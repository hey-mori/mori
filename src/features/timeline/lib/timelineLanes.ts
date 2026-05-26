/**
 * Lane-specific view-model helpers.
 *
 * The Timeline canvas renders one row per lane (event-type). This module
 * exposes typed lane snapshots so consumers (the canvas, the legend, the
 * mini-map) read structured data instead of recomputing it inline.
 */
import type { TimelineEvent } from "../../../domain/types";
import {
  buildSourceIndex,
  getActivityLaneVisuals,
  getTimelineLaneForEvent,
  timelineActivityLaneOrder as defaultLaneOrder,
  type ActivityLaneId,
} from "../../../lib/timeline/activityModel";
import type { LaneRenderModel, TimelineRenderModel } from "../../../lib/timeline/timelineViewModel";

export type TimelineLaneViewModel = {
  type: ActivityLaneId;
  label: string;
  tone: string;
  eventCount: number;
  itemCount: number;
  /** Whether the lane has any rendered display item. */
  hasContent: boolean;
};

export type TimelineLaneViewModelList = TimelineLaneViewModel[];

/**
 * Decorate the bare render-model lanes with display labels + tones so
 * components don't have to re-import `domain/constants`.
 */
export function getTimelineLaneViewModels(model: TimelineRenderModel): TimelineLaneViewModelList {
  return model.lanes.map(toLaneViewModel);
}

export function getActiveTimelineLaneViewModels(model: TimelineRenderModel): TimelineLaneViewModelList {
  return getTimelineLaneViewModels(model).filter((lane) => lane.hasContent);
}

function toLaneViewModel(lane: LaneRenderModel): TimelineLaneViewModel {
  return {
    type: lane.type,
    label: getActivityLaneVisuals(lane.type).label,
    tone: getActivityLaneVisuals(lane.type).tone,
    eventCount: lane.eventCount,
    itemCount: lane.itemCount,
    hasContent: lane.itemCount > 0,
  };
}

/**
 * Convenience for surfaces (Memory cards, Reports) that just want the lane
 * order with labels — no full render-model required.
 */
export function listLaneLabels(): Array<{ type: ActivityLaneId; label: string; tone: string }> {
  return defaultLaneOrder.map((type) => ({
    type,
    label: getActivityLaneVisuals(type).label,
    tone: getActivityLaneVisuals(type).tone,
  }));
}

/**
 * Count events per lane from a raw event list without going through the
 * full render model. Useful for Memory / Reports summaries that don't need
 * collision layout.
 */
export function countEventsByLane(events: TimelineEvent[]): Record<ActivityLaneId, number> {
  const counts = Object.fromEntries(defaultLaneOrder.map((type) => [type, 0])) as Record<ActivityLaneId, number>;
  const sourceIndex = buildSourceIndex([]);
  for (const event of events) {
    const lane = getTimelineLaneForEvent({ event, sources: sourceIndex });
    counts[lane] = (counts[lane] ?? 0) + 1;
  }
  return counts;
}
