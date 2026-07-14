/**
 * Schema registry · system + user schemas behind one lookup, plus the
 * validation that keeps records honest against their schema.
 *
 * User schemas are first-class (architecture doc §3.2): they register at
 * runtime with the same shape as system schemas and every kernel consumer
 * treats them identically. The registry is a pure in-memory structure;
 * persistence of user schemas is the store's job.
 */
import type {
  MoriRecord,
  PropertyType,
  RecordPropertyValue,
  SchemaDefinition,
  SchemaPropertyDefinition,
} from "./kernelTypes";
import { SYSTEM_SCHEMAS } from "./systemSchemas";

export type SchemaRegistry = {
  get(id: string): SchemaDefinition | undefined;
  has(id: string): boolean;
  list(): SchemaDefinition[];
  /** Registers a user schema. Throws `KernelValidationError` when invalid. */
  register(schema: SchemaDefinition): void;
};

export class KernelValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(issues.length > 0 ? `${message}: ${issues.join("; ")}` : message);
    this.name = "KernelValidationError";
    this.issues = issues;
  }
}

const SCHEMA_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const PROPERTY_TYPES: readonly PropertyType[] = [
  "text",
  "number",
  "boolean",
  "date",
  "duration-minutes",
  "select",
  "entity",
  "entity-list",
  "json",
];

/** Structural validation for a schema definition (system or user). */
export function validateSchemaDefinition(schema: SchemaDefinition): string[] {
  const issues: string[] = [];
  if (!SCHEMA_ID_PATTERN.test(schema.id)) {
    issues.push(`schema id "${schema.id}" must be kebab-case`);
  }
  if (!Number.isInteger(schema.version) || schema.version < 1) {
    issues.push("schema version must be a positive integer");
  }
  if (schema.name.trim().length === 0) issues.push("schema name is required");
  const seenKeys = new Set<string>();
  for (const property of schema.properties) {
    if (property.key.trim().length === 0) issues.push("property key is required");
    if (seenKeys.has(property.key)) issues.push(`duplicate property key "${property.key}"`);
    seenKeys.add(property.key);
    if (!PROPERTY_TYPES.includes(property.type)) {
      issues.push(`property "${property.key}" has unknown type "${property.type}"`);
    }
    if (property.type === "select" && (!property.options || property.options.length === 0)) {
      issues.push(`select property "${property.key}" needs options`);
    }
  }
  return issues;
}

export function createSchemaRegistry(userSchemas: SchemaDefinition[] = []): SchemaRegistry {
  const byId = new Map<string, SchemaDefinition>();
  for (const schema of SYSTEM_SCHEMAS) byId.set(schema.id, schema);

  const register = (schema: SchemaDefinition): void => {
    const issues = validateSchemaDefinition(schema);
    if (schema.scope !== "user") {
      issues.push("runtime-registered schemas must have scope \"user\"");
    }
    const existing = byId.get(schema.id);
    if (existing && existing.scope === "system") {
      issues.push(`schema id "${schema.id}" collides with a system schema`);
    }
    if (issues.length > 0) {
      throw new KernelValidationError(`invalid user schema "${schema.id}"`, issues);
    }
    byId.set(schema.id, schema);
  };

  for (const schema of userSchemas) register(schema);

  return {
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    list: () => [...byId.values()],
    register,
  };
}

export type RecordValidationResult = {
  /** Violations that make the record invalid against its schema. */
  errors: string[];
  /** Non-fatal oddities (e.g. properties the schema does not define). */
  warnings: string[];
};

function matchesType(value: RecordPropertyValue, property: SchemaPropertyDefinition): boolean {
  if (value === null) return true;
  switch (property.type) {
    case "text":
    case "date":
    case "entity":
      return typeof value === "string";
    case "number":
    case "duration-minutes":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "select":
      return typeof value === "string" && (property.options ?? []).includes(value);
    case "entity-list":
      return Array.isArray(value) && value.every((item) => typeof item === "string");
    case "json":
      // Any JSON container: an object or an array (null handled above).
      return typeof value === "object";
  }
}

/** Validates a record's properties against its schema. Unknown properties are
 *  warnings, not errors: a schema version bump must not corrupt old records. */
export function validateRecordAgainstSchema(
  record: Pick<MoriRecord, "properties">,
  schema: SchemaDefinition,
): RecordValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const defined = new Map(schema.properties.map((property) => [property.key, property]));

  for (const property of schema.properties) {
    const value = record.properties[property.key];
    if (property.required && (value === undefined || value === null)) {
      errors.push(`required property "${property.key}" is missing`);
    }
  }

  for (const [key, value] of Object.entries(record.properties)) {
    const property = defined.get(key);
    if (!property) {
      warnings.push(`property "${key}" is not defined by schema "${schema.id}"`);
      continue;
    }
    if (value !== undefined && !matchesType(value, property)) {
      errors.push(`property "${key}" does not match type "${property.type}"`);
    }
  }

  return { errors, warnings };
}
