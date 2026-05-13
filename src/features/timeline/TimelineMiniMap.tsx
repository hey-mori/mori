import { eventTypeTone } from "../../domain/constants";
import { focusStateClassName, getEventFocusState } from "../../lib/timeline/focusState";
import type { PositionedEvent } from "../../lib/timeline/layout";
import type { AxisTick } from "../../lib/timeline/timeScale";

export function TimelineMiniMap({
  events,
  ticks,
  selectedEventId,
  focusedSet,
}: {
  events: PositionedEvent[];
  ticks: AxisTick[];
  selectedEventId: string | null;
  focusedSet: Set<string>;
}) {
  if (!events.length) return null;
  const first = ticks[0];
  const last = ticks[ticks.length - 1];

  return (
    <div className="mini-map" aria-hidden="true">
      <span className="mini-map-label">{first?.label ?? ""}</span>
      <div className="mini-track">
        {events.map((event) => {
          const state = getEventFocusState({
            eventId: event.id,
            selectedEventId,
            focusedSet,
          });
          return (
            <i
              key={event.id}
              className={`mini-dot tone-${eventTypeTone[event.type]} ${focusStateClassName(state)}`}
              style={{ left: `${event.xPercent}%`, top: `${18 + (event.laneIndex % 4) * 8}px` }}
            />
          );
        })}
      </div>
      <span className="mini-map-label">{last?.label ?? ""}</span>
    </div>
  );
}
