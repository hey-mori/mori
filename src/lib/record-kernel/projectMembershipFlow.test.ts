/**
 * Reviewed project membership end to end, on a desktop repository whose SQLite
 * stand-in round-trips every value through the real row converters. Frozen
 * cases (2026-10-08 membership evaluation) 1, 8, 9, 13, 14, 15 and the
 * fallback rule.
 */
import { describe, expect, it } from "vitest";
import { applyMembershipDecision } from "./projectMembership";
import { upsertAgentSessionRecords } from "./agentSessionRecordAdapter";
import { autoImportedSessionId } from "../session/autoImportSessions";
import { createSchemaRegistry } from "./schemaRegistry";
import { KernelRepository, type KernelDesktopCommands } from "./kernelRepository";
import { KernelBrowserStore } from "./kernelStore";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";
import type { KernelContext, MoriRecord } from "./kernelTypes";
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import type {
  SqliteKernelObjectRow,
  SqliteKernelRecordRow,
  SqliteKernelRevisionRow,
} from "../sqlite/kernelRows";

type Disk = {
  records: Map<string, SqliteKernelRecordRow>;
  objects: SqliteKernelObjectRow[];
  revisions: SqliteKernelRevisionRow[];
  failWrites: boolean;
};

function disk(): Disk {
  return { records: new Map(), objects: [], revisions: [], failWrites: false };
}

function commands(state: Disk): KernelDesktopCommands {
  return {
    saveKernelRecordRows: async (rows: SqliteKernelRecordRow[]) => {
      if (state.failWrites) throw new Error("disk full");
      for (const row of rows) state.records.set(row.id, row);
      return { rowsWritten: rows.length };
    },
    listKernelRecordRows: async () => [...state.records.values()],
    getKernelRecordRow: async (id: string) => state.records.get(id) ?? null,
    deleteKernelRecordRow: async () => 0,
    searchKernelRecordRows: async () => [],
    saveKernelObjectRows: async (rows: SqliteKernelObjectRow[]) => {
      for (const row of rows) {
        const index = state.objects.findIndex((entry) => entry.collection === row.collection && entry.id === row.id);
        if (index >= 0) state.objects[index] = row;
        else state.objects.push(row);
      }
      return { rowsWritten: rows.length };
    },
    listKernelObjectRows: async (collection: string) => state.objects.filter((row) => row.collection === collection),
    appendKernelRevisionRows: async (rows: SqliteKernelRevisionRow[]) => {
      if (state.failWrites) throw new Error("disk full");
      state.revisions.push(...rows);
      return { rowsWritten: rows.length };
    },
    listKernelRevisionRows: async (recordId: string) => state.revisions.filter((row) => row.record_id === recordId),
  };
}

/** A fresh process over the same disk: nothing carried in memory. */
function open(state: Disk) {
  return new KernelRepository({
    runtime: "desktop",
    store: new KernelBrowserStore(new MemoryKeyValueStorage()),
    commands: commands(state),
  });
}

const registry = createSchemaRegistry();
const at = (iso: string) => () => new Date(iso);
const infra: KernelContext = { id: "ctx-infra", type: "project", name: "infra", createdAt: "2026-10-08T00:00:00Z" };
const home: KernelContext = { id: "ctx-home", type: "project", name: "home", createdAt: "2026-10-08T00:00:00Z" };
const routine: KernelContext = { id: "ctx-routine", type: "routine", name: "아침", createdAt: "2026-10-08T00:00:00Z" };

function worktreeSession(updatedAt: string): AgentWorkSessionMeta {
  return {
    agentId: "claude",
    agentName: "Claude Code",
    importKind: "claude-code",
    id: "wt-session",
    sessionId: "wt-session",
    projectPath: "/home/u/dev",
    projectName: "/home/u/dev",
    filePath: "/x/wt-session.jsonl",
    sourceFilePath: "/x/wt-session.jsonl",
    startedAt: "2026-09-16T06:15:31.016Z",
    updatedAt,
    messageCount: 40,
    title: "저장소 구조 작업",
    activityClass: "conversation",
    interaction: "interactive",
    repository: { root: "/home/u/dev/infra", basis: "session-record", worktreePath: "/home/u/dev/infra/.claude/worktrees/s", conflict: false },
  };
}

const id = autoImportedSessionId(worktreeSession("x"));

async function seed(state: Disk) {
  const repo = open(state);
  for (const context of [infra, home, routine]) await repo.saveContext(context);
  await upsertAgentSessionRecords(repo, registry, [worktreeSession("2026-10-08T06:00:00Z")], { now: at("2026-10-08T06:00:00Z") });
}

const read = async (state: Disk) => (await open(state).getRecord(id)).data as MoriRecord;
const trail = async (state: Disk) => (await open(state).listRevisions(id)).data;
const poll = (state: Disk, updatedAt: string) =>
  upsertAgentSessionRecords(open(state), registry, [worktreeSession(updatedAt)], { now: at(updatedAt) });

describe("reviewed project membership · durable flow", () => {
  it("writes nothing before the operator confirms, then one user revision that survives restart and polls", async () => {
    const state = disk();
    await seed(state);
    await poll(state, "2026-10-08T06:01:30Z");
    expect((await read(state)).contextIds).toEqual([]);

    const outcome = await applyMembershipDecision(open(state), registry, {
      recordId: id,
      decision: "confirm",
      contextId: "ctx-infra",
      expectedProjectId: null,
      now: at("2026-10-08T06:02:00Z"),
    });
    expect(outcome.ok).toBe(true);

    // A fresh process reads it from disk, and later polls do not touch it.
    await poll(state, "2026-10-08T06:03:00Z");
    await poll(state, "2026-10-08T06:04:30Z");
    const record = await read(state);
    expect(record.contextIds).toEqual(["ctx-infra"]);
    expect(record.occurredEnd).toBe("2026-10-08T06:04:30Z");

    const userRevisions = (await trail(state)).filter((revision) => revision.actor === "user");
    expect(userRevisions).toHaveLength(1);
    const before = userRevisions[0].before as MoriRecord;
    const after = userRevisions[0].after as MoriRecord;
    expect(before.contextIds).toEqual([]);
    expect(after.contextIds).toEqual(["ctx-infra"]);
    // Only the membership changed in the operator's revision.
    expect({ ...after, contextIds: before.contextIds, updatedAt: before.updatedAt }).toEqual(before);
    // No source path was copied into the record.
    expect(JSON.stringify(record)).not.toContain("/home/u/dev");
  });

  it("keeps a session's newer end time when it grew between display and confirmation", async () => {
    const state = disk();
    await seed(state);
    await poll(state, "2026-10-08T07:30:00Z");
    await applyMembershipDecision(open(state), registry, { recordId: id, decision: "confirm", contextId: "ctx-infra", expectedProjectId: null });
    expect((await read(state)).occurredEnd).toBe("2026-10-08T07:30:00Z");
  });

  it("refuses a stale confirmation instead of overwriting a newer filing", async () => {
    const state = disk();
    await seed(state);
    await applyMembershipDecision(open(state), registry, { recordId: id, decision: "confirm", contextId: "ctx-home", expectedProjectId: null });
    const stale = await applyMembershipDecision(open(state), registry, { recordId: id, decision: "confirm", contextId: "ctx-infra", expectedProjectId: null });
    expect(stale).toEqual({ ok: false, reason: "stale" });
    expect((await read(state)).contextIds).toEqual(["ctx-home"]);
  });

  it("refuses a duplicate confirmation without a second revision", async () => {
    const state = disk();
    await seed(state);
    await applyMembershipDecision(open(state), registry, { recordId: id, decision: "confirm", contextId: "ctx-infra", expectedProjectId: null });
    const again = await applyMembershipDecision(open(state), registry, { recordId: id, decision: "confirm", contextId: "ctx-infra", expectedProjectId: "ctx-infra" });
    expect(again).toEqual({ ok: false, reason: "unchanged" });
    expect((await trail(state)).filter((revision) => revision.actor === "user")).toHaveLength(1);
  });

  it("refuses a project archived after the suggestion was shown", async () => {
    const state = disk();
    await seed(state);
    await open(state).saveContext({ ...infra, archived: true });
    const outcome = await applyMembershipDecision(open(state), registry, { recordId: id, decision: "confirm", contextId: "ctx-infra", expectedProjectId: null });
    expect(outcome).toEqual({ ok: false, reason: "archived-context" });
    expect((await read(state)).contextIds).toEqual([]);
  });

  it("unfiles durably, keeps other contexts, and later polls do not reattach", async () => {
    const state = disk();
    await seed(state);
    const repo = open(state);
    const current = (await repo.getRecord(id)).data as MoriRecord;
    // The operator had also put the session under a routine.
    const { applyRecordPatch } = await import("./recordFactory");
    const withRoutine = applyRecordPatch(current, { contextIds: ["ctx-routine"] }, "user", registry);
    await repo.saveRecord(withRoutine.record, withRoutine.revision);

    await applyMembershipDecision(open(state), registry, { recordId: id, decision: "confirm", contextId: "ctx-infra", expectedProjectId: null });
    await applyMembershipDecision(open(state), registry, { recordId: id, decision: "unfile", contextId: "ctx-infra", expectedProjectId: "ctx-infra" });
    await poll(state, "2026-10-08T08:00:00Z");
    await poll(state, "2026-10-08T08:01:30Z");

    const record = await read(state);
    expect(record.contextIds).toEqual(["ctx-routine"]);
    expect(record.properties.projectReview).toEqual({ rejected: ["ctx-infra"] });
    expect(record.occurredEnd).toBe("2026-10-08T08:01:30Z");
  });

  it("reports a write that fell back to browser storage as a failure, not a membership", async () => {
    const state = disk();
    await seed(state);
    state.failWrites = true;
    const outcome = await applyMembershipDecision(open(state), registry, { recordId: id, decision: "confirm", contextId: "ctx-infra", expectedProjectId: null });
    expect(outcome).toEqual({ ok: false, reason: "fell-back" });
    state.failWrites = false;
    expect((await read(state)).contextIds).toEqual([]);
  });
});
