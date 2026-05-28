import {
  Filter,
  List,
  Rows3,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  CANONICAL_TIMELINE_LANES,
  getActivityLaneVisuals,
  type ActivityLaneId,
} from "../../lib/timeline/activityModel";

export type TimelineReadingMode = "swimlane" | "flow";

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
 * Timeline toolbar. Deliberately spare: a reading-mode switch (conversation
 * thread ↔ swimlane), one search field, and the category filter. There is no
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

  useClickOutside(filterPopRef, filterOpen, () => setFilterOpen(false));

  return (
    <div className="timeline-toolbar" role="toolbar" aria-label="타임라인 컨트롤">
      <div className="timeline-toolbar-left">
        <div className="timeline-mode-switch" role="group" aria-label="흐름 보기 방식">
          <button
            type="button"
            className={`timeline-mode-option ${readingMode === "swimlane" ? "is-active" : ""}`}
            aria-pressed={readingMode === "swimlane"}
            onClick={() => onReadingModeChange("swimlane")}
            title="타임라인: 시간 축에서 카테고리별로 언제·무엇이 겹쳤는지 훑어보기"
          >
            <Rows3 size={14} aria-hidden="true" />
            타임라인
          </button>
          <button
            type="button"
            className={`timeline-mode-option ${readingMode === "flow" ? "is-active" : ""}`}
            aria-pressed={readingMode === "flow"}
            onClick={() => onReadingModeChange("flow")}
            title="목록: 모든 활동을 시간순으로, 내용 미리보기와 함께 읽기"
          >
            <List size={14} aria-hidden="true" />
            목록
          </button>
        </div>
      </div>

      <div className="timeline-toolbar-search" role="search" aria-label="타임라인 이벤트 검색">
        <Search size={14} aria-hidden="true" className="timeline-search-icon" />
        <input
          type="search"
          className="timeline-search-input"
          placeholder=""
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label="타임라인 이벤트 검색"
        />
        {searchQuery ? (
          <button
            type="button"
            className="timeline-search-clear"
            onClick={() => onSearchChange("")}
            aria-label="검색어 지우기"
          >
            <X size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="timeline-toolbar-right">
        <div className="toolbar-pop-wrap" ref={filterPopRef}>
          <button
            type="button"
            className={`toolbar-toggle ${activeFilters.length ? "is-active" : ""}`}
            onClick={() => setFilterOpen((open) => !open)}
            aria-expanded={filterOpen}
            aria-controls="timeline-filter-popover"
            title="카테고리 필터"
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
              <footer>
                <small>선택한 카테고리를 강조하고 나머지는 흐리게 표시합니다. 이벤트는 숨겨지지 않습니다.</small>
              </footer>
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
