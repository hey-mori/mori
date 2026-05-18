import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import type { MoriMockSession } from "../../domain/types";
import { buildTimelineEventCardViewModel } from "../../features/timeline/lib/timelineCards";
import { buildTimelineRenderModel } from "./timelineViewModel";
import { MAX_ROWS_PER_LANE } from "./collisionLayout";
import {
  buildTimelineStressEvents,
  TIMELINE_STRESS_EVENT_COUNT,
  TIMELINE_STRESS_RANGE,
} from "./timelineStressFixture";

const stressEvents = buildTimelineStressEvents();

function stressView(): MoriMockSession {
  return {
    ...moriMockSession,
    session: {
      ...moriMockSession.session,
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

  it("keeps every lane within the row cap even under bursts", () => {
    // Bounded growth: clustering plus the row cap keep any single lane from
    // stacking unbounded rows under a day-scale burst.
    const model = stressModel();
    for (const lane of model.layout.lanes) {
      expect(lane.rowCount).toBeLessThanOrEqual(MAX_ROWS_PER_LANE);
    }
  });

  it("clusters the morning AI-conversation burst into at least one bundle", () => {
    const model = stressModel();
    const aiLane = model.lanes.find((lane) => lane.type === "aiConversation");
    expect(aiLane).toBeDefined();
    const bundles = aiLane!.items.filter((item) => item.kind === "bundle");
    expect(bundles.length).toBeGreaterThanOrEqual(1);
  });

  it("flags the connector-imported morning burst as a same-source bundle", () => {
    const model = stressModel();
    const aiLane = model.lanes.find((lane) => lane.type === "aiConversation");
    const sameSourceBundle = aiLane!.items.find(
      (item) => item.kind === "bundle" && item.sameConnectorSource !== null,
    );
    expect(sameSourceBundle).toBeDefined();
    expect(
      sameSourceBundle?.kind === "bundle" ? sameSourceBundle.sameConnectorSource : null,
    ).toBe("claude-code");
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
