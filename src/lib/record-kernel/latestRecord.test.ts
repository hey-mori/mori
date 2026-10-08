import { describe, expect, it } from "vitest";
import { latestRecordFor } from "./latestRecord";
import { applyRecordPatch, createRecord } from "./recordFactory";
import { createSchemaRegistry } from "./schemaRegistry";
import { KernelRepository } from "./kernelRepository";
import { KernelBrowserStore } from "./kernelStore";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";

const registry = createSchemaRegistry();

describe("latestRecordFor", () => {
  it("lets a body edit from an old snapshot keep a project filed a moment earlier", async () => {
    const repo = new KernelRepository({ runtime: "browser", store: new KernelBrowserStore(new MemoryKeyValueStorage()) });
    const created = createRecord({ schemaId: "note", title: "메모", body: "처음", origin: "user", timeBasis: "capture-fallback" }, registry);
    await repo.saveRecord(created.record, created.revision);
    // The project filing lands first...
    const filed = applyRecordPatch(created.record, { contextIds: ["ctx-infra"] }, "user", registry);
    await repo.saveRecord(filed.record, filed.revision);
    // ...then a save queued during creation patches the creation-time snapshot.
    const base = await latestRecordFor(repo, created.record);
    const edited = applyRecordPatch(base, { body: "처음 더 쓴 내용" }, "user", registry);
    expect(edited.record.contextIds).toEqual(["ctx-infra"]);
    expect(edited.record.body).toBe("처음 더 쓴 내용");
    // Patching the snapshot directly is what used to unfile it.
    expect(applyRecordPatch(created.record, { body: "x" }, "user", registry).record.contextIds).toEqual([]);
  });

  it("falls back to the caller's snapshot when the read is unreliable or empty", async () => {
    const snapshot = createRecord({ schemaId: "note", title: "메모", body: "b", origin: "user", timeBasis: "capture-fallback" }, registry).record;
    const fellBack = { getRecord: async () => ({ data: { ...snapshot, body: "stale" }, source: "browser-local-storage" as const, fellBack: true }) };
    const missing = { getRecord: async () => ({ data: null, source: "desktop-sqlite" as const, fellBack: false }) };
    const throwing = { getRecord: async () => { throw new Error("boom"); } };
    expect(await latestRecordFor(fellBack, snapshot)).toBe(snapshot);
    expect(await latestRecordFor(missing, snapshot)).toBe(snapshot);
    expect(await latestRecordFor(throwing, snapshot)).toBe(snapshot);
  });
});
