import { eventTypeIcons } from "../../domain/constants";
import type { LaidOutTimelineItem, TimelineDensity } from "../../lib/timeline/collisionLayout";
import { focusStateClassName, type EventFocusState } from "../../lib/timeline/focusState";
import type { TimelineEvent } from "../../domain/types";
import { buildTimelineEventCardViewModel } from "./lib/timelineCards";

/**
 * Event card.
 *
 * The card's job is to answer "when + what" at a glance: a muted time row,
 * a prominent title, and one calm meta signal. Trust level is detail — it
 * lives in the inspector, not stamped on every card, so the lane stays
 * scannable.
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
  // Progressive disclosure: only the comfortable tier carries footer meta on
  // the card. Compact and dense move that detail into the inspector.
  const densityClass = densityClassName(density);
  const showFooter = density === "comfortable";

  return (
    <button
      className={`event-card card-${vm.tone} ${focusStateClassName(focusState)} ${densityClass}`}
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
      </header>
      <strong className="event-card-title">{vm.title}</strong>
      {showFooter && vm.primaryMeta ? (
        <footer className="event-card-footer">
          <span className="event-card-meta">{vm.primaryMeta}</span>
        </footer>
      ) : null}
    </button>
  );
}

/** Map a density mode to the card's modifier class (comfortable = none). */
export function densityClassName(density: TimelineDensity): string {
  if (density === "dense") return "is-dense";
  if (density === "compact") return "is-compact";
  return "";
}
