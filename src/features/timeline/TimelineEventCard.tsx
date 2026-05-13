import { eventTypeIcons, eventTypeLabels, eventTypeTone } from "../../domain/constants";
import { formatTime } from "../../lib/formatting/time";
import type { LaidOutTimelineItem, TimelineDensity } from "../../lib/timeline/collisionLayout";
import { focusStateClassName, type EventFocusState } from "../../lib/timeline/focusState";
import type { TimelineEvent } from "../../domain/types";

export function TimelineEventCard({
  event,
  layout,
  focusState,
  density,
  onSelect,
  onHover,
}: {
  event: TimelineEvent;
  layout: LaidOutTimelineItem;
  focusState: EventFocusState;
  density: TimelineDensity;
  onSelect: (eventId: string) => void;
  onHover: (eventId: string | null) => void;
}) {
  const Icon = eventTypeIcons[event.type];
  const issueCount = event.linkedIssueIds.length;
  const decisionCount = event.linkedDecisionIds.length;
  const sourceCount = event.sourceRefs.length;
  const tone = eventTypeTone[event.type];
  const compact = density === "compact";
  const metaParts: string[] = [];
  if (sourceCount > 0) metaParts.push(`${sourceCount} src`);
  if (issueCount > 0) metaParts.push(`${issueCount} issue${issueCount === 1 ? "" : "s"}`);
  if (decisionCount > 0) metaParts.push(`${decisionCount} dec`);

  return (
    <button
      className={`event-card card-${tone} ${focusStateClassName(focusState)} ${compact ? "is-compact" : ""}`}
      onClick={() => onSelect(event.id)}
      onMouseEnter={() => onHover(event.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        left: `${layout.x}px`,
        top: `${layout.y}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
      }}
      type="button"
      aria-pressed={focusState === "selected"}
      title={`${eventTypeLabels[event.type]} · ${event.title}`}
    >
      <header className="event-card-header">
        <span className={`event-card-time tone-${tone}`}>
          <Icon size={12} />
          {formatTime(event.start)}
        </span>
        {event.trustLevel === "inferred" ? (
          <span className="event-card-inferred" title={`Inferred ${Math.round(event.confidence * 100)}% confidence`}>
            ~{Math.round(event.confidence * 100)}%
          </span>
        ) : null}
      </header>
      <strong className="event-card-title">{event.title}</strong>
      {!compact ? <p className="event-card-summary">{event.summary}</p> : null}
      {metaParts.length > 0 ? (
        <footer className="event-card-footer">
          <span className="event-card-meta">{metaParts.join(" · ")}</span>
        </footer>
      ) : null}
    </button>
  );
}
