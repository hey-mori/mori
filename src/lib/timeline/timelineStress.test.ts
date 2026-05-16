import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import type { MoriMockSession } from "../../domain/types";
import { buildTimelineEventCardViewModel } from "../../features/timeline/lib/timelineCards";
import { buildTimelineRenderModel } from "./timelineViewModel";
import type { TimelineDensity } from "./collisionLayout";
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

function stressModel(density: TimelineDensity) {
  return buildTimelineRenderModel({
    view: stressView(),
    mode: "timeline",
    density,
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

  it("keeps every lane on a single row even under bursts", () => {
    // Bounded growth: clustering must absorb bursts so no lane stacks rows.
    for (const density of ["comfortable", "compact", "dense"] as TimelineDensity[]) {
      const model = stressModel(density);
      for (const lane of model.layout.lanes) {
        expect(lane.rowCount).toBeLessThanOrEqual(1);
      }
    }
  });

  it("clusters the morning AI-conversation burst into at least one bundle", () => {
    const model = stressModel("comfortable");
    const aiLane = model.lanes.find((lane) => lane.type === "aiConversation");
    expect(aiLane).toBeDefined();
    const bundles = aiLane!.items.filter((item) => item.kind === "bundle");
    expect(bundles.length).toBeGreaterThanOrEqual(1);
  });

  it("dense density produces a shorter frame than comfortable at day scale", () => {
    expect(stressModel("dense").layout.frameHeight).toBeLessThan(
      stressModel("comfortable").layout.frameHeight,
    );
  });

  it("dense density shows at least as many display items as comfortable", () => {
    // Denser cards mean a lane can show more individual events before merging.
    expect(stressModel("dense").visibleDisplayItems.length).toBeGreaterThanOrEqual(
      stressModel("comfortable").visibleDisplayItems.length,
    );
  });

  it("renders a long ranged event wider than an instantaneous one", () => {
    const model = stressModel("comfortable");
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
      // Footer meta is short tokens ("2 src", "1 dec"), never prose.
      for (const part of vm.metaParts) {
        expect(part.length).toBeLessThanOrEqual(12);
      }
    }
  });
});
