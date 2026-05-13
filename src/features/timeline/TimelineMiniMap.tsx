import { useMemo } from "react";
import { eventTypeTone, laneOrder } from "../../domain/constants";
import { focusStateClassName, getEventFocusState } from "../../lib/timeline/focusState";
import { timestampToXPercent, type TimelineRange } from "../../lib/timeline/layout";
import type { TimelineEvent } from "../../domain/types";
import type { AxisTick } from "../../lib/timeline/timeScale";

export function TimelineMiniMap({
  events,
  range,
  ticks,
  selectedEventId,
  focusedSet,
}: {
  events: TimelineEvent[];
  range: TimelineRange;
  ticks: AxisTick[];
  selectedEventId: string | null;
  focusedSet: Set<string>;
}) {
  // Place dots by real time position (not by lane index modulo) so the rail
  // reads as a true bird's-eye-view of when events happened.
  const placed = useMemo(() => {
    return events.map((event) => {
      const xPercent = timestampToXPercent(event.start, range);
      const laneIndex = Math.max(0, laneOrder.indexOf(event.type));
      return { event, xPercent, laneIndex };
    });
  }, [events, range]);

  if (placed.length === 0) return null;

  const totalLanes = laneOrder.length;
  const selectedDot = placed.find((dot) => dot.event.id === selectedEventId);

  return (
    <div className="mini-map" aria-label="Timeline overview">
      <div className="mini-map-axis" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick.iso} className="mini-map-tick" style={{ left: `${tick.xPercent}%` }}>
            {tick.label}
          </span>
        ))}
      </div>
      <div className="mini-track">
        {placed.map(({ event, xPercent, laneIndex }) => {
          const state = getEventFocusState({
            eventId: event.id,
            selectedEventId,
            focusedSet,
          });
          const topPercent = (laneIndex / Math.max(1, totalLanes - 1)) * 80 + 10;
          return (
            <i
              key={event.id}
              className={`mini-dot tone-${eventTypeTone[event.type]} ${focusStateClassName(state)}`}
              style={{
                left: `${xPercent}%`,
                top: `${topPercent}%`,
              }}
              title={event.title}
            />
          );
        })}
        {selectedDot ? (
          <span
            className="mini-map-marker"
            style={{ left: `${selectedDot.xPercent}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
}
