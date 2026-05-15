import { describe, expect, it } from "vitest";
import type { MemoryProposal } from "./consolidationProposals";
import {
  acceptProposal,
  countConsolidationReviewStatuses,
  deferProposal,
  discardProposal,
  editProposal,
  effectiveSummary,
  effectiveTitle,
  getReviewEntry,
  initializeConsolidationReviewState,
  keepWatchingProposal,
  resetConsolidationReviewState,
  resetProposal,
  setReviewerNote,
} from "./consolidationReviewState";

function proposal(id: string, overrides: Partial<MemoryProposal> = {}): MemoryProposal {
  return {
    id,
    kind: "promotedDecision",
    title: `Title ${id}`,
    summary: `Summary ${id}`,
    rationale: "",
    confidence: 0.8,
    importance: "medium",
    evidenceRefs: [{ kind: "session", sessionId: "s-1" }],
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

describe("initializeConsolidationReviewState", () => {
  it("creates one entry per proposal in insertion order", () => {
    const state = initializeConsolidationReviewState([proposal("a"), proposal("b"), proposal("c")]);
    expect(state.order).toEqual(["a", "b", "c"]);
    expect(Object.keys(state.entries).sort()).toEqual(["a", "b", "c"]);
    for (const id of state.order) {
      expect(state.entries[id].status).toBe("proposed");
      expect(state.entries[id].edits.title).toBeNull();
      expect(state.entries[id].note).toBeNull();
    }
  });

  it("derives a stable draftId from the proposal set head and count", () => {
    const a = initializeConsolidationReviewState([proposal("x"), proposal("y")]);
    const b = initializeConsolidationReviewState([proposal("x"), proposal("y")]);
    expect(a.draftId).toBe(b.draftId);
    expect(a.draftId).toContain("x");
  });

  it("handles an empty proposal list with an empty-sentinel draftId", () => {
    const state = initializeConsolidationReviewState([]);
    expect(state.order).toEqual([]);
    expect(state.draftId).toBe("consolidation-review-empty");
  });

  it("dedupes duplicate proposal ids defensively", () => {
    const state = initializeConsolidationReviewState([proposal("a"), proposal("a")]);
    expect(state.order).toEqual(["a"]);
  });
});

describe("transitions", () => {
  const initial = initializeConsolidationReviewState([proposal("a"), proposal("b")]);

  it("acceptProposal flips status to accepted and bumps revision", () => {
    const next = acceptProposal(initial, "a");
    expect(next.entries.a.status).toBe("accepted");
    expect(next.entries.a.revision).toBe(1);
    expect(next.entries.b.status).toBe("proposed");
    expect(next).not.toBe(initial);
  });

  it("discardProposal, keepWatchingProposal, deferProposal each set their status", () => {
    expect(discardProposal(initial, "a").entries.a.status).toBe("discarded");
    expect(keepWatchingProposal(initial, "a").entries.a.status).toBe("watching");
    expect(deferProposal(initial, "a").entries.a.status).toBe("deferred");
  });

  it("does not mutate the original state object", () => {
    const before = JSON.stringify(initial);
    acceptProposal(initial, "a");
    discardProposal(initial, "b");
    expect(JSON.stringify(initial)).toBe(before);
  });

  it("unknown proposal ids are no-ops (return the same state reference)", () => {
    expect(acceptProposal(initial, "missing")).toBe(initial);
    expect(discardProposal(initial, "missing")).toBe(initial);
  });

  it("re-applying the same status returns the same state reference", () => {
    const accepted = acceptProposal(initial, "a");
    expect(acceptProposal(accepted, "a")).toBe(accepted);
  });

  it("resetProposal clears edits/note and returns the entry to proposed", () => {
    const accepted = acceptProposal(initial, "a");
    const edited = editProposal(accepted, "a", { title: "Edited title" });
    const noted = setReviewerNote(edited, "a", "important");
    const reset = resetProposal(noted, "a");
    expect(reset.entries.a.status).toBe("proposed");
    expect(reset.entries.a.edits.title).toBeNull();
    expect(reset.entries.a.note).toBeNull();
  });
});

describe("editProposal", () => {
  const initial = initializeConsolidationReviewState([proposal("a")]);

  it("records an inline title edit and flips status to edited", () => {
    const next = editProposal(initial, "a", { title: "New title" });
    expect(next.entries.a.edits.title).toBe("New title");
    expect(next.entries.a.status).toBe("edited");
  });

  it("does not flip status to edited when the title matches the original", () => {
    const next = editProposal(initial, "a", { title: "Title a" });
    expect(next.entries.a.edits.title).toBe("Title a");
    expect(next.entries.a.status).toBe("proposed");
  });

  it("does not clobber prior edits when undefined is passed for a field", () => {
    const withTitle = editProposal(initial, "a", { title: "New title" });
    const withSummary = editProposal(withTitle, "a", { summary: "New summary" });
    expect(withSummary.entries.a.edits.title).toBe("New title");
    expect(withSummary.entries.a.edits.summary).toBe("New summary");
  });

  it("passing null clears the edit override for that field", () => {
    const withTitle = editProposal(initial, "a", { title: "New title" });
    const cleared = editProposal(withTitle, "a", { title: null });
    expect(cleared.entries.a.edits.title).toBeNull();
  });

  it("unknown proposal id is a no-op", () => {
    expect(editProposal(initial, "missing", { title: "x" })).toBe(initial);
  });
});

describe("setReviewerNote", () => {
  const initial = initializeConsolidationReviewState([proposal("a")]);

  it("attaches a reviewer note to the entry", () => {
    const next = setReviewerNote(initial, "a", "needs followup");
    expect(next.entries.a.note).toBe("needs followup");
  });

  it("clears the note when called with an empty string or null", () => {
    const withNote = setReviewerNote(initial, "a", "note");
    expect(setReviewerNote(withNote, "a", null).entries.a.note).toBeNull();
    expect(setReviewerNote(withNote, "a", "").entries.a.note).toBeNull();
  });

  it("unknown proposal id is a no-op", () => {
    expect(setReviewerNote(initial, "missing", "x")).toBe(initial);
  });
});

describe("counts", () => {
  it("counts every status correctly", () => {
    const state = initializeConsolidationReviewState([
      proposal("a"), proposal("b"), proposal("c"), proposal("d"), proposal("e"), proposal("f"),
    ]);
    const next = deferProposal(
      keepWatchingProposal(
        discardProposal(
          editProposal(acceptProposal(state, "a"), "b", { title: "x" }),
          "c",
        ),
        "d",
      ),
      "e",
    );
    const counts = countConsolidationReviewStatuses(next);
    expect(counts).toEqual({
      total: 6,
      proposed: 1, // "f"
      accepted: 1, // "a"
      edited: 1,   // "b"
      discarded: 1,
      watching: 1,
      deferred: 1,
    });
  });

  it("returns all zeros for an empty draft", () => {
    const state = initializeConsolidationReviewState([]);
    const counts = countConsolidationReviewStatuses(state);
    expect(counts.total).toBe(0);
    expect(counts.accepted).toBe(0);
  });
});

describe("selectors and effective text", () => {
  const initial = initializeConsolidationReviewState([proposal("a")]);

  it("getReviewEntry returns the entry or null", () => {
    expect(getReviewEntry(initial, "a")?.status).toBe("proposed");
    expect(getReviewEntry(initial, "missing")).toBeNull();
  });

  it("effectiveTitle/Summary prefers the edit override when present", () => {
    const edited = editProposal(initial, "a", { title: "Edited" });
    expect(effectiveTitle(edited.entries.a)).toBe("Edited");
    expect(effectiveSummary(edited.entries.a)).toBe("Summary a");
  });
});

describe("resetConsolidationReviewState", () => {
  it("returns a fresh draft from a new proposal list (prior actions dropped)", () => {
    const initial = initializeConsolidationReviewState([proposal("a"), proposal("b")]);
    const accepted = acceptProposal(initial, "a");
    const reset = resetConsolidationReviewState([proposal("a"), proposal("b"), proposal("c")]);
    expect(reset.entries.a.status).toBe("proposed");
    expect(reset.order).toEqual(["a", "b", "c"]);
    // Original draft is untouched (no mutation).
    expect(accepted.entries.a.status).toBe("accepted");
  });
});
