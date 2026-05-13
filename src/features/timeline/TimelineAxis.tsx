import type { AxisTick } from "../../lib/timeline/timeScale";

export function TimelineAxis({ ticks, frameWidth }: { ticks: AxisTick[]; frameWidth?: number }) {
  if (!ticks.length) return null;
  return (
    <div
      className="timeline-axis"
      aria-hidden="true"
      style={frameWidth ? { width: `${frameWidth}px` } : undefined}
    >
      {ticks.map((tick) => (
        <span key={tick.iso} className="timeline-axis-tick" style={{ left: `${tick.xPercent}%` }}>
          {tick.label}
        </span>
      ))}
    </div>
  );
}
