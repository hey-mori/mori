import { Layers3 } from "lucide-react";
import { eventTypeLabels, eventTypeTone } from "../../domain/constants";
import type { EventType } from "../../domain/types";
import { formatTimeRange } from "../../lib/formatting/time";
import type { LaidOutTimelineItem, TimelineDensity } from "../../lib/timeline/collisionLayout";
import { focusStateClassName, type EventFocusState } from "../../lib/timeline/focusState";
import type { TimelineDisplayBundle } from "../../lib/timeline/displayItems";

export function TimelineBundleCard({
  bundle,
  layout,
  focusState,
  density,
  onSelect,
  onHover,
}: {
  bundle: TimelineDisplayBundle;
  layout: LaidOutTimelineItem;
  focusState: EventFocusState;
  density: TimelineDensity;
  onSelect: (itemId: string) => void;
  onHover: (itemId: string | null) => void;
}) {
  const compact = density === "compact";
  const chips = Object.entries(bundle.eventTypeCounts)
    .filter((entry): entry is [EventType, number] => Boolean(entry[1]))
    .slice(0, 3);

  return (
    <button
      className={`timeline-bundle-card card-${eventTypeTone[bundle.laneType]} ${focusStateClassName(focusState)} ${compact ? "is-compact" : ""}`}
      onClick={() => onSelect(bundle.id)}
      onMouseEnter={() => onHover(bundle.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        left: `${layout.x}px`,
        top: `${layout.y}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
      }}
      type="button"
      aria-pressed={focusState === "selected"}
      title={`${bundle.title} · ${bundle.count} events`}
    >
      <header className="timeline-bundle-card-header">
        <span className={`event-card-time tone-${eventTypeTone[bundle.laneType]}`}>
          <Layers3 size={12} />
          {formatTimeRange(bundle.start, bundle.end)}
        </span>
        <span className="timeline-bundle-count">{bundle.count} events</span>
      </header>
      <strong className="timeline-bundle-title">{bundle.title}</strong>
      {!compact ? <p className="timeline-bundle-summary">{bundle.summary}</p> : null}
      <div className="timeline-bundle-chips">
        {chips.map(([type, count]) => (
          <span key={type} className={`timeline-bundle-chip tone-${eventTypeTone[type]}`}>
            {eventTypeLabels[type]} {count}
          </span>
        ))}
      </div>
      <footer className="timeline-bundle-footer">
        <span>{bundle.sourceCount} sources</span>
        {bundle.decisionCount > 0 ? <span>{bundle.decisionCount} decisions</span> : null}
        {bundle.issueCount > 0 ? <span>{bundle.issueCount} issues</span> : null}
      </footer>
    </button>
  );
}
