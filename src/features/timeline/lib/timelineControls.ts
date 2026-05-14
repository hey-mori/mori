/**
 * Feature-local view of the Timeline control registry. Bridges the legacy
 * `TIMELINE_CONTROLS` map and the new app-wide `FEATURE_REGISTRY` so
 * Timeline components keep their familiar `getPlannedHint(id)` API while
 * the registry consolidation continues.
 */
import { getFeature, getFeatureControlProps, type FeatureId } from "../../../app/featureStatus";
import {
  TIMELINE_CONTROLS,
  getPlannedHint as legacyGetPlannedHint,
  isImplemented as legacyIsImplemented,
  type TimelineControlId,
} from "../../../lib/timeline/timelineControls";

export { TIMELINE_CONTROLS, type TimelineControlId };

/**
 * Mapping table: Timeline-control id → feature-registry id.
 * Items not in this table are still served from the legacy registry.
 */
const FEATURE_ID_BY_CONTROL: Partial<Record<TimelineControlId, FeatureId>> = {
  density: "timeline.density",
  filter: "timeline.filter",
  search: "timeline.search",
  rangeSession: "timeline.range.session",
  rangeDay: "timeline.range.day",
  rangeWeek: "timeline.range.week",
  zoomIn: "timeline.zoom.in",
  zoomOut: "timeline.zoom.out",
  activeLanesOnly: "timeline.activeLanesOnly",
  inspectorFlowTrace: "timeline.inspector.flowTrace",
  inspectorCopySummary: "timeline.inspector.copySummary",
  inspectorEditEvent: "timeline.inspector.editEvent",
  inspectorSplitEvent: "timeline.inspector.split",
  inspectorMergeEvent: "timeline.inspector.merge",
  inspectorCreateIssue: "timeline.inspector.createIssue",
  inspectorAddNote: "timeline.inspector.addNote",
  memoSave: "timeline.inspector.memoSave",
  endSession: "appShell.endSession",
  sidebarCollapse: "appShell.sidebarCollapse",
};

export type TimelineControlState = {
  enabled: boolean;
  plannedHint?: string;
  status: "implemented" | "partial" | "planned" | "unavailable";
  label: string;
};

/**
 * Single helper that components can use to render any Timeline control.
 * Falls back to the legacy registry for ids we haven't migrated yet so this
 * milestone stays low-risk.
 */
export function getTimelineControlState(id: TimelineControlId): TimelineControlState {
  const featureId = FEATURE_ID_BY_CONTROL[id];
  if (featureId) {
    const feature = getFeature(featureId);
    const props = getFeatureControlProps(featureId);
    return {
      enabled: props.enabled,
      plannedHint: props.title,
      status: feature.status,
      label: feature.label,
    };
  }
  const legacy = TIMELINE_CONTROLS[id];
  return {
    enabled: legacyIsImplemented(id),
    plannedHint: legacyGetPlannedHint(id),
    status: legacy.status as TimelineControlState["status"],
    label: legacy.label,
  };
}

/** Re-exports of the legacy helpers so existing call sites keep compiling. */
export function getPlannedHint(id: TimelineControlId): string | undefined {
  return getTimelineControlState(id).plannedHint;
}

export function isImplemented(id: TimelineControlId): boolean {
  return getTimelineControlState(id).enabled;
}
