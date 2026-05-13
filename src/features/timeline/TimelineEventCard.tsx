import { Badge } from "../../components/ui/Badge";
import { eventTypeIcons, eventTypeLabels, eventTypeTone } from "../../domain/constants";
import { formatTime } from "../../lib/formatting/time";
import { describeTrustLevel } from "../../lib/relationships/relationshipDisplay";
import type { LaidOutEvent, TimelineDensity } from "../../lib/timeline/collisionLayout";
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
  layout: LaidOutEvent;
  focusState: EventFocusState;
  density: TimelineDensity;
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
  const compact = density === "compact";

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
        <span className="event-card-time">
          <Icon size={12} />
          {formatTime(event.start)}
        </span>
        <Badge tone={trust.tone}>{trust.label}</Badge>
      </header>
      <strong className="event-card-title">{event.title}</strong>
      {!compact ? <p className="event-card-summary">{event.summary}</p> : null}
      <footer className="event-card-footer">
        <span className="event-card-tag">{eventTypeLabels[event.type]}</span>
        <span className="event-card-meta">
          {sourceCount > 0 ? <span title="Source count">{sourceCount} src</span> : null}
          {issueCount > 0 ? (
            <span title="Linked issues">
              {issueCount} {issueCount === 1 ? "issue" : "issues"}
            </span>
          ) : null}
          {decisionCount > 0 ? <span title="Linked decisions">{decisionCount} dec</span> : null}
          {event.trustLevel === "inferred" ? (
            <span title="Inference confidence">{confidencePct}%</span>
          ) : null}
        </span>
      </footer>
    </button>
  );
}
