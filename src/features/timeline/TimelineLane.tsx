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
  dimmed = false,
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
  /** De-emphasise the lane when a category filter excludes it (never hidden). */
  dimmed?: boolean;
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
  // Every lane stays visible at one uniform height. An empty lane shows just
  // its label + a 0 count; a filtered-out lane reads de-emphasised (`is-dimmed`)
  // but is never removed — the category filter highlights, it does not hide.
  return (
    <div
      className={`lane ${colorClass}${isEmpty ? " is-empty" : ""}${dimmed ? " is-dimmed" : ""}`}
      style={{ top: `${lane.top}px`, height: `${lane.height}px` }}
    >
      <div className="lane-label" style={{ width: `${laneLabelWidthPx}px` }}>
        <span className="lane-label-icon">
          <Icon size={14} aria-hidden="true" />
        </span>
        <strong>{label}</strong>
        <span className={`lane-label-count${eventCount === 0 ? " is-zero" : ""}`}>
          {eventCount}
        </span>
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
