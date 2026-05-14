import { Filter, Grid2X2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "../../components/ui/Button";
import type { EventType } from "../../domain/types";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import { TimelineFilters } from "./TimelineFilters";

export type TimelineToolbarProps = {
  density: TimelineDensity;
  onToggleDensity: () => void;
  activeFilters: EventType[];
  onToggleFilter: (eventType: EventType) => void;
  onClearFilters: () => void;
};

export function TimelineToolbar({
  density,
  onToggleDensity,
  activeFilters,
  onToggleFilter,
  onClearFilters,
}: TimelineToolbarProps) {
  return (
    <div className="timeline-toolbar" role="toolbar" aria-label="Timeline controls">
      <div className="timeline-toolbar-row">
        <div className="timeline-toolbar-left">
          <div className="segmented" role="group" aria-label="Time range (planned)">
            <button type="button" disabled title="Day view is planned">
              Day
            </button>
            <button type="button" disabled title="Week view is planned">
              Week
            </button>
            <button type="button" className="active" aria-pressed="true">
              Session
            </button>
          </div>
          <div className="zoom-group" role="group" aria-label="Zoom (planned)">
            <button
              type="button"
              disabled
              title="Zoom controls are planned"
              aria-label="Zoom out (planned)"
            >
              <ZoomOut size={14} />
            </button>
            <button
              type="button"
              disabled
              title="Zoom controls are planned"
              aria-label="Zoom in (planned)"
            >
              <ZoomIn size={14} />
            </button>
          </div>
        </div>
        <div className="timeline-toolbar-right">
          <Button
            icon={Filter}
            onClick={onClearFilters}
            disabled={activeFilters.length === 0}
            title={activeFilters.length ? "Clear all category filters" : "No filters applied"}
          >
            {activeFilters.length ? `Clear filters (${activeFilters.length})` : "All categories"}
          </Button>
          <Button
            icon={Grid2X2}
            onClick={onToggleDensity}
            title={`Switch to ${density === "comfortable" ? "compact" : "comfortable"} density`}
          >
            {density === "comfortable" ? "Comfortable" : "Compact"}
          </Button>
        </div>
      </div>
      <div className="timeline-toolbar-filters">
        <TimelineFilters activeFilters={activeFilters} onToggle={onToggleFilter} />
      </div>
    </div>
  );
}
