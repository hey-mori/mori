import { describe, expect, it } from "vitest";
import type { Decision, Issue, TimelineEvent } from "../../domain/types";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import {
  buildAcceptedMemoryLinkTargets,
  countUnlinkableEvidenceRefs,
  countUnresolvedEventRefs,
} from "./acceptedMemoryLinks";

function makeEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: overrides.id ?? "evt-1",
    sessionId: "sess-1",
    projectId: "proj",
    start: overrides.start ?? "2026-05-20T10:00:00Z",
    type: "documentNote",
    title: overrides.title ?? "이벤트 제목",
    summary: "",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "verified",
    confidence: 0.9,
    createdBy: "user",
    userModified: false,
    ...overrides,
  };
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: overrides.id ?? "issue-1",
    projectId: "proj",
    sessionId: "sess-1",
    title: overrides.title ?? "이슈 제목",
    description: "",
    status: "open",
    priority: "medium",
    sourceEventIds: [],
    relatedDecisionIds: [],
    relatedFileIds: [],
    suggestedNextAction: "",
    createdAt: "2026-05-20T10:00:00Z",
    updatedAt: "2026-05-20T10:00:00Z",
    confidence: 0.9,
    trustLevel: "verified",
    ...overrides,
  };
}

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: overrides.id ?? "dec-1",
    projectId: "proj",
    sessionId: "sess-1",
    title: overrides.title ?? "결정 제목",
    decision: "",
    rationale: "",
    rejectedOptions: [],
    impact: [],
    sourceEventIds: [],
    relatedIssueIds: [],
    relatedSourceIds: [],
    createdAt: "2026-05-20T10:00:00Z",
    importance: "medium",
    trustLevel: "verified",
    confirmed: false,
    ...overrides,
  };
}

function makeMemory(
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id: overrides.id ?? "mem-1",
    projectId: "proj",
    kind: "promotedDecision",
    title: "Memory",
    summary: "",
    status: "accepted",
    importance: "medium",
    confidence: { label: "medium" },
    evidenceRefs: overrides.evidenceRefs ?? [],
    sourceSessionIds: overrides.sourceSessionIds ?? ["sess-1"],
    originProposalIds: [],
    relatedIssueIds: overrides.relatedIssueIds ?? [],
    relatedDecisionIds: overrides.relatedDecisionIds ?? [],
    proposedAction: "promote",
    sensitivity: "normal",
    resumeEligible: true,
    reportEligibility: "team",
    createdAt: "2026-05-20T10:00:00Z",
    updatedAt: "2026-05-20T10:00:00Z",
    acceptedAt: "2026-05-20T10:00:00Z",
    acceptedBy: "local-user",
    reviewActionIds: [],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("buildAcceptedMemoryLinkTargets", () => {
  it("returns timeline event targets only for evidence refs of kind event that exist in view", () => {
    const memory = makeMemory({
      evidenceRefs: [
        { kind: "event", sessionId: "sess-1", eventId: "evt-here" },
        { kind: "event", sessionId: "sess-1", eventId: "evt-missing" },
        { kind: "source", sessionId: "sess-1", sourceId: "src-1" },
        { kind: "session", sessionId: "sess-1" },
      ],
    });
    const view = {
      events: [makeEvent({ id: "evt-here", title: "있는 이벤트" })],
      issues: [],
      decisions: [],
    };
    const targets = buildAcceptedMemoryLinkTargets(memory, view);
    expect(targets.timelineEvents).toHaveLength(1);
    const target = targets.timelineEvents[0];
    if (target.kind !== "timelineEvent") throw new Error("expected timelineEvent");
    expect(target.eventId).toBe("evt-here");
    expect(target.title).toBe("있는 이벤트");
  });

  it("deduplicates event refs and skips duplicates", () => {
    const memory = makeMemory({
      evidenceRefs: [
        { kind: "event", sessionId: "sess-1", eventId: "evt-1" },
        { kind: "event", sessionId: "sess-1", eventId: "evt-1" },
        { kind: "event", sessionId: "sess-1", eventId: "evt-2" },
      ],
    });
    const view = {
      events: [makeEvent({ id: "evt-1" }), makeEvent({ id: "evt-2" })],
      issues: [],
      decisions: [],
    };
    const targets = buildAcceptedMemoryLinkTargets(memory, view);
    expect(targets.timelineEvents.map((t) => (t.kind === "timelineEvent" ? t.eventId : ""))).toEqual([
      "evt-1",
      "evt-2",
    ]);
  });

  it("resolves issue and decision titles and drops missing ids", () => {
    const memory = makeMemory({
      relatedIssueIds: ["issue-1", "issue-missing"],
      relatedDecisionIds: ["dec-1", "dec-missing"],
    });
    const view = {
      events: [],
      issues: [makeIssue({ id: "issue-1", title: "Open issue" })],
      decisions: [makeDecision({ id: "dec-1", title: "Decision X" })],
    };
    const targets = buildAcceptedMemoryLinkTargets(memory, view);
    expect(targets.reviewIssues).toHaveLength(1);
    const issueTarget = targets.reviewIssues[0];
    if (issueTarget.kind !== "review") throw new Error("expected review target");
    expect(issueTarget.title).toBe("Open issue");
    expect(issueTarget.selection).toEqual({ kind: "issue", issueId: "issue-1" });

    expect(targets.reviewDecisions).toHaveLength(1);
    const decisionTarget = targets.reviewDecisions[0];
    if (decisionTarget.kind !== "review") throw new Error("expected review target");
    expect(decisionTarget.title).toBe("Decision X");
    expect(decisionTarget.selection).toEqual({ kind: "decision", decisionId: "dec-1" });
  });

  it("returns empty arrays when nothing resolves", () => {
    const memory = makeMemory({
      evidenceRefs: [{ kind: "event", sessionId: "sess-1", eventId: "evt-gone" }],
      relatedIssueIds: ["issue-gone"],
      relatedDecisionIds: ["dec-gone"],
    });
    const targets = buildAcceptedMemoryLinkTargets(memory, {
      events: [],
      issues: [],
      decisions: [],
    });
    expect(targets.timelineEvents).toEqual([]);
    expect(targets.reviewIssues).toEqual([]);
    expect(targets.reviewDecisions).toEqual([]);
  });
});

describe("countUnlinkableEvidenceRefs", () => {
  it("counts non-event refs (sessions and sources)", () => {
    const memory = makeMemory({
      evidenceRefs: [
        { kind: "event", sessionId: "s", eventId: "e1" },
        { kind: "source", sessionId: "s", sourceId: "src-1" },
        { kind: "source", sessionId: "s", sourceId: "src-2" },
        { kind: "session", sessionId: "s" },
      ],
    });
    expect(countUnlinkableEvidenceRefs(memory)).toBe(3);
  });

  it("returns 0 when every ref points at an event", () => {
    const memory = makeMemory({
      evidenceRefs: [{ kind: "event", sessionId: "s", eventId: "e1" }],
    });
    expect(countUnlinkableEvidenceRefs(memory)).toBe(0);
  });
});

describe("countUnresolvedEventRefs", () => {
  it("counts a ref into the open session whose event is gone, never one into another session", () => {
    const memory = makeMemory({
      evidenceRefs: [
        { kind: "event", sessionId: "sess-1", eventId: "evt-1" },
        { kind: "event", sessionId: "sess-1", eventId: "evt-renamed" },
        { kind: "event", sessionId: "sess-1", eventId: "evt-renamed" },
        { kind: "event", sessionId: "sess-other", eventId: "evt-x" },
      ] as never,
    });
    const view = { events: [makeEvent({ id: "evt-1" })], issues: [], decisions: [] };
    expect(countUnresolvedEventRefs(memory, view)).toBe(1);
    // And the memory itself is left as it was.
    expect(memory.evidenceRefs).toHaveLength(4);
  });

  it("is zero when every ref resolves or nothing of the session is open", () => {
    const memory = makeMemory({ evidenceRefs: [{ kind: "event", sessionId: "sess-1", eventId: "evt-1" }] as never });
    expect(countUnresolvedEventRefs(memory, { events: [makeEvent({ id: "evt-1" })], issues: [], decisions: [] })).toBe(0);
    expect(countUnresolvedEventRefs(memory, { events: [], issues: [], decisions: [] })).toBe(0);
  });
});
