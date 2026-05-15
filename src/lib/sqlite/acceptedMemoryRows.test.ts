import { describe, expect, it } from "vitest";
import {
  fromSqliteAcceptedMemoryRow,
  fromSqliteMemoryReviewActionRow,
  toSqliteAcceptedMemoryRow,
  toSqliteMemoryReviewActionRow,
} from "./acceptedMemoryRows";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";

function acceptedMemory(
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id: "mem-1",
    projectId: "p-1",
    kind: "promotedDecision",
    title: "Keep Import Review as a non-bypassable gate",
    summary: "Every captured event must pass through Import Review.",
    status: "accepted",
    importance: "high",
    confidence: { label: "high", score: 0.9, rationale: "two sessions agree" },
    evidenceRefs: [{ kind: "session", sessionId: "s-1", sessionTitle: "Sprint" }],
    sourceSessionIds: ["s-1", "s-2"],
    originProposalIds: ["prop-1"],
    relatedIssueIds: ["i-1"],
    relatedDecisionIds: [],
    proposedAction: "promote",
    reviewNote: "looks durable",
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
    actionType: "accept",
    actor: "local-user",
    timestamp: "2026-05-12T10:00:00Z",
    sourceProposalId: "prop-1",
    targetMemoryIds: ["mem-1"],
    before: { proposalTitle: "x", proposalStatus: "proposed" },
    after: { title: "Keep Import Review", status: "accepted", summary: "..." },
    note: "reviewer note",
    reversible: true,
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("accepted memory SQLite row converters", () => {
  it("round-trips an accepted memory through the SQLite row shape", () => {
    const original = acceptedMemory();
    const restored = fromSqliteAcceptedMemoryRow(toSqliteAcceptedMemoryRow(original));
    // The adapter flips to desktop-sqlite; everything else is preserved.
    expect(restored).toEqual({ ...original, adapter: "desktop-sqlite" });
  });

  it("flattens object and array fields into JSON columns", () => {
    const row = toSqliteAcceptedMemoryRow(acceptedMemory());
    expect(row.confidence_label).toBe("high");
    expect(row.confidence_score).toBe(0.9);
    expect(row.resume_eligible).toBe(1);
    expect(JSON.parse(row.evidence_refs_json)).toHaveLength(1);
    expect(JSON.parse(row.source_session_ids_json)).toEqual(["s-1", "s-2"]);
  });

  it("maps absent optional fields to null and back to undefined", () => {
    const lean = acceptedMemory();
    delete lean.reviewNote;
    delete lean.supersededBy;
    const restored = fromSqliteAcceptedMemoryRow(toSqliteAcceptedMemoryRow(lean));
    expect(restored.reviewNote).toBeUndefined();
    expect(restored.supersededBy).toBeUndefined();
  });

  it("preserves an absent confidence score / rationale", () => {
    const memory = acceptedMemory({ confidence: { label: "medium" } });
    const row = toSqliteAcceptedMemoryRow(memory);
    expect(row.confidence_score).toBeNull();
    expect(row.confidence_rationale).toBeNull();
    const restored = fromSqliteAcceptedMemoryRow(row);
    expect(restored.confidence).toEqual({ label: "medium" });
  });

  it("carries supersededBy when present", () => {
    const restored = fromSqliteAcceptedMemoryRow(
      toSqliteAcceptedMemoryRow(acceptedMemory({ supersededBy: "mem-newer" })),
    );
    expect(restored.supersededBy).toBe("mem-newer");
  });

  it("round-trips a review action including before/after snapshots", () => {
    const original = reviewAction();
    const restored = fromSqliteMemoryReviewActionRow(
      toSqliteMemoryReviewActionRow(original),
    );
    expect(restored).toEqual({ ...original, adapter: "desktop-sqlite" });
  });

  it("maps an absent before/after/note/sourceProposalId to null and back", () => {
    const lean = reviewAction();
    delete lean.before;
    delete lean.after;
    delete lean.note;
    delete lean.sourceProposalId;
    const row = toSqliteMemoryReviewActionRow(lean);
    expect(row.before_json).toBeNull();
    expect(row.after_json).toBeNull();
    expect(row.note).toBeNull();
    expect(row.source_proposal_id).toBeNull();
    const restored = fromSqliteMemoryReviewActionRow(row);
    expect(restored.before).toBeUndefined();
    expect(restored.after).toBeUndefined();
    expect(restored.note).toBeUndefined();
    expect(restored.sourceProposalId).toBeUndefined();
  });

  it("encodes the reversible flag as an integer column", () => {
    expect(toSqliteMemoryReviewActionRow(reviewAction({ reversible: false })).reversible).toBe(0);
    expect(toSqliteMemoryReviewActionRow(reviewAction({ reversible: true })).reversible).toBe(1);
    const restored = fromSqliteMemoryReviewActionRow(
      toSqliteMemoryReviewActionRow(reviewAction({ reversible: false })),
    );
    expect(restored.reversible).toBe(false);
  });
});
