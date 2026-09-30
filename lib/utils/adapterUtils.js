import { ReferenceKind, serialize } from "@mikro-orm/core";
import { dset } from "dset";
import { createAdapterError } from "./createAdapterError.js";
function checkForExhaustiveWhereOperator(op) {
    throw new RangeError(`[Better Auth MikroORM adapter error] Unhandled WHERE operator detected: ${op}`);
}
const ownReferences = [
    ReferenceKind.SCALAR,
    ReferenceKind.ONE_TO_MANY,
    ReferenceKind.EMBEDDED
];
/**
 * Creates bunch of utilities for adapter
 *
 * @param orm - Mikro ORM instance
 */
export function createAdapterUtils(orm, config) {
    const naming = orm.config.getNamingStrategy();
    const metadata = orm.getMetadata();
    const normalizeEntityName = name => naming.getEntityName(naming.classToTableName(name));
    const getEntityMetadata = (entityName) => {
        const normalizedEntityName = normalizeEntityName(entityName);
        if (!metadata.getByClassName(normalizedEntityName, false)) {
            createAdapterError(`Cannot find metadata for "${normalizedEntityName}" entity. Make sure it defined and listed in your Mikro ORM config.`);
        }
        return metadata.getByClassName(normalizedEntityName);
    };
    /**
     * Returns metadata for a property by given `fieldName`.
     *
     * @param metadata - Entity metadata
     * @param fieldName - The name of the field to get metadata for
     */
    function getPropertyMetadata(metadata, fieldName) {
        const prop = metadata.props.find(prop => {
            if (ownReferences.includes(prop.kind) && prop.name === fieldName) {
                return true;
            }
            if (prop.kind === ReferenceKind.MANY_TO_ONE &&
                (prop.name === fieldName ||
                    prop.fieldNames.includes(naming.propertyToColumnName(fieldName)))) {
                return true;
            }
            return false;
        });
        if (!prop) {
            createAdapterError(`Can't find property "${fieldName}" on entity "${metadata.className}".`);
        }
        return prop;
    }
    /**
     * Returns referenced _column_ name for given `prop` using [naming strategy](https://mikro-orm.io/docs/naming-strategy) defined by the config.
     *
     * @param entityName - The name of the entity
     * @param prop - Property metadata
     */
    function getReferencedColumnName(entityName, prop) {
        if (ownReferences.includes(prop.kind)) {
            return prop.name;
        }
        if (prop.kind === ReferenceKind.MANY_TO_ONE) {
            return naming.columnNameToProperty(naming.joinColumnName(prop.name));
        }
        createAdapterError(`Reference kind ${prop.kind} is not supported. Defined in "${entityName}" entity for "${prop.name}" field.`);
    }
    /**
     * Returns referenced _property_ name in camelCase.
     *
     * @param entityName - The name of the entity
     * @param prop - Property metadata
     */
    const getReferencedPropertyName = (metadata, prop) => getReferencedColumnName(metadata.className, prop);
    const getFieldPath = (metadata, fieldName, throwOnShadowProps = false) => {
        const prop = getPropertyMetadata(metadata, fieldName);
        if (prop.persist === false && throwOnShadowProps) {
            createAdapterError(`Cannot serialize "${fieldName}" into path, because it cannot be persisted in "${metadata.tableName}" table.`);
        }
        if (prop.kind === ReferenceKind.SCALAR ||
            prop.kind === ReferenceKind.EMBEDDED) {
            return [prop.name];
        }
        if (prop.kind === ReferenceKind.MANY_TO_ONE) {
            if (prop.referencedPKs.length > 1) {
                createAdapterError(`The "${fieldName}" field references to a table "${prop.name}" with complex primary key, which is not supported`);
            }
            return [prop.name, naming.referenceColumnName()];
        }
        createAdapterError(`Cannot normalize "${fieldName}" field name into path for "${metadata.className}" entity.`);
    };
    /**
     * Normalizes property's raw input value: if property is a reference,
     * then it wraps value using [`orm.em.getReference`](https://mikro-orm.io/docs/entity-manager#entity-references) method,
     * to unsure it's correctly persisted.
     *
     * Otherwise the value is returned as is.
     *
     * @param property - Metadata of the property
     * @param value - Raw input value
     */
    const normalizePropertyValue = (property, value) => {
        if (value == null ||
            !property.targetMeta ||
            property.kind === ReferenceKind.SCALAR ||
            property.kind === ReferenceKind.EMBEDDED) {
            return value;
        }
        return orm.em.getReference(property.targetMeta.class, value);
    };
    const normalizeInput = (metadata, input) => {
        const fields = {};
        Object.entries(input).forEach(([key, value]) => {
            const property = getPropertyMetadata(metadata, key);
            const normalizedValue = normalizePropertyValue(property, value);
            dset(fields, [property.name], normalizedValue);
        });
        return fields;
    };
    const normalizeOutput = (metadata, output, select) => {
        let result = {};
        const serializedOutput = serialize(output);
        Object.entries(serializedOutput)
            .map(([key, value]) => ({
            path: getReferencedPropertyName(metadata, getPropertyMetadata(metadata, key)),
            value
        }))
            .forEach(({ path, value }) => {
            dset(result, path, value);
        });
        // Filter out unnecessary fields
        // TODO: Implement proper select on mikro-orm querying level
        if (select) {
            result = Object.fromEntries(Object.entries(result).filter(([name]) => select.includes(name)));
        }
        return result;
    };
    /**
     * Creates a `where` clause with given params.
     *
     * @param fieldName - The name of the field
     * @param path - Path to the field reference
     * @param value - Field's value
     * @param op - Query operator
     * @param target - Target object to assign the result to. The object will be *mutated*
     */
    function createWhereClause(path, value, op, target = {}) {
        dset(target, op == null || op === "eq" ? path : path.concat(op), value);
        return target;
    }
    /**
     * Same as `createWhereClause`, but creates a statement with only `$in` operator and check if the `value` is an array.
     *
     * @param fieldName - The name of the field
     * @param path - Path to the field reference
     * @param value - Field's value
     * @param target - Target object to assign the result to. The object will be *mutated*
     */
    function createWhereInClause(fieldName, path, value, operator, target) {
        const normalizedOperator = `$${operator}`;
        if (!Array.isArray(value)) {
            createAdapterError(`The value for the field "${fieldName}" must be an array when using the ${normalizedOperator} operator.`);
        }
        return createWhereClause(path, value, normalizedOperator, target);
    }
    function normalizeWhereClause(path, input, target) {
        switch (input.operator) {
            case "in":
                return createWhereInClause(input.field, path, input.value, "in", target);
            case "not_in":
                return createWhereInClause(input.field, path, input.value, "nin", target);
            case "contains":
                return createWhereClause(path, `%${input.value}%`, "$like", target);
            case "starts_with":
                return createWhereClause(path, `${input.value}%`, "$like", target);
            case "ends_with":
                return createWhereClause(path, `%${input.value}`, "$like", target);
            // The next 5 case statemets are _expected_ to fall through so we can simplify and reuse the same logic for these operators
            case "gt":
            case "gte":
            case "lt":
            case "lte":
            case "ne":
                return createWhereClause(path, input.value, `$${input.operator}`, target);
            case "eq":
            case undefined:
                return createWhereClause(path, input.value, "eq", target);
            default:
                return checkForExhaustiveWhereOperator(input.operator);
        }
    }
    const normalizeWhereClauses = (metadata, where) => {
        if (!where) {
            return {};
        }
        if (where.length === 1) {
            const [clause] = where;
            if (!clause) {
                return {};
            }
            const path = getFieldPath(metadata, clause.field, true);
            return normalizeWhereClause(path, clause);
        }
        const result = {};
        where
            .filter(({ connector }) => !connector || connector === "AND")
            .forEach((clause, index) => {
            const path = ["$and", index].concat(getFieldPath(metadata, clause.field, true));
            normalizeWhereClause(path, clause, result);
        });
        where
            .filter(({ connector }) => connector === "OR")
            .forEach((clause, index) => {
            const path = ["$or", index].concat(getFieldPath(metadata, clause.field, true));
            normalizeWhereClause(path, clause, result);
        });
        return result;
    };
    const normalizeSelect = (model, select) => select?.map(field => config.getFieldName({ model, field }));
    return {
        getEntityMetadata,
        getPropertyMetadata,
        normalizeEntityName,
        getFieldPath,
        normalizeInput,
        normalizeOutput,
        normalizeWhereClauses,
        normalizeSelect
    };
}
