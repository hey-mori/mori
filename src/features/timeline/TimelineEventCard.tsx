import { ShieldCheck, ShieldQuestion, Eye, type LucideIcon } from "lucide-react";
import { eventTypeIcons } from "../../domain/constants";
import type { LaidOutTimelineItem, TimelineDensity } from "../../lib/timeline/collisionLayout";
import { focusStateClassName, type EventFocusState } from "../../lib/timeline/focusState";
import type { TimelineEvent, TrustLevel } from "../../domain/types";
import { buildTimelineEventCardViewModel } from "./lib/timelineCards";

const TRUST_ICONS: Record<TrustLevel, LucideIcon> = {
  verified: ShieldCheck,
  observed: Eye,
  inferred: ShieldQuestion,
};

/**
 * Event card.
 *
 * Reads from `TimelineEventCardViewModel` (built once per event) so the JSX
 * only handles layout + class names. The view model carries the time label,
 * trust glyph, footer meta, aria label, and tooltip — never recompute those
 * inline.
 */
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
  const vm = buildTimelineEventCardViewModel(event);
  const Icon = eventTypeIcons[event.type];
  const TrustIcon = TRUST_ICONS[event.trustLevel];
  const compact = density === "compact";

  return (
    <button
      className={`event-card card-${vm.tone} trust-${vm.trust.tone} ${focusStateClassName(focusState)} ${compact ? "is-compact" : ""}`}
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
      aria-label={vm.ariaLabel}
      title={vm.buttonTitle}
    >
      <header className="event-card-header">
        <span className={`event-card-time tone-${vm.tone}`}>
          <Icon size={11} aria-hidden="true" />
          {vm.timeLabel}
        </span>
        <span
          className={`event-card-trust trust-${vm.trust.tone}`}
          title={vm.trust.tooltip}
          aria-hidden="true"
        >
          {/* Identical badge width across all trust levels so card headers
              never jitter when you scan a lane. Confidence detail lives in
              the inspector + the `title` tooltip. */}
          <TrustIcon size={11} />
        </span>
      </header>
      <strong className="event-card-title">{vm.title}</strong>
      {!compact && vm.metaParts.length > 0 ? (
        <footer className="event-card-footer">
          <span className="event-card-meta">{vm.metaParts.join(" · ")}</span>
        </footer>
      ) : null}
    </button>
  );
}
