import { describe, expect, it } from "vitest";
import { laneOrder } from "../../domain/constants";
import { moriMockSession } from "../../domain/mock-data";
import { createTimelineBundles } from "./bundleEvents";
import {
  computeItemWidth,
  computeTimelineLayout,
  indexEventAnchors,
  MAX_ROWS_PER_LANE,
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

/** Minimal display item, enough for the layout engine. */
function eventItem(
  id: string,
  laneType: TimelineDisplayItem["laneType"],
  start: string,
  end?: string,
): TimelineDisplayItem {
  return {
    kind: "event",
    id,
    laneType,
    memberEventIds: [id],
    start,
    end,
  } as unknown as TimelineDisplayItem;
}

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

  it("keeps every lane within the row cap and maps event anchors through bundles", () => {
    const layout = computeTimelineLayout(displayItems, range, {
      frameWidth: 1240,
      density: "comfortable",
      laneOrder,
    });
    const eventIndex = indexEventAnchors(layout);
    const researchAnchor = eventIndex.get("evt-dayflow");

    for (const lane of layout.lanes) {
      expect(lane.rowCount).toBeLessThanOrEqual(MAX_ROWS_PER_LANE);
    }
    expect(researchAnchor?.kind).toBe("bundle");
    expect(researchAnchor?.itemId).toContain("bundle-webResearch");
  });

  it("places a card at its true start time — clustered cards are never pushed sideways", () => {
    // Two events seconds apart in the same lane. With min-width cards they
    // overlap, so they must stack vertically while keeping near-identical x.
    const items = [
      eventItem("c1", "aiConversation", "2026-05-14T10:00:00Z"),
      eventItem("c2", "aiConversation", "2026-05-14T10:02:00Z"),
    ];
    const layout = computeTimelineLayout(items, range, {
      frameWidth: 1240,
      density: "comfortable",
      laneOrder,
    });
    const placed = layout.items.filter((item) => item.laneType === "aiConversation");
    expect(placed).toHaveLength(2);

    // True position: x values stay tightly clustered (old behaviour pushed
    // each card a full card-width to the right, ~120px+ apart).
    const xs = placed.map((item) => item.x).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeLessThan(80);

    // Stacking: the overlapping cards land on distinct rows.
    const ys = new Set(placed.map((item) => item.y));
    expect(ys.size).toBe(2);
  });

  it("grows the lane height with the row count", () => {
    const single = computeTimelineLayout(
      [eventItem("s1", "decision", "2026-05-14T10:00:00Z")],
      range,
      { frameWidth: 1240, density: "comfortable", laneOrder },
    );
    const stacked = computeTimelineLayout(
      [
        eventItem("d1", "decision", "2026-05-14T10:00:00Z"),
        eventItem("d2", "decision", "2026-05-14T10:01:00Z"),
        eventItem("d3", "decision", "2026-05-14T10:02:00Z"),
      ],
      range,
      { frameWidth: 1240, density: "comfortable", laneOrder },
    );
    const singleLane = single.lanes.find((lane) => lane.type === "decision")!;
    const stackedLane = stacked.lanes.find((lane) => lane.type === "decision")!;
    expect(singleLane.rowCount).toBe(1);
    expect(stackedLane.rowCount).toBe(MAX_ROWS_PER_LANE);
    expect(stackedLane.height).toBeGreaterThan(singleLane.height);
  });

  it("renders every content lane at one uniform height", () => {
    // A busy lane and a quiet lane must share a height; empty lanes collapse
    // to a slimmer band so the timeline is not a jagged stack of sizes.
    const items = [
      eventItem("u1", "aiConversation", "2026-05-14T10:00:00Z"),
      eventItem("u2", "aiConversation", "2026-05-14T10:01:00Z"),
      eventItem("u3", "decision", "2026-05-14T10:00:00Z"),
    ];
    const layout = computeTimelineLayout(items, range, {
      frameWidth: 1240,
      density: "comfortable",
      laneOrder,
    });
    const contentHeights = new Set(
      layout.lanes.filter((lane) => lane.rowCount > 0).map((lane) => lane.height),
    );
    expect(contentHeights.size).toBe(1);
    const emptyLanes = layout.lanes.filter((lane) => lane.rowCount === 0);
    expect(emptyLanes.length).toBeGreaterThan(0);
    for (const empty of emptyLanes) {
      expect(empty.height).toBeLessThan([...contentHeights][0]!);
    }
  });

  it("caps a heavily clustered lane at MAX_ROWS_PER_LANE", () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      eventItem(`x${index}`, "aiConversation", `2026-05-14T10:0${index}:00Z`),
    );
    const layout = computeTimelineLayout(items, range, {
      frameWidth: 1240,
      density: "comfortable",
      laneOrder,
    });
    const lane = layout.lanes.find((entry) => entry.type === "aiConversation")!;
    expect(lane.rowCount).toBe(MAX_ROWS_PER_LANE);
  });
});

describe("computeItemWidth", () => {
  const range = { start: "2026-05-14T09:00:00Z", end: "2026-05-14T14:00:00Z" };
  const contentWidthPx = 1100;

  function widthItem(start: string, end: string | undefined): TimelineDisplayItem {
    return { kind: "event", start, end } as unknown as TimelineDisplayItem;
  }

  it("collapses a short or end-less event to the minimum cardlet width", () => {
    const noEnd = computeItemWidth(
      widthItem("2026-05-14T10:00:00Z", undefined),
      range,
      contentWidthPx,
      "comfortable",
    );
    const fiveMinutes = computeItemWidth(
      widthItem("2026-05-14T10:00:00Z", "2026-05-14T10:05:00Z"),
      range,
      contentWidthPx,
      "comfortable",
    );
    expect(noEnd).toBe(120);
    expect(fiveMinutes).toBe(120);
  });

  it("makes a longer event render a wider card than a short one", () => {
    const short = computeItemWidth(
      widthItem("2026-05-14T10:00:00Z", "2026-05-14T10:05:00Z"),
      range,
      contentWidthPx,
      "comfortable",
    );
    const long = computeItemWidth(
      widthItem("2026-05-14T10:00:00Z", "2026-05-14T11:30:00Z"),
      range,
      contentWidthPx,
      "comfortable",
    );
    expect(long).toBeGreaterThan(short);
  });

  it("clamps a very long event to the per-density maximum width", () => {
    const allDay = computeItemWidth(
      widthItem("2026-05-14T09:00:00Z", "2026-05-14T14:00:00Z"),
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
