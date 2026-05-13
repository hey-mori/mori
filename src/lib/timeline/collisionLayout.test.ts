import { describe, expect, it } from "vitest";
import type { EventType, TimelineEvent } from "../../domain/types";
import { computeTimelineLayout } from "./collisionLayout";

const laneOrder: EventType[] = [
  "aiConversation",
  "decision",
  "issue",
  "fileCode",
  "webResearch",
  "documentNote",
  "artifact",
  "other",
];

function buildEvent(id: string, type: EventType, start: string): TimelineEvent {
  return {
    id,
    sessionId: "sess",
    projectId: "proj",
    start,
    type,
    title: id,
    summary: "",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "verified",
    confidence: 0.9,
    createdBy: "user",
    userModified: false,
  };
}

const range = { start: "2026-05-12T13:00:00Z", end: "2026-05-12T18:00:00Z" };

describe("computeTimelineLayout", () => {
  it("places well-spaced events in the same row", () => {
    const events = [
      buildEvent("a", "aiConversation", "2026-05-12T13:00:00Z"),
      buildEvent("b", "aiConversation", "2026-05-12T17:00:00Z"),
    ];
    const layout = computeTimelineLayout(events, range, {
      frameWidth: 1200,
      laneOrder,
    });
    expect(layout.events.find((e) => e.eventId === "a")!.rowIndex).toBe(0);
    expect(layout.events.find((e) => e.eventId === "b")!.rowIndex).toBe(0);
  });

  it("stacks overlapping events into separate sub-rows", () => {
    const events = [
      buildEvent("a", "aiConversation", "2026-05-12T14:35:00Z"),
      buildEvent("b", "aiConversation", "2026-05-12T14:37:00Z"),
      buildEvent("c", "aiConversation", "2026-05-12T14:39:00Z"),
    ];
    const layout = computeTimelineLayout(events, range, {
      frameWidth: 1200,
      laneOrder,
    });
    const rows = layout.events.map((e) => e.rowIndex).sort();
    // Three events crowded into the same x-band should land on three rows.
    expect(rows).toEqual([0, 1, 2]);
  });

  it("derives lane height from row count", () => {
    const single = computeTimelineLayout(
      [buildEvent("a", "issue", "2026-05-12T13:30:00Z")],
      range,
      { frameWidth: 1200, laneOrder },
    );
    const tripled = computeTimelineLayout(
      [
        buildEvent("a", "issue", "2026-05-12T14:00:00Z"),
        buildEvent("b", "issue", "2026-05-12T14:02:00Z"),
        buildEvent("c", "issue", "2026-05-12T14:04:00Z"),
      ],
      range,
      { frameWidth: 1200, laneOrder },
    );
    const singleLane = single.lanes.find((l) => l.type === "issue")!;
    const tripledLane = tripled.lanes.find((l) => l.type === "issue")!;
    expect(tripledLane.height).toBeGreaterThan(singleLane.height);
    expect(tripledLane.rowCount).toBe(3);
  });

  it("compact density yields shorter cards and shorter lanes than comfortable", () => {
    const events = [
      buildEvent("a", "decision", "2026-05-12T14:00:00Z"),
      buildEvent("b", "decision", "2026-05-12T14:02:00Z"),
    ];
    const comfortable = computeTimelineLayout(events, range, {
      frameWidth: 1200,
      laneOrder,
      density: "comfortable",
    });
    const compact = computeTimelineLayout(events, range, {
      frameWidth: 1200,
      laneOrder,
      density: "compact",
    });
    expect(compact.cardHeight).toBeLessThan(comfortable.cardHeight);
    const compactLane = compact.lanes.find((l) => l.type === "decision")!;
    const comfortableLane = comfortable.lanes.find((l) => l.type === "decision")!;
    expect(compactLane.height).toBeLessThan(comfortableLane.height);
  });

  it("never produces overlapping rectangles in the same lane", () => {
    const events = [
      buildEvent("a", "issue", "2026-05-12T14:00:00Z"),
      buildEvent("b", "issue", "2026-05-12T14:01:00Z"),
      buildEvent("c", "issue", "2026-05-12T14:02:00Z"),
      buildEvent("d", "issue", "2026-05-12T15:00:00Z"),
    ];
    const layout = computeTimelineLayout(events, range, { frameWidth: 1200, laneOrder });
    const issueCards = layout.events.filter((e) => e.type === "issue");
    for (let i = 0; i < issueCards.length; i += 1) {
      for (let j = i + 1; j < issueCards.length; j += 1) {
        const a = issueCards[i];
        const b = issueCards[j];
        const horizontallyOverlap = a.x < b.x + b.width && b.x < a.x + a.width;
        const sameRow = a.rowIndex === b.rowIndex;
        // Two cards may share an x-range *or* a row, but not both.
        expect(horizontallyOverlap && sameRow).toBe(false);
      }
    }
  });

  it("exposes deterministic anchor points for relationship layers", () => {
    const events = [buildEvent("a", "fileCode", "2026-05-12T15:00:00Z")];
    const layout = computeTimelineLayout(events, range, { frameWidth: 1200, laneOrder });
    const a = layout.events[0];
    expect(a.anchorLeft.x).toBe(a.x);
    expect(a.anchorRight.x).toBe(a.x + a.width);
    expect(a.anchorCenter.y).toBe(a.y + a.height / 2);
    expect(a.anchorCenter.y).toBeGreaterThanOrEqual(a.laneTop);
    expect(a.anchorCenter.y).toBeLessThanOrEqual(a.laneTop + a.laneHeight);
  });

  it("places cards inside the content area to the right of the lane label column", () => {
    const events = [buildEvent("a", "aiConversation", "2026-05-12T13:00:00Z")];
    const layout = computeTimelineLayout(events, range, {
      frameWidth: 1200,
      laneOrder,
      laneLabelWidthPx: 160,
    });
    expect(layout.laneLabelWidthPx).toBe(160);
    expect(layout.contentLeftPx).toBe(160);
    expect(layout.events[0].x).toBeGreaterThanOrEqual(160);
  });

  it("frame height aggregates lane heights and the axis offset", () => {
    const events = [
      buildEvent("a", "decision", "2026-05-12T14:00:00Z"),
      buildEvent("b", "issue", "2026-05-12T14:00:00Z"),
    ];
    const layout = computeTimelineLayout(events, range, { frameWidth: 1200, laneOrder });
    const summed = layout.lanes.reduce((acc, lane) => acc + lane.height, 0);
    expect(layout.frameHeight).toBe(summed + layout.laneOffsetPx);
  });
});
