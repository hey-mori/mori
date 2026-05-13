import type { AxisTick } from "../../lib/timeline/timeScale";

export function TimelineAxis({
  ticks,
  frameWidth,
  contentLeftPx,
  contentWidthPx,
}: {
  ticks: AxisTick[];
  frameWidth?: number;
  contentLeftPx?: number;
  contentWidthPx?: number;
}) {
  if (!ticks.length) return null;
  return (
    <div
      className="timeline-axis"
      aria-hidden="true"
      style={frameWidth ? { width: `${frameWidth}px` } : undefined}
    >
      {contentLeftPx !== undefined && contentWidthPx !== undefined ? (
        <div
          className="timeline-axis-track"
          style={{ left: `${contentLeftPx}px`, width: `${contentWidthPx}px` }}
        >
          {ticks.map((tick) => (
            <span key={tick.iso} className="timeline-axis-tick" style={{ left: `${tick.xPercent}%` }}>
              {tick.label}
            </span>
          ))}
        </div>
      ) : (
        ticks.map((tick) => (
          <span key={tick.iso} className="timeline-axis-tick" style={{ left: `${tick.xPercent}%` }}>
            {tick.label}
          </span>
        ))
      )}
    </div>
  );
}
