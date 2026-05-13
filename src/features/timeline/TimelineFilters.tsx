import { eventTypeLabels, eventTypeTone, laneOrder } from "../../domain/constants";
import type { EventType } from "../../domain/types";

export function TimelineFilters({
  activeFilters,
  onToggle,
}: {
  activeFilters: EventType[];
  onToggle: (eventType: EventType) => void;
}) {
  return (
    <div className="timeline-filters" role="group" aria-label="Filter timeline by event type">
      {laneOrder.map((type) => {
        const active = activeFilters.includes(type);
        return (
          <button
            key={type}
            type="button"
            className={`timeline-filter ${active ? "active" : ""}`}
            aria-pressed={active}
            onClick={() => onToggle(type)}
          >
            <i className={`legend-dot tone-${eventTypeTone[type]}`} />
            {eventTypeLabels[type]}
          </button>
        );
      })}
    </div>
  );
}
