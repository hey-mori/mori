import { Calendar, Check, ChevronDown, Filter, PanelRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { eventTypeLabels, eventTypeTone, laneOrder } from "../../domain/constants";
import type { EventType } from "../../domain/types";
import { getPlannedHint } from "../../lib/timeline/timelineControls";

/**
 * Time-range options. Only `session` is implemented today; `day` / `week`
 * render as disabled menu rows so the control honestly shows what is planned.
 */
type TimelineRangeId = "day" | "week" | "session";

export type TimelineToolbarProps = {
  activeFilters: EventType[];
  onToggleFilter: (eventType: EventType) => void;
  onClearFilters: () => void;
  inspectorCollapsed: boolean;
  onToggleInspector: () => void;
  /** Narrow viewports auto-hide the inspector, so the toggle is disabled. */
  inspectorToggleDisabled: boolean;
};

/**
 * Compact one-row toolbar.
 *
 * Honesty contract (sourced from `TIMELINE_CONTROLS`):
 *   - Session is implemented; Day / Week are planned and render as disabled
 *     rows inside the range dropdown with explanatory tooltips.
 *   - The Category control opens a popover. We never spread 8 huge chips
 *     across a second row; the lane labels on the canvas are the primary
 *     categorical structure.
 *
 * Density, "active lanes only" and zoom controls were intentionally removed:
 * density is fixed to one comfortable tier, every lane is always shown, and
 * time-axis zoom now lives on the minimap brush.
 */
export function TimelineToolbar({
  activeFilters,
  onToggleFilter,
  onClearFilters,
  inspectorCollapsed,
  onToggleInspector,
  inspectorToggleDisabled,
}: TimelineToolbarProps) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const rangePopRef = useRef<HTMLDivElement | null>(null);
  const filterPopRef = useRef<HTMLDivElement | null>(null);

  useClickOutside(rangePopRef, rangeOpen, () => setRangeOpen(false));
  useClickOutside(filterPopRef, filterOpen, () => setFilterOpen(false));

  const dayHint = getPlannedHint("rangeDay");
  const weekHint = getPlannedHint("rangeWeek");

  const rangeItems: Array<{ id: TimelineRangeId; label: string; hint?: string }> = [
    { id: "session", label: "세션" },
    { id: "day", label: "일", hint: dayHint },
    { id: "week", label: "주", hint: weekHint },
  ];

  return (
    <div className="timeline-toolbar" role="toolbar" aria-label="Timeline controls">
      <div className="timeline-toolbar-left">
        <div className="toolbar-pop-wrap" ref={rangePopRef}>
          <button
            type="button"
            className="toolbar-select"
            onClick={() => setRangeOpen((open) => !open)}
            aria-expanded={rangeOpen}
            aria-controls="timeline-range-menu"
            title="타임라인 표시 범위"
          >
            <Calendar size={14} aria-hidden="true" />
            <span>세션</span>
            <ChevronDown size={13} aria-hidden="true" className="toolbar-select-caret" />
          </button>
          {rangeOpen ? (
            <div
              className="toolbar-menu"
              id="timeline-range-menu"
              role="menu"
              aria-label="표시 범위"
            >
              {rangeItems.map((item) => {
                const planned = item.id !== "session";
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.id === "session"}
                    className={`toolbar-menu-item ${planned ? "is-planned" : ""}`}
                    disabled={planned}
                    title={item.hint}
                    onClick={() => setRangeOpen(false)}
                  >
                    <span className="toolbar-menu-check">
                      {item.id === "session" ? <Check size={13} aria-hidden="true" /> : null}
                    </span>
                    <span>{item.label}</span>
                    {planned ? <span className="toolbar-menu-tag">예정</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <div className="timeline-toolbar-right">
        <div className="toolbar-pop-wrap" ref={filterPopRef}>
          <button
            type="button"
            className={`toolbar-toggle ${activeFilters.length ? "is-active" : ""}`}
            onClick={() => setFilterOpen((open) => !open)}
            aria-expanded={filterOpen}
            aria-controls="timeline-filter-popover"
            title="타임라인 카테고리 필터"
          >
            <Filter size={14} aria-hidden="true" />
            {activeFilters.length ? `필터 · ${activeFilters.length}` : "필터"}
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
    </div>
  );
}

/** Close a popover when a pointerdown lands outside its wrapper. */
function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ref, open, onClose]);
}
