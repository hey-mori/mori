import { describe, expect, it } from "vitest";
import {
  buildHomeMemoryState,
  classifyMemoryState,
} from "./homeMemoryState";
import type { HomeSessionMetricSnapshot } from "./homeOverview";

const snap = (over: Partial<HomeSessionMetricSnapshot>): HomeSessionMetricSnapshot => ({
  sessionId: Math.random().toString(36).slice(2),
  ...over,
});

describe("classifyMemoryState", () => {
  it("treats a session with no reconstructed work as imported", () => {
    expect(classifyMemoryState(snap({ hasReconstructedWork: false }))).toBe(
      "imported",
    );
    // Missing flag is also imported — nothing on disk yet.
    expect(classifyMemoryState(snap({}))).toBe("imported");
  });

  it("flags open issues as review, ahead of resumable", () => {
    expect(
      classifyMemoryState(
        snap({ hasReconstructedWork: true, openIssues: 1, pendingNextActions: 3 }),
      ),
    ).toBe("review");
  });

  it("does not flag unconfirmed-decisions-only sessions as review (too common a signal)", () => {
    expect(
      classifyMemoryState(
        snap({ hasReconstructedWork: true, unconfirmedDecisions: 2 }),
      ),
    ).toBe("saved");
  });

  it("marks a session with a pending next action (no open issues) as resumable", () => {
    expect(
      classifyMemoryState(
        snap({ hasReconstructedWork: true, pendingNextActions: 1 }),
      ),
    ).toBe("resumable");
  });

  it("treats a settled analyzed session as saved", () => {
    expect(
      classifyMemoryState(
        snap({
          hasReconstructedWork: true,
          openIssues: 0,
          unconfirmedDecisions: 0,
          pendingNextActions: 0,
        }),
      ),
    ).toBe("saved");
  });
});

describe("buildHomeMemoryState", () => {
  it("is empty with no sessions", () => {
    const state = buildHomeMemoryState([]);
    expect(state.isEmpty).toBe(true);
    expect(state.total).toBe(0);
    expect(state.peak).toBe(0);
    expect(state.buckets.map((b) => b.key)).toEqual([
      "imported",
      "review",
      "saved",
      "resumable",
    ]);
    expect(state.buckets.every((b) => b.count === 0)).toBe(true);
  });

  it("partitions sessions so bucket counts sum to the total", () => {
    const state = buildHomeMemoryState([
      snap({ hasReconstructedWork: false }), // imported
      snap({ hasReconstructedWork: true, openIssues: 2 }), // review
      snap({ hasReconstructedWork: true, unconfirmedDecisions: 1 }), // saved (no open issues)
      snap({ hasReconstructedWork: true, pendingNextActions: 4 }), // resumable
      snap({ hasReconstructedWork: true }), // saved
      snap({ hasReconstructedWork: true }), // saved
    ]);
    const byKey = Object.fromEntries(state.buckets.map((b) => [b.key, b.count]));
    expect(byKey).toEqual({ imported: 1, review: 1, resumable: 1, saved: 3 });
    expect(state.total).toBe(6);
    expect(byKey.imported + byKey.review + byKey.resumable + byKey.saved).toBe(
      state.total,
    );
    expect(state.peak).toBe(3);
    expect(state.isEmpty).toBe(false);
  });

  it("keeps a single sparse session honest (one bucket of one)", () => {
    const state = buildHomeMemoryState([snap({ hasReconstructedWork: false })]);
    expect(state.total).toBe(1);
    expect(state.buckets.find((b) => b.key === "imported")?.count).toBe(1);
    expect(state.peak).toBe(1);
  });
});
