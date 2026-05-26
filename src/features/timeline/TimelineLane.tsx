import type { LucideIcon } from "lucide-react";
import { TimelineEventCard } from "./TimelineEventCard";
import { TimelineBundleCard } from "./TimelineBundleCard";
import type { SourceRef } from "../../domain/types";
import type { LaidOutTimelineItem, LaneLayout, TimelineDensity } from "../../lib/timeline/collisionLayout";
import type { TimelineDisplayItem } from "../../lib/timeline/displayItems";
import { getEventFocusState } from "../../lib/timeline/focusState";
import type { MoriMenuItemSpec } from "../../components/ui/MoriActionMenu";

/**
 * One lane row.
 *
 * The lane label is `position: sticky; left: 0` (driven by CSS) so it stays
 * pinned to the left edge of the scrolling frame during horizontal scroll.
 * The label's parent (the lane row itself) is `position: absolute`, which
 * is fine — `position: sticky` honours its nearest scrolling ancestor, not
 * its positioned ancestor.
 */
export function TimelineLane({
  icon: Icon,
  label,
  tone,
  lane,
  laneLabelWidthPx,
  items,
  eventCount,
  layouts,
  density,
  selectedItemId,
  focusedSet,
  onSelect,
  onHover,
  eventMenuItems,
  sourceIndex,
}: {
  icon: LucideIcon;
  label: string;
  tone: string;
  lane: LaneLayout;
  laneLabelWidthPx: number;
  items: TimelineDisplayItem[];
  eventCount: number;
  layouts: Map<string, LaidOutTimelineItem>;
  density: TimelineDensity;
  selectedItemId: string | null;
  focusedSet: Set<string>;
  onSelect: (itemId: string) => void;
  onHover: (itemId: string | null) => void;
  eventMenuItems?: (event: TimelineDisplayItem & { kind: "event" }) => MoriMenuItemSpec[];
  sourceIndex?: ReadonlyMap<string, SourceRef>;
}) {
  const colorClass = `lane-tone-${tone}`;
  const isEmpty = items.length === 0;
  // Skip empty lanes entirely — they used to render as a dim 64px band even
  // when they had no events, which made the canvas look busier than it is.
  // The lane still exists in the layout's lanes[] array for tests / callers.
  if (isEmpty) return null;
  return (
    <div
      className={`lane ${colorClass}`}
      style={{ top: `${lane.top}px`, height: `${lane.height}px` }}
    >
      <div className="lane-label" style={{ width: `${laneLabelWidthPx}px` }}>
        <span className="lane-label-icon">
          <Icon size={14} aria-hidden="true" />
        </span>
        <strong>{label}</strong>
        {eventCount > 0 ? <span className="lane-label-count">{eventCount}</span> : null}
      </div>
      {items.map((item) => {
        const layout = layouts.get(item.id);
        if (!layout) return null;
        const visualLayout = { ...layout, y: layout.y - lane.top };
        const focusState = getEventFocusState({
          itemId: item.id,
          itemEntityIds: item.memberEventIds,
          selectedItemId,
          focusedSet,
        });

        if (item.kind === "bundle") {
          return (
            <TimelineBundleCard
              key={item.id}
              bundle={item}
              layout={visualLayout}
              density={density}
              focusState={focusState}
              onSelect={onSelect}
              onHover={onHover}
            />
          );
        }

        return (
          <TimelineEventCard
            key={item.id}
            event={item.event}
            layout={visualLayout}
            density={density}
            focusState={focusState}
            onSelect={onSelect}
            onHover={onHover}
            menuItems={eventMenuItems?.(item)}
            sourceIndex={sourceIndex}
          />
        );
      })}
    </div>
  );
}
