import { describe, expect, it } from "vitest";
import { laneOrder } from "../../domain/constants";
import { moriMockSession } from "../../domain/mock-data";
import { createTimelineBundles } from "./bundleEvents";
import {
  computeItemWidth,
  computeTimelineLayout,
  indexEventAnchors,
  indexLayout,
} from "./collisionLayout";
import type { TimelineDisplayItem } from "./displayItems";

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

  it("dense density is the most compact tier — shorter cards and frame than compact", () => {
    const compact = computeTimelineLayout(displayItems, range, {
      frameWidth: 1240,
      density: "compact",
      laneOrder,
    });
    const dense = computeTimelineLayout(displayItems, range, {
      frameWidth: 1240,
      density: "dense",
      laneOrder,
    });

    expect(dense.cardHeight).toBeLessThan(compact.cardHeight);
    expect(dense.cardWidth).toBeLessThan(compact.cardWidth);
    expect(dense.frameHeight).toBeLessThan(compact.frameHeight);
    // Dense cardlets stay wide enough to remain readable, not hairline slivers.
    expect(dense.cardWidth).toBeGreaterThanOrEqual(90);
  });
});

describe("computeItemWidth", () => {
  const range = { start: "2026-05-14T09:00:00Z", end: "2026-05-14T14:00:00Z" };
  const contentWidthPx = 1100;

  function eventItem(start: string, end: string | undefined): TimelineDisplayItem {
    return { kind: "event", start, end } as unknown as TimelineDisplayItem;
  }

  it("collapses a short or end-less event to the minimum cardlet width", () => {
    const noEnd = computeItemWidth(
      eventItem("2026-05-14T10:00:00Z", undefined),
      range,
      contentWidthPx,
      "comfortable",
    );
    const fiveMinutes = computeItemWidth(
      eventItem("2026-05-14T10:00:00Z", "2026-05-14T10:05:00Z"),
      range,
      contentWidthPx,
      "comfortable",
    );
    expect(noEnd).toBe(120);
    expect(fiveMinutes).toBe(120);
  });

  it("makes a longer event render a wider card than a short one", () => {
    const short = computeItemWidth(
      eventItem("2026-05-14T10:00:00Z", "2026-05-14T10:05:00Z"),
      range,
      contentWidthPx,
      "comfortable",
    );
    const long = computeItemWidth(
      eventItem("2026-05-14T10:00:00Z", "2026-05-14T11:30:00Z"),
      range,
      contentWidthPx,
      "comfortable",
    );
    expect(long).toBeGreaterThan(short);
  });

  it("clamps a very long event to the per-density maximum width", () => {
    const allDay = computeItemWidth(
      eventItem("2026-05-14T09:00:00Z", "2026-05-14T14:00:00Z"),
      range,
      contentWidthPx,
      "comfortable",
    );
    expect(allDay).toBe(300);
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
