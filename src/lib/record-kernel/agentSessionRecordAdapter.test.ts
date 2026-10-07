import { describe, expect, it } from "vitest";
import {
  buildAgentSessionRecordInput,
  upsertAgentSessionRecords,
} from "./agentSessionRecordAdapter";
import { autoImportedSessionId } from "../session/autoImportSessions";
import { applyRecordPatch, createRecord, type RecordPatch } from "./recordFactory";
import { createSchemaRegistry } from "./schemaRegistry";
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import type { KernelContext, MoriRecord, KernelRevision } from "./kernelTypes";
import {
  KernelRepository,
  type KernelDesktopCommands,
  type KernelResult,
} from "./kernelRepository";
import type {
  SqliteKernelObjectRow,
  SqliteKernelRecordRow,
  SqliteKernelRevisionRow,
} from "../sqlite/kernelRows";
import { KernelBrowserStore } from "./kernelStore";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";

function meta(partial: Partial<AgentWorkSessionMeta> = {}): AgentWorkSessionMeta {
  return {
    agentId: "claude",
    agentName: "Claude Code",
    importKind: "claude-code",
    id: "conv-123",
    sessionId: "conv-123",
    projectPath: "/Users/x/dev/mori",
    projectName: "mori",
    filePath: "/logs/conv-123.jsonl",
    sourceFilePath: "/logs/conv-123.jsonl",
    startedAt: "2026-07-16T09:00:00.000Z",
    updatedAt: "2026-07-16T10:30:00.000Z",
    messageCount: 12,
    title: "Auth 미들웨어 마이그레이션",
    ...partial,
  } as AgentWorkSessionMeta;
}

function ctx(id: string, name: string): KernelContext {
  return { id, type: "project", name, createdAt: "2026-07-01T00:00:00.000Z" };
}

describe("buildAgentSessionRecordInput", () => {
  it("mirrors a session as a thin, active agent-session record keyed by its stable id", () => {
    const input = buildAgentSessionRecordInput(meta(), []);
    expect(input.id).toBe(autoImportedSessionId(meta()));
    expect(input.schemaId).toBe("agent-session");
    expect(input.status).toBe("active");
    expect(input.origin).toBe("automation");
    expect(input.title).toBe("Auth 미들웨어 마이그레이션");
    expect(input.timeBasis).toBe("source-observed");
    expect(input.occurredStart).toBe("2026-07-16T09:00:00.000Z");
    expect(input.occurredEnd).toBe("2026-07-16T10:30:00.000Z");
    expect(input.properties).toEqual({ agentId: "claude", stepCount: 12 });
    expect(input.body).toContain("메시지 12개");
  });

  it("binds only to an existing context matched by project name, never invents one", () => {
    const bound = buildAgentSessionRecordInput(meta(), [ctx("ctx-mori", "mori")]);
    expect(bound.contextIds).toEqual(["ctx-mori"]);
    const unmatched = buildAgentSessionRecordInput(meta({ projectName: "other" }), [
      ctx("ctx-mori", "mori"),
    ]);
    expect(unmatched.contextIds).toEqual([]);
  });

  it("keeps the activity time unknown (never fabricated) when the session has no start", () => {
    const input = buildAgentSessionRecordInput(meta({ startedAt: "", updatedAt: "" }), []);
    expect(input.timeBasis).toBe("unknown");
    expect(input.occurredStart).toBeUndefined();
    expect(input.occurredEnd).toBeUndefined();
  });

  it("produces a record the factory accepts (schema + time invariants hold)", () => {
    const registry = createSchemaRegistry();
    const built = buildAgentSessionRecordInput(meta(), []);
    // createRecord throws on any invariant violation; a clean create is the assertion.
    expect(() => createRecord(built, registry)).not.toThrow();
  });
});

describe("upsertAgentSessionRecords", () => {
  function fakeRepo() {
    const saved: MoriRecord[] = [];
    const contexts: KernelContext[] = [ctx("ctx-mori", "mori")];
    return {
      saved,
      listContexts: async (): Promise<KernelResult<KernelContext[]>> => ({
        data: contexts,
        source: "browser-local-storage",
        fellBack: false,
      }),
      getRecord: async (): Promise<KernelResult<MoriRecord | null>> => ({
        data: null,
        source: "browser-local-storage",
        fellBack: false,
      }),
      listRevisions: async (): Promise<KernelResult<KernelRevision[]>> => ({
        data: [],
        source: "browser-local-storage",
        fellBack: false,
      }),
      saveRecord: async (record: MoriRecord, _revision: KernelRevision): Promise<KernelResult<MoriRecord>> => {
        saved.push(record);
        return { data: record, source: "browser-local-storage", fellBack: false };
      },
    };
  }

  it("writes one active record per session, bound to a matching context", async () => {
    const repo = fakeRepo();
    const registry = createSchemaRegistry();
    const result = await upsertAgentSessionRecords(repo, registry, [
      meta(),
      meta({ id: "conv-456", title: "리포트 정리", projectName: "other" }),
    ]);
    expect(result).toEqual({ created: 2, updated: 0, unchanged: 0, preserved: 0, failed: 0 });
    expect(repo.saved.map((r) => r.status)).toEqual(["active", "active"]);
    expect(repo.saved[0]?.contextIds).toEqual(["ctx-mori"]);
    expect(repo.saved[1]?.contextIds).toEqual([]);
  });

  it("counts a per-record failure without aborting the batch", async () => {
    const repo = fakeRepo();
    let calls = 0;
    const flaky = {
      ...repo,
      saveRecord: async (record: MoriRecord): Promise<KernelResult<MoriRecord>> => {
        calls += 1;
        if (calls === 1) throw new Error("write failed");
        repo.saved.push(record);
        return { data: record, source: "browser-local-storage", fellBack: false };
      },
    };
    const result = await upsertAgentSessionRecords(flaky, createSchemaRegistry(), [
      meta(),
      meta({ id: "conv-456" }),
    ]);
    expect(result).toMatchObject({ created: 1, failed: 1 });
  });

  it("no-ops on an empty batch", async () => {
    const repo = fakeRepo();
    expect(await upsertAgentSessionRecords(repo, createSchemaRegistry(), [])).toEqual({
      created: 0,
      updated: 0,
      unchanged: 0,
      preserved: 0,
      failed: 0,
    });
    expect(repo.saved).toHaveLength(0);
  });
});

describe("upsertAgentSessionRecords · rediscovery of an existing record", () => {
  const registry = createSchemaRegistry();
  const T0 = new Date("2026-07-16T11:00:00.000Z");
  const T1 = new Date("2026-07-16T12:00:00.000Z");
  const T2 = new Date("2026-07-16T13:00:00.000Z");
  const at = (date: Date) => () => date;

  function browserRepository() {
    const store = new KernelBrowserStore(new MemoryKeyValueStorage());
    const repository = new KernelRepository({ runtime: "browser", store });
    void repository.saveContext(ctx("ctx-mori", "mori"));
    void repository.saveContext(ctx("ctx-work", "회사/mori"));
    return repository;
  }

  async function discover(repository: KernelRepository, session: AgentWorkSessionMeta, now: Date) {
    return upsertAgentSessionRecords(repository, registry, [session], { now: at(now) });
  }

  async function current(repository: KernelRepository, session = meta()) {
    const record = (await repository.getRecord(autoImportedSessionId(session))).data;
    if (!record) throw new Error("record missing");
    return record;
  }

  async function userEdit(repository: KernelRepository, patch: RecordPatch, now: Date) {
    const record = await current(repository);
    const { record: next, revision } = applyRecordPatch(record, patch, "user", registry, at(now));
    await repository.saveRecord(next, revision);
  }

  async function revisions(repository: KernelRepository, session = meta()) {
    return (await repository.listRevisions(autoImportedSessionId(session))).data;
  }

  const grown = meta({ updatedAt: "2026-07-16T11:45:00.000Z", messageCount: 30 });

  it("leaves a record created provisional before the active default as provisional", async () => {
    const repository = browserRepository();
    const legacy = createRecord(
      { ...buildAgentSessionRecordInput(meta(), []), status: "provisional", now: at(T0) },
      registry,
    );
    await repository.saveRecord(legacy.record, legacy.revision);

    await discover(repository, grown, T1);

    const record = await current(repository);
    expect(record.status).toBe("provisional");
    expect(record.properties.stepCount).toBe(30);
  });

  it("keeps a status the user chose", async () => {
    const repository = browserRepository();
    await discover(repository, meta(), T0);
    // The user marks an observed session as unsure; growth must not undo that.
    await userEdit(repository, { status: "provisional" }, T1);

    await discover(repository, grown, T2);

    expect((await current(repository)).status).toBe("provisional");
  });

  it("does not resurrect a discarded session or write to it", async () => {
    const repository = browserRepository();
    await discover(repository, meta(), T0);
    await userEdit(repository, { status: "discarded" }, T1);
    const before = await revisions(repository);

    const result = await discover(repository, grown, T2);

    expect((await current(repository)).status).toBe("discarded");
    expect(await revisions(repository)).toHaveLength(before.length);
    expect(result).toMatchObject({ created: 0, updated: 0, preserved: 1 });
  });

  it("keeps the project the user filed the session into", async () => {
    const repository = browserRepository();
    await discover(repository, meta(), T0);
    expect((await current(repository)).contextIds).toEqual(["ctx-mori"]);
    await userEdit(repository, { contextIds: ["ctx-work"] }, T1);

    await discover(repository, grown, T2);

    expect((await current(repository)).contextIds).toEqual(["ctx-work"]);
  });

  it("keeps a user rename while still merging what the source newly observed", async () => {
    const repository = browserRepository();
    await discover(repository, meta(), T0);
    await userEdit(repository, { title: "인증 리팩터 회고" }, T1);

    await discover(repository, { ...grown, title: "Auth 미들웨어 마이그레이션 (계속)" }, T2);

    const record = await current(repository);
    expect(record.title).toBe("인증 리팩터 회고");
    expect(record.occurredEnd).toBe("2026-07-16T11:45:00.000Z");
    expect(record.properties.stepCount).toBe(30);
    expect(record.body).toContain("메시지 30개");
  });

  it("keeps a user rename across repeated growth, not only the first", async () => {
    const repository = browserRepository();
    await discover(repository, meta(), T0);
    await userEdit(repository, { title: "인증 리팩터 회고" }, T1);

    await discover(repository, grown, T2);
    const again = meta({ updatedAt: "2026-07-16T12:30:00.000Z", messageCount: 41 });
    await discover(repository, again, new Date("2026-07-16T14:00:00.000Z"));

    const record = await current(repository);
    expect(record.title).toBe("인증 리팩터 회고");
    expect(record.properties.stepCount).toBe(41);
  });

  it("keeps an activity date the user set", async () => {
    const repository = browserRepository();
    await discover(repository, meta(), T0);
    await userEdit(
      repository,
      { occurredStart: "2026-07-15", occurredEnd: undefined, timeBasis: "user-provided" },
      T1,
    );

    await discover(repository, grown, T2);

    const record = await current(repository);
    expect(record.occurredStart).toBe("2026-07-15");
    expect(record.occurredEnd).toBeUndefined();
    expect(record.timeBasis).toBe("user-provided");
  });

  it("updates an untouched record with one automation revision and keeps its creation time", async () => {
    const repository = browserRepository();
    await discover(repository, meta(), T0);
    const created = await current(repository);

    const result = await discover(repository, { ...grown, title: "새 제목" }, T1);

    const record = await current(repository);
    expect(result).toMatchObject({ created: 0, updated: 1 });
    expect(record.title).toBe("새 제목");
    expect(record.status).toBe("active");
    expect(record.occurredEnd).toBe("2026-07-16T11:45:00.000Z");
    expect(record.createdAt).toBe(created.createdAt);
    expect(record.capturedAt).toBe(created.capturedAt);

    const trail = await revisions(repository);
    expect(trail.map((revision) => revision.operation)).toEqual(["create", "update"]);
    expect(trail[1]?.actor).toBe("rule");
    expect((trail[1]?.before as MoriRecord).title).toBe("Auth 미들웨어 마이그레이션");
  });

  it("binds a newly matching project when the binding is still automation's", async () => {
    const repository = browserRepository();
    await discover(repository, meta({ projectName: "회사/mori" }), T0);
    expect((await current(repository)).contextIds).toEqual(["ctx-work"]);

    await discover(repository, { ...grown, projectName: "mori" }, T1);

    expect((await current(repository)).contextIds).toEqual(["ctx-mori"]);
  });

  it("writes nothing when the observation is identical", async () => {
    const repository = browserRepository();
    await discover(repository, meta(), T0);

    const result = await discover(repository, meta(), T1);

    expect(result).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(await revisions(repository)).toHaveLength(1);
  });

  it("leaves a record of another schema under the same id alone", async () => {
    const repository = browserRepository();
    const { record, revision } = createRecord(
      { id: autoImportedSessionId(meta()), schemaId: "note", title: "메모", origin: "user" },
      registry,
    );
    await repository.saveRecord(record, revision);

    const result = await discover(repository, grown, T1);

    expect((await current(repository)).schemaId).toBe("note");
    expect(result).toMatchObject({ created: 0, updated: 0, preserved: 1 });
  });

  it("keeps every field once the user edited a record whose automation write is not on record", async () => {
    const repository = browserRepository();
    const { record } = createRecord(buildAgentSessionRecordInput(meta(), []), registry);
    const edited = applyRecordPatch(record, { title: "직접 고친 제목" }, "user", registry, at(T1));
    await repository.saveRecord(edited.record, edited.revision);

    await discover(repository, grown, T2);

    const after = await current(repository);
    expect(after.title).toBe("직접 고친 제목");
    expect(after.occurredEnd).toBe(meta().updatedAt);
  });

  it("does not recreate a session when the existing record cannot be read reliably", async () => {
    const saved: MoriRecord[] = [];
    const unreliable = {
      listContexts: async (): Promise<KernelResult<KernelContext[]>> => ({
        data: [],
        source: "browser-local-storage",
        fellBack: true,
      }),
      getRecord: async (): Promise<KernelResult<MoriRecord | null>> => ({
        data: null,
        source: "browser-local-storage",
        fellBack: true,
      }),
      listRevisions: async (): Promise<KernelResult<KernelRevision[]>> => ({
        data: [],
        source: "browser-local-storage",
        fellBack: true,
      }),
      saveRecord: async (record: MoriRecord): Promise<KernelResult<MoriRecord>> => {
        saved.push(record);
        return { data: record, source: "browser-local-storage", fellBack: true };
      },
    };

    const result = await upsertAgentSessionRecords(unreliable, registry, [grown]);

    expect(saved).toHaveLength(0);
    expect(result).toMatchObject({ created: 0, failed: 1 });
  });
});

describe("upsertAgentSessionRecords · desktop row round trip", () => {
  /** SQLite stand-in: records upsert by id, as `save_kernel_records` does, and
   *  every value crosses the same row converters the real bridge uses. */
  function sqliteCommands(): KernelDesktopCommands {
    const records = new Map<string, SqliteKernelRecordRow>();
    const objects: SqliteKernelObjectRow[] = [];
    const revisions: SqliteKernelRevisionRow[] = [];
    return {
      saveKernelRecordRows: async (rows: SqliteKernelRecordRow[]) => {
        for (const row of rows) records.set(row.id, row);
        return { rowsWritten: rows.length };
      },
      listKernelRecordRows: async () => [...records.values()],
      getKernelRecordRow: async (id: string) => records.get(id) ?? null,
      deleteKernelRecordRow: async () => 0,
      searchKernelRecordRows: async () => [],
      saveKernelObjectRows: async (rows: SqliteKernelObjectRow[]) => {
        objects.push(...rows);
        return { rowsWritten: rows.length };
      },
      listKernelObjectRows: async (collection: string) =>
        objects.filter((row) => row.collection === collection),
      appendKernelRevisionRows: async (rows: SqliteKernelRevisionRow[]) => {
        revisions.push(...rows);
        return { rowsWritten: rows.length };
      },
      listKernelRevisionRows: async (recordId: string) =>
        revisions.filter((row) => row.record_id === recordId),
    };
  }

  it("keeps user edits and merges growth when the baseline comes back from SQLite rows", async () => {
    const registry = createSchemaRegistry();
    const repository = new KernelRepository({
      runtime: "desktop",
      store: new KernelBrowserStore(new MemoryKeyValueStorage()),
      commands: sqliteCommands(),
    });
    const id = autoImportedSessionId(meta());
    const at = (iso: string) => () => new Date(iso);

    await upsertAgentSessionRecords(repository, registry, [meta()], {
      now: at("2026-07-16T11:00:00.000Z"),
    });
    const created = (await repository.getRecord(id)).data as MoriRecord;
    const edited = applyRecordPatch(
      created,
      { title: "직접 고친 제목", status: "provisional" },
      "user",
      registry,
      at("2026-07-16T12:00:00.000Z"),
    );
    await repository.saveRecord(edited.record, edited.revision);

    const grown = meta({ updatedAt: "2026-07-16T11:45:00.000Z", messageCount: 30 });
    const first = await upsertAgentSessionRecords(repository, registry, [grown], {
      now: at("2026-07-16T13:00:00.000Z"),
    });
    const repeat = await upsertAgentSessionRecords(repository, registry, [grown], {
      now: at("2026-07-16T14:00:00.000Z"),
    });

    const record = (await repository.getRecord(id)).data as MoriRecord;
    expect(first).toMatchObject({ updated: 1, failed: 0 });
    expect(repeat).toMatchObject({ unchanged: 1, failed: 0 });
    expect(record.title).toBe("직접 고친 제목");
    expect(record.status).toBe("provisional");
    expect(record.properties.stepCount).toBe(30);
    expect((await repository.listRevisions(id)).data.map((r) => r.operation)).toEqual([
      "create",
      "status-change",
      "update",
    ]);
  });
});
