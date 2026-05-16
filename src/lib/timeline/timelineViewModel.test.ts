import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import type { MoriMockSession, Relationship, TimelineEvent } from "../../domain/types";
import {
  buildInspectorViewModel,
  buildTimelineRenderModel,
  countHiddenRelationships,
  densityBundleTuning,
  filterEvents,
  getActiveLanes,
  getFocusedRelationships,
} from "./timelineViewModel";

function withEvents(events: TimelineEvent[], relationships: Relationship[] = []): MoriMockSession {
  return {
    ...moriMockSession,
    events,
    relationships,
  };
}

function buildModel(view: MoriMockSession, overrides: Partial<Parameters<typeof buildTimelineRenderModel>[0]> = {}) {
  return buildTimelineRenderModel({
    view,
    mode: "timeline",
    density: "comfortable",
    selectedEventId: null,
    hoveredEventId: null,
    activeFilters: [],
    searchQuery: "",
    frameWidth: 1240,
    sessionMode: "demo",
    importCount: 0,
    hasAnalysis: true,
    ...overrides,
  });
}

describe("filterEvents", () => {
  const events = moriMockSession.events;

  it("returns the input array when no filter or search is active", () => {
    expect(filterEvents({ events, activeFilters: [], searchQuery: "" })).toBe(events);
  });

  it("filters by event type", () => {
    const filtered = filterEvents({
      events,
      activeFilters: ["decision"],
      searchQuery: "",
    });
    expect(filtered.every((event) => event.type === "decision")).toBe(true);
  });

  it("filters by search query against title + summary", () => {
    const target = events[0]!;
    const filtered = filterEvents({
      events,
      activeFilters: [],
      searchQuery: target.title.slice(0, Math.min(8, target.title.length)),
    });
    expect(filtered.map((event) => event.id)).toContain(target.id);
  });

  it("intersects filter + search", () => {
    const filtered = filterEvents({
      events,
      activeFilters: ["aiConversation"],
      searchQuery: "x-9-not-a-real-match",
    });
    expect(filtered).toEqual([]);
  });
});

describe("buildTimelineRenderModel", () => {
  it("returns demo-empty when sessionMode is demo and there are no events", () => {
    const model = buildModel(withEvents([]), { sessionMode: "demo" });
    expect(model.emptyVariant).toBe("demo-empty");
  });

  it("returns draft-no-imports when draft session has no imports", () => {
    const model = buildModel(withEvents([]), {
      sessionMode: "draft",
      importCount: 0,
      hasAnalysis: false,
    });
    expect(model.emptyVariant).toBe("draft-no-imports");
  });

  it("returns draft-needs-quick-pass when imports exist but no analysis", () => {
    const model = buildModel(withEvents([]), {
      sessionMode: "draft",
      importCount: 2,
      hasAnalysis: false,
    });
    expect(model.emptyVariant).toBe("draft-needs-quick-pass");
  });

  it("returns null emptyVariant when events exist", () => {
    const model = buildModel(moriMockSession);
    expect(model.emptyVariant).toBeNull();
  });

  it("returns lanes in the configured order", () => {
    const model = buildModel(moriMockSession);
    expect(model.lanes.map((lane) => lane.type)).toEqual([
      "aiConversation",
      "decision",
      "issue",
      "fileCode",
      "webResearch",
      "documentNote",
      "artifact",
      "other",
    ]);
  });

  it("filters events when activeFilters is set", () => {
    const model = buildModel(moriMockSession, { activeFilters: ["decision"] });
    expect(model.visibleEvents.every((event) => event.type === "decision")).toBe(true);
  });

  it("resolves the selected item from selectedEventId", () => {
    const target = moriMockSession.events[2]!;
    const model = buildModel(moriMockSession, { selectedEventId: target.id });
    expect(model.selectedItem?.memberEventIds).toContain(target.id);
  });

  it("falls back to the first display item when selectedEventId is not present", () => {
    const model = buildModel(moriMockSession, { selectedEventId: "does-not-exist" });
    expect(model.selectedItem).toBe(model.visibleDisplayItems[0]);
  });

  it("seeds focusedSet from the selected item in timeline mode (depth 1)", () => {
    const target = moriMockSession.events.find((event) => event.type === "decision")!;
    const model = buildModel(moriMockSession, { selectedEventId: target.id });
    expect(model.focusedSet.has(target.id)).toBe(true);
  });

  it("widens focusedSet to depth 2 in flow mode", () => {
    const target = moriMockSession.events.find((event) => event.type === "decision")!;
    const flowModel = buildModel(moriMockSession, { selectedEventId: target.id, mode: "flow" });
    const timelineModel = buildModel(moriMockSession, { selectedEventId: target.id, mode: "timeline" });
    expect(flowModel.focusedSet.size).toBeGreaterThanOrEqual(timelineModel.focusedSet.size);
  });

  it("getActiveLanes hides lanes with zero items", () => {
    const lonely = withEvents(
      moriMockSession.events.filter((event) => event.type === "decision"),
      [],
    );
    const model = buildModel(lonely);
    const active = getActiveLanes(model);
    expect(active.every((lane) => lane.itemCount > 0)).toBe(true);
    expect(active.length).toBeLessThan(model.lanes.length);
  });

  it("computes a layout that places at least one item on the right of the lane labels", () => {
    const model = buildModel(moriMockSession);
    expect(model.layout.items.length).toBe(model.visibleDisplayItems.length);
    if (model.layout.items.length > 0) {
      expect(model.layout.items[0]!.x).toBeGreaterThanOrEqual(model.layout.contentLeftPx);
    }
  });
});

describe("getFocusedRelationships", () => {
  it("returns no relationships when focusedSet is empty", () => {
    const model = buildModel(withEvents([], []));
    expect(getFocusedRelationships({ model, relationships: moriMockSession.relationships })).toEqual([]);
  });

  it("returns only relationships where both endpoints are in the focused set", () => {
    const sampleEvent = moriMockSession.events[0]!;
    const sibling = moriMockSession.events[1]!;
    const stranger = moriMockSession.events[2]!;
    // A direct relationship from the seed to its sibling — depth-1 focus
    // walks reach both endpoints, so this should remain visible.
    const directRelationship: Relationship = {
      id: "rel-test-1",
      fromId: sampleEvent.id,
      fromType: "event",
      toId: sibling.id,
      toType: "event",
      type: "ledTo",
      confidence: 0.9,
      reason: "test",
    };
    // A relationship between two events that are at distance >= 2 from the
    // seed — neither lands in the focused set, so this should be filtered.
    const distantRelationship: Relationship = {
      id: "rel-test-2",
      fromId: stranger.id,
      fromType: "event",
      toId: "unrelated-distant-event",
      toType: "event",
      type: "ledTo",
      confidence: 0.6,
      reason: "test",
    };
    const view = withEvents(moriMockSession.events, [directRelationship, distantRelationship]);
    const model = buildModel(view, { selectedEventId: sampleEvent.id });
    const focused = getFocusedRelationships({ model, relationships: view.relationships });
    expect(focused.map((relationship) => relationship.id)).toContain(directRelationship.id);
    expect(focused.map((relationship) => relationship.id)).not.toContain(distantRelationship.id);
  });
});

describe("countHiddenRelationships", () => {
  it("returns zero when the event has no relationships outside the focused set", () => {
    const model = buildModel(moriMockSession);
    const count = countHiddenRelationships({
      model,
      relationships: [],
      forEventIds: ["any-id"],
    });
    expect(count).toBe(0);
  });

  it("counts relationships whose other endpoint is outside the focused set", () => {
    // The hidden relationship pivots on a totally separate event so the focus
    // walker can never reach it from the selected seed. The relationship still
    // touches the target event we're asking about, but the other endpoint is
    // unreachable from the seed.
    const target = moriMockSession.events[3]!; // Use a non-seed target.
    const seed = moriMockSession.events[0]!;
    const hidden: Relationship = {
      id: "rel-hidden",
      fromId: target.id,
      fromType: "event",
      toId: "unreachable-event",
      toType: "event",
      type: "ledTo",
      confidence: 0.6,
      reason: "test",
    };
    // Use an empty relationship array so the focus walker stays at depth 0
    // around the seed. Then we manually query for `target.id` to ensure the
    // hidden count is computed against the focused set, not the seed itself.
    const view = withEvents(moriMockSession.events, [hidden]);
    const model = buildModel(view, { selectedEventId: seed.id });
    const count = countHiddenRelationships({
      model,
      relationships: view.relationships,
      forEventIds: [target.id],
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

describe("buildInspectorViewModel", () => {
  it("derives sources, issues, decisions, and confidence pct for the selected event", () => {
    const target = moriMockSession.events.find(
      (event) => event.sourceRefs.length > 0,
    )!;
    const model = buildModel(moriMockSession, { selectedEventId: target.id });
    const inspector = buildInspectorViewModel({
      event: target,
      view: moriMockSession,
      model,
    });
    expect(inspector.event).toBe(target);
    expect(inspector.confidencePct).toBe(Math.round(target.confidence * 100));
    expect(inspector.sources.map((source) => source.id).sort()).toEqual(
      target.sourceRefs.slice().sort(),
    );
  });
});

describe("densityBundleTuning", () => {
  it("lets denser modes show more individual events before clustering", () => {
    const comfortable = densityBundleTuning("comfortable");
    const compact = densityBundleTuning("compact");
    const dense = densityBundleTuning("dense");

    expect(compact.maxVisibleItemsPerLane).toBeGreaterThan(
      comfortable.maxVisibleItemsPerLane,
    );
    expect(dense.maxVisibleItemsPerLane).toBeGreaterThan(
      compact.maxVisibleItemsPerLane,
    );
  });

  it("tightens the cluster window as density increases", () => {
    expect(densityBundleTuning("dense").timeWindowMinutes).toBeLessThan(
      densityBundleTuning("comfortable").timeWindowMinutes,
    );
  });
});
