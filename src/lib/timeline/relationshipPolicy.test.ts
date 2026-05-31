import { describe, expect, it } from "vitest";
import type { Relationship } from "../../domain/types";
import type { LaidOutTimelineItem } from "./collisionLayout";
import {
  buildVisibleConnectors,
  chooseRelationshipVisibility,
  defaultConnectorCap,
} from "./relationshipPolicy";

function laidOutItem(overrides: Partial<LaidOutTimelineItem> & { itemId: string }): LaidOutTimelineItem {
  return {
    itemId: overrides.itemId,
    kind: overrides.kind ?? "event",
    laneType: overrides.laneType ?? "conversation",
    memberEventIds: overrides.memberEventIds ?? [overrides.itemId],
    rowIndex: overrides.rowIndex ?? 0,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 180,
    height: overrides.height ?? 68,
    laneTop: overrides.laneTop ?? 0,
    laneHeight: overrides.laneHeight ?? 80,
    anchorLeft: overrides.anchorLeft ?? { x: 0, y: 34 },
    anchorRight: overrides.anchorRight ?? { x: 180, y: 34 },
    anchorCenter: overrides.anchorCenter ?? { x: 90, y: 34 },
  };
}

function rel(id: string, from: string, to: string): Relationship {
  return {
    id,
    fromId: from,
    fromType: "event",
    toId: to,
    toType: "event",
    type: "ledTo",
    confidence: 0.8,
    reason: "test",
  };
}

describe("chooseRelationshipVisibility", () => {
  it("shows quiet overview connectors in Timeline mode without focus", () => {
    expect(
      chooseRelationshipVisibility({
        mode: "timeline",
        focusedSet: new Set(["a"]),
        focusActive: false,
      }),
    ).toBe("overview");
  });

  it("shows focused-only connectors when focus is active in Timeline mode", () => {
    expect(
      chooseRelationshipVisibility({
        mode: "timeline",
        focusedSet: new Set(["a", "b"]),
        focusActive: true,
      }),
    ).toBe("focused-only");
  });

  it("uses graph visibility in Flow Focus mode", () => {
    expect(
      chooseRelationshipVisibility({
        mode: "flow",
        focusedSet: new Set(["a", "b"]),
        focusActive: true,
      }),
    ).toBe("graph");
  });
});

describe("buildVisibleConnectors", () => {
  const anchors = new Map<string, LaidOutTimelineItem>([
    ["a", laidOutItem({ itemId: "item-a", memberEventIds: ["a"] })],
    ["b", laidOutItem({ itemId: "item-b", memberEventIds: ["b"], laneType: "review" })],
    ["c", laidOutItem({ itemId: "item-c", memberEventIds: ["c"] })],
    ["d", laidOutItem({ itemId: "item-d", memberEventIds: ["d"], laneType: "tracker" })],
  ]);
  const focused = new Set(["a", "b", "c"]);

  it("renders overview connectors in default Timeline mode", () => {
    const out = buildVisibleConnectors({
      mode: "timeline",
      focusedSet: focused,
      focusActive: false,
      relationships: [rel("r1", "a", "b")],
      eventAnchorIndex: anchors,
      toneOfLane: () => "purple",
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.contributingIds).toEqual(["r1"]);
  });

  it("renders focused connectors when focus is active", () => {
    const out = buildVisibleConnectors({
      mode: "timeline",
      focusedSet: focused,
      focusActive: true,
      relationships: [rel("r1", "a", "b")],
      eventAnchorIndex: anchors,
      toneOfLane: () => "purple",
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.contributingIds).toEqual(["r1"]);
  });

  it("drops connectors that leave the focused set", () => {
    const out = buildVisibleConnectors({
      mode: "timeline",
      focusedSet: focused,
      focusActive: true,
      relationships: [rel("r1", "a", "b"), rel("r2", "a", "d")],
      eventAnchorIndex: anchors,
      toneOfLane: () => "purple",
    });
    expect(out.map((connector) => connector.contributingIds.flat())).toEqual([["r1"]]);
  });

  it("aggregates multiple raw relationships into one connector per item pair", () => {
    const out = buildVisibleConnectors({
      mode: "flow",
      focusedSet: focused,
      focusActive: true,
      relationships: [rel("r1", "a", "b"), rel("r2", "a", "b"), rel("r3", "b", "c")],
      eventAnchorIndex: anchors,
      toneOfLane: () => "purple",
    });
    const aToB = out.find((connector) => connector.id === "item-a->item-b");
    const bToC = out.find((connector) => connector.id === "item-b->item-c");
    expect(aToB?.weight).toBe(2);
    expect(aToB?.contributingIds).toEqual(["r1", "r2"]);
    expect(bToC?.weight).toBe(1);
  });

  it("respects the maxConnectors cap", () => {
    const relationships: Relationship[] = [];
    const localFocus = new Set<string>();
    const localAnchors = new Map<string, LaidOutTimelineItem>();
    for (let i = 0; i < 20; i += 1) {
      const fromId = `from-${i}`;
      const toId = `to-${i}`;
      localFocus.add(fromId);
      localFocus.add(toId);
      localAnchors.set(fromId, laidOutItem({ itemId: `item-from-${i}`, memberEventIds: [fromId] }));
      localAnchors.set(toId, laidOutItem({ itemId: `item-to-${i}`, memberEventIds: [toId] }));
      relationships.push(rel(`r-${i}`, fromId, toId));
    }
    const out = buildVisibleConnectors({
      mode: "flow",
      focusedSet: localFocus,
      focusActive: true,
      relationships,
      eventAnchorIndex: localAnchors,
      toneOfLane: () => "purple",
      maxConnectors: 4,
    });
    expect(out).toHaveLength(4);
  });
});

describe("defaultConnectorCap", () => {
  it("uses a wider cap in Flow Focus", () => {
    expect(defaultConnectorCap("flow")).toBeGreaterThan(defaultConnectorCap("timeline"));
  });
});
