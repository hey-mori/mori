import { useMemo } from "react";
import { eventTypeTone, laneOrder } from "../../domain/constants";
import { focusStateClassName, getEventFocusState } from "../../lib/timeline/focusState";
import { timestampToXPercent, type TimelineRange } from "../../lib/timeline/layout";
import type { TimelineDisplayItem } from "../../lib/timeline/displayItems";
import type { AxisTick } from "../../lib/timeline/timeScale";
import {
  FULL_MINIMAP_VIEWPORT,
  type MinimapViewport,
} from "../../lib/timeline/minimapViewport";

export function TimelineMiniMap({
  items,
  range,
  ticks,
  selectedItemId,
  focusedSet,
  viewport = FULL_MINIMAP_VIEWPORT,
}: {
  items: TimelineDisplayItem[];
  range: TimelineRange;
  ticks: AxisTick[];
  selectedItemId: string | null;
  focusedSet: Set<string>;
  /** Visible horizontal slice of the canvas, drawn as the viewport rect. */
  viewport?: MinimapViewport;
}) {
  const placed = useMemo(() => {
    return items.map((item) => {
      const xPercent = timestampToXPercent(item.start, range);
      const laneIndex = Math.max(0, laneOrder.indexOf(item.laneType));
      return { item, xPercent, laneIndex };
    });
  }, [items, range]);

  if (placed.length === 0) return null;

  const totalLanes = laneOrder.length;
  const selectedDot = placed.find((dot) => dot.item.id === selectedItemId);

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
        <span
          className="mini-map-viewport"
          aria-hidden="true"
          style={{
            left: `${viewport.leftPercent}%`,
            width: `${viewport.widthPercent}%`,
          }}
        />
        {placed.map(({ item, xPercent, laneIndex }) => {
          const state = getEventFocusState({
            itemId: item.id,
            itemEntityIds: item.memberEventIds,
            selectedItemId,
            focusedSet,
          });
          const topPercent = (laneIndex / Math.max(1, totalLanes - 1)) * 80 + 10;
          return (
            <i
              key={item.id}
              className={`mini-dot tone-${eventTypeTone[item.laneType]} ${focusStateClassName(state)} ${item.kind === "bundle" ? "is-bundle" : ""}`}
              style={{
                left: `${xPercent}%`,
                top: `${topPercent}%`,
              }}
              title={item.kind === "bundle" ? item.title : item.event.title}
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
