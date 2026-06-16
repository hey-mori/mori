import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../domain/types";
import { buildFlowRelationships } from "./flowConnectors";

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

describe("buildFlowRelationships", () => {
  it("links consecutive cross-lane events within a request, skipping same-lane runs", () => {
    const rels = buildFlowRelationships(
      [
        event({ id: "ask", start: "2026-05-22T09:00:00Z", openedByUser: true, turnId: "t1", type: "aiConversation" }),
        event({ id: "f1", start: "2026-05-22T09:01:00Z", type: "fileCode" }),
        event({ id: "f2", start: "2026-05-22T09:02:00Z", type: "fileCode" }),
        event({ id: "c1", start: "2026-05-22T09:03:00Z", type: "aiConversation" }),
      ],
      [],
    );

    // ask→f1 (대화→파일) and f2→c1 (파일→대화); f1→f2 is same lane, no link.
    expect(rels.map((r) => [r.fromId, r.toId])).toEqual([
      ["ask", "f1"],
      ["f2", "c1"],
    ]);
    expect(rels.every((r) => r.type === "ledTo" && r.fromType === "event" && r.toType === "event")).toBe(true);
  });

  it("produces no lines for a flat session with no user-opened turns", () => {
    expect(
      buildFlowRelationships(
        [
          event({ id: "a", type: "aiConversation" }),
          event({ id: "b", start: "2026-05-22T09:01:00Z", type: "fileCode" }),
        ],
        [],
      ),
    ).toEqual([]);
  });

  it("does not link across request boundaries", () => {
    const rels = buildFlowRelationships(
      [
        event({ id: "ask1", start: "2026-05-22T09:00:00Z", openedByUser: true, turnId: "t1", type: "aiConversation" }),
        event({ id: "ask2", start: "2026-05-22T09:30:00Z", openedByUser: true, turnId: "t2", type: "fileCode" }),
      ],
      [],
    );
    // Each request opener is alone in its span, so there is nothing to link.
    expect(rels).toEqual([]);
  });
});
