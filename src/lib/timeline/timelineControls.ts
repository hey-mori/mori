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
    label: "일 단위 보기",
    status: "planned",
    plannedHint: "일 단위 보기는 여러 세션에 걸쳐 있어 예정된 마일스톤입니다.",
  },
  rangeWeek: {
    id: "rangeWeek",
    label: "주 단위 보기",
    status: "planned",
    plannedHint: "주 단위 보기는 세션 간 집계에 의존합니다 (Planned).",
  },
  zoomIn: {
    id: "zoomIn",
    label: "확대",
    status: "planned",
    plannedHint: "시간축 줌은 예정되어 있습니다. 더 촘촘한 보기는 밀도 전환을 사용하세요.",
  },
  zoomOut: {
    id: "zoomOut",
    label: "축소",
    status: "planned",
    plannedHint: "시간축 줌은 예정되어 있습니다. 더 촘촘한 보기는 밀도 전환을 사용하세요.",
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
    status: "implemented",
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
    status: "implemented",
  },
  inspectorEditEvent: {
    id: "inspectorEditEvent",
    label: "이벤트 편집",
    status: "implemented",
  },
  inspectorCreateIssue: {
    id: "inspectorCreateIssue",
    label: "이슈 생성",
    status: "implemented",
  },
  inspectorSplitEvent: {
    id: "inspectorSplitEvent",
    label: "이벤트 분할",
    status: "implemented",
  },
  inspectorMergeEvent: {
    id: "inspectorMergeEvent",
    label: "이벤트 병합",
    status: "implemented",
  },
  inspectorAddNote: {
    id: "inspectorAddNote",
    label: "메모 추가",
    status: "implemented",
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
