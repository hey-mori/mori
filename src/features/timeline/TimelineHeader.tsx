import { Filter, List, Minus, Plus, Rows3, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { SearchField } from "../../components/ui/SearchField";
import { FollowControl } from "../live-follow/FollowControl";
import { MAX_ZOOM, MIN_ZOOM } from "../../lib/timeline/minimapViewport";
import {
  CANONICAL_TIMELINE_LANES,
  getActivityLaneVisuals,
  type ActivityLaneId,
} from "../../lib/timeline/activityModel";

/** The 흐름 tab's reading views, all directly selectable: the raw conversation
 *  stream, the AI work-flow, the time-axis swimlane, and the causal map. */
export type TimelineReadingMode = "stream" | "workflow" | "swimlane" | "causal";

export type TimelineToolbarProps = {
  activeFilters: ActivityLaneId[];
  /** Per-lane event count, shown as a plain number next to each category. */
  laneCounts?: Partial<Record<ActivityLaneId, number>>;
  onToggleFilter: (lane: ActivityLaneId) => void;
  onClearFilters: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  readingMode: TimelineReadingMode;
  onReadingModeChange: (mode: TimelineReadingMode) => void;
  /** Which reading modes to offer. A single entry hides the switch entirely. */
  availableModes?: TimelineReadingMode[];
  /** Current time-axis zoom (1 = whole span). Drives the zoom stepper. */
  zoomFactor?: number;
  /** Set a new (unclamped) zoom factor; the parent clamps it. Omit to hide the
   *  zoom stepper (e.g. in the 원본 stream, which has no time axis). */
  onZoomChange?: (zoom: number) => void;
};

/** The reading-mode switch options, in display order. */
const READING_MODE_OPTIONS: { id: TimelineReadingMode; label: string; icon: typeof Sparkles }[] = [
  { id: "workflow", label: "흐름", icon: Sparkles },
  { id: "swimlane", label: "타임라인", icon: Rows3 },
  { id: "stream", label: "원본", icon: List },
];

/**
 * Timeline toolbar. Deliberately spare: a reading-mode switch (time map,
 * list, connection map), one search field, and the category filter. There is no
 * inspector toggle — the inspector opens when an item is selected and closes
 * from its own X. The old session/day/week range dropdown and the C/M/D
 * density switch were removed — the range is always the full session span and
 * the density is fixed, so neither earned a control.
 */
export function TimelineToolbar({
  activeFilters,
  laneCounts,
  onToggleFilter,
  onClearFilters,
  searchQuery,
  onSearchChange,
  readingMode,
  onReadingModeChange,
  availableModes = ["workflow", "swimlane", "stream"],
  zoomFactor = 1,
  onZoomChange,
}: TimelineToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPopRef = useRef<HTMLDivElement | null>(null);

  useClickOutside(filterPopRef, filterOpen, () => setFilterOpen(false));

  const modeOptions = READING_MODE_OPTIONS.filter((option) =>
    availableModes.includes(option.id),
  );

  // The zoom stepper only makes sense on the time-positioned swimlane; the
  // 원본 stream has no time axis to stretch. Each step scales by 1.5x.
  const showZoom = onZoomChange && readingMode === "swimlane";
  const zoomOut = () => onZoomChange?.(zoomFactor / 1.5);
  const zoomIn = () => onZoomChange?.(zoomFactor * 1.5);

  return (
    <div className="timeline-toolbar" role="toolbar" aria-label="타임라인 컨트롤">
      {/* Top row — the reading-mode switch on the left and the auto-sync toggle
          on the far right, mirroring the 분석 tab's section-switch / run-controls
          split. A single offered mode locks the view, so the switch is hidden;
          연결(causal) stays in the code, just not offered here. */}
      <div className="timeline-toolbar-row">
        <div className="timeline-toolbar-left">
          {modeOptions.length > 1 ? (
            <div className="timeline-mode-switch" role="group" aria-label="보기 방식">
              {modeOptions.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`timeline-mode-option ${readingMode === id ? "is-active" : ""}`}
                  aria-pressed={readingMode === id}
                  onClick={() => onReadingModeChange(id)}
                >
                  <Icon size={14} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="timeline-toolbar-right">
          {showZoom ? (
            <div className="timeline-zoom" role="group" aria-label="확대 / 축소">
              <button
                type="button"
                className="timeline-zoom-step"
                onClick={zoomOut}
                disabled={zoomFactor <= MIN_ZOOM + 0.001}
                aria-label="축소"
              >
                <Minus size={14} aria-hidden="true" />
              </button>
              <span className="timeline-zoom-value" aria-live="polite">
                {Math.round(zoomFactor * 100)}%
              </span>
              <button
                type="button"
                className="timeline-zoom-step"
                onClick={zoomIn}
                disabled={zoomFactor >= MAX_ZOOM - 0.001}
                aria-label="확대"
              >
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <FollowControl />
        </div>
      </div>

      {/* Bottom row — search on the left, the category filter on the right.
          Boxed as its own band, like the 분석 tab's 자료 / 정리 search bar. */}
      <div className="timeline-toolbar-row timeline-toolbar-search-row">
        <div className="timeline-toolbar-left">
          <SearchField
            value={searchQuery}
            onChange={onSearchChange}
            ariaLabel="타임라인 이벤트 검색"
            className="tab-toolbar-search"
          />
        </div>
        <div className="timeline-toolbar-right">
          <div className="toolbar-pop-wrap" ref={filterPopRef}>
            <button
              type="button"
              className={`toolbar-toggle ${activeFilters.length ? "is-active" : ""}`}
              onClick={() => setFilterOpen((open) => !open)}
              aria-expanded={filterOpen}
              aria-controls="timeline-filter-popover"
              aria-label="카테고리 필터"
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
                  {CANONICAL_TIMELINE_LANES.map((lane) => {
                    const visuals = getActivityLaneVisuals(lane);
                    const active = activeFilters.includes(lane);
                    const count = laneCounts?.[lane] ?? 0;
                    return (
                      <li key={lane}>
                        <button
                          type="button"
                          className={`filter-pop-item tone-${visuals.tone} ${active ? "active" : ""}`}
                          aria-pressed={active}
                          onClick={() => onToggleFilter(lane)}
                        >
                          <span className={`legend-dot tone-${visuals.tone}`} />
                          <span className="filter-pop-label">{visuals.label}</span>
                          <span className={`filter-pop-count${count === 0 ? " is-zero" : ""}`}>
                            {count}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function useClickOutside(
  ref: RefObject<HTMLElement | null>,
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
