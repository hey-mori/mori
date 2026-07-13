import { describe, expect, it } from "vitest";

import type { MemoryProposal } from "./consolidationProposals";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import { buildProvisionalMemoriesFromProposals } from "./provisionalMemory";

function proposal(id: string): MemoryProposal {
  return {
    id,
    kind: "promotedDecision",
    title: `Decision ${id}`,
    summary: "We normalize the event schema first.",
    rationale: "Signal score 6.",
    confidence: 0.9,
    importance: "high",
    evidenceRefs: [{ kind: "session", sessionId: "s-1", sessionTitle: "게이트웨이" }],
    sourceSessionIds: ["s-1"],
    relatedIssueIds: [],
    relatedDecisionIds: [],
    proposedAction: "promote",
    status: "proposed",
    createdAt: "2026-07-10T10:00:00.000Z",
    updatedAt: "2026-07-10T10:00:00.000Z",
  };
}

const AT = "2026-07-13T09:00:00.000Z";

describe("buildProvisionalMemoriesFromProposals", () => {
  it("creates provisional memory that never crosses an external boundary", () => {
    const { memoriesToSave, reviewActionsToAppend } = buildProvisionalMemoriesFromProposals({
      projectId: "p-1",
      proposals: [proposal("prop-1")],
      at: AT,
    });
    expect(memoriesToSave).toHaveLength(1);
    const memory = memoriesToSave[0];
    expect(memory.status).toBe("provisional");
    expect(memory.resumeEligible).toBe(false);
    expect(memory.reportEligibility).toBe("excluded");
    expect(memory.originProposalIds).toEqual(["prop-1"]);
    // One audit row, attributed to the policy, reversible.
    expect(reviewActionsToAppend).toHaveLength(1);
    expect(reviewActionsToAppend[0].actionType).toBe("autoOrganize");
    expect(reviewActionsToAppend[0].actor).toBe("auto-policy");
    expect(reviewActionsToAppend[0].reversible).toBe(true);
    expect(memory.reviewActionIds).toEqual([reviewActionsToAppend[0].id]);
  });

  it("is idempotent: a proposal already turned into memory is skipped", () => {
    const first = buildProvisionalMemoriesFromProposals({
      projectId: "p-1",
      proposals: [proposal("prop-1")],
      at: AT,
    });
    const existing = first.memoriesToSave as StoredAcceptedProjectMemory[];
    const second = buildProvisionalMemoriesFromProposals({
      projectId: "p-1",
      proposals: [proposal("prop-1"), proposal("prop-2")],
      at: AT,
      existingMemories: existing,
    });
    expect(second.memoriesToSave.map((m) => m.originProposalIds[0])).toEqual(["prop-2"]);
    expect(second.alreadyKnownCount).toBe(1);
  });
});
