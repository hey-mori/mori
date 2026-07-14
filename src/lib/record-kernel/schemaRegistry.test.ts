import { describe, expect, it } from "vitest";
import type { SchemaDefinition } from "./kernelTypes";
import {
  KernelValidationError,
  createSchemaRegistry,
  validateRecordAgainstSchema,
  validateSchemaDefinition,
} from "./schemaRegistry";
import { SYSTEM_SCHEMAS } from "./systemSchemas";

/** The user-defined schema exercised end-to-end per the K1 requirement:
 *  a reading tracker no system schema covers. */
const READING_SCHEMA: SchemaDefinition = {
  id: "reading",
  version: 1,
  scope: "user",
  name: "독서",
  description: "읽은 책과 소감",
  layer: "occurrence",
  properties: [
    { key: "bookTitle", label: "책", type: "text", required: true },
    { key: "pages", label: "읽은 쪽수", type: "number", metric: true, unit: "쪽" },
    { key: "verdict", label: "평가", type: "select", options: ["좋았음", "보통", "별로"] },
  ],
};

describe("system schemas", () => {
  it("seeds well over the required five, all structurally valid and unique", () => {
    expect(SYSTEM_SCHEMAS.length).toBeGreaterThanOrEqual(5);
    const ids = new Set(SYSTEM_SCHEMAS.map((schema) => schema.id));
    expect(ids.size).toBe(SYSTEM_SCHEMAS.length);
    for (const schema of SYSTEM_SCHEMAS) {
      expect(schema.scope).toBe("system");
      expect(validateSchemaDefinition(schema)).toEqual([]);
    }
  });

  it("covers every model layer so the layer mapping is real, not aspirational", () => {
    const layers = new Set(SYSTEM_SCHEMAS.map((schema) => schema.layer));
    expect(layers).toContain("occurrence");
    expect(layers).toContain("distilled");
    expect(layers).toContain("source");
    expect(layers).toContain("aggregate");
  });
});

describe("createSchemaRegistry", () => {
  it("resolves system and registered user schemas through one lookup", () => {
    const registry = createSchemaRegistry([READING_SCHEMA]);
    expect(registry.get("workout")?.scope).toBe("system");
    expect(registry.get("reading")?.name).toBe("독서");
    expect(registry.list().length).toBe(SYSTEM_SCHEMAS.length + 1);
  });

  it("rejects a user schema colliding with a system id", () => {
    const registry = createSchemaRegistry();
    expect(() =>
      registry.register({ ...READING_SCHEMA, id: "workout" }),
    ).toThrow(KernelValidationError);
  });

  it("rejects structurally broken user schemas", () => {
    const registry = createSchemaRegistry();
    expect(() =>
      registry.register({
        ...READING_SCHEMA,
        id: "Bad Id",
        properties: [{ key: "level", label: "단계", type: "select" }],
      }),
    ).toThrow(/kebab-case/);
  });

  it("rejects runtime registration claiming system scope", () => {
    const registry = createSchemaRegistry();
    expect(() =>
      registry.register({ ...READING_SCHEMA, id: "reading-2", scope: "system" }),
    ).toThrow(/scope "user"/);
  });
});

describe("validateRecordAgainstSchema", () => {
  it("accepts a record matching the user schema", () => {
    const result = validateRecordAgainstSchema(
      { properties: { bookTitle: "SQLite 내부", pages: 42, verdict: "좋았음" } },
      READING_SCHEMA,
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("errors on a missing required property and a wrong type", () => {
    const result = validateRecordAgainstSchema(
      { properties: { pages: "많이" } },
      READING_SCHEMA,
    );
    expect(result.errors).toContain('required property "bookTitle" is missing');
    expect(result.errors).toContain('property "pages" does not match type "number"');
  });

  it("errors on an out-of-options select value", () => {
    const result = validateRecordAgainstSchema(
      { properties: { bookTitle: "책", verdict: "최고" } },
      READING_SCHEMA,
    );
    expect(result.errors).toContain('property "verdict" does not match type "select"');
  });

  it("treats unknown properties as warnings so schema evolution never corrupts old records", () => {
    const result = validateRecordAgainstSchema(
      { properties: { bookTitle: "책", legacyField: 1 } },
      READING_SCHEMA,
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain('property "legacyField" is not defined by schema "reading"');
  });
});
