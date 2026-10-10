import { useCallback, useState, type FocusEvent, type MouseEvent } from "react";
import { Layers3 } from "lucide-react";
import type { LaidOutTimelineItem, TimelineDensity } from "../../lib/timeline/collisionLayout";
import { focusStateClassName, type EventFocusState } from "../../lib/timeline/focusState";
import type { TimelineDisplayBundle } from "../../lib/timeline/displayItems";
import { buildTimelineBundleViewModel } from "./lib/timelineCards";
import {
  densityClassName,
  FloatingTimelineHoverCard,
  type TimelineHoverPreview,
} from "./TimelineEventCard";

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
  const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);
  const preview: TimelineHoverPreview = {
    meta: [vm.timeLabel, `${bundle.count}개 이벤트`, vm.typeMixLabel].filter((item): item is string =>
      Boolean(item),
    ),
    title: vm.title,
    summary: bundle.summary,
  };

  const showHover = useCallback(
    (target: HTMLElement) => {
      setHoverAnchor(target.getBoundingClientRect());
      onHover(bundle.id);
    },
    [bundle.id, onHover],
  );

  const hideHover = useCallback(() => {
    setHoverAnchor(null);
    onHover(null);
  }, [onHover]);

  return (
    <>
      <button
        className={`timeline-bundle-card card-${vm.tone} ${focusStateClassName(focusState)} ${densityClassName(density)}`}
        onClick={() => onSelect(bundle.id)}
        onMouseEnter={(e: MouseEvent<HTMLButtonElement>) => showHover(e.currentTarget)}
        onMouseLeave={hideHover}
        onFocus={(e: FocusEvent<HTMLButtonElement>) => showHover(e.currentTarget)}
        onBlur={hideHover}
        style={{
          left: `${layout.x}px`,
          top: `${layout.y}px`,
          width: `${layout.width}px`,
          height: `${layout.height}px`,
        }}
        type="button"
        data-item-id={bundle.id}
        aria-pressed={focusState === "selected"}
        aria-label={vm.ariaLabel}
        data-preview={`${vm.timeLabel} · ${bundle.count}개 이벤트\n${vm.title}\n${bundle.summary}`}
      >
        <span className="event-card-row">
          <span className={`event-card-source-mark tone-${vm.tone} mark-bundle`} aria-hidden="true">
            <Layers3 size={12} strokeWidth={2.2} />
          </span>
          <span className="event-card-time">{vm.timeLabel}</span>
          <span className="timeline-bundle-count">{bundle.count}</span>
          <strong className="timeline-bundle-title">{vm.title}</strong>
        </span>
      </button>
      <FloatingTimelineHoverCard anchor={hoverAnchor} preview={preview} />
    </>
  );
}
