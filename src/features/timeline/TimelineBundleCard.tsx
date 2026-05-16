import { Layers3 } from "lucide-react";
import type { LaidOutTimelineItem, TimelineDensity } from "../../lib/timeline/collisionLayout";
import { focusStateClassName, type EventFocusState } from "../../lib/timeline/focusState";
import type { TimelineDisplayBundle } from "../../lib/timeline/displayItems";
import { buildTimelineBundleViewModel } from "./lib/timelineCards";
import { densityClassName } from "./TimelineEventCard";

/**
 * Bundle card.
 *
 * Reads from `TimelineBundleViewModel` (built once per bundle) so the JSX
 * only handles layout + class names. The view model carries the time range,
 * tone, type-mix label, footer parts, aria label, and tooltip.
 */
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
  const vm = buildTimelineBundleViewModel(bundle);
  const showFooter = density === "comfortable";

  return (
    <button
      className={`timeline-bundle-card card-${vm.tone} ${focusStateClassName(focusState)} ${densityClassName(density)}`}
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
      aria-label={vm.ariaLabel}
      title={vm.buttonTitle}
    >
      <header className="timeline-bundle-card-header">
        <span className={`event-card-time tone-${vm.tone}`}>
          <Layers3 size={11} aria-hidden="true" />
          {vm.timeLabel}
        </span>
        <span className="timeline-bundle-count">{bundle.count}개 이벤트</span>
      </header>
      <strong className="timeline-bundle-title">{vm.title}</strong>
      {showFooter && vm.typeMixLabel ? (
        <footer className="timeline-bundle-footer">
          <span>{vm.typeMixLabel}</span>
        </footer>
      ) : null}
    </button>
  );
}
