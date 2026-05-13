import type { LucideIcon } from "lucide-react";
import { TimelineEventCard } from "./TimelineEventCard";
import type { PositionedEvent } from "../../lib/timeline/layout";
import { getEventFocusState } from "../../lib/timeline/focusState";

export function TimelineLane({
  icon: Icon,
  label,
  events,
  height,
  cardWidth,
  selectedEventId,
  focusedSet,
  onSelect,
  onHover,
}: {
  icon: LucideIcon;
  label: string;
  events: PositionedEvent[];
  height: number;
  cardWidth: number;
  selectedEventId: string | null;
  focusedSet: Set<string>;
  onSelect: (eventId: string) => void;
  onHover: (eventId: string | null) => void;
}) {
  return (
    <div className="lane" style={{ height }}>
      <div className="lane-label">
        <Icon size={16} />
        <strong>{label}</strong>
        <span>{events.length}</span>
      </div>
      {events.map((event) => (
        <TimelineEventCard
          key={event.id}
          cardWidth={cardWidth}
          event={event}
          focusState={getEventFocusState({
            eventId: event.id,
            selectedEventId,
            focusedSet,
          })}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </div>
  );
}
