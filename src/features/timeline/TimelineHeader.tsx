import { Filter, List, MoreHorizontal, Route, Rows3, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { SearchField } from "../../components/ui/SearchField";
import {
  CANONICAL_TIMELINE_LANES,
  getActivityLaneVisuals,
  type ActivityLaneId,
} from "../../lib/timeline/activityModel";

/** The two views the 흐름 tab leads with: the raw conversation stream and the
 *  AI work-flow. */
export type TimelinePrimaryMode = "stream" | "workflow";
/** Retired views, still reachable through the "고급" affordance. */
export type TimelineAdvancedMode = "swimlane" | "causal";
export type TimelineReadingMode = TimelinePrimaryMode | TimelineAdvancedMode;

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
};

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
}: TimelineToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPopRef = useRef<HTMLDivElement | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedPopRef = useRef<HTMLDivElement | null>(null);
  const isAdvancedMode = readingMode === "swimlane" || readingMode === "causal";

  useClickOutside(filterPopRef, filterOpen, () => setFilterOpen(false));
  useClickOutside(advancedPopRef, advancedOpen, () => setAdvancedOpen(false));

  return (
    <div className="timeline-toolbar" role="toolbar" aria-label="타임라인 컨트롤">
      <SearchField
        value={searchQuery}
        onChange={onSearchChange}
        ariaLabel="타임라인 이벤트 검색"
        className="tab-toolbar-search"
      />

      <span className="timeline-toolbar-spacer" aria-hidden="true" />

      <div className="timeline-toolbar-right">
        <div className="timeline-mode-switch" role="group" aria-label="흐름 보기 방식">
          <button
            type="button"
            className={`timeline-mode-option ${readingMode === "stream" ? "is-active" : ""}`}
            aria-pressed={readingMode === "stream"}
            onClick={() => onReadingModeChange("stream")}
          >
            <List size={14} aria-hidden="true" />
            원본
          </button>
          <button
            type="button"
            className={`timeline-mode-option ${readingMode === "workflow" ? "is-active" : ""}`}
            aria-pressed={readingMode === "workflow"}
            onClick={() => onReadingModeChange("workflow")}
          >
            <Sparkles size={14} aria-hidden="true" />
            AI 흐름
          </button>
        </div>
        <div className="toolbar-pop-wrap" ref={advancedPopRef}>
          <button
            type="button"
            className={`toolbar-toggle ${isAdvancedMode ? "is-active" : ""}`}
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
            aria-controls="timeline-advanced-popover"
            aria-label="고급 보기"
          >
            <MoreHorizontal size={14} aria-hidden="true" />
            고급
          </button>
          {advancedOpen ? (
            <div
              className="filter-popover"
              id="timeline-advanced-popover"
              role="dialog"
              aria-label="고급 보기"
            >
              <header>
                <span>고급 보기</span>
              </header>
              <ul>
                <li>
                  <button
                    type="button"
                    className={`filter-pop-item ${readingMode === "swimlane" ? "active" : ""}`}
                    aria-pressed={readingMode === "swimlane"}
                    onClick={() => {
                      onReadingModeChange("swimlane");
                      setAdvancedOpen(false);
                    }}
                  >
                    <Rows3 size={14} aria-hidden="true" />
                    <span className="filter-pop-label">타임라인</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className={`filter-pop-item ${readingMode === "causal" ? "active" : ""}`}
                    aria-pressed={readingMode === "causal"}
                    onClick={() => {
                      onReadingModeChange("causal");
                      setAdvancedOpen(false);
                    }}
                  >
                    <Route size={14} aria-hidden="true" />
                    <span className="filter-pop-label">연결</span>
                  </button>
                </li>
              </ul>
            </div>
          ) : null}
        </div>
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
