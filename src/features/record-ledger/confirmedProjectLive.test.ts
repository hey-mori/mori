import { describe, expect, it } from "vitest";
import type { KernelContext, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { buildProjectSearchInventory, type SourceDescriptor } from "../../lib/session/projectSearch";
import { liveSourcesOf } from "../../lib/live-intake/confirmedLiveSources";
import { INTAKE_ROW_VERSION, type IntakeRequestRow } from "../../lib/live-intake/intakeTypes";
import { selectProjectPathForLabel } from "../../lib/live-intake";
import { confirmedLiveScopeFor } from "./confirmedLiveScope";
import {
  projectConfirmedLive,
  readConfirmedLive,
  type ConfirmedLiveScope,
} from "./useProjectLive";

// The real shape this guards: a session confirmed into `infra` whose agent ran
// in a worktree under the parent folder, so its rows carry `/home/me/dev`,
// while an unrelated session ran in a folder that happens to be named infra.

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const ctx = (id: string, name: string, extra: Partial<KernelContext> = {}): KernelContext => ({
  id,
  type: "project",
  name,
  createdAt: "2026-10-08T00:00:00Z",
  ...extra,
});
const infra = ctx("ctx-infra", "infra");
const storage = ctx("ctx-storage", "storage", { parentId: "ctx-infra" });
const oldChild = ctx("ctx-old", "old", { parentId: "ctx-infra", archived: true });
const other = ctx("ctx-other", "other");
const contexts = [infra, storage, oldChild, other];

function rec(id: string, overrides: Partial<MoriRecord> = {}): MoriRecord {
  return {
    id,
    schemaId: "agent-session",
    title: `세션 ${id}`,
    body: "",
    capturedAt: "2026-10-08T00:00:00Z",
    occurredStart: "2026-10-08T00:00:00Z",
    timeBasis: "source-observed",
    status: "active",
    origin: "automation",
    ownership: "db",
    contextIds: [],
    properties: { agentId: "claude" },
    createdAt: "2026-10-08T00:00:00Z",
    updatedAt: "2026-10-08T00:00:00Z",
    ...overrides,
  };
}

const WORKTREE = "/home/me/.claude/projects/-home-me-dev/gate4.jsonl";
const SOURCES: Record<string, string> = {
  gate4: WORKTREE,
  child: "/home/me/.claude/projects/-home-me-dev-infra-storage/child.jsonl",
  folder: "/home/me/.claude/projects/-home-me-dev-infra/folder.jsonl",
  lookalike: "/home/me/.claude/projects/-home-me-dev-x/lookalike.jsonl",
  archivedChild: "/home/me/.claude/projects/-home-me-dev-old/old.jsonl",
  otherProject: "/home/me/.claude/projects/-home-me-dev-other/o.jsonl",
};
const descriptorOf = (id: string): SourceDescriptor | null =>
  SOURCES[id] ? { agentName: "Claude Code", importKind: "claude-code", sourcePath: SOURCES[id] } : null;

const records = [
  rec("gate4", { contextIds: ["ctx-infra"], title: "Gate 4" }),
  rec("child", { contextIds: ["ctx-storage"] }),
  // Not a member: ran in the folder named infra, or merely shares a title.
  rec("folder", { title: "infra" }),
  rec("lookalike", { title: "Gate 4" }),
  rec("archivedChild", { contextIds: ["ctx-old"] }),
  rec("otherProject", { contextIds: ["ctx-other"] }),
];

function row(partial: Partial<IntakeRequestRow> & { id: string; sessionKey: string }): IntakeRequestRow {
  return {
    schemaVersion: INTAKE_ROW_VERSION,
    projectPath: "/home/me/dev",
    sessionLabel: "dev",
    title: "an ask",
    titleTruncated: false,
    startedAt: ago(10),
    endedAt: ago(2),
    stepCount: 3,
    tools: [],
    files: [],
    hasError: false,
    status: "completed",
    locator: { path: partial.sessionKey, offset: 0 },
    observedAt: ago(1),
    ...partial,
  };
}

function fakeStore(rows: IntakeRequestRow[], opts: { ignoreKey?: boolean } = {}) {
  const reads: string[] = [];
  return {
    reads,
    async listSessionRows(key: string) {
      reads.push(key);
      return opts.ignoreKey ? rows : rows.filter((r) => r.sessionKey === key);
    },
    async listProjectPaths() {
      return [...new Set(rows.map((r) => r.projectPath))];
    },
    async listProjectRows(path: string) {
      return rows.filter((r) => r.projectPath === path);
    },
  };
}

function scopeFor(projectId: string, label: string, recs = records): { scope: ConfirmedLiveScope; sessionByKey: ReadonlyMap<string, string | null> } {
  const inventory = buildProjectSearchInventory({ projectId, contexts, records: recs, descriptorOf });
  const sources = liveSourcesOf(inventory.kind === "ok" ? inventory.entries : []);
  return { scope: { projectId, label, keys: sources.keys }, sessionByKey: sources.sessionByKey };
}

const waitingGate4 = row({ id: "g1", sessionKey: WORKTREE, title: "Gate 4, waiting on you", status: "waitingForUser" });
const runningInFolder = row({
  id: "f1",
  sessionKey: SOURCES.folder,
  projectPath: "/home/me/dev/infra",
  sessionLabel: "infra",
  status: "running",
  endedAt: undefined,
});
const runningLookalike = row({ id: "l1", sessionKey: SOURCES.lookalike, projectPath: "/home/me/dev/x", status: "running", endedAt: undefined });
const childDone = row({ id: "c1", sessionKey: SOURCES.child, projectPath: "/home/me/dev/infra/storage", status: "completed" });
const archivedRunning = row({ id: "a1", sessionKey: SOURCES.archivedChild, projectPath: "/home/me/dev/old", status: "running", endedAt: undefined });
const otherWaiting = row({ id: "o1", sessionKey: SOURCES.otherProject, projectPath: "/home/me/dev/other", status: "waitingForUser" });
const ALL = [waitingGate4, runningInFolder, runningLookalike, childDone, archivedRunning, otherWaiting];

describe("현재 상황 of a reviewed project", () => {
  it("counts a confirmed worktree session's waiting request under its project", async () => {
    const { scope } = scopeFor("ctx-infra", "infra");
    const out = projectConfirmedLive(await readConfirmedLive(fakeStore(ALL), scope), scope, NOW);
    expect(out.projection?.label).toBe("infra");
    expect(out.projection?.waiting.map((r) => r.title)).toEqual(["Gate 4, waiting on you"]);
    expect(out.projection?.waitingCount).toBe(1);
  });

  it("rolls up active descendants and leaves archived ones out", async () => {
    const { scope } = scopeFor("ctx-infra", "infra");
    expect(scope.keys).toContain(SOURCES.child);
    expect(scope.keys).not.toContain(SOURCES.archivedChild);
    const out = projectConfirmedLive(await readConfirmedLive(fakeStore(ALL), scope), scope, NOW);
    expect(out.projection?.runningCount).toBe(0);
    expect(out.projection?.recentRequests.map((r) => r.id).sort()).toEqual(["c1", "g1"]);
  });

  it("never counts a session from the folder named like the project, only says it was seen", async () => {
    const { scope } = scopeFor("ctx-infra", "infra");
    const out = projectConfirmedLive(await readConfirmedLive(fakeStore(ALL), scope), scope, NOW);
    expect(out.projection?.runningCount).toBe(0);
    expect(out.projection?.recentRequests.some((r) => r.sessionKey === SOURCES.folder)).toBe(false);
    expect(out.unconfirmedObserved).toBe(1);
  });

  it("does not call a confirmed session unconfirmed when it also ran in the named folder", async () => {
    const { scope } = scopeFor("ctx-infra", "infra");
    const gate4InFolder = row({ id: "g2", sessionKey: WORKTREE, projectPath: "/home/me/dev/infra", sessionLabel: "infra" });
    const out = projectConfirmedLive(await readConfirmedLive(fakeStore([...ALL, gate4InFolder]), scope), scope, NOW);
    expect(out.unconfirmedObserved).toBe(1);
    expect(out.projection?.recentRequests.map((r) => r.id)).toContain("g2");
  });

  it("never joins by title: a same-titled session elsewhere stays out", async () => {
    const { scope } = scopeFor("ctx-infra", "infra");
    expect(scope.keys).not.toContain(SOURCES.lookalike);
    const store = fakeStore(ALL);
    await readConfirmedLive(store, scope);
    expect(store.reads).not.toContain(SOURCES.lookalike);
  });

  it("keeps another project's sessions on that project", async () => {
    const { scope } = scopeFor("ctx-other", "other");
    const out = projectConfirmedLive(await readConfirmedLive(fakeStore(ALL), scope), scope, NOW);
    expect(out.projection?.waiting.map((r) => r.id)).toEqual(["o1"]);
  });

  it("reads only the confirmed sessions, one session at a time", async () => {
    const { scope } = scopeFor("ctx-infra", "infra");
    const store = fakeStore(ALL);
    await readConfirmedLive(store, scope);
    expect(store.reads.sort()).toEqual([SOURCES.child, WORKTREE].sort());
  });

  it("drops rows a backend returns for a session it was not asked for", async () => {
    const { scope } = scopeFor("ctx-infra", "infra");
    const out = projectConfirmedLive(await readConfirmedLive(fakeStore(ALL, { ignoreKey: true }), scope), scope, NOW);
    expect(out.projection?.runningCount).toBe(0);
    expect(out.projection?.recentRequests.map((r) => r.id).sort()).toEqual(["c1", "g1"]);
  });

  it("shows an old waiting request as last observed, not as waiting now", async () => {
    const { scope } = scopeFor("ctx-infra", "infra");
    const old = { ...waitingGate4, endedAt: ago(60 * 30), observedAt: ago(60 * 30) };
    const out = projectConfirmedLive(await readConfirmedLive(fakeStore([old]), scope), scope, NOW);
    expect(out.projection?.freshness).toBe("stale");
    expect(out.projection?.waitingCount).toBe(0);
    expect(out.projection?.recentRequests[0]?.status).toBe("unknown");
  });

  it("does not let a fresh member revive another member's stale waiting request", async () => {
    const { scope } = scopeFor("ctx-infra", "infra");
    const old = { ...waitingGate4, endedAt: ago(60 * 30), observedAt: ago(60 * 30) };
    const out = projectConfirmedLive(await readConfirmedLive(fakeStore([old, childDone]), scope), scope, NOW);
    expect(out.projection?.freshness).toBe("live");
    expect(out.projection?.waitingCount).toBe(0);
    expect(out.projection?.waiting).toEqual([]);
  });

  it("shows nothing when no confirmed session was observed", async () => {
    const { scope } = scopeFor("ctx-infra", "infra");
    const out = projectConfirmedLive(await readConfirmedLive(fakeStore([runningInFolder]), scope), scope, NOW);
    expect(out.projection).toBeNull();
    expect(out.unconfirmedObserved).toBe(1);
  });

  it("shows nothing for a project that cannot be resolved", async () => {
    const { scope } = scopeFor("ctx-missing", "missing");
    expect(scope.keys).toEqual([]);
    const out = projectConfirmedLive(await readConfirmedLive(fakeStore(ALL), scope), scope, NOW);
    expect(out.projection).toBeNull();
  });

  it("shows nothing while the kernel is loading", () => {
    expect(projectConfirmedLive({ projectId: "ctx-infra", rows: ALL, unconfirmed: 0 }, null, NOW).projection).toBeNull();
  });
});

describe("races on the project page", () => {
  it("never shows a read that landed for the project the user left", async () => {
    const infraScope = scopeFor("ctx-infra", "infra").scope;
    const otherScope = scopeFor("ctx-other", "other").scope;
    const lateRead = await readConfirmedLive(fakeStore(ALL), infraScope);
    expect(projectConfirmedLive(lateRead, otherScope, NOW).projection).toBeNull();
  });

  it("never shows a parent's read on a child selected mid-read", async () => {
    const parentRead = await readConfirmedLive(fakeStore(ALL), scopeFor("ctx-infra", "infra").scope);
    const out = projectConfirmedLive(parentRead, scopeFor("ctx-storage", "storage").scope, NOW);
    expect(out.projection).toBeNull();
    expect(out.unconfirmedObserved).toBe(0);
  });

  it("drops a session unfiled while its rows were in flight", async () => {
    const before = scopeFor("ctx-infra", "infra").scope;
    const read = await readConfirmedLive(fakeStore(ALL), before);
    const unfiled = records.map((r) => (r.id === "gate4" ? { ...r, contextIds: [] } : r));
    const after = scopeFor("ctx-infra", "infra", unfiled).scope;
    const out = projectConfirmedLive(read, after, NOW);
    expect(out.projection?.waitingCount).toBe(0);
    expect(out.projection?.recentRequests.map((r) => r.id)).toEqual(["c1"]);
  });

  it("drops a session archived while its rows were in flight", async () => {
    const before = scopeFor("ctx-infra", "infra").scope;
    const read = await readConfirmedLive(fakeStore(ALL), before);
    const archived = records.map((r) => (r.id === "gate4" ? { ...r, status: "archived" as MoriRecord["status"] } : r));
    const out = projectConfirmedLive(read, scopeFor("ctx-infra", "infra", archived).scope, NOW);
    expect(out.projection?.waitingCount).toBe(0);
  });
});

describe("opening a request from 현재 상황", () => {
  it("maps a worktree row to its confirmed session, not to a same-titled one", () => {
    const { sessionByKey } = scopeFor("ctx-infra", "infra");
    expect(sessionByKey.get(WORKTREE)).toBe("gate4");
    expect(sessionByKey.has(SOURCES.lookalike)).toBe(false);
  });

  it("opens neither when two members name the same file", () => {
    const twin = rec("twin", { contextIds: ["ctx-infra"] });
    const inventory = buildProjectSearchInventory({
      projectId: "ctx-infra",
      contexts,
      records: [...records, twin],
      descriptorOf: (id) => (id === "twin" ? descriptorOf("gate4") : descriptorOf(id)),
    });
    const sources = liveSourcesOf(inventory.kind === "ok" ? inventory.entries : []);
    expect(sources.sessionByKey.get(WORKTREE)).toBeNull();
    // Its rows are still the project's: both sessions are members.
    expect(sources.keys).toContain(WORKTREE);
  });
});

describe("negative control", () => {
  it("the folder-name lookup could never find the worktree session for infra", () => {
    const paths = [...new Set(ALL.map((r) => r.projectPath))];
    const folder = selectProjectPathForLabel(paths, "infra");
    // It finds the unrelated folder named infra, and only that.
    expect(folder).toBe("/home/me/dev/infra");
    expect(ALL.filter((r) => r.projectPath === folder).map((r) => r.id)).toEqual(["f1"]);
  });
});

describe("what the aside counts", () => {
  const folderRow = (id: string, key: string, observedAt = ago(1)) =>
    row({ id, sessionKey: key, projectPath: "/home/me/dev/infra", sessionLabel: "infra", observedAt });
  const FILED = "/f/filed-elsewhere.jsonl";
  const REJECTED = "/f/rejected.jsonl";
  const UNKNOWN = "/f/unknown.jsonl";
  const OLD = "/f/old.jsonl";
  const extra = [
    rec("filed", { contextIds: ["ctx-other"] }),
    rec("rejected", { properties: { agentId: "claude", projectReview: { rejected: ["ctx-infra"] } } }),
    rec("old"),
  ];
  const fileToSession: Record<string, string> = { [FILED]: "filed", [REJECTED]: "rejected", [OLD]: "old" };

  function liveFor(recs = [...records, ...extra]) {
    const sources = confirmedLiveScopeFor({
      project: infra,
      loading: false,
      inventory: buildProjectSearchInventory({ projectId: "ctx-infra", contexts, records: recs, descriptorOf }),
      records: recs,
      contexts,
      sessionIdOfFile: (key) => fileToSession[key] ?? (key === SOURCES.folder ? "folder" : undefined),
    });
    return sources!.scope;
  }

  it("leaves out sessions filed elsewhere, rejected here, or seen long ago", async () => {
    const scope = liveFor();
    const rows = [
      waitingGate4,
      runningInFolder,
      folderRow("x1", FILED),
      folderRow("x2", REJECTED),
      folderRow("x3", UNKNOWN),
      folderRow("x4", OLD, ago(60 * 24)),
    ];
    const out = projectConfirmedLive(await readConfirmedLive(fakeStore(rows), scope, NOW), scope, NOW);
    // The unfiled folder session and the one with no record are counted.
    expect(out.unconfirmedObserved).toBe(2);
  });
});

describe("the page's scope", () => {
  const input = {
    project: infra,
    inventory: buildProjectSearchInventory({ projectId: "ctx-infra", contexts, records, descriptorOf }),
    records,
    contexts,
    sessionIdOfFile: () => undefined,
  };

  it("reads nothing while the kernel is loading", () => {
    expect(confirmedLiveScopeFor({ ...input, loading: true })).toBeNull();
  });

  it("reads nothing on a folder group", () => {
    expect(confirmedLiveScopeFor({ ...input, project: null, loading: false })).toBeNull();
  });

  it("never uses another project's inventory", () => {
    const scoped = confirmedLiveScopeFor({ ...input, project: other, loading: false });
    expect(scoped?.scope.keys).toEqual([]);
  });

  it("reads the confirmed sources once loaded", () => {
    expect(confirmedLiveScopeFor({ ...input, loading: false })?.scope.keys).toContain(WORKTREE);
  });
});
