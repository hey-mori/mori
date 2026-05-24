import { timestampToXPercent } from "../../lib/timeline/layout";
import type { TimelineRange } from "../../lib/timeline/layout";
import type { TimelineGapMarker } from "../../lib/timeline/timelineViewModel";

export function TimelineTimeMarkers({
  markers,
  range,
  contentLeftPx,
  contentWidthPx,
  topPx,
  heightPx,
}: {
  markers: TimelineGapMarker[];
  range: TimelineRange;
  contentLeftPx: number;
  contentWidthPx: number;
  topPx: number;
  heightPx: number;
}) {
  if (markers.length === 0 || heightPx <= 0) return null;

  return (
    <div
      className="timeline-time-markers"
      aria-hidden="true"
      style={{
        left: `${contentLeftPx}px`,
        top: `${topPx}px`,
        width: `${contentWidthPx}px`,
        height: `${heightPx}px`,
      }}
    >
      {markers.map((marker) => {
        const left = timestampToXPercent(marker.at, range);
        return (
          <span
            key={marker.id}
            className="timeline-gap-marker"
            style={{ left: `${left}%` }}
            title={`${marker.label}: ${marker.from} → ${marker.to}`}
          >
            <span>{marker.label}</span>
          </span>
        );
      })}
    </div>
  );
}
