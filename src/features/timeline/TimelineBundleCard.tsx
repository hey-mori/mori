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
  const tone = eventTypeTone[bundle.laneType];
  const typeMixLabel = Object.entries(bundle.eventTypeCounts)
    .filter((entry): entry is [EventType, number] => Boolean(entry[1]))
    .slice(0, 2)
    .map(([type, count]) => `${eventTypeLabels[type]} ${count}`)
    .join(" · ");

  const footerParts: string[] = [];
  if (bundle.sourceCount > 0) footerParts.push(`${bundle.sourceCount} src`);
  if (bundle.decisionCount > 0) footerParts.push(`${bundle.decisionCount} dec`);
  if (bundle.issueCount > 0) footerParts.push(`${bundle.issueCount} issue${bundle.issueCount === 1 ? "" : "s"}`);

  return (
    <button
      className={`timeline-bundle-card card-${tone} ${focusStateClassName(focusState)} ${compact ? "is-compact" : ""}`}
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
      aria-label={`${bundle.title} · ${bundle.count} events`}
      title={`${bundle.title} · ${bundle.count} events`}
    >
      <header className="timeline-bundle-card-header">
        <span className={`event-card-time tone-${tone}`}>
          <Layers3 size={11} aria-hidden="true" />
          {formatTimeRange(bundle.start, bundle.end)}
        </span>
        <span className="timeline-bundle-count">{bundle.count} events</span>
      </header>
      <strong className="timeline-bundle-title">{bundle.title}</strong>
      {!compact ? (
        <footer className="timeline-bundle-footer">
          {typeMixLabel ? <span>{typeMixLabel}</span> : null}
          {footerParts.length ? <span>{footerParts.join(" · ")}</span> : null}
        </footer>
      ) : null}
    </button>
  );
}
