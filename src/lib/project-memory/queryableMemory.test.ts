import { describe, expect, it } from "vitest";
import { searchAcceptedMemories, searchProjectMemoryReferences } from "./queryableMemory";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import type { SourceRef, TimelineEvent } from "../../domain/types";

function memory(
  id: string,
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id,
    projectId: "p-1",
    kind: "promotedDecision",
    title: `Decision ${id}`,
    summary: `Summary for ${id}`,
    status: "accepted",
    importance: "medium",
    confidence: { label: "medium" },
    evidenceRefs: [{ kind: "session", sessionId: "s-1", sessionTitle: "Sprint one" }],
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
    reviewActionIds: [],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("searchAcceptedMemories", () => {
  it("returns every memory as a filter match for an empty query", () => {
    const result = searchAcceptedMemories([memory("a"), memory("b")]);
    expect(result.matchCount).toBe(2);
    expect(result.totalSearched).toBe(2);
    expect(result.results.every((r) => r.matchedField === null)).toBe(true);
    expect(result.results[0]?.matchReason).toBe("Filter match");
    expect(result.dataBasis).toContain("local-only");
  });

  it("matches query text against the title", () => {
    const result = searchAcceptedMemories(
      [memory("a", { title: "Adopt SQLite for storage" }), memory("b", { title: "Use Tailwind" })],
      { text: "sqlite" },
    );
    expect(result.matchCount).toBe(1);
    expect(result.results[0]?.matchedField).toBe("title");
  });

  it("matches against the summary when the title does not match", () => {
    const result = searchAcceptedMemories(
      [memory("a", { title: "Storage choice", summary: "We picked SQLite over IndexedDB." })],
      { text: "indexeddb" },
    );
    expect(result.results[0]?.matchedField).toBe("summary");
    expect(result.results[0]?.snippet.toLowerCase()).toContain("indexeddb");
  });

  it("matches against evidence-ref session titles", () => {
    const result = searchAcceptedMemories(
      [memory("a", { title: "x", summary: "y", evidenceRefs: [
        { kind: "session", sessionId: "s-9", sessionTitle: "Auth hardening sprint" },
      ] })],
      { text: "hardening" },
    );
    expect(result.results[0]?.matchedField).toBe("evidenceRef");
  });

  it("matches against source session ids", () => {
    const result = searchAcceptedMemories(
      [memory("a", { title: "x", summary: "y", sourceSessionIds: ["session-unique-42"] })],
      { text: "unique-42" },
    );
    expect(result.results[0]?.matchedField).toBe("sourceSession");
  });

  it("ranks title matches ahead of summary matches", () => {
    const result = searchAcceptedMemories(
      [
        memory("summary-hit", { title: "Storage", summary: "We chose redis here." }),
        memory("title-hit", { title: "Redis caching", summary: "details" }),
      ],
      { text: "redis" },
    );
    expect(result.results.map((r) => r.memoryId)).toEqual(["title-hit", "summary-hit"]);
  });

  it("ranks current memory ahead of non-current at the same match tier", () => {
    const result = searchAcceptedMemories(
      [
        memory("stale", { title: "Redis decision", status: "stale" }),
        memory("current", { title: "Redis decision", status: "accepted" }),
      ],
      { text: "redis" },
    );
    expect(result.results[0]?.memoryId).toBe("current");
    expect(result.results[0]?.isCurrent).toBe(true);
    expect(result.results[1]?.isCurrent).toBe(false);
  });

  it("marks stale / contradicted / superseded / retired memories as non-current", () => {
    for (const status of ["stale", "contradicted", "superseded", "retired", "watching", "deferred"] as const) {
      const result = searchAcceptedMemories([memory("a", { status })]);
      expect(result.results[0]?.isCurrent).toBe(false);
    }
  });

  it("applies kind / status / sensitivity / eligibility filters", () => {
    const memories = [
      memory("a", { kind: "promotedDecision", status: "accepted", sensitivity: "normal", resumeEligible: true, reportEligibility: "personal" }),
      memory("b", { kind: "recurringIssue", status: "stale", sensitivity: "sensitive", resumeEligible: false, reportEligibility: "excluded" }),
    ];
    expect(searchAcceptedMemories(memories, { filters: { kind: "recurringIssue" } }).results.map((r) => r.memoryId)).toEqual(["b"]);
    expect(searchAcceptedMemories(memories, { filters: { status: "stale" } }).results.map((r) => r.memoryId)).toEqual(["b"]);
    expect(searchAcceptedMemories(memories, { filters: { sensitivity: "normal" } }).results.map((r) => r.memoryId)).toEqual(["a"]);
    expect(searchAcceptedMemories(memories, { filters: { resumeEligible: false } }).results.map((r) => r.memoryId)).toEqual(["b"]);
    expect(searchAcceptedMemories(memories, { filters: { reportEligibility: "personal" } }).results.map((r) => r.memoryId)).toEqual(["a"]);
  });

  it("combines text and filters", () => {
    const result = searchAcceptedMemories(
      [
        memory("a", { title: "Redis caching", kind: "promotedDecision" }),
        memory("b", { title: "Redis caching", kind: "recurringIssue" }),
      ],
      { text: "redis", filters: { kind: "recurringIssue" } },
    );
    expect(result.results.map((r) => r.memoryId)).toEqual(["b"]);
  });

  it("reports evidence and source-session counts on each result", () => {
    const result = searchAcceptedMemories([
      memory("a", {
        evidenceRefs: [
          { kind: "session", sessionId: "s-1" },
          { kind: "event", sessionId: "s-1", eventId: "e-1" },
        ],
        sourceSessionIds: ["s-1", "s-2"],
      }),
    ]);
    expect(result.results[0]?.evidenceCount).toBe(2);
    expect(result.results[0]?.sourceSessionCount).toBe(2);
  });

  it("returns an empty result set when nothing matches", () => {
    const result = searchAcceptedMemories([memory("a")], { text: "nonexistent-term" });
    expect(result.results).toEqual([]);
    expect(result.matchCount).toBe(0);
    expect(result.totalSearched).toBe(1);
  });

  it("keeps snippets within the curated fields and bounded in length", () => {
    const longSummary = "word ".repeat(120).trim();
    const result = searchAcceptedMemories([memory("a", { summary: longSummary })], { text: "word" });
    expect(result.results[0]?.snippet.length).toBeLessThanOrEqual(142);
  });
});

function timelineEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "e-1",
    sessionId: "s-1",
    projectId: "p-1",
    start: "2026-05-12T10:00:00Z",
    type: "fileCode",
    title: "Edit auth module",
    summary: "Reworked the login flow.",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "verified",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    ...overrides,
  };
}

function evidenceSource(overrides: Partial<SourceRef> = {}): SourceRef {
  return {
    id: "src-1",
    sessionId: "s-1",
    kind: "gitDiff",
    title: "Auth refactor diff",
    detail: "3 files changed in the auth package.",
    trustLevel: "verified",
    redactionStatus: "notNeeded",
    rawRetention: "summaryOnly",
    capturedAt: "2026-05-12T10:00:00Z",
    relatedEventIds: [],
    ...overrides,
  };
}

describe("searchProjectMemoryReferences", () => {
  it("returns nothing for an empty query — references are search-only", () => {
    expect(
      searchProjectMemoryReferences({ timelineEvents: [timelineEvent()] }, { text: "" }),
    ).toEqual([]);
  });

  it("matches timeline event titles and summaries", () => {
    const refs = searchProjectMemoryReferences(
      {
        timelineEvents: [
          timelineEvent({ id: "title-hit", title: "Auth rework" }),
          timelineEvent({ id: "summary-hit", title: "Misc", summary: "touched auth code" }),
        ],
      },
      { text: "auth" },
    );
    expect(refs.map((r) => r.refId)).toEqual(["title-hit", "summary-hit"]);
    expect(refs.every((r) => r.resultKind === "timelineEvent")).toBe(true);
  });

  it("matches evidence source titles and detail", () => {
    const refs = searchProjectMemoryReferences(
      { evidenceSources: [evidenceSource({ id: "src-d", title: "Diff", detail: "auth package" })] },
      { text: "auth" },
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]?.resultKind).toBe("evidenceSource");
    expect(refs[0]?.matchedField).toBe("detail");
  });

  it("ranks title matches ahead of summary/detail matches across kinds", () => {
    const refs = searchProjectMemoryReferences(
      {
        timelineEvents: [timelineEvent({ id: "ev-summary", title: "x", summary: "redis" })],
        evidenceSources: [evidenceSource({ id: "src-title", title: "Redis notes", detail: "y" })],
      },
      { text: "redis" },
    );
    expect(refs[0]?.refId).toBe("src-title");
    expect(refs[0]?.matchedField).toBe("title");
  });

  it("returns an empty array when nothing matches", () => {
    const refs = searchProjectMemoryReferences(
      { timelineEvents: [timelineEvent()], evidenceSources: [evidenceSource()] },
      { text: "nonexistent" },
    );
    expect(refs).toEqual([]);
  });
});
