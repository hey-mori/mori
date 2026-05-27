import {
  Filter,
  MessageSquare,
  PanelRight,
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
  onToggleFilter: (lane: ActivityLaneId) => void;
  onClearFilters: () => void;
  inspectorCollapsed: boolean;
  onToggleInspector: () => void;
  inspectorToggleDisabled: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  readingMode: TimelineReadingMode;
  onReadingModeChange: (mode: TimelineReadingMode) => void;
};

/**
 * Timeline toolbar. Deliberately spare: a reading-mode switch (conversation
 * thread ↔ swimlane), one search field, the category filter, and the
 * inspector toggle. The old session/day/week range dropdown and the C/M/D
 * density switch were removed — the range is always the full session span and
 * the density is fixed, so neither earned a control.
 */
export function TimelineToolbar({
  activeFilters,
  onToggleFilter,
  onClearFilters,
  inspectorCollapsed,
  onToggleInspector,
  inspectorToggleDisabled,
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
        <div className="timeline-mode-switch" role="group" aria-label="타임라인 보기 방식">
          <button
            type="button"
            className={`timeline-mode-option ${readingMode === "flow" ? "is-active" : ""}`}
            aria-pressed={readingMode === "flow"}
            onClick={() => onReadingModeChange("flow")}
            title="대화 스레드: 턴과 출처 활동을 시간순으로 읽기"
          >
            <MessageSquare size={14} aria-hidden="true" />
            대화
          </button>
          <button
            type="button"
            className={`timeline-mode-option ${readingMode === "swimlane" ? "is-active" : ""}`}
            aria-pressed={readingMode === "swimlane"}
            onClick={() => onReadingModeChange("swimlane")}
            title="타임라인: 카테고리 레인별로 활동 훑어보기"
          >
            <Rows3 size={14} aria-hidden="true" />
            타임라인
          </button>
        </div>
      </div>

      <div className="timeline-toolbar-search" role="search" aria-label="타임라인 이벤트 검색">
        <Search size={14} aria-hidden="true" className="timeline-search-icon" />
        <input
          type="search"
          className="timeline-search-input"
          placeholder="이벤트 검색"
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
                  return (
                    <li key={lane}>
                      <button
                        type="button"
                        className={`filter-pop-item tone-${visuals.tone} ${active ? "active" : ""}`}
                        aria-pressed={active}
                        onClick={() => onToggleFilter(lane)}
                      >
                        <span className={`legend-dot tone-${visuals.tone}`} />
                        {visuals.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <footer>
                <small>필터는 세션 데이터를 바꾸지 않고 보이는 이벤트만 좁힙니다.</small>
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
              ? "좁은 화면에서는 인스펙터가 자동으로 숨겨집니다."
              : inspectorCollapsed
                ? "인스펙터 열기"
                : "인스펙터 닫기"
          }
        >
          <PanelRight size={14} aria-hidden="true" />
          인스펙터
        </button>
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
