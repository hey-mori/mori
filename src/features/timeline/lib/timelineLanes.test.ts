import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../../domain/mock-data";
import { buildTimelineRenderModel } from "../../../lib/timeline/timelineViewModel";
import {
  countEventsByLane,
  getActiveTimelineLaneViewModels,
  getTimelineLaneViewModels,
  listLaneLabels,
} from "./timelineLanes";

const model = buildTimelineRenderModel({
  view: moriMockSession,
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
});

describe("timelineLanes", () => {
  it("decorates lanes with display labels + tones", () => {
    const lanes = getTimelineLaneViewModels(model);
    expect(lanes.length).toBe(model.lanes.length);
    expect(lanes[0]!.label).toBeTruthy();
    expect(lanes[0]!.tone).toBeTruthy();
  });

  it("active lanes filter drops lanes with zero items", () => {
    const active = getActiveTimelineLaneViewModels(model);
    expect(active.every((lane) => lane.hasContent)).toBe(true);
  });

  it("listLaneLabels matches the canonical lane order", () => {
    const labels = listLaneLabels();
    expect(labels.map((entry) => entry.type)).toEqual([
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

  it("countEventsByLane sums to the input length", () => {
    const counts = countEventsByLane(moriMockSession.events);
    const sum = Object.values(counts).reduce((acc, value) => acc + value, 0);
    expect(sum).toBe(moriMockSession.events.length);
  });
});
