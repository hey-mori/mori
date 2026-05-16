import { Layers3 } from "lucide-react";
import { eventTypeIcons, eventTypeLabels } from "../../domain/constants";
import { sortDisplayItemsChronologically } from "../../lib/timeline/displayItems";
import type { TimelineRenderModel } from "../../lib/timeline/timelineViewModel";
import {
  buildTimelineBundleViewModel,
  buildTimelineEventCardViewModel,
} from "./lib/timelineCards";

/**
 * Narrow-width Timeline fallback.
 *
 * The swimlane canvas needs a wide frame and only scrolls horizontally. On
 * tablet / narrow widths that is awkward, so the Timeline renders this flat
 * vertical chronological list instead — every event and bundle in one
 * readable column, ordered by start time. Selecting a row drives the same
 * `selectedEventId` the canvas uses, so widening the window restores the
 * swimlane with the selection intact.
 */
export function TimelineChronoList({
  model,
  selectedItemId,
  onSelect,
}: {
  model: TimelineRenderModel;
  selectedItemId: string | null;
  onSelect: (itemId: string) => void;
}) {
  const items = sortDisplayItemsChronologically(model.visibleDisplayItems);
  if (items.length === 0) return null;

  return (
    <ol className="timeline-chrono-list" aria-label="Timeline chronological list">
      {items.map((item) => {
        const selected =
          item.id === selectedItemId ||
          (selectedItemId != null && item.memberEventIds.includes(selectedItemId));

        if (item.kind === "bundle") {
          const vm = buildTimelineBundleViewModel(item);
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`timeline-chrono-row card-${vm.tone} ${selected ? "is-selected" : ""}`}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(item.id)}
              >
                <span className="timeline-chrono-time">{vm.timeLabel}</span>
                <span className={`timeline-chrono-icon tone-${vm.tone}`}>
                  <Layers3 size={14} aria-hidden="true" />
                </span>
                <span className="timeline-chrono-body">
                  <strong>{vm.title}</strong>
                  <small>{vm.typeMixLabel}</small>
                </span>
                <span className="timeline-chrono-meta">{item.count}개 이벤트</span>
              </button>
            </li>
          );
        }

        const vm = buildTimelineEventCardViewModel(item.event);
        const Icon = eventTypeIcons[item.event.type];
        return (
          <li key={item.id}>
            <button
              type="button"
              className={`timeline-chrono-row card-${vm.tone} ${selected ? "is-selected" : ""}`}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(item.id)}
            >
              <span className="timeline-chrono-time">{vm.timeLabel}</span>
              <span className={`timeline-chrono-icon tone-${vm.tone}`}>
                <Icon size={14} aria-hidden="true" />
              </span>
              <span className="timeline-chrono-body">
                <strong>{vm.title}</strong>
                <small>
                  {eventTypeLabels[item.event.type]} · {vm.trust.label}
                </small>
              </span>
              {vm.primaryMeta ? (
                <span className="timeline-chrono-meta">{vm.primaryMeta}</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
