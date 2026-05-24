import { Layers3 } from "lucide-react";
import { eventTypeIcons, eventTypeLabels } from "../../domain/constants";
import type { TimelineEvent } from "../../domain/types";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import { sortDisplayItemsChronologically } from "../../lib/timeline/displayItems";
import type { TimelineRenderModel } from "../../lib/timeline/timelineViewModel";
import {
  buildTimelineBundleViewModel,
  buildTimelineEventCardViewModel,
  buildTrustGlyph,
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
  density,
}: {
  model: TimelineRenderModel;
  selectedItemId: string | null;
  onSelect: (itemId: string) => void;
  density: TimelineDensity;
}) {
  const items = sortDisplayItemsChronologically(model.visibleDisplayItems);
  if (items.length === 0) return null;

  return (
    <ol className={`timeline-chrono-list is-${density}`} aria-label="Timeline chronological list">
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
              {selected ? (
                <div className="timeline-chrono-detail" role="region">
                  <p>{item.summary}</p>
                  <small>
                    포함된 이벤트:{" "}
                    {item.members.slice(0, 5).map((member) => member.title).join(", ")}
                    {item.members.length > 5 ? ` 외 ${item.members.length - 5}건` : ""}
                  </small>
                </div>
              ) : null}
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
            {selected ? (
              <div className="timeline-chrono-detail" role="region">
                <p>{item.event.summary}</p>
                <small>{eventDetailMeta(item.event)}</small>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One calm detail line for a selected chronological-list row. At narrow
 * widths there is no side inspector, so the selected row discloses its
 * trust + linked-item counts inline — progressive disclosure on selection.
 */
function eventDetailMeta(event: TimelineEvent): string {
  const parts = [buildTrustGlyph(event.trustLevel, event.confidence).label];
  if (event.trustLevel === "inferred") {
    parts.push(`신뢰도 ${Math.round(event.confidence * 100)}%`);
  }
  if (event.sourceRefs.length > 0) parts.push(`근거 ${event.sourceRefs.length}`);
  if (event.linkedIssueIds.length > 0) parts.push(`이슈 ${event.linkedIssueIds.length}`);
  if (event.linkedDecisionIds.length > 0) parts.push(`결정 ${event.linkedDecisionIds.length}`);
  return parts.join(" · ");
}
