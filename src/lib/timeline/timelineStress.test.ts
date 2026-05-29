import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import type { MockSession } from "../../domain/types";
import { buildTimelineEventCardViewModel } from "../../features/timeline/lib/timelineCards";
import { buildTimelineRenderModel } from "./timelineViewModel";
import {
  buildTimelineStressEvents,
  TIMELINE_STRESS_EVENT_COUNT,
  TIMELINE_STRESS_RANGE,
} from "./timelineStressFixture";

const stressEvents = buildTimelineStressEvents();

function stressView(): MockSession {
  return {
    ...mockSession,
    session: {
      ...mockSession.session,
      startedAt: TIMELINE_STRESS_RANGE.start,
      endedAt: TIMELINE_STRESS_RANGE.end,
    },
    events: stressEvents,
    relationships: [],
  };
}

function stressModel() {
  return buildTimelineRenderModel({
    view: stressView(),
    mode: "timeline",
    density: "comfortable",
    selectedEventId: null,
    hoveredEventId: null,
    activeFilters: [],
    searchQuery: "",
    frameWidth: 1240,
    sessionMode: "draft",
    importCount: stressEvents.length,
    hasAnalysis: true,
  });
}

describe("timeline stress fixture", () => {
  it("builds a day-scale set of 36 events across every lane", () => {
    expect(stressEvents).toHaveLength(TIMELINE_STRESS_EVENT_COUNT);
    expect(TIMELINE_STRESS_EVENT_COUNT).toBeGreaterThanOrEqual(30);
    const lanes = new Set(stressEvents.map((event) => event.type));
    expect(lanes.size).toBeGreaterThanOrEqual(6);
  });

  it("keeps bursts on a single lane rail", () => {
    const model = stressModel();
    expect(model.layout.lanes.every((lane) => lane.rowCount <= 1)).toBe(true);
  });

  it("keeps the morning AI-conversation burst as individual events", () => {
    const model = stressModel();
    const aiLane = model.lanes.find((lane) => lane.type === "conversation");
    expect(aiLane).toBeDefined();
    const morningBurst = aiLane!.items.filter(
      (item) => item.kind === "event" && item.event.connectorEventId?.startsWith("claude-code::"),
    );
    expect(morningBurst.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps connector identity on each individual morning burst event", () => {
    const model = stressModel();
    const aiLane = model.lanes.find((lane) => lane.type === "conversation");
    const connectorIds = aiLane!.items
      .filter((item) => item.kind === "event" && item.event.connectorEventId?.startsWith("claude-code::"))
      .map((item) => (item.kind === "event" ? item.event.connectorEventId : null));
    expect(connectorIds.length).toBeGreaterThanOrEqual(6);
    expect(
      connectorIds.every((connectorEventId) => connectorEventId?.startsWith("claude-code::")),
    ).toBe(true);
  });

  it("keeps the connector-imported morning burst on one row", () => {
    const model = stressModel();
    const burstLayouts = model.layout.items.filter((item) =>
      item.memberEventIds.some((eventId) => {
        const event = stressEvents.find((candidate) => candidate.id === eventId);
        return event?.connectorEventId?.startsWith("claude-code::");
      }),
    );
    expect(new Set(burstLayouts.map((item) => item.rowIndex))).toEqual(new Set([0]));
  });

  it("renders a long ranged event wider than an instantaneous one", () => {
    const model = stressModel();
    // stress-evt-09 is a 90-minute AI session; stress-evt-12 is an
    // instantaneous decision. Both stay individual (decisions never bundle,
    // the long AI event is isolated from the morning burst).
    const longEvent = model.eventAnchorIndex.get("stress-evt-09");
    const instantEvent = model.eventAnchorIndex.get("stress-evt-12");
    expect(longEvent).toBeDefined();
    expect(instantEvent).toBeDefined();
    expect(longEvent!.width).toBeGreaterThan(instantEvent!.width);
  });

  it("never leaks raw summaries into the card view model", () => {
    for (const event of stressEvents) {
      const vm = buildTimelineEventCardViewModel(event);
      expect(vm).not.toHaveProperty("summary");
      // The footer carries one short calm signal ("근거 2"), never prose.
      if (vm.primaryMeta !== null) {
        expect(vm.primaryMeta.length).toBeLessThanOrEqual(12);
      }
    }
  });
});
