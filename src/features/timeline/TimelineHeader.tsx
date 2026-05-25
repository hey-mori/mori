import {
  Calendar,
  Check,
  ChevronDown,
  Filter,
  MessageSquare,
  PanelRight,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { eventTypeLabels, eventTypeTone, laneOrder } from "../../domain/constants";
import type { EventType } from "../../domain/types";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import { getPlannedHint } from "../../lib/timeline/timelineControls";

export type TimelineReadingMode = "swimlane" | "flow";

type TimelineRangeId = "day" | "week" | "session";

const DENSITY_OPTIONS: Array<{
  id: TimelineDensity;
  shortLabel: string;
  title: string;
}> = [
  { id: "comfortable", shortLabel: "C", title: "여유 밀도" },
  { id: "compact", shortLabel: "M", title: "기본 밀도" },
  { id: "dense", shortLabel: "D", title: "고밀도 추적 보기" },
];

export type TimelineToolbarProps = {
  activeFilters: EventType[];
  onToggleFilter: (eventType: EventType) => void;
  onClearFilters: () => void;
  inspectorCollapsed: boolean;
  onToggleInspector: () => void;
  inspectorToggleDisabled: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  readingMode: TimelineReadingMode;
  onReadingModeChange: (mode: TimelineReadingMode) => void;
  density: TimelineDensity;
  onDensityChange: (density: TimelineDensity) => void;
};

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
  density,
  onDensityChange,
}: TimelineToolbarProps) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const rangePopRef = useRef<HTMLDivElement | null>(null);
  const filterPopRef = useRef<HTMLDivElement | null>(null);

  useClickOutside(rangePopRef, rangeOpen, () => setRangeOpen(false));
  useClickOutside(filterPopRef, filterOpen, () => setFilterOpen(false));

  const rangeItems: Array<{ id: TimelineRangeId; label: string; hint?: string }> = [
    { id: "session", label: "세션" },
    { id: "day", label: "일", hint: getPlannedHint("rangeDay") },
    { id: "week", label: "주", hint: getPlannedHint("rangeWeek") },
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
              aria-label="타임라인 표시 범위"
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

        <div className="timeline-mode-switch" role="group" aria-label="타임라인 보기 방식">
          <button
            type="button"
            className={`timeline-mode-option ${readingMode === "flow" ? "is-active" : ""}`}
            aria-pressed={readingMode === "flow"}
            onClick={() => onReadingModeChange("flow")}
            title="흐름 보기: 턴과 출처 활동을 시간순으로 읽기"
          >
            <MessageSquare size={14} aria-hidden="true" />
            흐름
          </button>
          <button
            type="button"
            className={`timeline-mode-option ${readingMode === "swimlane" ? "is-active" : ""}`}
            aria-pressed={readingMode === "swimlane"}
            onClick={() => onReadingModeChange("swimlane")}
            title="타임라인 보기: 이벤트 레인별로 활동 훑어보기"
          >
            <Rows3 size={14} aria-hidden="true" />
            타임라인
          </button>
        </div>

        <div className="timeline-density-switch" role="group" aria-label="타임라인 밀도">
          <span className="timeline-density-label">
            <SlidersHorizontal size={13} aria-hidden="true" />
            밀도
          </span>
          {DENSITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`timeline-density-option ${density === option.id ? "is-active" : ""}`}
              aria-pressed={density === option.id}
              onClick={() => onDensityChange(option.id)}
              title={option.title}
            >
              {option.shortLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="timeline-toolbar-search" role="search" aria-label="타임라인 이벤트 검색">
        <Search size={13} aria-hidden="true" className="timeline-search-icon" />
        <input
          type="search"
          className="timeline-search-input"
          placeholder="이벤트 검색..."
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
            <X size={12} aria-hidden="true" />
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
                  필터는 세션 데이터를 바꾸지 않고 보이는 이벤트만 좁힙니다.
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
