import { describe, expect, it } from "vitest";
import type {
  Decision,
  Issue,
  IssueStatus,
  NextAction,
  Priority,
  TrustLevel,
} from "../../domain/types";
import {
  countIssuePriorities,
  countIssueStatuses,
  findEvents,
  getReviewSummary,
  getTimelineInspectorReviewLinks,
  getUnresolvedItems,
  groupIssuesByStatus,
  ISSUE_STATUS_ORDER,
  pickDefaultReviewSelection,
  reviewSelectionTab,
} from "./reviewWorkspace";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: overrides.id ?? "issue-1",
    projectId: "proj",
    sessionId: "sess",
    title: "Issue title",
    description: "An issue.",
    status: overrides.status ?? "open",
    priority: overrides.priority ?? "medium",
    sourceEventIds: overrides.sourceEventIds ?? [],
    relatedDecisionIds: overrides.relatedDecisionIds ?? [],
    relatedFileIds: [],
    suggestedNextAction: "Follow up.",
    createdAt: "2026-05-14T10:00:00Z",
    updatedAt: "2026-05-14T10:00:00Z",
    confidence: overrides.confidence ?? 0.9,
    trustLevel: overrides.trustLevel ?? "verified",
    ...overrides,
  };
}

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: overrides.id ?? "decision-1",
    projectId: "proj",
    sessionId: "sess",
    title: "Decision title",
    decision: "Decided to do X.",
    rationale: "Because Y.",
    rejectedOptions: [],
    impact: [],
    sourceEventIds: overrides.sourceEventIds ?? [],
    relatedIssueIds: overrides.relatedIssueIds ?? [],
    relatedSourceIds: overrides.relatedSourceIds ?? [],
    createdAt: "2026-05-14T10:00:00Z",
    importance: overrides.importance ?? "medium",
    trustLevel: overrides.trustLevel ?? "verified",
    confirmed: overrides.confirmed ?? false,
    ...overrides,
  };
}

function makeNextAction(overrides: Partial<NextAction> = {}): NextAction {
  return {
    id: overrides.id ?? "na-1",
    sessionId: "sess",
    title: "Do the thing",
    priority: overrides.priority ?? "medium",
    relatedIssueIds: overrides.relatedIssueIds ?? [],
    relatedEventIds: overrides.relatedEventIds ?? [],
    ...overrides,
  };
}

describe("groupIssuesByStatus", () => {
  it("returns one bucket per status (deterministic for empty columns)", () => {
    const grouped = groupIssuesByStatus([]);
    for (const status of ISSUE_STATUS_ORDER) {
      expect(grouped[status]).toEqual([]);
    }
  });

  it("places each issue into the correct status bucket", () => {
    const issues: Issue[] = [
      makeIssue({ id: "a", status: "open" }),
      makeIssue({ id: "b", status: "open" }),
      makeIssue({ id: "c", status: "inProgress" }),
      makeIssue({ id: "d", status: "resolved" }),
      makeIssue({ id: "e", status: "watching" }),
    ];
    const grouped = groupIssuesByStatus(issues);
    expect(grouped.open.map((issue) => issue.id)).toEqual(["a", "b"]);
    expect(grouped.inProgress.map((issue) => issue.id)).toEqual(["c"]);
    expect(grouped.resolved.map((issue) => issue.id)).toEqual(["d"]);
    expect(grouped.watching.map((issue) => issue.id)).toEqual(["e"]);
  });
});

describe("countIssueStatuses + countIssuePriorities", () => {
  it("counts every issue exactly once across statuses and priorities", () => {
    const issues: Issue[] = [
      makeIssue({ id: "a", status: "open", priority: "high" }),
      makeIssue({ id: "b", status: "inProgress", priority: "medium" }),
      makeIssue({ id: "c", status: "resolved", priority: "low" }),
      makeIssue({ id: "d", status: "watching", priority: "high" }),
    ];
    expect(countIssueStatuses(issues)).toEqual({
      open: 1,
      inProgress: 1,
      resolved: 1,
      watching: 1,
    });
    expect(countIssuePriorities(issues)).toEqual({ high: 2, medium: 1, low: 1 });
  });
});

describe("getReviewSummary", () => {
  it("rolls every category up into the summary chip line", () => {
    const issues: Issue[] = [
      makeIssue({ id: "a", status: "open", priority: "high" }),
      makeIssue({ id: "b", status: "inProgress", priority: "medium" }),
      makeIssue({ id: "c", status: "resolved", priority: "low" }),
      makeIssue({
        id: "d",
        status: "watching",
        priority: "low",
        trustLevel: "inferred",
        confidence: 0.4,
      }),
    ];
    const decisions: Decision[] = [
      makeDecision({ id: "x", importance: "high", confirmed: true }),
      makeDecision({ id: "y", importance: "medium", confirmed: false }),
      makeDecision({ id: "z", importance: "low", confirmed: false, trustLevel: "inferred" }),
    ];
    const nextActions: NextAction[] = [makeNextAction({ id: "n1" })];
    const summary = getReviewSummary({ issues, decisions, nextActions });

    expect(summary).toMatchObject({
      issueCount: 4,
      decisionCount: 3,
      nextActionCount: 1,
      unresolvedIssueCount: 1,
      inProgressIssueCount: 1,
      resolvedIssueCount: 1,
      watchingIssueCount: 1,
      unconfirmedDecisionCount: 2,
      highPriorityIssueCount: 1,
      highImportanceDecisionCount: 1,
    });
    // Inferred low-confidence issue + inferred unconfirmed decision => 2.
    expect(summary.lowConfidenceCount).toBe(2);
  });
});

describe("getUnresolvedItems", () => {
  it("surfaces open issues before in-progress before low-confidence inferred issues", () => {
    const issues: Issue[] = [
      makeIssue({
        id: "low-conf",
        status: "watching",
        trustLevel: "inferred",
        confidence: 0.5,
      }),
      makeIssue({ id: "open-one", status: "open" }),
      makeIssue({ id: "progress-one", status: "inProgress" }),
    ];
    const items = getUnresolvedItems({ issues, decisions: [], nextActions: [] });
    const ids = items.map((item) => (item.kind === "issue" ? item.issue.id : item.kind));
    expect(ids).toEqual(["open-one", "progress-one", "low-conf"]);
  });

  it("includes unconfirmed decisions and pending next actions in stable order", () => {
    const decisions: Decision[] = [
      makeDecision({ id: "d1", confirmed: false }),
      makeDecision({ id: "d2", confirmed: false, trustLevel: "inferred" }),
      makeDecision({ id: "d3", confirmed: true }),
    ];
    const nextActions: NextAction[] = [
      makeNextAction({ id: "n1", priority: "high" }),
      makeNextAction({ id: "n2", priority: "low" }),
    ];
    const items = getUnresolvedItems({ issues: [], decisions, nextActions });
    const reasons = items.map((item) => item.reason);
    // unconfirmed-decision before low-confidence-decision; next actions last.
    expect(reasons).toEqual([
      "unconfirmed-decision",
      "low-confidence-decision",
      "pending-next-action",
      "pending-next-action",
    ]);
    // High-priority next action sorts before low-priority within its group.
    const naIds = items.filter((item) => item.kind === "nextAction").map((item) =>
      item.kind === "nextAction" ? item.nextAction.id : "",
    );
    expect(naIds).toEqual(["n1", "n2"]);
  });

  it("excludes confirmed verified decisions and resolved issues", () => {
    const issues: Issue[] = [
      makeIssue({ id: "r", status: "resolved" }),
      makeIssue({ id: "w", status: "watching", trustLevel: "verified" }),
    ];
    const decisions: Decision[] = [makeDecision({ id: "ok", confirmed: true })];
    const items = getUnresolvedItems({ issues, decisions, nextActions: [] });
    expect(items).toEqual([]);
  });

  it("excludes completed next actions from the unresolved feed", () => {
    const nextActions: NextAction[] = [
      makeNextAction({ id: "pending" }),
      makeNextAction({ id: "done", done: true, completedAt: "2026-05-18T09:00:00Z" }),
    ];
    const items = getUnresolvedItems({ issues: [], decisions: [], nextActions });
    const naIds = items
      .filter((item) => item.kind === "nextAction")
      .map((item) => (item.kind === "nextAction" ? item.nextAction.id : ""));
    expect(naIds).toEqual(["pending"]);
  });
});

describe("pickDefaultReviewSelection", () => {
  it("picks the first open issue if one exists", () => {
    const issues: Issue[] = [
      makeIssue({ id: "wat", status: "watching" }),
      makeIssue({ id: "open-1", status: "open" }),
    ];
    const selection = pickDefaultReviewSelection({ issues, decisions: [], nextActions: [] });
    expect(selection).toEqual({ kind: "issue", issueId: "open-1" });
  });

  it("falls back to in-progress, then any issue, then decision, then next action", () => {
    expect(
      pickDefaultReviewSelection({
        issues: [makeIssue({ id: "ip", status: "inProgress" })],
        decisions: [],
        nextActions: [],
      }),
    ).toEqual({ kind: "issue", issueId: "ip" });

    expect(
      pickDefaultReviewSelection({
        issues: [],
        decisions: [makeDecision({ id: "first-d" })],
        nextActions: [],
      }),
    ).toEqual({ kind: "decision", decisionId: "first-d" });

    expect(
      pickDefaultReviewSelection({
        issues: [],
        decisions: [],
        nextActions: [makeNextAction({ id: "first-na" })],
      }),
    ).toEqual({ kind: "nextAction", nextActionId: "first-na" });
  });

  it("returns 'none' when every list is empty", () => {
    expect(pickDefaultReviewSelection({ issues: [], decisions: [], nextActions: [] })).toEqual({
      kind: "none",
    });
  });
});

describe("reviewSelectionTab", () => {
  it("maps each selection kind to its content tab", () => {
    expect(reviewSelectionTab({ kind: "issue", issueId: "i" })).toBe("issues");
    expect(reviewSelectionTab({ kind: "decision", decisionId: "d" })).toBe("decisions");
    expect(reviewSelectionTab({ kind: "nextAction", nextActionId: "n" })).toBe(
      "nextActions",
    );
  });

  it("falls back to the issues tab for an empty selection", () => {
    expect(reviewSelectionTab({ kind: "none" })).toBe("issues");
  });
});

describe("findEvents", () => {
  it("filters events to the requested id set", () => {
    const events = [
      { id: "e1" } as any,
      { id: "e2" } as any,
      { id: "e3" } as any,
    ];
    expect(findEvents(events, ["e2", "e3"])).toEqual([events[1], events[2]]);
  });

  it("returns an empty array when no ids match", () => {
    const events = [{ id: "e1" } as any];
    expect(findEvents(events, ["nope"])).toEqual([]);
  });
});

describe("constants", () => {
  it("exposes a deterministic issue-status display order", () => {
    expect(ISSUE_STATUS_ORDER).toEqual<IssueStatus[]>([
      "open",
      "inProgress",
      "resolved",
      "watching",
    ]);
  });
});

// Type-only assertions to make sure exported helpers stay generic enough to
// be called from React components without `any` casts.
const _typecheck: Priority = "high" as Priority;
const _trustCheck: TrustLevel = "verified" as TrustLevel;
void _typecheck;
void _trustCheck;

describe("getTimelineInspectorReviewLinks", () => {
  const links = getTimelineInspectorReviewLinks({
    issues: [{ id: "i1", title: "이슈 하나" }, { id: "i2", title: "이슈 둘" }],
    decisions: [{ id: "d1", title: "결정 하나" }],
    nextActions: [{ id: "n1", title: "액션 하나" }],
    artifacts: [{ id: "a1", title: "파일 하나" }],
  });

  it("returns one group per linked-item kind in inspector order", () => {
    expect(links.map((group) => group.kind)).toEqual([
      "issue",
      "decision",
      "nextAction",
      "artifact",
    ]);
  });

  it("gives each issue / decision / next action a per-item Review selection", () => {
    const issueGroup = links.find((group) => group.kind === "issue")!;
    expect(issueGroup.items.map((item) => item.selection)).toEqual([
      { kind: "issue", issueId: "i1" },
      { kind: "issue", issueId: "i2" },
    ]);
    expect(links.find((g) => g.kind === "decision")!.items[0].selection).toEqual({
      kind: "decision",
      decisionId: "d1",
    });
    expect(links.find((g) => g.kind === "nextAction")!.items[0].selection).toEqual({
      kind: "nextAction",
      nextActionId: "n1",
    });
  });

  it("leaves artifacts without a Review selection — they have no Review home", () => {
    const artifactGroup = links.find((group) => group.kind === "artifact")!;
    expect(artifactGroup.items[0].selection).toBeNull();
    expect(artifactGroup.items[0].title).toBe("파일 하나");
  });
});
