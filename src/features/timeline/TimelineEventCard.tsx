import { Badge } from "../../components/ui/Badge";
import { eventTypeIcons, eventTypeLabels, eventTypeTone } from "../../domain/constants";
import { formatTime } from "../../lib/formatting/time";
import { describeTrustLevel } from "../../lib/relationships/relationshipDisplay";
import { focusStateClassName, type EventFocusState } from "../../lib/timeline/focusState";
import type { PositionedEvent } from "../../lib/timeline/layout";

export function TimelineEventCard({
  event,
  focusState,
  cardWidth,
  onSelect,
  onHover,
}: {
  event: PositionedEvent;
  focusState: EventFocusState;
  cardWidth: number;
  onSelect: (eventId: string) => void;
  onHover: (eventId: string | null) => void;
}) {
  const trust = describeTrustLevel(event.trustLevel);
  const Icon = eventTypeIcons[event.type];
  const issueCount = event.linkedIssueIds.length;
  const decisionCount = event.linkedDecisionIds.length;
  const sourceCount = event.sourceRefs.length;
  const confidencePct = Math.round(event.confidence * 100);
  const tone = eventTypeTone[event.type];

  return (
    <button
      className={`event-card card-${tone} ${focusStateClassName(focusState)}`}
      onClick={() => onSelect(event.id)}
      onMouseEnter={() => onHover(event.id)}
      onMouseLeave={() => onHover(null)}
      style={{ left: `${event.xPercent}%`, width: cardWidth }}
      type="button"
      aria-pressed={focusState === "selected"}
      title={`${eventTypeLabels[event.type]} · ${event.title}`}
    >
      <header className="event-card-header">
        <span className="event-card-time">
          <Icon size={13} />
          {formatTime(event.start)}
        </span>
        <Badge tone={trust.tone}>{trust.label}</Badge>
      </header>
      <strong className="event-card-title">{event.title}</strong>
      <p className="event-card-summary">{event.summary}</p>
      <footer className="event-card-footer">
        <span className="event-card-tag">{eventTypeLabels[event.type]}</span>
        <span className="event-card-meta">
          {sourceCount > 0 ? <span>{sourceCount} src</span> : null}
          {issueCount > 0 ? <span>{issueCount} issue{issueCount === 1 ? "" : "s"}</span> : null}
          {decisionCount > 0 ? <span>{decisionCount} dec</span> : null}
          {event.trustLevel === "inferred" ? <span>{confidencePct}%</span> : null}
        </span>
      </footer>
    </button>
  );
}
