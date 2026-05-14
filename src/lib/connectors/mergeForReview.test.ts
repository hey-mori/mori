import { describe, expect, it } from "vitest";
import type { SourceRef, TimelineEvent } from "../../domain/types";
import { mergeConnectorCandidatesForReview } from "./mergeForReview";

function buildSource(overrides: Partial<SourceRef> = {}): SourceRef {
  return {
    id: "src-conn-1",
    sessionId: "sess-1",
    kind: "claudeTranscript",
    title: "Claude Code session A",
    detail: "1 event",
    trustLevel: "verified",
    redactionStatus: "notNeeded",
    rawRetention: "summaryOnly",
    capturedAt: "2026-05-14T10:00:00Z",
    relatedEventIds: ["evt-1"],
    ...overrides,
  };
}

function buildEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "evt-1",
    sessionId: "sess-1",
    projectId: "proj-1",
    start: "2026-05-14T10:00:00Z",
    type: "aiConversation",
    title: "Prompt submitted",
    summary: "",
    sourceRefs: ["src-conn-1"],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "verified",
    confidence: 1,
    createdBy: "import",
    userModified: false,
    ...overrides,
  };
}

describe("mergeConnectorCandidatesForReview", () => {
  it("returns null when no candidates", () => {
    expect(mergeConnectorCandidatesForReview([])).toBeNull();
  });

  it("returns the only candidate as-is when there is one", () => {
    const candidate = { source: buildSource(), events: [buildEvent()] };
    const merged = mergeConnectorCandidatesForReview([candidate]);
    expect(merged).not.toBeNull();
    expect(merged!.source).toBe(candidate.source);
    expect(merged!.events).toBe(candidate.events);
  });

  it("merges two candidates into one composite source", () => {
    const claudeCandidate = {
      source: buildSource({
        id: "src-conn-claude",
        title: "Claude Code session A",
        capturedAt: "2026-05-14T10:00:00Z",
        kind: "claudeTranscript" as const,
      }),
      events: [buildEvent({ id: "evt-claude-1", sourceRefs: ["src-conn-claude"] })],
    };
    const codexCandidate = {
      source: buildSource({
        id: "src-conn-codex",
        title: "Codex CLI session B",
        capturedAt: "2026-05-14T11:00:00Z",
        kind: "codexTranscript" as const,
      }),
      events: [
        buildEvent({
          id: "evt-codex-1",
          start: "2026-05-14T11:00:00Z",
          sourceRefs: ["src-conn-codex"],
        }),
      ],
    };

    const merged = mergeConnectorCandidatesForReview([claudeCandidate, codexCandidate]);
    expect(merged).not.toBeNull();
    // Mixed-kind merge falls back to manualNote so the source registry resolves
    expect(merged!.source.kind).toBe("manualNote");
    expect(merged!.source.title).toMatch(/Connector JSONL · 2 sessions · 2 events/);
    expect(merged!.source.detail).toMatch(/Claude Code session A \(1\)/);
    expect(merged!.source.detail).toMatch(/Codex CLI session B \(1\)/);
    // Earliest captured wins
    expect(merged!.source.capturedAt).toBe("2026-05-14T10:00:00Z");
    // Events are chronologically sorted
    expect(merged!.events.map((event) => event.id)).toEqual(["evt-claude-1", "evt-codex-1"]);
  });

  it("preserves per-event sourceRefs while adding the merged source on top", () => {
    const candidate = {
      source: buildSource({ id: "src-conn-A" }),
      events: [buildEvent({ id: "evt-A", sourceRefs: ["src-conn-A"] })],
    };
    const candidate2 = {
      source: buildSource({
        id: "src-conn-B",
        title: "Other session",
        capturedAt: "2026-05-14T12:00:00Z",
      }),
      events: [buildEvent({ id: "evt-B", sourceRefs: ["src-conn-B"] })],
    };
    const merged = mergeConnectorCandidatesForReview([candidate, candidate2])!;
    const eventA = merged.events.find((event) => event.id === "evt-A")!;
    expect(eventA.sourceRefs).toContain("src-conn-A");
    expect(eventA.sourceRefs[0]).toBe(merged.source.id);
  });

  it("keeps the merged kind when all candidates agree", () => {
    const candidate1 = {
      source: buildSource({ id: "src-conn-1", kind: "claudeTranscript" }),
      events: [buildEvent({ id: "evt-1", sourceRefs: ["src-conn-1"] })],
    };
    const candidate2 = {
      source: buildSource({
        id: "src-conn-2",
        kind: "claudeTranscript",
        capturedAt: "2026-05-14T12:00:00Z",
      }),
      events: [buildEvent({ id: "evt-2", sourceRefs: ["src-conn-2"] })],
    };
    const merged = mergeConnectorCandidatesForReview([candidate1, candidate2])!;
    expect(merged.source.kind).toBe("claudeTranscript");
  });

  it("escalates trust + retention to the worst-case across buckets", () => {
    const verified = {
      source: buildSource({ id: "s1", trustLevel: "verified", rawRetention: "summaryOnly" }),
      events: [buildEvent({ id: "e1", sourceRefs: ["s1"] })],
    };
    const inferred = {
      source: buildSource({
        id: "s2",
        trustLevel: "inferred",
        rawRetention: "retained",
        capturedAt: "2026-05-14T12:00:00Z",
      }),
      events: [buildEvent({ id: "e2", sourceRefs: ["s2"] })],
    };
    const merged = mergeConnectorCandidatesForReview([verified, inferred])!;
    expect(merged.source.trustLevel).toBe("inferred");
    expect(merged.source.rawRetention).toBe("retained");
  });
});
