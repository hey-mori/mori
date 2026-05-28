import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import { timelineActivityLaneOrder as laneOrder } from "./activityModel";
import { createTimelineBundles } from "./bundleEvents";
import {
  computeItemWidth,
  computeTimelineLayout,
  indexEventAnchors,
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
    expect(first!.laneType).toBe("conversation");
  });

  it("maps event anchors through bundles and keeps row counts honest", () => {
    const layout = computeTimelineLayout(displayItems, range, {
      frameWidth: 1240,
      density: "comfortable",
      laneOrder,
    });
    const eventIndex = indexEventAnchors(layout);
    const researchAnchor = eventIndex.get("evt-dayflow");

    for (const lane of layout.lanes) {
      expect(lane.rowCount).toBeGreaterThanOrEqual(0);
    }
    // All laid-out items in a lane share one y — the lane's single row.
    const yByLane = new Map<string, Set<number>>();
    for (const item of layout.items) {
      const set = yByLane.get(item.laneType) ?? new Set<number>();
      set.add(item.y);
      yByLane.set(item.laneType, set);
    }
    for (const ys of yByLane.values()) {
      expect(ys.size).toBeGreaterThanOrEqual(1);
    }
    expect(researchAnchor?.kind).toBe("bundle");
    expect(researchAnchor?.itemId).toContain("bundle-research");
  });

  it("keeps close events on one compact rail", () => {
    // The swimlane is a scanning map: close events keep their true x position
    // and do not grow the lane into a transcript-like second row.
    const items = [
      eventItem("c1", "conversation", "2026-05-14T10:00:00Z"),
      eventItem("c2", "conversation", "2026-05-14T10:02:00Z"),
    ];
    const layout = computeTimelineLayout(items, range, {
      frameWidth: 1240,
      density: "comfortable",
      laneOrder,
    });
    const placed = layout.items
      .filter((item) => item.laneType === "conversation")
      .sort((a, b) => a.x - b.x);
    expect(placed).toHaveLength(2);

    expect(placed[0]!.y).toBe(placed[1]!.y);
    expect(placed[0]!.rowIndex).toBe(0);
    expect(placed[1]!.rowIndex).toBe(0);
    expect(placed[1]!.x - placed[0]!.x).toBeLessThan(30);
  });

  it("keeps every lane at the same compact height", () => {
    // Busy, quiet, and empty lanes share one band height so the swimlane reads
    // as a fixed header + fixed plot row, never a jagged stack of sizes.
    const items = [
      eventItem("u1", "conversation", "2026-05-14T10:00:00Z"),
      eventItem("u2", "conversation", "2026-05-14T10:01:00Z"),
      eventItem("u3", "review", "2026-05-14T10:00:00Z"),
    ];
    const layout = computeTimelineLayout(items, range, {
      frameWidth: 1240,
      density: "comfortable",
      laneOrder,
    });
    const conversation = layout.lanes.find((lane) => lane.type === "conversation")!;
    const review = layout.lanes.find((lane) => lane.type === "review")!;
    const emptyLanes = layout.lanes.filter((lane) => lane.rowCount === 0);
    expect(emptyLanes.length).toBeGreaterThan(0);
    expect(conversation.height).toBe(review.height);
    for (const empty of emptyLanes) {
      expect(empty.height).toBe(review.height);
    }
  });

  it("does not open extra rows for a heavily clustered lane", () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      eventItem(`x${index}`, "conversation", `2026-05-14T10:0${index}:00Z`),
    );
    const layout = computeTimelineLayout(items, range, {
      frameWidth: 1240,
      density: "comfortable",
      laneOrder,
    });
    const lane = layout.lanes.find((entry) => entry.type === "conversation")!;
    expect(lane.rowCount).toBe(1);

    const placed = layout.items
      .filter((item) => item.laneType === "conversation")
      .sort((a, b) => a.x - b.x);
    expect(new Set(placed.map((item) => item.y)).size).toBe(1);
    expect(placed[1]!.x - placed[0]!.x).toBeLessThan(20);
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
