import { Calendar, Filter, Grid2X2, Layers, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { eventTypeLabels, eventTypeTone, laneOrder } from "../../domain/constants";
import type { EventType } from "../../domain/types";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import {
  TIMELINE_CONTROLS,
  getPlannedHint,
  isImplemented,
} from "../../lib/timeline/timelineControls";

export type TimelineToolbarProps = {
  density: TimelineDensity;
  onToggleDensity: () => void;
  activeFilters: EventType[];
  onToggleFilter: (eventType: EventType) => void;
  onClearFilters: () => void;
  activeLanesOnly: boolean;
  onToggleActiveLanesOnly: () => void;
  visibleLaneCount: number;
  totalLaneCount: number;
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
  onToggleDensity,
  activeFilters,
  onToggleFilter,
  onClearFilters,
  activeLanesOnly,
  onToggleActiveLanesOnly,
  visibleLaneCount,
  totalLaneCount,
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
        <div className="segmented" role="group" aria-label="Time range">
          <button type="button" disabled title={dayHint}>
            <Calendar size={13} aria-hidden="true" /> Day
          </button>
          <button type="button" disabled title={weekHint}>
            Week
          </button>
          <button
            type="button"
            className="active"
            aria-pressed={isImplemented("rangeSession")}
            title="Single session view (current)"
          >
            Session
          </button>
        </div>
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
              ? `Showing ${visibleLaneCount} active lanes (toggle to show all ${totalLaneCount})`
              : `Showing all ${totalLaneCount} lanes (toggle to hide empty)`
          }
        >
          <Layers size={14} aria-hidden="true" />
          {activeLanesOnly
            ? `Active lanes · ${visibleLaneCount}/${totalLaneCount}`
            : `All lanes · ${totalLaneCount}`}
        </button>
        <div className="filter-pop-wrap" ref={filterPopRef}>
          <button
            type="button"
            className={`toolbar-toggle ${activeFilters.length ? "is-active" : ""}`}
            onClick={() => setFilterOpen((open) => !open)}
            aria-expanded={filterOpen}
            aria-controls="timeline-filter-popover"
            title="Filter timeline categories"
          >
            <Filter size={14} aria-hidden="true" />
            {activeFilters.length
              ? `Filter · ${activeFilters.length}`
              : "Filter"}
          </button>
          {filterOpen ? (
            <div
              className="filter-popover"
              id="timeline-filter-popover"
              role="dialog"
              aria-label="Category filter"
            >
              <header>
                <span>Category filter</span>
                <button
                  type="button"
                  className="filter-popover-clear"
                  onClick={() => {
                    onClearFilters();
                    setFilterOpen(false);
                  }}
                  disabled={activeFilters.length === 0}
                >
                  Clear
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
                  Lane labels are the primary category structure. Use filters
                  to focus on one or more types without changing the canvas.
                </small>
              </footer>
            </div>
          ) : null}
        </div>
        <Button
          icon={Grid2X2}
          onClick={onToggleDensity}
          title={`Switch to ${density === "comfortable" ? "compact" : "comfortable"} density`}
        >
          {density === "comfortable" ? "Comfortable" : "Compact"}
        </Button>
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
      Day / Week / Zoom are <strong>Planned</strong> — Session view is the
      single source of truth for now.
      <span className="screen-reader-only">
        {plannedHints.map((control) => `${control.label}: ${control.plannedHint}`).join(" ")}
      </span>
    </p>
  );
}
