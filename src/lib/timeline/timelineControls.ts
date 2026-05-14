/**
 * Single source of truth for which Timeline controls are real, planned, or
 * deliberately disabled. Components read from this registry instead of
 * hand-writing `disabled` flags and tooltips.
 *
 * Honesty contract:
 *   - `implemented` controls always render active.
 *   - `planned` controls render disabled with a `title` tooltip explaining
 *     what is planned. They are never hidden so the product surface remains
 *     legible, but they never look like working features.
 *   - `hidden` controls do not render at all in the current product surface.
 */

export type TimelineControlStatus = "implemented" | "planned" | "hidden";

export type TimelineControlId =
  | "density"
  | "filter"
  | "search"
  | "rangeSession"
  | "rangeDay"
  | "rangeWeek"
  | "zoomIn"
  | "zoomOut"
  | "categoryPopover"
  | "activeLanesOnly"
  | "endSession"
  | "exportReport"
  | "sidebarCollapse"
  | "memoSave"
  | "inspectorEditEvent"
  | "inspectorCreateIssue"
  | "inspectorSplitEvent"
  | "inspectorMergeEvent"
  | "inspectorAddNote"
  | "inspectorFlowTrace"
  | "inspectorCopySummary";

export type TimelineControlSpec = {
  id: TimelineControlId;
  label: string;
  status: TimelineControlStatus;
  /** Tooltip text used as `title` when the control renders disabled. */
  plannedHint?: string;
};

/**
 * Registry sorted by area. Add a new control here before referencing it in
 * components — never wire a button without a registry row.
 */
export const TIMELINE_CONTROLS: Record<TimelineControlId, TimelineControlSpec> = {
  density: {
    id: "density",
    label: "Comfortable / Compact",
    status: "implemented",
  },
  filter: {
    id: "filter",
    label: "Category filter",
    status: "implemented",
  },
  search: {
    id: "search",
    label: "Event search",
    status: "implemented",
  },
  rangeSession: {
    id: "rangeSession",
    label: "Session",
    status: "implemented",
  },
  rangeDay: {
    id: "rangeDay",
    label: "Day",
    status: "planned",
    plannedHint: "Day view spans multiple sessions and is a planned milestone.",
  },
  rangeWeek: {
    id: "rangeWeek",
    label: "Week",
    status: "planned",
    plannedHint: "Week view depends on cross-session aggregation (Planned).",
  },
  zoomIn: {
    id: "zoomIn",
    label: "Zoom in",
    status: "planned",
    plannedHint: "Time-scale zoom is planned. Switch density for a denser scan view.",
  },
  zoomOut: {
    id: "zoomOut",
    label: "Zoom out",
    status: "planned",
    plannedHint: "Time-scale zoom is planned. Switch density for a denser scan view.",
  },
  categoryPopover: {
    id: "categoryPopover",
    label: "Category filter popover",
    status: "implemented",
  },
  activeLanesOnly: {
    id: "activeLanesOnly",
    label: "Active lanes only",
    status: "implemented",
  },
  endSession: {
    id: "endSession",
    label: "세션 종료",
    status: "planned",
    plannedHint: "Session end + final report writeback is the next persistence milestone.",
  },
  exportReport: {
    id: "exportReport",
    label: "Export report",
    status: "implemented",
  },
  sidebarCollapse: {
    id: "sidebarCollapse",
    label: "Collapse sidebar",
    status: "planned",
    plannedHint: "Sidebar collapse is part of the responsive shell milestone.",
  },
  memoSave: {
    id: "memoSave",
    label: "Save event memo",
    status: "planned",
    plannedHint: "Saving corrections is a planned persistence milestone.",
  },
  inspectorEditEvent: {
    id: "inspectorEditEvent",
    label: "Edit event",
    status: "planned",
    plannedHint: "Direct event editing depends on the correction milestone.",
  },
  inspectorCreateIssue: {
    id: "inspectorCreateIssue",
    label: "Create issue",
    status: "planned",
    plannedHint: "Manual issue creation is part of the Review write surface.",
  },
  inspectorSplitEvent: {
    id: "inspectorSplitEvent",
    label: "Split event",
    status: "planned",
    plannedHint: "Splitting events depends on the event-correction milestone.",
  },
  inspectorMergeEvent: {
    id: "inspectorMergeEvent",
    label: "Merge event",
    status: "planned",
    plannedHint: "Merging events depends on the event-correction milestone.",
  },
  inspectorAddNote: {
    id: "inspectorAddNote",
    label: "Add note",
    status: "planned",
    plannedHint: "Inspector notes depend on the correction milestone.",
  },
  inspectorFlowTrace: {
    id: "inspectorFlowTrace",
    label: "Flow trace",
    status: "implemented",
  },
  inspectorCopySummary: {
    id: "inspectorCopySummary",
    label: "Copy summary",
    status: "implemented",
  },
};

export function isImplemented(id: TimelineControlId): boolean {
  return TIMELINE_CONTROLS[id].status === "implemented";
}

export function getPlannedHint(id: TimelineControlId): string | undefined {
  const control = TIMELINE_CONTROLS[id];
  return control.status === "planned" ? control.plannedHint : undefined;
}

export function listImplemented(): TimelineControlId[] {
  return (Object.keys(TIMELINE_CONTROLS) as TimelineControlId[]).filter((id) =>
    isImplemented(id),
  );
}

export function listPlanned(): TimelineControlId[] {
  return (Object.keys(TIMELINE_CONTROLS) as TimelineControlId[]).filter(
    (id) => TIMELINE_CONTROLS[id].status === "planned",
  );
}
