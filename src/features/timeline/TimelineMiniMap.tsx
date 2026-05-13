import { eventTypeTone } from "../../domain/constants";
import { laneOrder } from "../../domain/constants";
import { focusStateClassName, getEventFocusState } from "../../lib/timeline/focusState";
import type { TimelineLayout } from "../../lib/timeline/collisionLayout";
import type { AxisTick } from "../../lib/timeline/timeScale";

export function TimelineMiniMap({
  layout,
  ticks,
  selectedEventId,
  focusedSet,
}: {
  layout: TimelineLayout;
  ticks: AxisTick[];
  selectedEventId: string | null;
  focusedSet: Set<string>;
}) {
  if (!layout.events.length) return null;
  const first = ticks[0];
  const last = ticks[ticks.length - 1];

  return (
    <div className="mini-map" aria-hidden="true">
      <span className="mini-map-label">{first?.label ?? ""}</span>
      <div className="mini-track">
        {layout.events.map((event) => {
          const state = getEventFocusState({
            eventId: event.eventId,
            selectedEventId,
            focusedSet,
          });
          const xPercent = (event.anchorCenter.x / layout.frameWidth) * 100;
          const laneIndex = laneOrder.indexOf(event.type);
          return (
            <i
              key={event.eventId}
              className={`mini-dot tone-${eventTypeTone[event.type]} ${focusStateClassName(state)}`}
              style={{
                left: `${xPercent}%`,
                top: `${10 + (laneIndex % 4) * 8}px`,
              }}
            />
          );
        })}
      </div>
      <span className="mini-map-label">{last?.label ?? ""}</span>
    </div>
  );
}
