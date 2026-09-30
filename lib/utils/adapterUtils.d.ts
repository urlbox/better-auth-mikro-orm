import type { EntityManager, EntityMetadata, EntityProperty, MikroORM } from "@mikro-orm/core";
import type { Where } from "better-auth";
import type { AdapterFactoryCustomizeAdapterCreator } from "better-auth/adapters";
type AdapterFactoryCustomizeAdapterCreatorConfig = Parameters<AdapterFactoryCustomizeAdapterCreator>[0];
export interface AdapterUtils {
    /**
     * Normalizes given model `name` for Mikro ORM using [naming strategy](https://mikro-orm.io/docs/naming-strategy) defined by the config.
     *
     * @param name - The name of the entity
     */
    normalizeEntityName(name: string): string;
    /**
     * Returns metadata for given `entityName` from MetadataStorage.
     *
     * @param entityName - The name of the entity to get the metadata for
     *
     * @throws BetterAuthError when no metadata found
     */
    getEntityMetadata(name: string): EntityMetadata;
    /**
     * Returns metadata for a property by given `fieldName`.
     *
     * @param metadata - Entity metadata
     * @param fieldName - The name of the field to get metadata for
     *
     * @throws BetterAuthError when no such field exist on the entity
     */
    getPropertyMetadata(metadata: EntityMetadata, fieldName: string): EntityProperty;
    /**
     * Returns a path to a `field` reference.
     *
     * @param entityName - The name of the entity
     * @param fieldName - The field's name
     * @param throwOnShadowProps - Whether or throw error for Shadow Props. Use it for where clause so Mikro ORM will not throw when accessing such props from database.
     *
     * @throws BetterAuthError when no such field exist on the `entity`
     * @throws BetterAuthError if complex primary key is discovered in `fieldName` relation
     */
    getFieldPath(metadata: EntityMetadata, fieldName: string, throwOnShadowProps?: boolean): string[];
    /**
     * Normalized Better Auth data for Mikro ORM.
     *
     * @param entityName - The name of the entity
     * @param input - The data to normalize
     * @param em - EntityManager used to create references. Defaults to the current context of `orm.em`
     */
    normalizeInput(metadata: EntityMetadata, input: Record<string, any>, em?: EntityManager): Record<string, any>;
    /**
     * Normalizes the Mikro ORM output for Better Auth.
     *
     * @param entityName - The name of the entity
     * @param output - The result of a Mikro ORM query
     * @param select - A list of fields to return
     */
    normalizeOutput(metadata: EntityMetadata, output: Record<string, any>, select?: string[]): Record<string, any>;
    /**
     * Transfroms hiven list of Where clause(s) for Mikro ORM.
     *
     * @param entityName - Entity name
     * @param where - A list where clause(s) to normalize
     */
    normalizeWhereClauses(metadata: EntityMetadata, where?: Where[]): Record<string, any>;
    normalizeSelect(modelName: string, input?: string[]): string[] | undefined;
}
/**
 * Creates bunch of utilities for adapter
 *
 * @param orm - Mikro ORM instance
 */
export declare function createAdapterUtils(orm: MikroORM, config: AdapterFactoryCustomizeAdapterCreatorConfig): AdapterUtils;
export {};
