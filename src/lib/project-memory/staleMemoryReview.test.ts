import { describe, expect, it } from "vitest";
import {
  buildStaleMemoryProposals,
  STALE_NEXT_SESSION_DAYS,
} from "./staleMemoryReview";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

const NOW = "2026-05-15T00:00:00Z";

function memory(
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
    confidence: { label: "high", score: 0.9 },
    evidenceRefs: [{ kind: "session", sessionId: "s-1", sessionTitle: "Sprint" }],
    sourceSessionIds: ["s-1"],
    originProposalIds: ["prop-1"],
    relatedIssueIds: ["i-1"],
    relatedDecisionIds: ["d-1"],
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

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("buildStaleMemoryProposals", () => {
  it("emits nothing for fresh, signal-free accepted memories", () => {
    expect(buildStaleMemoryProposals([memory()], { now: NOW })).toEqual([]);
  });

  it("flags superseded memory with high confidence and markStale", () => {
    const proposals = buildStaleMemoryProposals(
      [memory({ id: "mem-sup", status: "superseded", supersededBy: "mem-newer" })],
      { now: NOW },
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.kind).toBe("staleMemory");
    expect(proposals[0]?.confidence).toBe(0.9);
    expect(proposals[0]?.proposedAction).toBe("markStale");
    expect(proposals[0]?.rationale).toContain("superseded");
    expect(proposals[0]?.rationale).toContain("mem-newer");
  });

  it("flags retired memory with high confidence", () => {
    const proposals = buildStaleMemoryProposals(
      [memory({ id: "mem-ret", status: "retired" })],
      { now: NOW },
    );
    expect(proposals[0]?.confidence).toBe(0.9);
    expect(proposals[0]?.rationale).toContain("retired");
  });

  it("flags an explicit revisit note with medium confidence", () => {
    const proposals = buildStaleMemoryProposals(
      [memory({ id: "mem-note", reviewNote: "Should revisit once the API stabilises" })],
      { now: NOW },
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.confidence).toBe(0.6);
    expect(proposals[0]?.proposedAction).toBe("markStale");
    expect(proposals[0]?.rationale).toContain("revisit");
  });

  it("ignores reviewer notes without a stale keyword", () => {
    const proposals = buildStaleMemoryProposals(
      [memory({ reviewNote: "Solid decision, well evidenced." })],
      { now: NOW },
    );
    expect(proposals).toEqual([]);
  });

  it("flags an old next-session recommendation with low confidence (time-only)", () => {
    const proposals = buildStaleMemoryProposals(
      [
        memory({
          id: "mem-next",
          kind: "nextSessionRecommendation",
          updatedAt: daysAgo(STALE_NEXT_SESSION_DAYS + 5),
          acceptedAt: daysAgo(STALE_NEXT_SESSION_DAYS + 5),
        }),
      ],
      { now: NOW },
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.confidence).toBe(0.3);
    expect(proposals[0]?.proposedAction).toBe("keepWatching");
    expect(proposals[0]?.rationale).toMatch(/days ago/);
  });

  it("does not time-flag a recent next-session recommendation", () => {
    const proposals = buildStaleMemoryProposals(
      [
        memory({
          kind: "nextSessionRecommendation",
          updatedAt: daysAgo(STALE_NEXT_SESSION_DAYS - 5),
        }),
      ],
      { now: NOW },
    );
    expect(proposals).toEqual([]);
  });

  it("does not apply time-only decay to non-next-session memories", () => {
    const proposals = buildStaleMemoryProposals(
      [memory({ kind: "promotedDecision", updatedAt: daysAgo(400) })],
      { now: NOW },
    );
    expect(proposals).toEqual([]);
  });

  it("prefers the strongest signal when several could apply", () => {
    // A superseded next-session recommendation that is also old + noted:
    // supersession wins (high confidence), only one proposal is emitted.
    const proposals = buildStaleMemoryProposals(
      [
        memory({
          id: "mem-multi",
          kind: "nextSessionRecommendation",
          status: "superseded",
          reviewNote: "outdated now",
          updatedAt: daysAgo(90),
        }),
      ],
      { now: NOW },
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.confidence).toBe(0.9);
  });

  it("carries evidence refs, session ids, and related ids without raw content", () => {
    const proposals = buildStaleMemoryProposals(
      [memory({ id: "mem-ev", status: "retired" })],
      { now: NOW },
    );
    const proposal = proposals[0];
    expect(proposal?.evidenceRefs).toEqual([
      { kind: "session", sessionId: "s-1", sessionTitle: "Sprint" },
    ]);
    expect(proposal?.sourceSessionIds).toEqual(["s-1"]);
    expect(proposal?.relatedIssueIds).toEqual(["i-1"]);
    expect(proposal?.relatedDecisionIds).toEqual(["d-1"]);
    // The proposal id is namespaced on the accepted-memory id.
    expect(proposal?.id).toBe("proposal::staleMemory::mem-ev");
  });

  it("sorts proposals strongest signal first", () => {
    const proposals = buildStaleMemoryProposals(
      [
        memory({
          id: "mem-time",
          kind: "nextSessionRecommendation",
          updatedAt: daysAgo(90),
        }),
        memory({ id: "mem-sup", status: "superseded" }),
        memory({ id: "mem-note", reviewNote: "revisit this" }),
      ],
      { now: NOW },
    );
    expect(proposals.map((p) => p.confidence)).toEqual([0.9, 0.6, 0.3]);
  });

  it("tolerates an unparseable timestamp on a next-session recommendation", () => {
    const proposals = buildStaleMemoryProposals(
      [memory({ kind: "nextSessionRecommendation", updatedAt: "not-a-date", acceptedAt: "also-bad" })],
      { now: NOW },
    );
    expect(proposals).toEqual([]);
  });
});
