import { ShieldCheck, ShieldQuestion, Eye, type LucideIcon } from "lucide-react";
import { eventTypeIcons, eventTypeLabels, eventTypeTone } from "../../domain/constants";
import { formatTime, formatTimeRange, minutesBetween } from "../../lib/formatting/time";
import type { LaidOutTimelineItem, TimelineDensity } from "../../lib/timeline/collisionLayout";
import { focusStateClassName, type EventFocusState } from "../../lib/timeline/focusState";
import type { TimelineEvent, TrustLevel } from "../../domain/types";

const TRUST_GLYPHS: Record<TrustLevel, { icon: LucideIcon; label: string; tone: string }> = {
  verified: { icon: ShieldCheck, label: "Verified", tone: "verified" },
  observed: { icon: Eye, label: "Observed", tone: "observed" },
  inferred: { icon: ShieldQuestion, label: "Inferred", tone: "inferred" },
};

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
  const trust = TRUST_GLYPHS[event.trustLevel];
  const TrustIcon = trust.icon;
  const issueCount = event.linkedIssueIds.length;
  const decisionCount = event.linkedDecisionIds.length;
  const sourceCount = event.sourceRefs.length;
  const tone = eventTypeTone[event.type];
  const compact = density === "compact";

  // Time label: show a range when the event covers a meaningful span, otherwise
  // show the single start time. We never show "00:00 - 00:00" type degenerate
  // ranges — those add visual noise without helping orientation.
  const hasRange = event.end ? minutesBetween(event.start, event.end) >= 1 : false;
  const timeLabel = hasRange && event.end ? formatTimeRange(event.start, event.end) : formatTime(event.start);

  // Footer meta: a single trust-anchored summary "verified · 2 src · 3 issues",
  // never uppercase tracking. We hide it altogether on compact density to
  // reduce noise, since the inspector already exposes everything.
  const metaParts: string[] = [];
  if (sourceCount > 0) metaParts.push(`${sourceCount} src`);
  if (issueCount > 0) metaParts.push(`${issueCount} issue${issueCount === 1 ? "" : "s"}`);
  if (decisionCount > 0) metaParts.push(`${decisionCount} dec`);

  return (
    <button
      className={`event-card card-${tone} trust-${trust.tone} ${focusStateClassName(focusState)} ${compact ? "is-compact" : ""}`}
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
      aria-label={`${eventTypeLabels[event.type]} · ${event.title} · ${trust.label}`}
      title={`${eventTypeLabels[event.type]} · ${event.title}`}
    >
      <header className="event-card-header">
        <span className={`event-card-time tone-${tone}`}>
          <Icon size={11} aria-hidden="true" />
          {timeLabel}
        </span>
        <span
          className={`event-card-trust trust-${trust.tone}`}
          title={`${trust.label}${event.trustLevel === "inferred" ? ` · ${Math.round(event.confidence * 100)}% confidence` : ""}`}
          aria-hidden="true"
        >
          {/* Identical badge width across all trust levels so card headers
              never jitter when you scan a lane. Confidence detail lives in
              the inspector + the `title` tooltip. */}
          <TrustIcon size={11} />
        </span>
      </header>
      <strong className="event-card-title">{event.title}</strong>
      {!compact && metaParts.length > 0 ? (
        <footer className="event-card-footer">
          <span className="event-card-meta">{metaParts.join(" · ")}</span>
        </footer>
      ) : null}
    </button>
  );
}
