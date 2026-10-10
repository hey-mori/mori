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
    // The conversation's own last move wins over later idle-time bookkeeping.
    const quiet = buildAgentSessionRecordInput(
      meta({ updatedAt: "2026-07-19T08:00:00.000Z", lastMessageAt: "2026-07-16T10:30:00.000Z" }),
      [],
    );
    expect(quiet.occurredEnd).toBe("2026-07-16T10:30:00.000Z");
    // A last message before the start falls back to the source's last activity.
    const early = buildAgentSessionRecordInput(
      meta({ updatedAt: "2026-07-16T10:30:00.000Z", lastMessageAt: "2026-07-16T08:00:00.000Z" }),
      [],
    );
    expect(early.occurredEnd).toBe("2026-07-16T10:30:00.000Z");
    // In order as instants but not as text (mixed offsets): no end rather than
    // one the record factory would reject.
    const mixed = buildAgentSessionRecordInput(
      meta({ startedAt: "2026-11-01T01:50:00-07:00", updatedAt: "2026-11-01T01:10:00-08:00" }),
      [],
    );
    expect(mixed.occurredEnd).toBeUndefined();
    expect(input.properties).toEqual({ agentId: "claude", stepCount: 12 });
    expect(input.body).toContain("메시지 12개");
  });

  it("never binds a project, not even on an exact name match: membership is reviewed", () => {
    // A name is not an identity (two checkouts can share one), and an automatic
    // binding could be reapplied after the operator unfiled the session.
    expect(buildAgentSessionRecordInput(meta(), [ctx("ctx-mori", "mori")]).contextIds).toEqual([]);
    expect(buildAgentSessionRecordInput(meta({ projectName: "other" }), [ctx("ctx-mori", "mori")]).contextIds).toEqual([]);
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

  it("writes one active record per session, filed under no project", async () => {
    const repo = fakeRepo();
    const registry = createSchemaRegistry();
    const result = await upsertAgentSessionRecords(repo, registry, [
      meta(),
      meta({ id: "conv-456", title: "리포트 정리", projectName: "other" }),
    ]);
    expect(result).toEqual({ created: 2, updated: 0, unchanged: 0, preserved: 0, failed: 0 });
    expect(repo.saved.map((r) => r.status)).toEqual(["active", "active"]);
    expect(repo.saved[0]?.contextIds).toEqual([]);
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
    expect((await current(repository)).contextIds).toEqual([]);
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

  it("neither removes nor replaces a project an older automation wrote", async () => {
    // Records created before membership became a reviewed decision may carry
    // an automatic binding. Rediscovery leaves contextIds alone either way.
    const repository = browserRepository();
    const legacy = createRecord(
      { ...buildAgentSessionRecordInput(meta(), []), contextIds: ["ctx-work"], now: at(T0) },
      registry,
    );
    await repository.saveRecord(legacy.record, legacy.revision);

    await discover(repository, { ...grown, projectName: "mori" }, T1);

    expect((await current(repository)).contextIds).toEqual(["ctx-work"]);
    expect((await current(repository)).occurredEnd).toBe(grown.updatedAt);
  });

  it("does not reattach a project after the operator unfiled the session", async () => {
    const repository = browserRepository();
    await discover(repository, meta(), T0);
    await userEdit(repository, { contextIds: ["ctx-mori"] }, T1);
    await userEdit(repository, { contextIds: [] }, T1);
    await discover(repository, grown, T2);
    expect((await current(repository)).contextIds).toEqual([]);
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

describe("long-running Claude sessions (NUC trial, 2026-10-08)", () => {
  const registry = createSchemaRegistry();
  const at = (iso: string) => () => new Date(iso);

  function repo() {
    const store = new KernelBrowserStore(new MemoryKeyValueStorage());
    return new KernelRepository({ runtime: "browser", store });
  }

  // A live session: the first message at 13:48, then hours of growth past the
  // reader's 1 MB preview, so the count is a lower bound that never moves.
  const live = (updatedAt: string, extra: Partial<AgentWorkSessionMeta> = {}) =>
    meta({
      startedAt: "2026-10-07T13:48:42.613Z",
      updatedAt,
      messageCount: 46,
      messageCountComplete: false,
      title: "Mori 개발 재개 상태 점검",
      ...extra,
    });

  async function poll(repository: KernelRepository, session: AgentWorkSessionMeta, iso: string) {
    return upsertAgentSessionRecords(repository, registry, [session], { now: at(iso) });
  }

  async function trail(repository: KernelRepository) {
    return (await repository.listRevisions(autoImportedSessionId(live("x")))).data;
  }

  async function current(repository: KernelRepository) {
    return (await repository.getRecord(autoImportedSessionId(live("x")))).data as MoriRecord;
  }

  it("does not record a head-only message count as the session's size", () => {
    const input = buildAgentSessionRecordInput(live("2026-10-07T13:48:42.613Z"), []);
    expect(input.properties).toEqual({ agentId: "claude" });
    expect(input.body).not.toContain("메시지");
    const complete = buildAgentSessionRecordInput(meta({ messageCount: 12 }), []);
    expect(complete.properties).toMatchObject({ stepCount: 12 });
  });

  it("tracks the real end time through hours of growth with one growth revision, not one per poll", async () => {
    const repository = repo();
    await poll(repository, live("2026-10-07T13:48:42.613Z"), "2026-10-07T13:50:00Z");
    for (const end of ["2026-10-07T14:00:00Z", "2026-10-07T15:30:00Z", "2026-10-07T17:12:05Z"]) {
      await poll(repository, live(end), end);
    }

    const record = await current(repository);
    expect(record.occurredStart).toBe("2026-10-07T13:48:42.613Z");
    expect(record.occurredEnd).toBe("2026-10-07T17:12:05Z");
    const revisions = await trail(repository);
    expect(revisions.map((r) => [r.actor, r.operation])).toEqual([
      ["rule", "create"],
      ["rule", "update"],
    ]);
    // The superseding revision keeps the stretch's starting point.
    expect((revisions[1].before as MoriRecord).occurredEnd).toBe("2026-10-07T13:48:42.613Z");
    expect((revisions[1].after as MoriRecord).occurredEnd).toBe("2026-10-07T17:12:05Z");
  });

  it("never merges growth across a user edit, and keeps the edit", async () => {
    const repository = repo();
    await poll(repository, live("2026-10-07T13:48:42.613Z"), "2026-10-07T13:50:00Z");
    await poll(repository, live("2026-10-07T14:00:00Z"), "2026-10-07T14:00:00Z");
    const edited = applyRecordPatch(await current(repository), { title: "D1-D4 수정" }, "user", registry, at("2026-10-07T14:05:00Z"));
    await repository.saveRecord(edited.record, edited.revision);
    await poll(repository, live("2026-10-07T15:30:00Z"), "2026-10-07T15:30:00Z");
    await poll(repository, live("2026-10-07T16:00:00Z"), "2026-10-07T16:00:00Z");

    const revisions = await trail(repository);
    expect(revisions.map((r) => [r.actor, r.operation])).toEqual([
      ["rule", "create"],
      ["rule", "update"],
      ["user", "update"],
      ["rule", "update"],
    ]);
    expect((await current(repository)).title).toBe("D1-D4 수정");
    expect((await current(repository)).occurredEnd).toBe("2026-10-07T16:00:00Z");
  });

  it("gives a change of title from the source its own revision", async () => {
    const repository = repo();
    await poll(repository, live("2026-10-07T13:48:42.613Z"), "2026-10-07T13:50:00Z");
    await poll(repository, live("2026-10-07T14:00:00Z"), "2026-10-07T14:00:00Z");
    await poll(repository, live("2026-10-07T15:00:00Z", { title: "Claude가 붙인 새 제목" }), "2026-10-07T15:00:00Z");
    await poll(repository, live("2026-10-07T16:00:00Z", { title: "Claude가 붙인 새 제목" }), "2026-10-07T16:00:00Z");

    const revisions = await trail(repository);
    expect(revisions).toHaveLength(4);
    expect((revisions[2].after as MoriRecord).title).toBe("Claude가 붙인 새 제목");
  });

  it("writes nothing for an identical poll and stays consistent across a restart", async () => {
    const repository = repo();
    await poll(repository, live("2026-10-07T13:48:42.613Z"), "2026-10-07T13:50:00Z");
    await poll(repository, live("2026-10-07T14:00:00Z"), "2026-10-07T14:00:00Z");
    const unchanged = await poll(repository, live("2026-10-07T14:00:00Z"), "2026-10-07T14:01:30Z");
    expect(unchanged).toMatchObject({ unchanged: 1, updated: 0 });
    // A restart is a fresh call over the same stored revisions.
    await poll(repository, live("2026-10-07T15:00:00Z"), "2026-10-07T15:00:00Z");
    expect(await trail(repository)).toHaveLength(2);
  });

  it("corrects a zone-less start written before the UTC fix, as one automation update", async () => {
    const repository = repo();
    // A session with no first-message timestamp: the start fell back to the
    // file time, written without a zone before the fix.
    await poll(repository, meta({ startedAt: "2026-09-30T04:22:13", updatedAt: "2026-09-30T04:22:13" }), "2026-10-08T03:00:00Z");
    await poll(repository, meta({ startedAt: "2026-09-30T04:22:13Z", updatedAt: "2026-09-30T04:22:13Z" }), "2026-10-08T04:00:00Z");
    const record = (await repository.getRecord(autoImportedSessionId(meta()))).data as MoriRecord;
    expect(record.occurredStart).toBe("2026-09-30T04:22:13Z");
    const revisions = (await repository.listRevisions(autoImportedSessionId(meta()))).data;
    expect(revisions.map((r) => r.operation)).toEqual(["create", "update"]);
  });
});

describe("session outcome evidence on the record", () => {
  const registry = createSchemaRegistry();
  const at = (iso: string) => () => new Date(iso);

  function repo() {
    const store = new KernelBrowserStore(new MemoryKeyValueStorage());
    return new KernelRepository({ runtime: "browser", store });
  }

  const pr = (repository: string, number: number, firstLine: number) => ({
    repository,
    number,
    url: `https://github.com/${repository}/pull/${number}`,
    firstObservedAt: "2026-10-07T14:08:13.173Z",
    firstLine,
    observations: 1,
  });
  const branch = (name: string, lastObservedAt: string) => ({
    name,
    basis: "record",
    firstObservedAt: "2026-10-07T13:48:42.613Z",
    lastObservedAt,
    firstLine: 1,
  });
  const observed = (
    updatedAt: string,
    prs: ReturnType<typeof pr>[],
    lastBranchAt = updatedAt,
    extra: Partial<AgentWorkSessionMeta> = {},
  ) =>
    meta({
      sessionId: "segment-1",
      startedAt: "2026-10-07T13:48:42.613Z",
      updatedAt,
      messageCount: 46,
      messageCountComplete: false,
      title: "재개 점검",
      activityClass: "conversation",
      interaction: "interactive",
      evidence: {
        prs,
        branches: [branch("main", lastBranchAt)],
        repositories: [...new Set(prs.map((entry) => entry.repository))],
        complete: true,
        scannedBytes: 1234,
      },
      ...extra,
    });
  const id = autoImportedSessionId(observed("x", []));
  const poll = (repository: KernelRepository, session: AgentWorkSessionMeta, iso: string) =>
    upsertAgentSessionRecords(repository, registry, [session], { now: at(iso) });
  const current = async (repository: KernelRepository) => (await repository.getRecord(id)).data as MoriRecord;
  const trail = async (repository: KernelRepository) => (await repository.listRevisions(id)).data;

  it("stores structured observations with locators, not counts that move every poll", () => {
    const input = buildAgentSessionRecordInput(
      observed("2026-10-07T15:00:00Z", [pr("acme/app", 137, 812), { ...pr("acme/app", 139, 990), observations: 7 }]),
      [],
    );
    expect(input.properties).toMatchObject({ activityClass: "conversation", interaction: "interactive" });
    expect(input.properties?.sessionEvidence).toEqual({
      coverage: "complete",
      segment: "segment-1",
      prs: [
        { repository: "acme/app", number: 137, url: "https://github.com/acme/app/pull/137", firstObservedAt: "2026-10-07T14:08:13.173Z", line: 812 },
        { repository: "acme/app", number: 139, url: "https://github.com/acme/app/pull/139", firstObservedAt: "2026-10-07T14:08:13.173Z", line: 990 },
      ],
      branches: [
        { name: "main", basis: "record", firstObservedAt: "2026-10-07T13:48:42.613Z", lastObservedAt: "2026-10-07T15:00:00Z", line: 1 },
      ],
      repositories: ["acme/app"],
    });
    // No prose: the record body is the same one honest line as before.
    expect(input.body).toBe("Claude Code 세션");
  });

  it("writes nothing when the same evidence is observed again, even if links repeated", async () => {
    const repository = repo();
    await poll(repository, observed("2026-10-07T15:00:00Z", [pr("acme/app", 137, 812)]), "2026-10-07T15:00:00Z");
    const repeated = observed("2026-10-07T15:00:00Z", [{ ...pr("acme/app", 137, 812), observations: 9 }]);
    const result = await poll(repository, repeated, "2026-10-07T15:01:30Z");
    expect(result).toMatchObject({ unchanged: 1, updated: 0 });
    expect(await trail(repository)).toHaveLength(1);
  });

  it("adds newly linked PRs as growth: one superseded update, not one per poll", async () => {
    const repository = repo();
    await poll(repository, observed("2026-10-07T15:00:00Z", []), "2026-10-07T15:00:00Z");
    await poll(repository, observed("2026-10-07T15:30:00Z", [pr("acme/app", 137, 812)]), "2026-10-07T15:30:00Z");
    await poll(repository, observed("2026-10-07T16:00:00Z", [pr("acme/app", 137, 812), pr("acme/home", 139, 990)]), "2026-10-07T16:00:00Z");
    const revisions = await trail(repository);
    expect(revisions.map((r) => [r.actor, r.operation])).toEqual([
      ["rule", "create"],
      ["rule", "update"],
    ]);
    const stored = (await current(repository)).properties.sessionEvidence as { prs: Array<{ number: number }> };
    expect(stored.prs.map((entry) => entry.number)).toEqual([137, 139]);
    // The superseding revision still reverts to the evidence before the stretch.
    const before = (revisions[1].before as MoriRecord).properties.sessionEvidence as { prs: unknown[] };
    expect(before.prs).toEqual([]);
  });

  it("keeps a user's rename and status while evidence keeps arriving", async () => {
    const repository = repo();
    await poll(repository, observed("2026-10-07T15:00:00Z", []), "2026-10-07T15:00:00Z");
    const renamed = applyRecordPatch(await current(repository), { title: "D0-D4 통합" }, "user", registry, at("2026-10-07T15:05:00Z"));
    await repository.saveRecord(renamed.record, renamed.revision);
    const parked = applyRecordPatch(await current(repository), { status: "archived" }, "user", registry, at("2026-10-07T15:06:00Z"));
    await repository.saveRecord(parked.record, parked.revision);
    const result = await poll(repository, observed("2026-10-07T16:00:00Z", [pr("acme/app", 153, 1500)]), "2026-10-07T16:00:00Z");
    // An archived record is the user's: automation does not write to it at all.
    expect(result).toMatchObject({ preserved: 1 });
    const record = await current(repository);
    expect(record.title).toBe("D0-D4 통합");
    expect(record.status).toBe("archived");
    expect((await trail(repository)).map((r) => [r.actor, r.operation])).toEqual([
      ["rule", "create"],
      ["user", "update"],
      ["user", "status-change"],
    ]);
  });

  it("never folds evidence growth into a revision across a user edit", async () => {
    const repository = repo();
    await poll(repository, observed("2026-10-07T15:00:00Z", []), "2026-10-07T15:00:00Z");
    await poll(repository, observed("2026-10-07T15:30:00Z", [pr("acme/app", 137, 812)]), "2026-10-07T15:30:00Z");
    const renamed = applyRecordPatch(await current(repository), { title: "사용자 제목" }, "user", registry, at("2026-10-07T15:35:00Z"));
    await repository.saveRecord(renamed.record, renamed.revision);
    await poll(repository, observed("2026-10-07T16:00:00Z", [pr("acme/app", 137, 812), pr("acme/app", 139, 990)]), "2026-10-07T16:00:00Z");
    expect((await trail(repository)).map((r) => [r.actor, r.operation])).toEqual([
      ["rule", "create"],
      ["rule", "update"],
      ["user", "update"],
      ["rule", "update"],
    ]);
    expect((await current(repository)).title).toBe("사용자 제목");
  });

  it("backfills evidence onto a record written before evidence existed, once", async () => {
    const repository = repo();
    const legacy = meta({ sessionId: "segment-1", startedAt: "2026-10-07T13:48:42.613Z", updatedAt: "2026-10-07T15:00:00Z", messageCount: 46, messageCountComplete: false, title: "재개 점검" });
    await poll(repository, legacy, "2026-10-07T15:00:00Z");
    expect((await current(repository)).properties.sessionEvidence).toBeUndefined();
    const withEvidence = observed("2026-10-07T15:00:00Z", [pr("acme/app", 137, 812)]);
    await poll(repository, withEvidence, "2026-10-08T09:00:00Z");
    await poll(repository, withEvidence, "2026-10-08T09:01:30Z");
    const revisions = await trail(repository);
    expect(revisions).toHaveLength(2);
    expect((await current(repository)).properties).toMatchObject({ activityClass: "conversation", interaction: "interactive" });
  });
});

describe("session outcome evidence across an app restart", () => {
  const registry = createSchemaRegistry();
  const at = (iso: string) => () => new Date(iso);
  const repo = () => new KernelRepository({ runtime: "browser", store: new KernelBrowserStore(new MemoryKeyValueStorage()) });
  const pr = (number: number) => ({
    repository: "acme/infra",
    number,
    url: "",
    firstObservedAt: "2026-10-01T00:00:00Z",
    firstLine: number,
    observations: 1,
  });
  const seen = (prs: number[], complete: boolean, extra: Partial<AgentWorkSessionMeta> = {}) =>
    meta({
      sessionId: "segment-big",
      startedAt: "2026-09-09T04:01:18.269Z",
      updatedAt: "2026-10-08T07:00:00Z",
      title: "운영 작업",
      evidence: {
        prs: prs.map(pr),
        branches: [{ name: "main", basis: "record", firstObservedAt: "", lastObservedAt: "", firstLine: 1 }],
        repositories: ["acme/infra"],
        complete,
      },
      ...extra,
    });
  const id = autoImportedSessionId(seen([], true));

  it("does not shrink complete evidence when the first pass after a restart is partial", async () => {
    const repository = repo();
    await upsertAgentSessionRecords(repository, registry, [seen([1, 2, 3], true)], { now: at("2026-10-08T07:00:00Z") });
    const result = await upsertAgentSessionRecords(repository, registry, [seen([1], false)], { now: at("2026-10-08T08:00:00Z") });
    expect(result).toMatchObject({ unchanged: 1, updated: 0 });
    const stored = (await repository.getRecord(id)).data?.properties.sessionEvidence as { coverage: string; prs: unknown[] };
    expect(stored.coverage).toBe("complete");
    expect(stored.prs).toHaveLength(3);
  });

  it("still records a partial pass that found something new, or a different segment", async () => {
    const repository = repo();
    await upsertAgentSessionRecords(repository, registry, [seen([1, 2], true)], { now: at("2026-10-08T07:00:00Z") });
    await upsertAgentSessionRecords(repository, registry, [seen([1, 9], false)], { now: at("2026-10-08T08:00:00Z") });
    const stored = (await repository.getRecord(id)).data?.properties.sessionEvidence as { coverage: string; prs: Array<{ number: number }> };
    expect(stored.coverage).toBe("partial");
    expect(stored.prs.map((entry) => entry.number)).toEqual([1, 9]);
  });
});

describe("repository identity stays out of the kernel record", () => {
  it("writes no path and no project from the observed checkout", () => {
    const input = buildAgentSessionRecordInput(
      meta({ projectName: "/home/u/dev", repository: { root: "/home/u/dev/infra", basis: "session-record", worktreePath: "/home/u/dev/infra/.claude/worktrees/x", conflict: false } }),
      [{ id: "ctx-infra", type: "project", name: "infra", createdAt: "x" }],
    );
    expect(JSON.stringify(input)).not.toContain("/home/u/dev/infra");
    expect(input.contextIds).toEqual([]);
  });
});
