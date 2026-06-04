import { describe, expect, it } from "vitest";
import type { EventActor, TimelineEvent } from "../../domain/types";
import { buildImportDigest } from "./importDigest";

function ev(
  id: string,
  start: string,
  actor: EventActor,
  toolName?: string,
  summary = "",
): TimelineEvent {
  return {
    id,
    sessionId: "s1",
    projectId: "p1",
    start,
    type: "aiConversation",
    title: id,
    summary,
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    actor,
    ...(toolName ? { toolName } : {}),
  };
}

describe("buildImportDigest", () => {
  it("counts events by lane using the timeline classifier", () => {
    const digest = buildImportDigest([
      ev("c1", "2026-06-04T09:00:00Z", "assistant"),
      ev("c2", "2026-06-04T09:10:00Z", "user"),
      ev("t1", "2026-06-04T09:20:00Z", "tool", "Bash", "🔧 Bash: ls"),
      ev("f1", "2026-06-04T09:30:00Z", "tool", "Edit"),
      ev("f2", "2026-06-04T09:35:00Z", "tool", "Write"),
      ev("r1", "2026-06-04T09:40:00Z", "tool", "WebFetch"),
      ev("b1", "2026-06-04T09:50:00Z", "tool", "Bash", "🔧 Bash: npm test"),
    ]);

    expect(digest.eventCount).toBe(7);
    expect(digest.conversationTurns).toBe(2);
    expect(digest.toolCalls).toBe(1); // only the plain Bash
    expect(digest.fileChanges).toBe(2);
    expect(digest.research).toBe(1);
    expect(digest.buildRuns).toBe(1);
  });

  it("returns non-empty lanes sorted by count", () => {
    const digest = buildImportDigest([
      ev("c1", "2026-06-04T09:00:00Z", "assistant"),
      ev("c2", "2026-06-04T09:01:00Z", "assistant"),
      ev("f1", "2026-06-04T09:02:00Z", "tool", "Edit"),
    ]);
    expect(digest.lanes[0]).toMatchObject({ lane: "conversation", count: 2 });
    expect(digest.lanes.find((l) => l.lane === "files")?.count).toBe(1);
    expect(digest.lanes.every((l) => l.count > 0)).toBe(true);
  });

  it("computes a human span duration", () => {
    const digest = buildImportDigest([
      ev("a", "2026-06-04T09:03:00Z", "assistant"),
      ev("b", "2026-06-04T11:58:00Z", "assistant"),
    ]);
    expect(digest.span.start).toBe("2026-06-04T09:03:00Z");
    expect(digest.span.end).toBe("2026-06-04T11:58:00Z");
    expect(digest.span.durationLabel).toBe("약 3시간");
  });

  it("handles an empty import", () => {
    const digest = buildImportDigest([]);
    expect(digest.eventCount).toBe(0);
    expect(digest.lanes).toEqual([]);
    expect(digest.span.durationLabel).toBe("");
  });
});
