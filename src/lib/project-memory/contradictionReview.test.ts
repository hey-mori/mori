import { describe, expect, it } from "vitest";
import { buildContradictionProposals } from "./contradictionReview";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

function memory(
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id: "mem-1",
    projectId: "p-1",
    kind: "promotedDecision",
    title: "Storage backend",
    summary: "Use SQLite for desktop persistence.",
    status: "accepted",
    importance: "medium",
    confidence: { label: "medium" },
    evidenceRefs: [{ kind: "session", sessionId: "s-1", sessionTitle: "Sprint" }],
    sourceSessionIds: ["s-1"],
    originProposalIds: ["prop-1"],
    relatedIssueIds: [],
    relatedDecisionIds: ["d-1"],
    proposedAction: "promote",
    sensitivity: "normal",
    resumeEligible: true,
    reportEligibility: "personal",
    createdAt: "2026-05-10T10:00:00Z",
    updatedAt: "2026-05-12T10:00:00Z",
    acceptedAt: "2026-05-12T10:00:00Z",
    acceptedBy: "local-user",
    reviewActionIds: [],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("buildContradictionProposals", () => {
  it("emits nothing for a single decision", () => {
    expect(buildContradictionProposals([memory()])).toEqual([]);
  });

  it("emits nothing when same-title decisions share the same summary", () => {
    const proposals = buildContradictionProposals([
      memory({ id: "a", title: "Storage backend", summary: "Use SQLite." }),
      memory({ id: "b", title: "Storage backend", summary: "Use SQLite." }),
    ]);
    expect(proposals).toEqual([]);
  });

  it("flags two current decisions that share a title but differ", () => {
    const proposals = buildContradictionProposals([
      memory({ id: "a", title: "Storage backend", summary: "Use SQLite for desktop." }),
      memory({ id: "b", title: "Storage backend", summary: "Use IndexedDB everywhere." }),
    ]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.kind).toBe("contradiction");
    expect(proposals[0]?.proposedAction).toBe("resolve");
    expect(proposals[0]?.confidence).toBeLessThan(0.7);
    // Shows both sides.
    expect(proposals[0]?.rationale).toContain("a — ");
    expect(proposals[0]?.rationale).toContain("b — ");
    expect(proposals[0]?.id).toBe("proposal::contradiction::a+b");
  });

  it("matches titles case- and punctuation-insensitively", () => {
    const proposals = buildContradictionProposals([
      memory({ id: "a", title: "Storage Backend.", summary: "Use SQLite." }),
      memory({ id: "b", title: "  storage backend  ", summary: "Use IndexedDB." }),
    ]);
    expect(proposals).toHaveLength(1);
  });

  it("ignores superseded / retired decisions — that is the lifecycle, not a conflict", () => {
    const proposals = buildContradictionProposals([
      memory({ id: "a", title: "Storage backend", summary: "Use SQLite.", status: "accepted" }),
      memory({ id: "b", title: "Storage backend", summary: "Use files.", status: "superseded" }),
      memory({ id: "c", title: "Storage backend", summary: "Use memory.", status: "retired" }),
    ]);
    // Only one current decision remains in the group → no contradiction.
    expect(proposals).toEqual([]);
  });

  it("only considers promotedDecision memories", () => {
    const proposals = buildContradictionProposals([
      memory({ id: "a", kind: "recurringIssue", title: "Flaky test", summary: "Fails on CI." }),
      memory({ id: "b", kind: "recurringIssue", title: "Flaky test", summary: "Fails locally." }),
    ]);
    expect(proposals).toEqual([]);
  });

  it("unions evidence refs, session ids, and related decision ids across the group", () => {
    const proposals = buildContradictionProposals([
      memory({
        id: "a",
        title: "Storage backend",
        summary: "Use SQLite.",
        evidenceRefs: [{ kind: "session", sessionId: "s-1" }],
        sourceSessionIds: ["s-1"],
        relatedDecisionIds: ["d-1"],
      }),
      memory({
        id: "b",
        title: "Storage backend",
        summary: "Use IndexedDB.",
        evidenceRefs: [{ kind: "session", sessionId: "s-2" }],
        sourceSessionIds: ["s-2"],
        relatedDecisionIds: ["d-2"],
      }),
    ]);
    expect(proposals[0]?.sourceSessionIds.sort()).toEqual(["s-1", "s-2"]);
    expect(proposals[0]?.relatedDecisionIds.sort()).toEqual(["d-1", "d-2"]);
    expect(proposals[0]?.evidenceRefs).toHaveLength(2);
  });

  it("takes the highest importance across the conflicting group", () => {
    const proposals = buildContradictionProposals([
      memory({ id: "a", title: "Storage backend", summary: "Use SQLite.", importance: "low" }),
      memory({ id: "b", title: "Storage backend", summary: "Use IndexedDB.", importance: "high" }),
    ]);
    expect(proposals[0]?.importance).toBe("high");
  });

  it("flags a three-way conflict as a single grouped proposal", () => {
    const proposals = buildContradictionProposals([
      memory({ id: "a", title: "Auth flow", summary: "Use sessions." }),
      memory({ id: "b", title: "Auth flow", summary: "Use JWT." }),
      memory({ id: "c", title: "Auth flow", summary: "Use OAuth only." }),
    ]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.summary).toContain("3 accepted decisions");
  });
});
