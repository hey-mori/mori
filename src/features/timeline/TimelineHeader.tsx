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
            <button type="button" disabled title="일 단위 보기는 다음 마일스톤">
              일
            </button>
            <button type="button" disabled title="주 단위 보기는 다음 마일스톤">
              주
            </button>
            <button type="button" className="active" aria-pressed="true">
              세션
            </button>
          </div>
          <div className="zoom-group" role="group" aria-label="Zoom (planned)">
            <button
              type="button"
              disabled
              title="확대/축소는 다음 마일스톤"
              aria-label="Zoom out (planned)"
            >
              <ZoomOut size={14} />
            </button>
            <button
              type="button"
              disabled
              title="확대/축소는 다음 마일스톤"
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
            {activeFilters.length ? `필터 해제 (${activeFilters.length})` : "전체 카테고리"}
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
