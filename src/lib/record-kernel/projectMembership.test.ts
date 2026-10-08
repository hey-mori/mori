import { describe, expect, it } from "vitest";
import type { KernelContext, MoriRecord } from "./kernelTypes";
import { membershipState, planMembershipDecision, rejectedProjects } from "./projectMembership";

const project = (id: string, name: string, extra: Partial<KernelContext> = {}): KernelContext => ({
  id,
  type: "project",
  name,
  createdAt: "2026-10-08T00:00:00Z",
  ...extra,
});
const infra = project("ctx-infra", "infra");
const home = project("ctx-home", "home");
const routine: KernelContext = { id: "ctx-routine", type: "routine", name: "아침", createdAt: "x" };
const contexts = [infra, home, routine];

function session(overrides: Partial<MoriRecord> = {}): MoriRecord {
  return {
    id: "auto-claude-wt",
    schemaId: "agent-session",
    title: "저장소 구조 작업",
    body: "Claude Code 세션",
    capturedAt: "2026-09-16T06:15:31Z",
    occurredStart: "2026-09-16T06:15:31Z",
    occurredEnd: "2026-10-08T06:59:10Z",
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

describe("membershipState", () => {
  it("reads only project contexts as membership", () => {
    expect(membershipState(session({ contextIds: ["ctx-routine"] }), contexts)).toEqual({ kind: "none" });
    expect(membershipState(session({ contextIds: ["ctx-routine", "ctx-infra"] }), contexts)).toEqual({ kind: "member", context: infra });
  });

  it("follows a renamed or moved project by id", () => {
    const renamed = [{ ...infra, name: "infra-platform", parentId: "ctx-home" }, home];
    expect(membershipState(session({ contextIds: ["ctx-infra"] }), renamed)).toMatchObject({ kind: "member", context: { name: "infra-platform" } });
  });

  it("exposes a membership whose project is missing or archived instead of replacing it", () => {
    expect(membershipState(session({ contextIds: ["ctx-gone"] }), contexts)).toEqual({ kind: "invalid", contextId: "ctx-gone", reason: "missing" });
    const archivedParent = [project("ctx-old", "old", { archived: true }), project("ctx-child", "infra", { parentId: "ctx-old" })];
    expect(membershipState(session({ contextIds: ["ctx-child"] }), archivedParent)).toMatchObject({ kind: "invalid", reason: "archived" });
  });
});

describe("planMembershipDecision", () => {
  const plan = (record: MoriRecord, decision: "confirm" | "reject" | "unfile", contextId: string, expectedProjectId: string | null, ctx = contexts) =>
    planMembershipDecision({ record, contexts: ctx, decision, contextId, expectedProjectId });

  it("confirms by writing the project id and nothing about the source", () => {
    const result = plan(session({ contextIds: ["ctx-routine"] }), "confirm", "ctx-infra", null);
    expect(result).toEqual({ patch: { contextIds: ["ctx-routine", "ctx-infra"], properties: { agentId: "claude" } } });
    expect(JSON.stringify(result)).not.toMatch(/home\/|worktree|github/);
  });

  it("moves a session to another project and keeps its other contexts", () => {
    const result = plan(session({ contextIds: ["ctx-routine", "ctx-infra"] }), "confirm", "ctx-home", "ctx-infra");
    expect(result).toMatchObject({ patch: { contextIds: ["ctx-routine", "ctx-home"] } });
  });

  it("refuses a decision made against a record that moved since it was shown", () => {
    expect(plan(session({ contextIds: ["ctx-home"] }), "confirm", "ctx-infra", null)).toEqual({ refused: "stale" });
    expect(plan(session(), "unfile", "ctx-infra", "ctx-infra")).toEqual({ refused: "stale" });
  });

  it("refiles a session whose project is gone, when the operator names the stale id", () => {
    const record = session({ contextIds: ["ctx-routine", "ctx-gone"] });
    expect(plan(record, "confirm", "ctx-home", "ctx-gone")).toMatchObject({ patch: { contextIds: ["ctx-routine", "ctx-home"] } });
    expect(plan(record, "confirm", "ctx-home", null)).toEqual({ refused: "stale" });
  });

  it("refuses a missing, archived, or non-project target, and a duplicate confirmation", () => {
    expect(plan(session(), "confirm", "ctx-gone", null)).toEqual({ refused: "missing-context" });
    expect(plan(session(), "confirm", "ctx-infra", null, [{ ...infra, archived: true }])).toEqual({ refused: "archived-context" });
    expect(plan(session(), "confirm", "ctx-routine", null)).toEqual({ refused: "not-a-project" });
    expect(plan(session({ contextIds: ["ctx-infra"] }), "confirm", "ctx-infra", "ctx-infra")).toEqual({ refused: "unchanged" });
  });

  it("unfiles, keeps other contexts, and remembers the answer", () => {
    const result = plan(session({ contextIds: ["ctx-routine", "ctx-infra"] }), "unfile", "ctx-infra", "ctx-infra");
    expect(result).toEqual({
      patch: { contextIds: ["ctx-routine"], properties: { agentId: "claude", projectReview: { rejected: ["ctx-infra"] } } },
    });
  });

  it("records a rejected suggestion without filing anything, and a later confirmation lifts it", () => {
    const rejected = plan(session(), "reject", "ctx-infra", null);
    expect(rejected).toEqual({ patch: { properties: { agentId: "claude", projectReview: { rejected: ["ctx-infra"] } } } });
    const after = session({ properties: { agentId: "claude", projectReview: { rejected: ["ctx-infra"] } } });
    expect(rejectedProjects(after)).toEqual(["ctx-infra"]);
    expect(plan(after, "reject", "ctx-infra", null)).toEqual({ refused: "unchanged" });
    expect(plan(after, "confirm", "ctx-infra", null)).toEqual({ patch: { contextIds: ["ctx-infra"], properties: { agentId: "claude" } } });
  });
});
