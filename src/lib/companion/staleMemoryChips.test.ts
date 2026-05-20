import { describe, expect, it } from "vitest";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import { buildStaleMemoryChips } from "./staleMemoryChips";

function makeMemory(
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id: overrides.id ?? "mem-1",
    projectId: "proj",
    kind: "promotedDecision",
    title: overrides.title ?? "Test memory",
    summary: "",
    status: overrides.status ?? "stale",
    importance: "medium",
    confidence: { label: "medium" },
    evidenceRefs: [],
    sourceSessionIds: ["sess-1"],
    originProposalIds: [],
    relatedIssueIds: [],
    relatedDecisionIds: [],
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

describe("buildStaleMemoryChips", () => {
  it("resolves ids in order with title, status, and lifecycle group", () => {
    const memories = [
      makeMemory({ id: "mem-stale", title: "Stale one", status: "stale" }),
      makeMemory({ id: "mem-contra", title: "Contradicted one", status: "contradicted" }),
    ];
    const chips = buildStaleMemoryChips(["mem-stale", "mem-contra"], memories);
    expect(chips).toEqual([
      {
        memoryId: "mem-stale",
        title: "Stale one",
        status: "stale",
        lifecycleGroup: "attention",
      },
      {
        memoryId: "mem-contra",
        title: "Contradicted one",
        status: "contradicted",
        lifecycleGroup: "attention",
      },
    ]);
  });

  it("drops ids that are absent from the supplied memory list", () => {
    const chips = buildStaleMemoryChips(
      ["mem-here", "mem-gone"],
      [makeMemory({ id: "mem-here" })],
    );
    expect(chips.map((chip) => chip.memoryId)).toEqual(["mem-here"]);
  });

  it("deduplicates repeated ids", () => {
    const chips = buildStaleMemoryChips(
      ["mem-1", "mem-1", "mem-1"],
      [makeMemory({ id: "mem-1" })],
    );
    expect(chips).toHaveLength(1);
  });

  it("returns an empty array when given no ids", () => {
    expect(buildStaleMemoryChips([], [makeMemory()])).toEqual([]);
  });
});
