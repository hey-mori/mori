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
