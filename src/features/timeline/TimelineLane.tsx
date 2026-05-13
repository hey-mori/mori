import type { LucideIcon } from "lucide-react";
import { TimelineEventCard } from "./TimelineEventCard";
import { TimelineBundleCard } from "./TimelineBundleCard";
import { eventTypeTone } from "../../domain/constants";
import type { EventType, TimelineEvent } from "../../domain/types";
import type { LaidOutTimelineItem, LaneLayout, TimelineDensity } from "../../lib/timeline/collisionLayout";
import type { TimelineDisplayItem } from "../../lib/timeline/displayItems";
import { getEventFocusState } from "../../lib/timeline/focusState";

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
}: {
  icon: LucideIcon;
  label: string;
  tone: EventType;
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
}) {
  const colorClass = `lane-tone-${eventTypeTone[tone]}`;
  const isEmpty = items.length === 0;
  return (
    <div
      className={`lane ${colorClass} ${isEmpty ? "is-empty" : ""}`}
      style={{ top: `${lane.top}px`, height: `${lane.height}px` }}
    >
      <div className="lane-label" style={{ width: `${laneLabelWidthPx}px` }}>
        <span className="lane-label-icon">
          <Icon size={14} />
        </span>
        <strong>{label}</strong>
        {eventCount > 0 ? <span className="lane-label-count">{eventCount}</span> : null}
      </div>
      {items.map((item) => {
        const layout = layouts.get(item.id);
        if (!layout) return null;
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
              layout={layout}
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
            layout={layout}
            density={density}
            focusState={focusState}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </div>
  );
}
