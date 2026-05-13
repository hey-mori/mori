import type { LucideIcon } from "lucide-react";
import { TimelineEventCard } from "./TimelineEventCard";
import type { TimelineEvent } from "../../domain/types";
import type { LaidOutEvent, LaneLayout, TimelineDensity } from "../../lib/timeline/collisionLayout";
import { getEventFocusState } from "../../lib/timeline/focusState";

export function TimelineLane({
  icon: Icon,
  label,
  lane,
  events,
  layouts,
  density,
  selectedEventId,
  focusedSet,
  onSelect,
  onHover,
}: {
  icon: LucideIcon;
  label: string;
  lane: LaneLayout;
  events: TimelineEvent[];
  layouts: Map<string, LaidOutEvent>;
  density: TimelineDensity;
  selectedEventId: string | null;
  focusedSet: Set<string>;
  onSelect: (eventId: string) => void;
  onHover: (eventId: string | null) => void;
}) {
  return (
    <div className="lane" style={{ top: `${lane.top}px`, height: `${lane.height}px` }}>
      <div className="lane-label">
        <Icon size={15} />
        <strong>{label}</strong>
        <span>{events.length}</span>
      </div>
      {events.map((event) => {
        const layout = layouts.get(event.id);
        if (!layout) return null;
        return (
          <TimelineEventCard
            key={event.id}
            event={event}
            layout={layout}
            density={density}
            focusState={getEventFocusState({
              eventId: event.id,
              selectedEventId,
              focusedSet,
            })}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </div>
  );
}
