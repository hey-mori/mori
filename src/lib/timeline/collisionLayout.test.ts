import { describe, expect, it } from "vitest";
import { laneOrder } from "../../domain/constants";
import { moriMockSession } from "../../domain/mock-data";
import { createTimelineBundles } from "./bundleEvents";
import { computeTimelineLayout, indexEventAnchors, indexLayout } from "./collisionLayout";

const range = {
  start: moriMockSession.session.startedAt,
  end: moriMockSession.session.endedAt,
};

const displayItems = createTimelineBundles(moriMockSession.events, moriMockSession.relationships, {
  timeWindowMinutes: 12,
  minEventsForBundle: 3,
  preserveSelectedEventId: "evt-positioning",
  preserveImportantEventIds: ["evt-positioning", "evt-start-flow"],
  maxVisibleItemsPerLane: 4,
  decisions: moriMockSession.decisions,
});

describe("computeTimelineLayout", () => {
  it("lays out display items in chronological order inside their swim lanes", () => {
    const layout = computeTimelineLayout(displayItems, range, {
      frameWidth: 1240,
      density: "comfortable",
      laneOrder,
    });

    const eventIndex = indexEventAnchors(layout);
    const first = eventIndex.get("evt-claude-start");
    const second = eventIndex.get("evt-positioning");

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first!.x).toBeLessThan(second!.x);
    expect(first!.laneType).toBe("aiConversation");
  });

  it("keeps busy lanes on a single primary row and maps event anchors through bundles", () => {
    const layout = computeTimelineLayout(displayItems, range, {
      frameWidth: 1240,
      density: "comfortable",
      laneOrder,
    });
    const eventIndex = indexEventAnchors(layout);
    const aiLane = layout.lanes.find((lane) => lane.type === "aiConversation");
    const researchAnchor = eventIndex.get("evt-dayflow");

    expect(aiLane?.rowCount).toBeLessThanOrEqual(1);
    expect(researchAnchor?.kind).toBe("bundle");
    expect(researchAnchor?.itemId).toContain("bundle-webResearch");
  });

  it("compact density yields shorter cards and shorter lanes than comfortable", () => {
    const comfortable = computeTimelineLayout(displayItems, range, {
      frameWidth: 1240,
      density: "comfortable",
      laneOrder,
    });
    const compact = computeTimelineLayout(displayItems, range, {
      frameWidth: 1240,
      density: "compact",
      laneOrder,
    });

    expect(compact.cardHeight).toBeLessThan(comfortable.cardHeight);
    expect(compact.frameHeight).toBeLessThan(comfortable.frameHeight);
  });

  it("places cards inside the content area to the right of the lane label column", () => {
    const layout = computeTimelineLayout(displayItems, range, {
      frameWidth: 1240,
      laneOrder,
      laneLabelWidthPx: 160,
    });
    expect(layout.laneLabelWidthPx).toBe(160);
    expect(layout.contentLeftPx).toBe(160);
    expect(layout.items[0]!.x).toBeGreaterThanOrEqual(160);
  });

  it("frame height aggregates lane heights and the axis offset", () => {
    const layout = computeTimelineLayout(displayItems, range, { frameWidth: 1240, laneOrder });
    const summed = layout.lanes.reduce((acc, lane) => acc + lane.height, 0);
    expect(layout.frameHeight).toBe(summed + layout.laneOffsetPx);
  });
});
