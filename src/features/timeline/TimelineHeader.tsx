import { Calendar, Filter, Layers, PanelRight, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import type { SegmentedControlOption } from "../../components/ui/SegmentedControl";
import { eventTypeLabels, eventTypeTone, laneOrder } from "../../domain/constants";
import type { EventType } from "../../domain/types";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import { TIMELINE_CONTROLS, getPlannedHint } from "../../lib/timeline/timelineControls";

/** Density tiers, ordered loosest → densest, for the segmented control. */
const DENSITY_OPTIONS: SegmentedControlOption<TimelineDensity>[] = [
  { id: "comfortable", label: "넓게", title: "넓은 카드 — 제목 + 메타데이터까지 표시" },
  { id: "compact", label: "보통", title: "낮은 카드 — 제목 위주, 메타데이터는 인스펙터로" },
  { id: "dense", label: "조밀", title: "최소 카드 — 아이콘 + 시각 + 제목, 하루치 스캔용" },
];

/**
 * Time-range segments. Only `session` is implemented today; `day` / `week`
 * render as disabled segments so the control honestly shows what is planned.
 */
type TimelineRangeId = "day" | "week" | "session";

export type TimelineToolbarProps = {
  density: TimelineDensity;
  onSetDensity: (density: TimelineDensity) => void;
  activeFilters: EventType[];
  onToggleFilter: (eventType: EventType) => void;
  onClearFilters: () => void;
  activeLanesOnly: boolean;
  onToggleActiveLanesOnly: () => void;
  visibleLaneCount: number;
  totalLaneCount: number;
  inspectorCollapsed: boolean;
  onToggleInspector: () => void;
  /** Narrow viewports auto-hide the inspector, so the toggle is disabled. */
  inspectorToggleDisabled: boolean;
};

/**
 * Compact one-row toolbar.
 *
 * Honesty contract (sourced from `TIMELINE_CONTROLS`):
 *   - Session is implemented; Day / Week / Zoom in / Zoom out are planned and
 *     render disabled with explanatory tooltips.
 *   - The Category control opens a popover. We never spread 8 huge chips
 *     across a second row; the lane labels on the canvas are the primary
 *     categorical structure.
 *   - The "Active lanes only" toggle is real and persists in app state.
 */
export function TimelineToolbar({
  density,
  onSetDensity,
  activeFilters,
  onToggleFilter,
  onClearFilters,
  activeLanesOnly,
  onToggleActiveLanesOnly,
  visibleLaneCount,
  totalLaneCount,
  inspectorCollapsed,
  onToggleInspector,
  inspectorToggleDisabled,
}: TimelineToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!filterOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (!filterPopRef.current) return;
      if (!filterPopRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterOpen]);

  const dayHint = getPlannedHint("rangeDay");
  const weekHint = getPlannedHint("rangeWeek");
  const zoomInHint = getPlannedHint("zoomIn");
  const zoomOutHint = getPlannedHint("zoomOut");

  return (
    <div className="timeline-toolbar" role="toolbar" aria-label="Timeline controls">
      <div className="timeline-toolbar-left">
        <SegmentedControl<TimelineRangeId>
          ariaLabel="Time range"
          value="session"
          options={[
            {
              id: "day",
              label: (
                <>
                  <Calendar size={13} aria-hidden="true" /> 일
                </>
              ),
              disabled: true,
              title: dayHint,
            },
            { id: "week", label: "주", disabled: true, title: weekHint },
            { id: "session", label: "세션", title: "단일 세션 보기 (현재)" },
          ]}
        />
        <div className="zoom-group" role="group" aria-label="Zoom">
          <button type="button" disabled title={zoomOutHint} aria-label="Zoom out">
            <ZoomOut size={14} />
          </button>
          <button type="button" disabled title={zoomInHint} aria-label="Zoom in">
            <ZoomIn size={14} />
          </button>
        </div>
      </div>
      <div className="timeline-toolbar-right">
        <button
          type="button"
          className={`toolbar-toggle ${activeLanesOnly ? "is-active" : ""}`}
          onClick={onToggleActiveLanesOnly}
          title={
            activeLanesOnly
              ? `활성 레인 ${visibleLaneCount}개 표시 중 (전체 ${totalLaneCount}개 보기로 전환)`
              : `전체 레인 ${totalLaneCount}개 표시 중 (빈 레인 숨기기로 전환)`
          }
        >
          <Layers size={14} aria-hidden="true" />
          {activeLanesOnly
            ? `활성 레인 · ${visibleLaneCount}/${totalLaneCount}`
            : `전체 레인 · ${totalLaneCount}`}
        </button>
        <div className="filter-pop-wrap" ref={filterPopRef}>
          <button
            type="button"
            className={`toolbar-toggle ${activeFilters.length ? "is-active" : ""}`}
            onClick={() => setFilterOpen((open) => !open)}
            aria-expanded={filterOpen}
            aria-controls="timeline-filter-popover"
            title="타임라인 카테고리 필터"
          >
            <Filter size={14} aria-hidden="true" />
            {activeFilters.length
              ? `필터 · ${activeFilters.length}`
              : "필터"}
          </button>
          {filterOpen ? (
            <div
              className="filter-popover"
              id="timeline-filter-popover"
              role="dialog"
              aria-label="카테고리 필터"
            >
              <header>
                <span>카테고리 필터</span>
                <button
                  type="button"
                  className="filter-popover-clear"
                  onClick={() => {
                    onClearFilters();
                    setFilterOpen(false);
                  }}
                  disabled={activeFilters.length === 0}
                >
                  지우기
                </button>
              </header>
              <ul>
                {laneOrder.map((type) => {
                  const active = activeFilters.includes(type);
                  return (
                    <li key={type}>
                      <button
                        type="button"
                        className={`filter-pop-item tone-${eventTypeTone[type]} ${active ? "active" : ""}`}
                        aria-pressed={active}
                        onClick={() => onToggleFilter(type)}
                      >
                        <span className={`legend-dot tone-${eventTypeTone[type]}`} />
                        {eventTypeLabels[type]}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <footer>
                <small>
                  레인 라벨이 기본 카테고리 구조입니다. 필터를 사용하면 캔버스를
                  바꾸지 않고 하나 이상의 유형에 집중할 수 있습니다.
                </small>
              </footer>
            </div>
          ) : null}
        </div>
        <SegmentedControl<TimelineDensity>
          ariaLabel="Timeline density"
          value={density}
          onChange={onSetDensity}
          options={DENSITY_OPTIONS}
        />
        <button
          type="button"
          className={`toolbar-toggle ${!inspectorCollapsed && !inspectorToggleDisabled ? "is-active" : ""}`}
          onClick={onToggleInspector}
          disabled={inspectorToggleDisabled}
          aria-pressed={!inspectorCollapsed && !inspectorToggleDisabled}
          title={
            inspectorToggleDisabled
              ? "좁은 화면에서는 인스펙터가 자동으로 접힙니다 — 창을 넓히면 다시 표시됩니다."
              : inspectorCollapsed
                ? "인스펙터 패널 열기 — 선택한 이벤트의 근거·신뢰도·연결 항목 표시"
                : "인스펙터 패널 접기 — 타임라인이 전체 폭을 사용"
          }
        >
          <PanelRight size={14} aria-hidden="true" />
          인스펙터
        </button>
      </div>
      <ToolbarPlannedLabel />
    </div>
  );
}

function ToolbarPlannedLabel() {
  // Honest single-line legend below the toolbar buttons so the user can see
  // which buttons are Planned at a glance instead of relying on tooltips.
  const plannedHints = [
    TIMELINE_CONTROLS.rangeDay,
    TIMELINE_CONTROLS.rangeWeek,
    TIMELINE_CONTROLS.zoomIn,
  ];
  return (
    <p className="timeline-toolbar-honesty">
      <span className="dot" aria-hidden="true" />
      일 / 주 / 줌 보기는 <strong>Planned</strong> 상태입니다 — 지금은 세션
      보기가 단일 기준입니다.
      <span className="screen-reader-only">
        {plannedHints.map((control) => `${control.label}: ${control.plannedHint}`).join(" ")}
      </span>
    </p>
  );
}
