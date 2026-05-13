import { Search } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { eventTypeIcons, eventTypeLabels, laneOrder } from "../../domain/constants";
import type { EventType, Relationship, TimelineEvent, Decision } from "../../domain/types";
import { createTimelineDisplayItems } from "../../lib/timeline/bundleEvents";
import {
  computeSingleRowLaneLayout,
  indexEventAnchors,
  indexLayout,
  type TimelineDensity,
} from "../../lib/timeline/singleRowLaneLayout";
import { isTimelineBundle, type TimelineDisplayItem } from "../../lib/timeline/displayItems";
import { computeAxisTicks } from "../../lib/timeline/timeScale";
import type { TimelineRange } from "../../lib/timeline/layout";
import { TimelineAxis } from "./TimelineAxis";
import { TimelineLane } from "./TimelineLane";
import { RelationshipLineLayer } from "./RelationshipLineLayer";

export type TimelineCanvasProps = {
  events: TimelineEvent[];
  relationships: Relationship[];
  decisions: Decision[];
  range: TimelineRange;
  selectedItemId: string | null;
  focusedSet: Set<string>;
  mode: "timeline" | "flow";
  density: TimelineDensity;
  onSelect: (itemId: string) => void;
  onHover: (itemId: string | null) => void;
};

const MIN_FRAME_WIDTH = 1080;
const MAX_FRAME_WIDTH = 1600;
const DEFAULT_FRAME_WIDTH = 1160;
const LANE_LABEL_WIDTH = 148;

export function TimelineCanvas({
  events,
  relationships,
  decisions,
  range,
  selectedItemId,
  focusedSet,
  mode,
  density,
  onSelect,
  onHover,
}: TimelineCanvasProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [frameWidth, setFrameWidth] = useState<number>(DEFAULT_FRAME_WIDTH);

  // Grow the canvas with the surrounding column so wide laptops fill the space
  // and narrow ones get an honest horizontal scroll instead of a squished UI.
  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth;
      if (!width) return;
      setFrameWidth(Math.min(MAX_FRAME_WIDTH, Math.max(MIN_FRAME_WIDTH, width)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const activeLaneOrder = useMemo<EventType[]>(() => {
    if (!events.length) return laneOrder;
    return laneOrder;
  }, [events.length]);

  const displayItems = useMemo<TimelineDisplayItem[]>(
    () =>
      createTimelineDisplayItems(events, relationships, {
        timeWindowMinutes: density === "comfortable" ? 12 : 10,
        minEventsForBundle: 3,
        preserveSelectedEventId: selectedItemId,
        preserveImportantEventIds: events
          .filter((event) => event.type === "decision" || event.linkedDecisionIds.length > 0 || event.sourceRefs.length > 1)
          .map((event) => event.id),
        maxVisibleItemsPerLane: density === "comfortable" ? 4 : 5,
        laneDensity: density,
        decisions,
      }),
    [events, relationships, selectedItemId, density, decisions],
  );

  const layout = useMemo(
    () =>
      computeSingleRowLaneLayout(displayItems, range, {
        frameWidth,
        density,
        laneOrder: activeLaneOrder,
        laneLabelWidthPx: LANE_LABEL_WIDTH,
      }),
    [displayItems, range, density, activeLaneOrder, frameWidth],
  );
  const layoutIndex = useMemo(() => indexLayout(layout), [layout]);
  const eventAnchorIndex = useMemo(() => indexEventAnchors(layout), [layout]);
  const ticks = useMemo(() => computeAxisTicks(range, { maxTicks: 6 }), [range]);

  // Default to "only the selected event's neighbourhood draws connectors" —
  // showing every relationship at once turned the canvas into a curtain of
  // lines. Flow mode and explicit focus still light up the wider graph.
  const focusActive = mode === "flow" || focusedSet.size > 1;

  if (!events.length) {
    return (
      <EmptyState
        icon={Search}
        title="No events match your current filters"
        description="Adjust the filters above, or import a source from Sources / Evidence to populate this timeline."
      />
    );
  }

  const laneEvents = new Map<string, TimelineEvent[]>();
  const laneItems = new Map<string, TimelineDisplayItem[]>();
  for (const lane of layout.lanes) {
    laneEvents.set(lane.type, []);
    laneItems.set(lane.type, []);
  }
  for (const event of events) {
    laneEvents.get(event.type)?.push(event);
  }
  for (const item of displayItems) {
    laneItems.get(item.laneType)?.push(item);
  }

  return (
    <div className="timeline-scroller" ref={scrollerRef}>
      <div
        className={`timeline-frame ${mode === "flow" ? "compact" : ""}`}
        style={{ width: `${frameWidth}px`, height: `${layout.frameHeight}px` }}
      >
        <TimelineAxis
          ticks={ticks}
          frameWidth={frameWidth}
          contentLeftPx={layout.contentLeftPx}
          contentWidthPx={layout.contentWidthPx}
        />
        <RelationshipLineLayer
          itemLayouts={layoutIndex}
          eventAnchorLayouts={eventAnchorIndex}
          relationships={relationships}
          focusedSet={focusedSet}
          focusActive={focusActive}
          mode={mode}
          frameWidth={frameWidth}
          frameHeight={layout.frameHeight}
        />
        <div className="lanes" style={{ height: `${layout.frameHeight - layout.laneOffsetPx}px` }}>
          {layout.lanes.map((lane) => (
            <TimelineLane
              key={lane.type}
              icon={eventTypeIcons[lane.type]}
              label={eventTypeLabels[lane.type]}
              tone={lane.type}
              lane={lane}
              laneLabelWidthPx={layout.laneLabelWidthPx}
              items={laneItems.get(lane.type) ?? []}
              eventCount={(laneEvents.get(lane.type) ?? []).length}
              layouts={layoutIndex}
              density={density}
              selectedItemId={selectedItemId}
              focusedSet={focusedSet}
              onSelect={onSelect}
              onHover={onHover}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
