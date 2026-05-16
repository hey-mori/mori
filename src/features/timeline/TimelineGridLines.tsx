import type { AxisTick } from "../../lib/timeline/timeScale";

/**
 * Vertical time gridlines for the Timeline canvas.
 *
 * The axis renders the tick *labels* along the top; this layer drops a
 * faint line from each tick down through the lane area so an event card
 * can be read against a real time position instead of floating free.
 *
 * It is derived entirely from the same `ticks` the axis uses — no extra
 * data, no decoration. It sits behind the event cards and relationship
 * lines (`z-index: 0`, `pointer-events: none`) so it never competes with
 * the content it is there to ground.
 */
export function TimelineGridLines({
  ticks,
  contentLeftPx,
  contentWidthPx,
  topPx,
  heightPx,
}: {
  ticks: AxisTick[];
  /** Left edge of the time content area (right of the lane-label gutter). */
  contentLeftPx: number;
  contentWidthPx: number;
  /** Top of the lane area, i.e. just below the sticky axis. */
  topPx: number;
  heightPx: number;
}) {
  if (ticks.length === 0 || heightPx <= 0 || contentWidthPx <= 0) return null;
  return (
    <div
      className="timeline-gridlines"
      aria-hidden="true"
      style={{
        left: `${contentLeftPx}px`,
        width: `${contentWidthPx}px`,
        top: `${topPx}px`,
        height: `${heightPx}px`,
      }}
    >
      {ticks.map((tick) => (
        <span
          key={tick.iso}
          className="timeline-gridline"
          style={{ left: `${tick.xPercent}%` }}
        />
      ))}
    </div>
  );
}
