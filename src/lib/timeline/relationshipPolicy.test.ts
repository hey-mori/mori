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
    labelRoom: overrides.labelRoom ?? 0,
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

  it("keeps the heaviest connectors when the cap bites, not just the earliest", () => {
    // Regression: aggregation preserves event order, so a plain slice kept only
    // the earliest connectors and the timeline drew lines at the start and
    // nothing after. A late-but-heavy handoff must survive the cap.
    const relationships: Relationship[] = [];
    const localFocus = new Set<string>();
    const localAnchors = new Map<string, LaidOutTimelineItem>();
    const link = (i: number, weight: number) => {
      const fromId = `from-${i}`;
      const toId = `to-${i}`;
      localFocus.add(fromId);
      localFocus.add(toId);
      localAnchors.set(fromId, laidOutItem({ itemId: `item-from-${i}`, memberEventIds: [fromId] }));
      localAnchors.set(toId, laidOutItem({ itemId: `item-to-${i}`, memberEventIds: [toId] }));
      // `weight` raw relationships collapse onto the same (from, to) pair.
      for (let n = 0; n < weight; n += 1) relationships.push(rel(`r-${i}-${n}`, fromId, toId));
    };
    for (let i = 0; i < 10; i += 1) link(i, 1); // early, light
    link(99, 5); // late, heavy

    const out = buildVisibleConnectors({
      mode: "flow",
      focusedSet: localFocus,
      focusActive: true,
      relationships,
      eventAnchorIndex: localAnchors,
      toneOfLane: () => "purple",
      maxConnectors: 3,
    });
    expect(out).toHaveLength(3);
    expect(out[0].id).toBe("item-from-99->item-to-99");
    expect(out[0].weight).toBe(5);
  });

  it("does not reorder when everything fits under the cap", () => {
    const out = buildVisibleConnectors({
      mode: "flow",
      focusedSet: focused,
      focusActive: true,
      relationships: [rel("r1", "a", "b"), rel("r2", "b", "c")],
      eventAnchorIndex: anchors,
      toneOfLane: () => "purple",
      maxConnectors: 40,
    });
    expect(out.map((connector) => connector.id)).toEqual(["item-a->item-b", "item-b->item-c"]);
  });
});

describe("defaultConnectorCap", () => {
  it("keeps Flow Focus a deliberately tight subgraph", () => {
    // A product decision, not a perf guard: Flow Focus means "a focused view".
    expect(defaultConnectorCap("flow")).toBeGreaterThan(0);
  });

  it("does not cap the Timeline overview at all", () => {
    // The canvas draws one bar per event uncapped, and connectors are always
    // fewer than bars and far cheaper per node, so capping them could never
    // rescue the canvas while it did silently truncate a deterministic map.
    expect(defaultConnectorCap("timeline")).toBeUndefined();
  });

  it("draws every connector on a session far past the old caps", () => {
    const relationships: Relationship[] = [];
    const localFocus = new Set<string>();
    const localAnchors = new Map<string, LaidOutTimelineItem>();
    for (let i = 0; i < 500; i += 1) {
      const fromId = `from-${i}`;
      const toId = `to-${i}`;
      localAnchors.set(fromId, laidOutItem({ itemId: `item-from-${i}`, memberEventIds: [fromId] }));
      localAnchors.set(toId, laidOutItem({ itemId: `item-to-${i}`, memberEventIds: [toId] }));
      relationships.push(rel(`r-${i}`, fromId, toId));
    }
    const out = buildVisibleConnectors({
      mode: "timeline",
      focusedSet: localFocus,
      focusActive: false,
      relationships,
      eventAnchorIndex: localAnchors,
      toneOfLane: () => "purple",
      maxConnectors: defaultConnectorCap("timeline"),
    });
    expect(out).toHaveLength(500);
  });
});
