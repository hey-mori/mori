import { describe, expect, it } from "vitest";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";
import {
  buildMemoryProvenance,
  describeMemoryLifecycleMeaning,
} from "./memoryProvenance";

function makeMemory(overrides: Partial<StoredAcceptedProjectMemory> = {}): StoredAcceptedProjectMemory {
  return {
    id: overrides.id ?? "mem-1",
    projectId: "proj",
    kind: "promotedDecision",
    title: "Test memory",
    summary: "A test memory record.",
    status: overrides.status ?? "accepted",
    importance: "medium",
    confidence: { label: "medium" },
    evidenceRefs: overrides.evidenceRefs ?? [
      { kind: "event", sessionId: "sess-1", eventId: "evt-1" },
    ],
    sourceSessionIds: overrides.sourceSessionIds ?? ["sess-1"],
    originProposalIds: ["prop-1"],
    relatedIssueIds: overrides.relatedIssueIds ?? [],
    relatedDecisionIds: overrides.relatedDecisionIds ?? [],
    proposedAction: "promote",
    sensitivity: "normal",
    resumeEligible: overrides.resumeEligible ?? true,
    reportEligibility: "team",
    createdAt: "2026-05-20T10:00:00Z",
    updatedAt: "2026-05-20T10:00:00Z",
    acceptedAt: "2026-05-20T10:00:00Z",
    acceptedBy: "local-user",
    supersededBy: overrides.supersededBy,
    reviewActionIds: [],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

function makeAction(
  overrides: Partial<StoredMemoryReviewAction> = {},
): StoredMemoryReviewAction {
  return {
    id: overrides.id ?? "act-1",
    projectId: "proj",
    actionType: overrides.actionType ?? "accept",
    actor: "local-user",
    timestamp: overrides.timestamp ?? "2026-05-20T10:05:00Z",
    targetMemoryIds: overrides.targetMemoryIds ?? ["mem-1"],
    before: overrides.before,
    after: overrides.after,
    reversible: overrides.reversible ?? true,
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("buildMemoryProvenance", () => {
  it("classifies the memory's lifecycle group from its status", () => {
    const provenance = buildMemoryProvenance(makeMemory({ status: "stale" }), []);
    expect(provenance.lifecycleGroup).toBe("attention");
    expect(provenance.status).toBe("stale");
  });

  it("counts evidence, sessions, and related review items", () => {
    const memory = makeMemory({
      evidenceRefs: [
        { kind: "event", sessionId: "s1", eventId: "e1" },
        { kind: "event", sessionId: "s2", eventId: "e2" },
        { kind: "source", sessionId: "s1", sourceId: "src1" },
      ],
      sourceSessionIds: ["s1", "s2"],
      relatedIssueIds: ["issue-1", "issue-2"],
      relatedDecisionIds: ["dec-1"],
    });
    const provenance = buildMemoryProvenance(memory, []);
    expect(provenance.evidenceCount).toBe(3);
    expect(provenance.sessionCount).toBe(2);
    expect(provenance.relatedIssueCount).toBe(2);
    expect(provenance.relatedDecisionCount).toBe(1);
  });

  it("returns audit entries for the memory only, newest-first", () => {
    const memory = makeMemory({ id: "mem-1" });
    const actions: StoredMemoryReviewAction[] = [
      makeAction({ id: "a-old", timestamp: "2026-05-19T08:00:00Z" }),
      makeAction({ id: "a-other", targetMemoryIds: ["mem-99"], timestamp: "2026-05-20T09:00:00Z" }),
      makeAction({ id: "a-new", timestamp: "2026-05-20T11:00:00Z" }),
    ];
    const provenance = buildMemoryProvenance(memory, actions);
    expect(provenance.auditEntries.map((entry) => entry.action.id)).toEqual([
      "a-new",
      "a-old",
    ]);
  });

  it("flags the most recent revertible action and skips ineligible ones", () => {
    const memory = makeMemory({ id: "mem-1", status: "accepted" });
    // Newest action: revert type — not itself revertible.
    // Middle action: accept with a valid before snapshot — eligible.
    // Oldest action: edit with no before snapshot — ineligible.
    const actions: StoredMemoryReviewAction[] = [
      makeAction({
        id: "act-revert",
        actionType: "revert",
        timestamp: "2026-05-20T12:00:00Z",
        before: { status: "watching" },
      }),
      makeAction({
        id: "act-accept",
        actionType: "accept",
        timestamp: "2026-05-20T11:00:00Z",
        before: { status: "watching" },
      }),
      makeAction({
        id: "act-edit-nosnapshot",
        actionType: "edit",
        timestamp: "2026-05-20T10:00:00Z",
        before: undefined,
      }),
    ];
    const provenance = buildMemoryProvenance(memory, actions);
    expect(provenance.lastRevertibleAction?.id).toBe("act-accept");
    const ids = provenance.auditEntries.map((entry) => entry.action.id);
    expect(ids[0]).toBe("act-revert");
    const revertEntry = provenance.auditEntries.find((entry) => entry.action.id === "act-revert");
    expect(revertEntry?.revertible).toBe(false);
    const acceptEntry = provenance.auditEntries.find((entry) => entry.action.id === "act-accept");
    expect(acceptEntry?.revertible).toBe(true);
  });

  it("returns null lastRevertibleAction when nothing is eligible", () => {
    const memory = makeMemory({ id: "mem-1" });
    const actions: StoredMemoryReviewAction[] = [
      makeAction({ id: "act-discard", actionType: "discard" }),
    ];
    const provenance = buildMemoryProvenance(memory, actions);
    expect(provenance.lastRevertibleAction).toBeNull();
    expect(provenance.auditEntries[0]?.revertible).toBe(false);
  });

  it("exposes supersededBy and resumeEligible", () => {
    const provenance = buildMemoryProvenance(
      makeMemory({ supersededBy: "mem-9", resumeEligible: false }),
      [],
    );
    expect(provenance.supersededBy).toBe("mem-9");
    expect(provenance.resumeEligible).toBe(false);
  });
});

describe("describeMemoryLifecycleMeaning", () => {
  it("returns a non-empty explanation for every lifecycle group", () => {
    for (const group of ["current", "advisory", "attention", "archived"] as const) {
      expect(describeMemoryLifecycleMeaning(group).length).toBeGreaterThan(0);
    }
  });
});
