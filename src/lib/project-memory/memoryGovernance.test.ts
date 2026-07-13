import { describe, expect, it } from "vitest";

import type { MemoryProposal, MemoryProposalKind } from "./consolidationProposals";
import {
  classifyProposalDisposition,
  partitionProposalsByGovernance,
} from "./memoryGovernance";

function proposal(
  kind: MemoryProposalKind,
  confidence: number,
  id = `${kind}-${confidence}`,
): MemoryProposal {
  return {
    id,
    kind,
    title: `${kind} title`,
    summary: "summary",
    rationale: "rationale",
    confidence,
    importance: "high",
    evidenceRefs: [{ kind: "session", sessionId: "s-1" }],
    sourceSessionIds: ["s-1"],
    relatedIssueIds: [],
    relatedDecisionIds: [],
    proposedAction: "promote",
    status: "proposed",
    createdAt: "2026-07-10T10:00:00.000Z",
    updatedAt: "2026-07-10T10:00:00.000Z",
  };
}

describe("classifyProposalDisposition", () => {
  it("auto-accepts safe, additive, high-confidence durable proposals", () => {
    expect(classifyProposalDisposition(proposal("promotedDecision", 0.9)).disposition).toBe("auto");
    expect(classifyProposalDisposition(proposal("keyEvidence", 0.8)).disposition).toBe("auto");
    expect(classifyProposalDisposition(proposal("recurringIssue", 0.75)).disposition).toBe("auto");
  });

  it("sends low-confidence durable proposals to review", () => {
    const result = classifyProposalDisposition(proposal("promotedDecision", 0.6));
    expect(result.disposition).toBe("review");
    expect(result.reason).toBe("low-confidence");
  });

  it("always reviews lifecycle proposals that mutate existing memory", () => {
    expect(classifyProposalDisposition(proposal("contradiction", 0.95)).disposition).toBe("review");
    expect(classifyProposalDisposition(proposal("staleMemory", 0.95)).disposition).toBe("review");
  });

  it("gives a standing risk a human glance even at high confidence", () => {
    expect(classifyProposalDisposition(proposal("unresolvedRisk", 0.95)).disposition).toBe("review");
  });

  it("does not treat a next-session recommendation as durable memory", () => {
    const result = classifyProposalDisposition(proposal("nextSessionRecommendation", 0.95));
    expect(result.disposition).toBe("skip");
    expect(result.reason).toBe("not-durable-memory");
  });

  it("reviews everything in review mode and derives nothing in capture-only", () => {
    expect(
      classifyProposalDisposition(proposal("promotedDecision", 0.95), { mode: "review" }).disposition,
    ).toBe("review");
    expect(
      classifyProposalDisposition(proposal("promotedDecision", 0.95), { mode: "captureOnly" }).disposition,
    ).toBe("skip");
  });

  it("reviews an auto-eligible proposal that conflicts with existing memory", () => {
    const result = classifyProposalDisposition(proposal("promotedDecision", 0.95), {
      conflictsWithExisting: true,
    });
    expect(result.disposition).toBe("review");
    expect(result.reason).toBe("conflicts-with-existing");
  });
});

describe("partitionProposalsByGovernance", () => {
  it("splits a mixed set into auto, review, and skipped, preserving order", () => {
    const proposals = [
      proposal("promotedDecision", 0.9, "a"),
      proposal("nextSessionRecommendation", 0.9, "b"),
      proposal("contradiction", 0.9, "c"),
      proposal("keyEvidence", 0.4, "d"),
      proposal("recurringIssue", 0.8, "e"),
    ];
    const { auto, review, skipped } = partitionProposalsByGovernance(proposals);
    expect(auto.map((p) => p.id)).toEqual(["a", "e"]);
    expect(review.map((p) => p.id)).toEqual(["c", "d"]);
    expect(skipped.map((p) => p.id)).toEqual(["b"]);
  });
});
