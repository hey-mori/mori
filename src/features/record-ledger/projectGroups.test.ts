import { describe, expect, it } from "vitest";
import type {
  KernelContext,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import { buildProjectGroups } from "./projectGroups";

function session(overrides: Partial<StoredSessionSummary> & { sessionId: string }): StoredSessionSummary {
  return {
    projectId: "p",
    title: overrides.sessionId,
    projectName: "proj",
    savedAt: "2026-07-14T09:00:00.000Z",
    status: "complete",
    ...overrides,
  };
}

function record(id: string, contextIds: string[] = []): MoriRecord {
  return {
    id,
    schemaId: "note",
    title: id,
    body: "",
    capturedAt: "2026-07-14T09:00:00Z",
    timeBasis: "unknown",
    status: "active",
    origin: "user",
    ownership: "db",
    contextIds,
    properties: {},
    createdAt: "2026-07-14T09:00:00Z",
    updatedAt: "2026-07-14T09:00:00Z",
  };
}

const moriCtx: KernelContext = { id: "ctx-mori", type: "project", name: "mori", createdAt: "x" };

describe("buildProjectGroups", () => {
  it("groups sessions by their source label's leaf", () => {
    const groups = buildProjectGroups(
      [
        session({ sessionId: "s1", sourceLabel: "C:/dev/mori" }),
        session({ sessionId: "s2", sourceLabel: "C:/dev/mori" }),
        session({ sessionId: "s3", sourceLabel: "C:/dev/tcc-ng-gw" }),
      ],
      [],
      [],
      [],
    );
    expect(groups.map((g) => g.name).sort()).toEqual(["mori", "tcc-ng-gw"]);
    const mori = groups.find((g) => g.name === "mori");
    expect(mori?.sessions).toHaveLength(2);
  });

  it("merges a kernel context and its sessions into one project group", () => {
    const groups = buildProjectGroups(
      [session({ sessionId: "s1", sourceLabel: "C:/dev/mori" })],
      [moriCtx],
      [record("r1", ["ctx-mori"])],
      [],
    );
    // One "mori" group, carrying both the session and the record.
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("mori");
    expect(groups[0].sessions).toHaveLength(1);
    expect(groups[0].records).toHaveLength(1);
    expect(groups[0].context?.id).toBe("ctx-mori");
  });

  it("keeps a session with no source label under its project name", () => {
    const groups = buildProjectGroups(
      [session({ sessionId: "s1", projectName: "proj" })],
      [],
      [],
      [],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("proj");
    expect(groups[0].sessions).toHaveLength(1);
  });

  it("falls back to a 기타 bucket when a session has neither label nor name", () => {
    const groups = buildProjectGroups(
      [session({ sessionId: "s1", sourceLabel: undefined, projectName: "" })],
      [],
      [],
      [],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("기타");
  });

  it("sorts busiest project first", () => {
    const groups = buildProjectGroups(
      [
        session({ sessionId: "s1", sourceLabel: "C:/dev/quiet" }),
        session({ sessionId: "s2", sourceLabel: "C:/dev/busy" }),
        session({ sessionId: "s3", sourceLabel: "C:/dev/busy" }),
      ],
      [],
      [],
      [],
    );
    expect(groups[0].name).toBe("busy");
  });

  it("keeps two same-named projects under different parents apart", () => {
    // The leaf key used to merge these into ONE group, mixing 회사's records
    // with 개인's under a single heading. They are different projects.
    const 회사: KernelContext = { id: "c1", type: "area", name: "회사", createdAt: "x" };
    const 개인: KernelContext = { id: "c2", type: "area", name: "개인", createdAt: "x" };
    const work: KernelContext = { id: "c3", type: "project", name: "mori", parentId: "c1", createdAt: "x" };
    const home: KernelContext = { id: "c4", type: "project", name: "mori", parentId: "c2", createdAt: "x" };
    const groups = buildProjectGroups(
      [],
      [회사, 개인, work, home],
      [record("a", ["c3"]), record("b", ["c4"])],
      [],
    );
    const moris = groups.filter((g) => g.name === "mori");
    expect(moris).toHaveLength(2);
    expect(moris.map((g) => g.parentPath).sort()).toEqual(["개인", "회사"]);
    // Each holds only its own record, not the other's.
    const work그룹 = moris.find((g) => g.parentPath === "회사");
    expect(work그룹?.records.map((r) => r.id)).toEqual(["a"]);
  });

  it("does not guess which same-named nested project a session belongs to", () => {
    // Two contexts own the leaf "mori" and neither path IS "mori", so a
    // filesystem path cannot say which. Filing real work under the wrong
    // project silently is worse than leaving it visibly unfiled.
    const 회사: KernelContext = { id: "c1", type: "area", name: "회사", createdAt: "x" };
    const 개인: KernelContext = { id: "c2", type: "area", name: "개인", createdAt: "x" };
    const work: KernelContext = { id: "c3", type: "project", name: "mori", parentId: "c1", createdAt: "x" };
    const home: KernelContext = { id: "c4", type: "project", name: "mori", parentId: "c2", createdAt: "x" };
    const groups = buildProjectGroups(
      [session({ sessionId: "s1", sourceLabel: "C:/dev/mori" })],
      [회사, 개인, work, home],
      [record("a", ["c3"]), record("b", ["c4"])],
      [],
    );
    // The session landed in neither context-backed group.
    for (const group of groups.filter((g) => g.context)) {
      expect(group.sessions).toHaveLength(0);
    }
    // And it was not dropped: it is visible in a group of its own.
    const unfiled = groups.find((g) => !g.context && g.sessions.length === 1);
    expect(unfiled?.sessions[0].sessionId).toBe("s1");
  });

  it("joins a session to a root context whose whole path is the leaf", () => {
    // An exact path match is not a guess, even when a nested project shares the
    // leaf, so this must resolve rather than fall through to 'ambiguous'.
    const 회사: KernelContext = { id: "c1", type: "area", name: "회사", createdAt: "x" };
    const work: KernelContext = { id: "c3", type: "project", name: "mori", parentId: "c1", createdAt: "x" };
    const root: KernelContext = { id: "c4", type: "project", name: "mori", createdAt: "x" };
    const groups = buildProjectGroups(
      [session({ sessionId: "s1", sourceLabel: "C:/dev/mori" })],
      [회사, work, root],
      [record("a", ["c3"]), record("b", ["c4"])],
      [],
    );
    const joined = groups.find((g) => g.context?.id === "c4");
    expect(joined?.sessions.map((s) => s.sessionId)).toEqual(["s1"]);
    // Every group still has a unique id, so navigation cannot land on two.
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
  });

  it("joins sessions to a project that holds no records yet", () => {
    // The flaw this pins: groups were seeded from groupRecordsByContext, which
    // drops a context with no records. So a project holding only SESSIONS had no
    // key, its own sessions fell through to an unfiled leaf group, and the
    // project read as empty while its work sat in a group beside it. This is
    // exactly what 프로젝트로 만들기 produces: a brand-new context, sessions only.
    const fresh: KernelContext = { id: "ctx-jinga", type: "project", name: "jinga", createdAt: "x" };
    const groups = buildProjectGroups(
      [session({ sessionId: "s1", sourceLabel: "C:/dev/jinga" })],
      [fresh],
      [],
      [],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].context?.id).toBe("ctx-jinga");
    expect(groups[0].sessions.map((s) => s.sessionId)).toEqual(["s1"]);
  });

  it("still joins a session to the one context that owns its leaf", () => {
    const groups = buildProjectGroups(
      [session({ sessionId: "s1", sourceLabel: "C:/dev/mori" })],
      [moriCtx],
      [record("a", ["ctx-mori"])],
      [],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions).toHaveLength(1);
    expect(groups[0].records).toHaveLength(1);
  });
});

// Project continuity (2026-10-08): a session is identified by its checkout, and
// a name match is never an identity. Shapes follow the NUC's real sessions with
// invented paths.
describe("buildProjectGroups · checkout identity", () => {
  const infraCtx: KernelContext = { id: "ctx-infra", type: "project", name: "infra", createdAt: "x" };
  const apiCtx: KernelContext = { id: "ctx-api", type: "project", name: "api", createdAt: "x" };
  const find = (groups: ReturnType<typeof buildProjectGroups>, id: string) =>
    groups.find((group) => group.sessions.some((entry) => entry.sessionId === id));

  it("files a Claude worktree session under the checkout it came from, not where it started", () => {
    // Began in ~/dev, entered a worktree of ~/dev/infra: the folder says `dev`.
    const groups = buildProjectGroups(
      [
        session({ sessionId: "main", sourceLabel: "/home/u/dev/infra", sourceRepository: "/home/u/dev/infra", sourceRepositoryBasis: "git-checkout" }),
        session({ sessionId: "wt", sourceLabel: "/home/u/dev", sourceRepository: "/home/u/dev/infra", sourceRepositoryBasis: "session-record" }),
      ],
      [infraCtx],
      [],
      [],
    );
    const infra = find(groups, "wt");
    expect(infra?.context?.id).toBe("ctx-infra");
    expect(infra?.sessions.map((entry) => entry.sessionId).sort()).toEqual(["main", "wt"]);
    expect(infra?.inclusion.wt).toEqual({ project: "context", identity: "worktree-record" });
    expect(groups.some((group) => group.name === "dev")).toBe(false);
  });

  it("puts two worktrees of one repository with their checkout", () => {
    const groups = buildProjectGroups(
      [
        session({ sessionId: "a", sourceLabel: "/home/u/dev/infra/.claude/worktrees/a", sourceRepository: "/home/u/dev/infra", sourceRepositoryBasis: "git-worktree" }),
        session({ sessionId: "b", sourceLabel: "/home/u/dev/infra-ci-plants", sourceRepository: "/home/u/dev/infra", sourceRepositoryBasis: "git-worktree" }),
      ],
      [],
      [],
      [],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("infra");
    expect(groups[0].inclusion.b).toEqual({ project: "checkout", identity: "git-worktree" });
  });

  it("keeps two checkouts with the same name apart and joins neither to a project by name", () => {
    const sessions = [
      session({ sessionId: "work", sourceLabel: "/srv/work/api" }),
      session({ sessionId: "play", sourceLabel: "/home/u/play/api" }),
    ];
    const unfiled = buildProjectGroups(sessions, [], [], []);
    expect(unfiled).toHaveLength(2);
    expect(unfiled.map((group) => group.parentPath).sort()).toEqual(["play", "work"]);

    const withContext = buildProjectGroups(sessions, [apiCtx], [], []);
    const project = withContext.find((group) => group.context?.id === "ctx-api");
    expect(project?.sessions).toEqual([]);
    expect(project?.candidates.map((entry) => entry.sessionId).sort()).toEqual(["play", "work"]);
    expect(find(withContext, "work")?.context).toBeNull();
  });

  it("still joins a project by name when only one checkout carries the name", () => {
    const groups = buildProjectGroups(
      [session({ sessionId: "s1", sourceLabel: "C:/dev/mori" }), session({ sessionId: "s2", sourceLabel: "c:\\dev\\mori\\" })],
      [moriCtx],
      [],
      [],
    );
    const mori = groups.find((group) => group.context?.id === "ctx-mori");
    expect(mori?.sessions).toHaveLength(2);
    expect(mori?.candidates).toEqual([]);
  });

  it("honours an alias the user confirmed, and says so", () => {
    const connections = [
      { projectKey: "/home/u/dev/mori", aliases: ["C:/dev/mori"], createdAt: "x", updatedAt: "x" },
    ];
    const groups = buildProjectGroups(
      [
        session({ sessionId: "nuc", sourceLabel: "/home/u/dev/mori" }),
        session({ sessionId: "laptop", sourceLabel: "C:/dev/mori" }),
      ],
      [moriCtx],
      [],
      [],
      connections,
    );
    const mori = groups.find((group) => group.context?.id === "ctx-mori");
    expect(mori?.sessions.map((entry) => entry.sessionId).sort()).toEqual(["laptop", "nuc"]);
    expect(mori?.inclusion.laptop).toEqual({ project: "alias", identity: "folder" });
    expect(mori?.inclusion.nuc).toEqual({ project: "context", identity: "folder" });
    // Without the confirmation the two same-named checkouts are only candidates.
    const unconfirmed = buildProjectGroups(
      [session({ sessionId: "nuc", sourceLabel: "/home/u/dev/mori" }), session({ sessionId: "laptop", sourceLabel: "C:/dev/mori" })],
      [moriCtx],
      [],
      [],
    );
    expect(unconfirmed.find((group) => group.context?.id === "ctx-mori")?.sessions).toEqual([]);
  });

  it("files a session with no established checkout by its folder, unlinked", () => {
    const groups = buildProjectGroups([session({ sessionId: "s", sourceLabel: "/home/u/dev/home" })], [], [], []);
    expect(groups[0].inclusion.s).toEqual({ project: "checkout", identity: "folder" });
    expect(groups[0].context).toBeNull();
  });
});

// Reviewed membership (2026-10-08): the operator's filing in the record's
// contextIds decides the group; the projection only suggests.
describe("buildProjectGroups · reviewed membership", () => {
  const infraCtx: KernelContext = { id: "ctx-infra", type: "project", name: "infra", createdAt: "x" };
  const homeCtx: KernelContext = { id: "ctx-home", type: "project", name: "home", createdAt: "x" };
  const apiCtx: KernelContext = { id: "ctx-api", type: "project", name: "api", createdAt: "x" };
  const agentRecord = (id: string, contextIds: string[], properties: Record<string, unknown> = {}): MoriRecord => ({
    ...record(id, contextIds),
    schemaId: "agent-session",
    properties: { agentId: "claude", ...properties },
  });
  const groupOf = (groups: ReturnType<typeof buildProjectGroups>, id: string) =>
    groups.find((group) => group.sessions.some((entry) => entry.sessionId === id));

  it("files a session by its reviewed membership over a misleading folder, listed once", () => {
    const groups = buildProjectGroups(
      [session({ sessionId: "s", sourceLabel: "/home/u/dev/home", sourceRepository: "/home/u/dev/home", sourceRepositoryBasis: "git-checkout" })],
      [infraCtx, homeCtx],
      [agentRecord("s", ["ctx-infra"])],
      [],
    );
    const group = groupOf(groups, "s");
    expect(group?.context?.id).toBe("ctx-infra");
    expect(group?.inclusion.s).toEqual({ project: "member", identity: "git-checkout" });
    expect(group?.records).toEqual([]);
    expect(groups.find((entry) => entry.context?.id === "ctx-home")?.sessions).toEqual([]);
  });

  it("marks a projection placement as a suggestion until it is reviewed", () => {
    const groups = buildProjectGroups(
      [session({ sessionId: "wt", sourceLabel: "/home/u/dev", sourceRepository: "/home/u/dev/infra", sourceRepositoryBasis: "session-record" })],
      [infraCtx],
      [agentRecord("wt", [])],
      [],
    );
    expect(groupOf(groups, "wt")?.inclusion.wt).toEqual({ project: "context", identity: "worktree-record", review: "suggested" });
  });

  it("files only the one of two same-named checkouts the operator confirmed", () => {
    const groups = buildProjectGroups(
      [session({ sessionId: "work", sourceLabel: "/srv/work/api" }), session({ sessionId: "play", sourceLabel: "/home/u/play/api" })],
      [apiCtx],
      [agentRecord("work", ["ctx-api"]), agentRecord("play", [])],
      [],
    );
    const api = groups.find((group) => group.context?.id === "ctx-api");
    expect(api?.sessions.map((entry) => entry.sessionId)).toEqual(["work"]);
    expect(groupOf(groups, "play")?.context).toBeNull();
  });

  it("never rejoins a project the operator rejected for the session", () => {
    const groups = buildProjectGroups(
      [session({ sessionId: "wt", sourceLabel: "/home/u/dev", sourceRepository: "/home/u/dev/infra", sourceRepositoryBasis: "session-record" })],
      [infraCtx],
      [agentRecord("wt", [], { projectReview: { rejected: ["ctx-infra"] } })],
      [],
    );
    const group = groupOf(groups, "wt");
    expect(group?.context).toBeNull();
    expect(group?.inclusion.wt.review).toBe("rejected");
    // Told apart from the project of the same name by its parent folder.
    expect(group?.name).toBe("infra");
    expect(group?.parentPath).toBe("dev");
  });

  it("flags a membership whose project was archived instead of refiling it by name", () => {
    const groups = buildProjectGroups(
      [session({ sessionId: "s", sourceLabel: "/home/u/dev/infra" })],
      [{ ...infraCtx, id: "ctx-old", archived: true }, infraCtx],
      [agentRecord("s", ["ctx-old"])],
      [],
    );
    expect(groupOf(groups, "s")?.inclusion.s).toMatchObject({ review: "invalid", invalidContextId: "ctx-old" });
  });

  it("follows a renamed project by id", () => {
    const groups = buildProjectGroups(
      [session({ sessionId: "s", sourceLabel: "/home/u/dev/infra" })],
      [{ ...infraCtx, name: "infra-platform" }],
      [agentRecord("s", ["ctx-infra"])],
      [],
    );
    expect(groupOf(groups, "s")?.name).toBe("infra-platform");
  });
});
