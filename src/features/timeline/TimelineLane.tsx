import type { LucideIcon } from "lucide-react";
import { TimelineEventCard } from "./TimelineEventCard";
import { eventTypeTone } from "../../domain/constants";
import type { EventType, TimelineEvent } from "../../domain/types";
import type { LaidOutEvent, LaneLayout, TimelineDensity } from "../../lib/timeline/collisionLayout";
import { getEventFocusState } from "../../lib/timeline/focusState";

export function TimelineLane({
  icon: Icon,
  label,
  tone,
  lane,
  laneLabelWidthPx,
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
  tone: EventType;
  lane: LaneLayout;
  laneLabelWidthPx: number;
  events: TimelineEvent[];
  layouts: Map<string, LaidOutEvent>;
  density: TimelineDensity;
  selectedEventId: string | null;
  focusedSet: Set<string>;
  onSelect: (eventId: string) => void;
  onHover: (eventId: string | null) => void;
}) {
  const colorClass = `lane-tone-${eventTypeTone[tone]}`;
  const isEmpty = events.length === 0;
  return (
    <div
      className={`lane ${colorClass} ${isEmpty ? "is-empty" : ""}`}
      style={{ top: `${lane.top}px`, height: `${lane.height}px` }}
    >
      <div className="lane-label" style={{ width: `${laneLabelWidthPx}px` }}>
        <span className="lane-label-icon">
          <Icon size={14} />
        </span>
        <strong>{label}</strong>
        {events.length > 0 ? <span className="lane-label-count">{events.length}</span> : null}
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
