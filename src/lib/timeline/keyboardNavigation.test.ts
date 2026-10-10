import { describe, expect, it } from "vitest";
import type { ActivityLaneId } from "./activityModel";
import { firstItem, selectAcrossLane, selectInLane } from "./keyboardNavigation";

type NavItem = {
  id: string;
  laneType: ActivityLaneId;
  start: string;
  memberEventIds: string[];
};

function item(
  id: string,
  laneType: ActivityLaneId,
  minute: number,
  memberEventIds: string[] = [id],
): NavItem {
  const mm = String(minute).padStart(2, "0");
  return { id, laneType, start: `2026-05-22T09:${mm}:00Z`, memberEventIds };
}

const LANE_ORDER: ActivityLaneId[] = ["conversation", "files", "git", "review"];

// conversation: c1(09:00) c2(09:10) c3(09:20)
// files:        f1(09:05) f2(09:18)
// review:       r1(09:12)
const ITEMS: NavItem[] = [
  item("c1", "conversation", 0),
  item("c2", "conversation", 10),
  item("c3", "conversation", 20),
  item("f1", "files", 5),
  item("f2", "files", 18),
  item("r1", "review", 12),
];

describe("selectInLane", () => {
  it("moves to the next item in the same lane by time", () => {
    expect(selectInLane(ITEMS, "c1", "next")).toBe("c2");
    expect(selectInLane(ITEMS, "c2", "next")).toBe("c3");
  });

  it("moves to the previous item in the same lane", () => {
    expect(selectInLane(ITEMS, "c3", "prev")).toBe("c2");
  });

  it("returns null at a lane edge", () => {
    expect(selectInLane(ITEMS, "c1", "prev")).toBeNull();
    expect(selectInLane(ITEMS, "c3", "next")).toBeNull();
  });

  it("stays within the lane and ignores other lanes", () => {
    expect(selectInLane(ITEMS, "f1", "next")).toBe("f2");
    expect(selectInLane(ITEMS, "f2", "next")).toBeNull();
  });

  it("resolves a selection given by a member event id (bundle)", () => {
    const items: NavItem[] = [
      { id: "b1", laneType: "conversation", start: "2026-05-22T09:00:00Z", memberEventIds: ["e1", "e2"] },
      item("c2", "conversation", 10),
    ];
    expect(selectInLane(items, "e2", "next")).toBe("c2");
  });

  it("defaults to the first item when nothing is selected", () => {
    expect(selectInLane(ITEMS, null, "next")).toBe("c2");
  });
});

describe("selectAcrossLane", () => {
  it("moves down to the nearest item in the next non-empty lane", () => {
    // from c2 (09:10) down → files: f1(09:05, Δ5) vs f2(09:18, Δ8) → f1
    expect(selectAcrossLane(ITEMS, "c2", "down", LANE_ORDER)).toBe("f1");
  });

  it("moves up to the nearest item in the previous non-empty lane", () => {
    // from r1 (09:12) up → git is empty, so files: f2(09:18, Δ6) vs f1(09:05, Δ7) → f2
    expect(selectAcrossLane(ITEMS, "r1", "up", LANE_ORDER)).toBe("f2");
  });

  it("skips empty lanes when walking the lane order", () => {
    // from f1 (09:05) down → git empty → review: r1
    expect(selectAcrossLane(ITEMS, "f1", "down", LANE_ORDER)).toBe("r1");
  });

  it("returns null at the top and bottom lanes", () => {
    expect(selectAcrossLane(ITEMS, "c1", "up", LANE_ORDER)).toBeNull();
    expect(selectAcrossLane(ITEMS, "r1", "down", LANE_ORDER)).toBeNull();
  });
});

describe("firstItem", () => {
  it("starts at the earliest item", () => {
    expect(firstItem(ITEMS, LANE_ORDER)).toBe("c1");
  });

  it("prefers the upper lane on a tie", () => {
    expect(firstItem([item("r0", "review", 0), item("f0", "files", 0)], LANE_ORDER)).toBe("f0");
  });

  it("is null for an empty view", () => {
    expect(firstItem([], LANE_ORDER)).toBeNull();
  });
});
