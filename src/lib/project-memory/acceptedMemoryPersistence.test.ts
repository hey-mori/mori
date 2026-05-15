import { describe, expect, it } from "vitest";
import type { MemoryProposal } from "./consolidationProposals";
import {
  acceptProposal,
  deferProposal,
  discardProposal,
  editProposal,
  initializeConsolidationReviewState,
  keepWatchingProposal,
  setReviewerNote,
} from "./consolidationReviewState";
import {
  buildAcceptedMemoriesFromReviewDraft,
} from "./acceptedMemoryPersistence";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

function proposal(id: string, overrides: Partial<MemoryProposal> = {}): MemoryProposal {
  return {
    id,
    kind: "promotedDecision",
    title: `Title ${id}`,
    summary: `Summary ${id}`,
    rationale: `Rationale ${id}`,
    confidence: 0.82,
    importance: "medium",
    evidenceRefs: [
      { kind: "session", sessionId: "s-1", sessionTitle: "Sample" },
      { kind: "event", sessionId: "s-1", eventId: "e-1" },
    ],
    sourceSessionIds: ["s-1"],
    relatedIssueIds: [],
    relatedDecisionIds: [],
    proposedAction: "promote",
    status: "proposed",
    createdAt: "2026-05-10T10:00:00Z",
    updatedAt: "2026-05-10T10:00:00Z",
    ...overrides,
  };
}

function idFactory(purpose: "memory" | "action", seed: string): string {
  return `${purpose}::${seed}`;
}

function fixedApply(reviewState: ReturnType<typeof initializeConsolidationReviewState>) {
  return buildAcceptedMemoriesFromReviewDraft({
    projectId: "p-test",
    reviewState,
    appliedAt: "2026-05-15T11:00:00Z",
    idFactory,
  });
}

describe("buildAcceptedMemoriesFromReviewDraft", () => {
  it("accepted proposals become accepted memories with high-level fields preserved", () => {
    const review = acceptProposal(
      initializeConsolidationReviewState([proposal("p1")]),
      "p1",
    );
    const result = fixedApply(review);

    expect(result.memoriesToSave.length).toBe(1);
    const memory = result.memoriesToSave[0];
    expect(memory.id).toBe("memory::p1");
    expect(memory.status).toBe("accepted");
    expect(memory.kind).toBe("promotedDecision");
    expect(memory.title).toBe("Title p1");
    expect(memory.summary).toBe("Summary p1");
    expect(memory.evidenceRefs.length).toBe(2);
    expect(memory.sourceSessionIds).toEqual(["s-1"]);
    expect(memory.originProposalIds).toEqual(["p1"]);
    expect(memory.confidence.label).toBe("high");
    expect(memory.confidence.score).toBe(0.82);
    expect(memory.acceptedAt).toBe("2026-05-15T11:00:00Z");
    expect(memory.resumeEligible).toBe(true);
    expect(memory.reportEligibility).toBe("personal");
  });

  it("edited proposals produce status=edited with edit overrides on title/summary", () => {
    const reviewBase = initializeConsolidationReviewState([proposal("p1")]);
    const edited = editProposal(reviewBase, "p1", {
      title: "New title",
      summary: "New summary",
    });
    const result = fixedApply(edited);

    expect(result.memoriesToSave.length).toBe(1);
    const memory = result.memoriesToSave[0];
    expect(memory.status).toBe("edited");
    expect(memory.title).toBe("New title");
    expect(memory.summary).toBe("New summary");
    expect(memory.resumeEligible).toBe(true);
  });

  it("watching proposals become memories but are not Resume-eligible", () => {
    const review = keepWatchingProposal(
      initializeConsolidationReviewState([proposal("p1")]),
      "p1",
    );
    const result = fixedApply(review);
    expect(result.memoriesToSave.length).toBe(1);
    const memory = result.memoriesToSave[0];
    expect(memory.status).toBe("watching");
    expect(memory.resumeEligible).toBe(false);
    expect(memory.reportEligibility).toBe("excluded");
  });

  it("deferred proposals become memories with deferred status", () => {
    const review = deferProposal(
      initializeConsolidationReviewState([proposal("p1")]),
      "p1",
    );
    const result = fixedApply(review);
    expect(result.memoriesToSave[0].status).toBe("deferred");
    expect(result.memoriesToSave[0].resumeEligible).toBe(false);
  });

  it("discarded proposals do not become memories but produce a discard audit row", () => {
    const review = discardProposal(
      initializeConsolidationReviewState([proposal("p1")]),
      "p1",
    );
    const result = fixedApply(review);
    expect(result.memoriesToSave.length).toBe(0);
    expect(result.skippedEntries.length).toBe(1);
    const discardAction = result.reviewActionsToAppend.find((row) => row.actionType === "discard");
    expect(discardAction).toBeDefined();
    expect(discardAction!.sourceProposalId).toBe("p1");
  });

  it("proposed entries are skipped entirely (no memory, no per-entry audit row)", () => {
    const review = initializeConsolidationReviewState([proposal("p1"), proposal("p2")]);
    const result = fixedApply(review);
    expect(result.memoriesToSave.length).toBe(0);
    expect(result.skippedEntries.length).toBe(2);
    // Only the bookend `apply` action is emitted when nothing was decided.
    expect(result.reviewActionsToAppend.length).toBe(1);
    expect(result.reviewActionsToAppend[0].actionType).toBe("apply");
  });

  it("reviewer note is preserved on both the memory and the per-entry audit row", () => {
    const review = setReviewerNote(
      acceptProposal(initializeConsolidationReviewState([proposal("p1")]), "p1"),
      "p1",
      "checked twice",
    );
    const result = fixedApply(review);
    expect(result.memoriesToSave[0].reviewNote).toBe("checked twice");
    const acceptAction = result.reviewActionsToAppend.find((row) => row.actionType === "accept");
    expect(acceptAction?.note).toBe("checked twice");
  });

  it("emits one accept / edit / watch / defer action plus a final apply action", () => {
    let review = initializeConsolidationReviewState([
      proposal("a"), proposal("b"), proposal("c"), proposal("d"), proposal("e"),
    ]);
    review = acceptProposal(review, "a");
    review = editProposal(review, "b", { title: "New" });
    review = keepWatchingProposal(review, "c");
    review = deferProposal(review, "d");
    review = discardProposal(review, "e");

    const result = fixedApply(review);
    const types = result.reviewActionsToAppend.map((row) => row.actionType);
    expect(types).toEqual(["accept", "edit", "watch", "defer", "discard", "apply"]);

    expect(result.summary).toEqual({
      acceptedCount: 1,
      editedCount: 1,
      watchingCount: 1,
      deferredCount: 1,
      discardedCount: 1,
      savedMemoryCount: 4,
      reviewActionCount: 6,
    });
  });

  it("uses an injected id factory so output is deterministic", () => {
    const review = acceptProposal(initializeConsolidationReviewState([proposal("p1")]), "p1");
    const a = fixedApply(review);
    const b = fixedApply(review);
    expect(a.memoriesToSave[0].id).toBe(b.memoriesToSave[0].id);
    expect(a.reviewActionsToAppend[0].id).toBe(b.reviewActionsToAppend[0].id);
  });

  it("reuses an existing accepted-memory id when one of its origin proposals matches", () => {
    const review = acceptProposal(initializeConsolidationReviewState([proposal("p1")]), "p1");
    const result = fixedApply(review);
    const stored = result.memoriesToSave[0];

    const reapply = buildAcceptedMemoriesFromReviewDraft({
      projectId: "p-test",
      reviewState: review,
      appliedAt: "2026-05-16T11:00:00Z",
      idFactory,
      existingMemories: [stored],
    });
    // Same memory id, fresh action ids on the new pass.
    expect(reapply.memoriesToSave[0].id).toBe(stored.id);
  });

  it("does not mutate the input review state or proposals", () => {
    const review = acceptProposal(initializeConsolidationReviewState([proposal("p1")]), "p1");
    const before = JSON.stringify(review);
    fixedApply(review);
    expect(JSON.stringify(review)).toBe(before);
  });

  it("does not copy raw connector content — only typed evidence refs are carried", () => {
    const proposalWithRichEvidence = proposal("p1", {
      evidenceRefs: [
        { kind: "source", sessionId: "s-1", sourceId: "src-1" },
        { kind: "event", sessionId: "s-1", eventId: "e-1" },
        { kind: "session", sessionId: "s-1", sessionTitle: "Hi" },
      ],
    });
    const review = acceptProposal(initializeConsolidationReviewState([proposalWithRichEvidence]), "p1");
    const memory = fixedApply(review).memoriesToSave[0];
    for (const ref of memory.evidenceRefs) {
      expect(["session", "event", "source"]).toContain(ref.kind);
      expect(typeof ref.sessionId).toBe("string");
      expect(ref.sessionId.length).toBeGreaterThan(0);
    }
    // Sanity: no raw text fields snuck into the row beyond curated summary/title.
    expect(memory.summary).toBe("Summary p1");
  });

  it("apply audit row carries the run id and saved counts", () => {
    const review = acceptProposal(initializeConsolidationReviewState([proposal("p1")]), "p1");
    const result = buildAcceptedMemoriesFromReviewDraft({
      projectId: "p-test",
      reviewState: review,
      appliedAt: "2026-05-15T11:00:00Z",
      idFactory,
      runId: "run-abc",
    });
    const apply = result.reviewActionsToAppend.find((row) => row.actionType === "apply");
    expect(apply).toBeDefined();
    expect(apply!.targetMemoryIds.length).toBe(1);
    expect((apply!.after as { runId?: string }).runId).toBe("run-abc");
  });
});

// ─── lifecycle proposals (staleMemory / contradiction) ─────────────────

function acceptedMemory(
  id: string,
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id,
    projectId: "p-test",
    kind: "promotedDecision",
    title: `Memory ${id}`,
    summary: `Summary ${id}`,
    status: "accepted",
    importance: "medium",
    confidence: { label: "medium" },
    evidenceRefs: [{ kind: "session", sessionId: "s-1" }],
    sourceSessionIds: ["s-1"],
    originProposalIds: [`prop-${id}`],
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
    reviewActionIds: ["act-prior"],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

function applyWithExisting(
  reviewState: ReturnType<typeof initializeConsolidationReviewState>,
  existingMemories: StoredAcceptedProjectMemory[],
) {
  return buildAcceptedMemoriesFromReviewDraft({
    projectId: "p-test",
    reviewState,
    appliedAt: "2026-05-15T11:00:00Z",
    idFactory,
    existingMemories,
  });
}

describe("buildAcceptedMemoriesFromReviewDraft — lifecycle proposals", () => {
  it("accepting a staleMemory proposal transitions the referenced memory to stale", () => {
    const stale = proposal("stale-1", {
      kind: "staleMemory",
      proposedAction: "markStale",
      targetMemoryIds: ["mem-1"],
    });
    const review = acceptProposal(initializeConsolidationReviewState([stale]), "stale-1");
    const result = applyWithExisting(review, [acceptedMemory("mem-1")]);

    // One memory written — the *existing* one, transitioned. Not a new record.
    expect(result.memoriesToSave).toHaveLength(1);
    const updated = result.memoriesToSave[0];
    expect(updated.id).toBe("mem-1");
    expect(updated.status).toBe("stale");
    expect(updated.kind).toBe("promotedDecision"); // original kind preserved
    expect(updated.updatedAt).toBe("2026-05-15T11:00:00Z");
    expect(updated.originProposalIds).toEqual(["prop-mem-1"]); // provenance preserved
  });

  it("appends a review action capturing the stale status transition", () => {
    const stale = proposal("stale-1", {
      kind: "staleMemory",
      proposedAction: "markStale",
      targetMemoryIds: ["mem-1"],
    });
    const review = acceptProposal(initializeConsolidationReviewState([stale]), "stale-1");
    const result = applyWithExisting(review, [acceptedMemory("mem-1")]);

    const action = result.reviewActionsToAppend.find((row) => row.actionType === "accept");
    expect(action).toBeDefined();
    expect(action!.targetMemoryIds).toEqual(["mem-1"]);
    expect((action!.before as { status: string }).status).toBe("accepted");
    expect((action!.after as { status: string }).status).toBe("stale");
    // The transition is recorded on the memory's audit chain.
    expect(result.memoriesToSave[0].reviewActionIds).toContain(action!.id);
  });

  it("accepting a contradiction proposal transitions every referenced decision", () => {
    const contradiction = proposal("conflict-1", {
      kind: "contradiction",
      proposedAction: "resolve",
      targetMemoryIds: ["mem-a", "mem-b"],
    });
    const review = acceptProposal(
      initializeConsolidationReviewState([contradiction]),
      "conflict-1",
    );
    const result = applyWithExisting(review, [
      acceptedMemory("mem-a"),
      acceptedMemory("mem-b"),
    ]);

    expect(result.memoriesToSave.map((m) => m.id).sort()).toEqual(["mem-a", "mem-b"]);
    expect(result.memoriesToSave.every((m) => m.status === "contradicted")).toBe(true);
  });

  it("keep-watching a lifecycle proposal records the decision but does not transition memory", () => {
    const stale = proposal("stale-1", {
      kind: "staleMemory",
      proposedAction: "markStale",
      targetMemoryIds: ["mem-1"],
    });
    const review = keepWatchingProposal(
      initializeConsolidationReviewState([stale]),
      "stale-1",
    );
    const result = applyWithExisting(review, [acceptedMemory("mem-1")]);

    expect(result.memoriesToSave).toHaveLength(0);
    expect(result.reviewActionsToAppend.some((row) => row.actionType === "watch")).toBe(true);
  });

  it("discarding a lifecycle proposal leaves the referenced memory untouched", () => {
    const stale = proposal("stale-1", {
      kind: "staleMemory",
      proposedAction: "markStale",
      targetMemoryIds: ["mem-1"],
    });
    const review = discardProposal(initializeConsolidationReviewState([stale]), "stale-1");
    const result = applyWithExisting(review, [acceptedMemory("mem-1")]);

    expect(result.memoriesToSave).toHaveLength(0);
    expect(result.reviewActionsToAppend.some((row) => row.actionType === "discard")).toBe(true);
  });

  it("is a no-op for a lifecycle proposal whose target memory is not held", () => {
    const stale = proposal("stale-1", {
      kind: "staleMemory",
      proposedAction: "markStale",
      targetMemoryIds: ["mem-missing"],
    });
    const review = acceptProposal(initializeConsolidationReviewState([stale]), "stale-1");
    const result = applyWithExisting(review, [acceptedMemory("mem-1")]);
    expect(result.memoriesToSave).toHaveLength(0);
  });

  it("does not re-transition a memory that is already stale", () => {
    const stale = proposal("stale-1", {
      kind: "staleMemory",
      proposedAction: "markStale",
      targetMemoryIds: ["mem-1"],
    });
    const review = acceptProposal(initializeConsolidationReviewState([stale]), "stale-1");
    const result = applyWithExisting(review, [acceptedMemory("mem-1", { status: "stale" })]);
    expect(result.memoriesToSave).toHaveLength(0);
  });
});
