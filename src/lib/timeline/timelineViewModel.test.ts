import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import type { MoriMockSession, Relationship, TimelineEvent } from "../../domain/types";
import {
  buildInspectorViewModel,
  buildTimelineGapMarkers,
  buildTimelineRenderModel,
  countHiddenRelationships,
  densityBundleTuning,
  filterEvents,
  getFocusedRelationships,
  shouldHideInspector,
  TIMELINE_INSPECTOR_NARROW_MAX_PX,
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
      "conversation",
      "command",
      "files",
      "git",
      "design",
      "tracker",
      "docs",
      "research",
      "build",
      "deploy",
      "automation",
      "review",
      "handoff",
      "memory",
      "notes",
      "unknown",
    ]);
  });

  it("filters events when activeFilters is set", () => {
    const model = buildModel(moriMockSession, { activeFilters: ["decision"] });
    expect(model.visibleEvents.every((event) => event.type === "decision")).toBe(true);
  });

  it("flags filteredEmpty when a search hides every event", () => {
    const model = buildModel(moriMockSession, { searchQuery: "zzz-no-such-event-xyz" });
    expect(model.emptyVariant).toBeNull();
    expect(model.visibleDisplayItems).toHaveLength(0);
    expect(model.filteredEmpty).toBe(true);
  });

  it("does not flag filteredEmpty when no filter or search is active", () => {
    const model = buildModel(moriMockSession);
    expect(model.filteredEmpty).toBe(false);
  });

  it("does not treat a data-empty session as filteredEmpty", () => {
    const emptyView = { ...moriMockSession, events: [] };
    const model = buildModel(emptyView, { searchQuery: "anything" });
    expect(model.filteredEmpty).toBe(false);
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
    expect(
      getFocusedRelationships({
        focusedSet: model.focusedSet,
        relationships: moriMockSession.relationships,
      }),
    ).toEqual([]);
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
    const focused = getFocusedRelationships({
      focusedSet: model.focusedSet,
      relationships: view.relationships,
    });
    expect(focused.map((relationship) => relationship.id)).toContain(directRelationship.id);
    expect(focused.map((relationship) => relationship.id)).not.toContain(distantRelationship.id);
  });
});

describe("countHiddenRelationships", () => {
  it("returns zero when the event has no relationships outside the focused set", () => {
    const model = buildModel(moriMockSession);
    const count = countHiddenRelationships({
      focusedSet: model.focusedSet,
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
      focusedSet: model.focusedSet,
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
    const inspector = buildInspectorViewModel({
      event: target,
      view: moriMockSession,
    });
    expect(inspector.event).toBe(target);
    expect(inspector.confidencePct).toBe(Math.round(target.confidence * 100));
    expect(inspector.sources.map((source) => source.id).sort()).toEqual(
      target.sourceRefs.slice().sort(),
    );
    expect(inspector.activity.activityKind).toBeTruthy();
    expect(inspector.projectHint.projectLabel).toBeTruthy();
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

  it("gives the conversation lane a tighter window and higher bundle threshold", () => {
    const tuning = densityBundleTuning("comfortable");
    // Conversation turns should bundle far less aggressively than the
    // lane-mix default, so individual turns stay readable.
    expect(tuning.conversationTimeWindowMinutes).toBeLessThan(tuning.timeWindowMinutes);
    expect(tuning.conversationMinEventsForBundle).toBeGreaterThan(3);
    expect(tuning.conversationMaxVisibleItemsPerLane).toBeGreaterThan(
      tuning.maxVisibleItemsPerLane,
    );
  });
});

describe("buildTimelineGapMarkers", () => {
  function gapEvent(id: string, start: string, end?: string): TimelineEvent {
    return {
      ...moriMockSession.events[0]!,
      id,
      start,
      ...(end ? { end } : {}),
    };
  }

  it("emits long pauses with a human label", () => {
    const markers = buildTimelineGapMarkers(
      [
        gapEvent("a", "2026-05-22T09:00:00Z", "2026-05-22T09:10:00Z"),
        gapEvent("b", "2026-05-22T10:05:00Z"),
      ],
      "comfortable",
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]?.fromEventId).toBe("a");
    expect(markers[0]?.toEventId).toBe("b");
    expect(markers[0]?.label).toBe("55분 공백");
  });

  it("uses density to decide whether a pause is meaningful", () => {
    const events = [
      gapEvent("a", "2026-05-22T09:00:00Z"),
      gapEvent("b", "2026-05-22T09:25:00Z"),
    ];
    expect(buildTimelineGapMarkers(events, "comfortable")).toHaveLength(0);
    expect(buildTimelineGapMarkers(events, "dense")).toHaveLength(1);
  });
});

describe("shouldHideInspector", () => {
  it("hides the inspector on a narrow viewport even when not collapsed", () => {
    expect(
      shouldHideInspector({
        mode: "timeline",
        inspectorCollapsed: false,
        viewportWidth: TIMELINE_INSPECTOR_NARROW_MAX_PX,
      }),
    ).toBe(true);
  });

  it("shows the inspector on a wide viewport when not collapsed", () => {
    expect(
      shouldHideInspector({
        mode: "timeline",
        inspectorCollapsed: false,
        viewportWidth: 1440,
      }),
    ).toBe(false);
  });

  it("hides the inspector when the user collapsed it, at any width", () => {
    expect(
      shouldHideInspector({
        mode: "timeline",
        inspectorCollapsed: true,
        viewportWidth: 1920,
      }),
    ).toBe(true);
  });

  it("never hides the Flow Focus trace panel", () => {
    expect(
      shouldHideInspector({
        mode: "flow",
        inspectorCollapsed: true,
        viewportWidth: 600,
      }),
    ).toBe(false);
  });
});
