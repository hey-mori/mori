import { describe, expect, it } from "vitest";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";
import {
  buildMemoryRevertProposal,
  planMemoryReviewRevert,
} from "./memoryReviewRevert";

function acceptedMemory(
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id: "mem-1",
    projectId: "p-1",
    kind: "promotedDecision",
    title: "Keep Import Review as a non-bypassable gate",
    summary: "Every captured event passes through Import Review.",
    status: "accepted",
    importance: "high",
    confidence: { label: "high", score: 0.9 },
    evidenceRefs: [{ kind: "session", sessionId: "s-cur" }],
    sourceSessionIds: ["s-cur"],
    originProposalIds: ["prop-1"],
    relatedIssueIds: [],
    relatedDecisionIds: [],
    proposedAction: "promote",
    sensitivity: "normal",
    resumeEligible: true,
    reportEligibility: "personal",
    createdAt: "2026-05-10T10:00:00Z",
    updatedAt: "2026-05-12T10:00:00Z",
    acceptedAt: "2026-05-12T10:00:00Z",
    acceptedBy: "local-user",
    reviewActionIds: ["act-1"],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

function reviewAction(
  overrides: Partial<StoredMemoryReviewAction> = {},
): StoredMemoryReviewAction {
  return {
    id: "act-1",
    projectId: "p-1",
    actionType: "edit",
    actor: "local-user",
    timestamp: "2026-05-12T10:00:00Z",
    sourceProposalId: "prop-1",
    targetMemoryIds: ["mem-1"],
    before: { status: "watching" },
    after: { status: "accepted" },
    note: "Promoted from watching after review.",
    reversible: true,
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("planMemoryReviewRevert", () => {
  it("produces an eligible plan from a valid before snapshot", () => {
    const plan = planMemoryReviewRevert(reviewAction(), [acceptedMemory()]);
    expect(plan.eligible).toBe(true);
    expect(plan.ineligibleReason).toBeNull();
    expect(plan.targetMemoryId).toBe("mem-1");
    expect(plan.restoreStatus).toBe("watching");
    expect(plan.currentStatus).toBe("accepted");
  });

  it("is ineligible when the action has no before snapshot", () => {
    const plan = planMemoryReviewRevert(
      reviewAction({ before: undefined }),
      [acceptedMemory()],
    );
    expect(plan.eligible).toBe(false);
    expect(plan.ineligibleReason).toMatch(/before snapshot/i);
    expect(plan.restoreStatus).toBeNull();
  });

  it("is ineligible when the before snapshot status is not a known status", () => {
    const plan = planMemoryReviewRevert(
      reviewAction({ before: { status: "made-up" } }),
      [acceptedMemory()],
    );
    expect(plan.eligible).toBe(false);
    expect(plan.ineligibleReason).toMatch(/before snapshot/i);
  });

  it("is ineligible when the target memory no longer exists", () => {
    const plan = planMemoryReviewRevert(reviewAction(), []);
    expect(plan.eligible).toBe(false);
    expect(plan.ineligibleReason).toMatch(/no longer exists/i);
    expect(plan.targetMemoryId).toBe("mem-1");
    expect(plan.currentStatus).toBeNull();
  });

  it("is ineligible for an unsupported action type", () => {
    const plan = planMemoryReviewRevert(
      reviewAction({ actionType: "discard" }),
      [acceptedMemory()],
    );
    expect(plan.eligible).toBe(false);
    expect(plan.ineligibleReason).toMatch(/cannot be reverted/i);
  });

  it("is ineligible when the action records no target memory", () => {
    const plan = planMemoryReviewRevert(
      reviewAction({ targetMemoryIds: [] }),
      [acceptedMemory()],
    );
    expect(plan.eligible).toBe(false);
    expect(plan.ineligibleReason).toMatch(/no target memory/i);
  });

  it("is ineligible when the action touched multiple memories", () => {
    const plan = planMemoryReviewRevert(
      reviewAction({ targetMemoryIds: ["mem-1", "mem-2"] }),
      [acceptedMemory()],
    );
    expect(plan.eligible).toBe(false);
    expect(plan.ineligibleReason).toMatch(/multiple memories/i);
  });
});

describe("buildMemoryRevertProposal", () => {
  it("yields a proposal targeting the reverted memory", () => {
    const action = reviewAction();
    const memory = acceptedMemory();
    const plan = planMemoryReviewRevert(action, [memory]);
    const proposal = buildMemoryRevertProposal(plan, action, memory);

    expect(proposal.targetMemoryId).toBe("mem-1");
    expect(proposal.sourceActionId).toBe("act-1");
    expect(proposal.id).toBe("proposal::memoryRevert::act-1");
    expect(proposal.status).toBe("proposed");
  });

  it("carries the restore status from the before snapshot", () => {
    const action = reviewAction();
    const memory = acceptedMemory();
    const plan = planMemoryReviewRevert(action, [memory]);
    const proposal = buildMemoryRevertProposal(plan, action, memory);

    expect(proposal.restoreStatus).toBe("watching");
    expect(proposal.currentStatus).toBe("accepted");
    expect(proposal.title).toContain("watching");
  });

  it("refuses to build from an ineligible plan", () => {
    const action = reviewAction({ before: undefined });
    const memory = acceptedMemory();
    const plan = planMemoryReviewRevert(action, [memory]);

    expect(plan.eligible).toBe(false);
    expect(() => buildMemoryRevertProposal(plan, action, memory)).toThrow(
      /ineligible plan/i,
    );
  });
});
