import { describe, expect, it } from "vitest";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";
import { KernelBrowserStore } from "./kernelStore";
import { createRecord } from "./recordFactory";
import { createSchemaRegistry } from "./schemaRegistry";
import type { SchemaDefinition } from "./kernelTypes";

const registry = createSchemaRegistry();

function makeStore(): KernelBrowserStore {
  return new KernelBrowserStore(new MemoryKeyValueStorage());
}

describe("KernelBrowserStore", () => {
  it("round-trips records", () => {
    const store = makeStore();
    const { record } = createRecord(
      { schemaId: "note", title: "메모", origin: "user" },
      registry,
    );
    store.saveRecord(record);
    expect(store.getRecord(record.id)).toEqual(record);
    expect(store.listRecords()).toEqual([record]);
    store.deleteRecord(record.id);
    expect(store.getRecord(record.id)).toBeNull();
  });

  it("round-trips contexts, entities, and aliases", () => {
    const store = makeStore();
    store.saveContext({ id: "ctx-1", type: "topic", name: "개인 연구", createdAt: "2026-07-14" });
    store.saveEntity({ id: "ent-1", type: "exercise", canonicalName: "러닝", createdAt: "2026-07-14" });
    store.saveEntityAliases("ent-1", [{ entityId: "ent-1", alias: "달리기", addedFrom: "user" }]);
    expect(store.getContext("ctx-1")?.name).toBe("개인 연구");
    expect(store.listEntities()).toHaveLength(1);
    expect(store.listEntityAliases("ent-1")[0]?.alias).toBe("달리기");
    expect(store.listEntityAliases("ent-2")).toEqual([]);
  });

  it("round-trips relations, sources, and source links", () => {
    const store = makeStore();
    store.saveRelation({
      id: "rel-1",
      fromRecordId: "rec-1",
      type: "derived-from",
      toRecordId: "rec-0",
      createdAt: "2026-07-14",
    });
    store.saveSource({
      id: "src-1",
      kind: "text",
      rawBody: "오늘 운동 러닝 10분",
      capturedAt: "2026-07-14",
      retention: "retained",
    });
    store.saveSourceLink({ sourceId: "src-1", recordId: "rec-1", role: "origin" });
    store.saveSourceLink({ sourceId: "src-1", recordId: "rec-2", role: "supports" });
    expect(store.listRelations()).toHaveLength(1);
    expect(store.getSource("src-1")?.rawBody).toContain("러닝");
    expect(store.listSourceLinksForRecord("rec-1")).toHaveLength(1);
    expect(store.listSourceLinksForRecord("rec-1")[0]?.role).toBe("origin");
  });

  it("keeps revisions per record in creation order", () => {
    const store = makeStore();
    store.appendRevision({
      id: "rev-b",
      recordId: "rec-1",
      actor: "ai",
      operation: "update",
      createdAt: "2026-07-14T10:00:00Z",
    });
    store.appendRevision({
      id: "rev-a",
      recordId: "rec-1",
      actor: "user",
      operation: "create",
      createdAt: "2026-07-14T09:00:00Z",
    });
    store.appendRevision({
      id: "rev-x",
      recordId: "rec-2",
      actor: "user",
      operation: "create",
      createdAt: "2026-07-14T09:30:00Z",
    });
    const revisions = store.listRevisions("rec-1");
    expect(revisions.map((revision) => revision.id)).toEqual(["rev-a", "rev-b"]);
  });

  it("round-trips rules and user schemas so personalization and schemas survive restarts", () => {
    const store = makeStore();
    store.saveRule({
      id: "rule-1",
      kind: "alias",
      condition: { alias: "달리기" },
      effect: { entityId: "ent-1" },
      learnedFromRevisionIds: [],
      enabled: true,
      createdAt: "2026-07-14",
    });
    const readingSchema: SchemaDefinition = {
      id: "reading",
      version: 1,
      scope: "user",
      name: "독서",
      description: "읽은 책",
      layer: "occurrence",
      properties: [{ key: "bookTitle", label: "책", type: "text", required: true }],
    };
    store.saveUserSchema(readingSchema);
    expect(store.listRules()).toHaveLength(1);
    expect(store.listUserSchemas()).toEqual([readingSchema]);
    // A persisted user schema rehydrates into a working registry.
    const rehydrated = createSchemaRegistry(store.listUserSchemas());
    const { record } = createRecord(
      {
        schemaId: "reading",
        title: "독서 기록",
        origin: "user",
        properties: { bookTitle: "SQLite 내부" },
      },
      rehydrated,
    );
    expect(record.schemaId).toBe("reading");
  });

  it("ignores an unknown envelope version instead of corrupting consumers", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(
      "mori.kernel.record.rec-x",
      JSON.stringify({ envelopeVersion: 999, savedAt: "2026-07-14", data: { id: "rec-x" } }),
    );
    const store = new KernelBrowserStore(storage);
    expect(store.getRecord("rec-x")).toBeNull();
    expect(store.listRecords()).toEqual([]);
  });
});
