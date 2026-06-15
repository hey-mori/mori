import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../domain/types";
import { buildRequestSpans } from "./requestSpans";

function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "evt-1",
    sessionId: "s1",
    projectId: "p1",
    start: "2026-05-22T09:00:00Z",
    type: "aiConversation",
    title: "사용자 질문",
    summary: "Claude 응답",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    ...overrides,
  };
}

describe("buildRequestSpans", () => {
  it("segments events into requests at each openedByUser boundary", () => {
    const spans = buildRequestSpans([
      event({ id: "ask1", start: "2026-05-22T09:00:00Z", openedByUser: true, turnId: "t1", title: "인증 설계?" }),
      event({ id: "work1", start: "2026-05-22T09:02:00Z", end: "2026-05-22T09:05:00Z" }),
      event({ id: "work2", start: "2026-05-22T09:06:00Z" }),
      event({ id: "ask2", start: "2026-05-22T09:30:00Z", openedByUser: true, turnId: "t2", title: "엣지 케이스?" }),
      event({ id: "work3", start: "2026-05-22T09:33:00Z", end: "2026-05-22T09:40:00Z" }),
    ]);

    expect(spans).toHaveLength(2);

    expect(spans[0].id).toBe("t1");
    expect(spans[0].index).toBe(0);
    expect(spans[0].title).toBe("인증 설계?");
    expect(spans[0].eventIds).toEqual(["ask1", "work1", "work2"]);
    expect(spans[0].start).toBe("2026-05-22T09:00:00.000Z");
    // End is the latest member end across the span.
    expect(spans[0].end).toBe("2026-05-22T09:06:00.000Z");

    expect(spans[1].id).toBe("t2");
    expect(spans[1].eventIds).toEqual(["ask2", "work3"]);
    expect(spans[1].end).toBe("2026-05-22T09:40:00.000Z");
  });

  it("returns no spans for a flat session with no user-opened turns", () => {
    expect(
      buildRequestSpans([
        event({ id: "a", start: "2026-05-22T09:00:00Z" }),
        event({ id: "b", start: "2026-05-22T09:01:00Z" }),
      ]),
    ).toEqual([]);
  });

  it("drops events that precede the first request", () => {
    const spans = buildRequestSpans([
      event({ id: "pre", start: "2026-05-22T08:58:00Z" }),
      event({ id: "ask", start: "2026-05-22T09:00:00Z", openedByUser: true, turnId: "t1" }),
      event({ id: "post", start: "2026-05-22T09:01:00Z" }),
    ]);

    expect(spans).toHaveLength(1);
    expect(spans[0].eventIds).toEqual(["ask", "post"]);
  });

  it("gives an instantaneous request a zero-length span (start === end)", () => {
    const spans = buildRequestSpans([
      event({ id: "ask", start: "2026-05-22T09:00:00Z", openedByUser: true, turnId: "t1" }),
    ]);

    expect(spans).toHaveLength(1);
    expect(spans[0].start).toBe(spans[0].end);
  });

  it("handles an empty event list", () => {
    expect(buildRequestSpans([])).toEqual([]);
  });
});
