import { Search } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { eventTypeIcons, eventTypeLabels, laneOrder } from "../../domain/constants";
import type { Relationship, TimelineEvent } from "../../domain/types";
import {
  computeTimelineLayout,
  indexLayout,
  type TimelineDensity,
} from "../../lib/timeline/collisionLayout";
import { computeAxisTicks } from "../../lib/timeline/timeScale";
import type { TimelineRange } from "../../lib/timeline/layout";
import { TimelineAxis } from "./TimelineAxis";
import { TimelineLane } from "./TimelineLane";
import { TimelineMiniMap } from "./TimelineMiniMap";
import { RelationshipLineLayer } from "./RelationshipLineLayer";

export type TimelineCanvasProps = {
  events: TimelineEvent[];
  relationships: Relationship[];
  range: TimelineRange;
  selectedEventId: string | null;
  focusedSet: Set<string>;
  mode: "timeline" | "flow";
  density: TimelineDensity;
  onSelect: (eventId: string) => void;
  onHover: (eventId: string | null) => void;
};

const FRAME_WIDTH = 1200;

export function TimelineCanvas({
  events,
  relationships,
  range,
  selectedEventId,
  focusedSet,
  mode,
  density,
  onSelect,
  onHover,
}: TimelineCanvasProps) {
  const layout = useMemo(
    () =>
      computeTimelineLayout(events, range, {
        frameWidth: FRAME_WIDTH,
        density,
        laneOrder,
      }),
    [events, range, density],
  );
  const layoutIndex = useMemo(() => indexLayout(layout), [layout]);
  const ticks = useMemo(() => computeAxisTicks(range, { maxTicks: 6 }), [range]);

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
  for (const lane of layout.lanes) laneEvents.set(lane.type, []);
  for (const event of events) {
    const bucket = laneEvents.get(event.type);
    if (bucket) bucket.push(event);
  }

  const focusActive = mode === "flow" || focusedSet.size > 0;

  return (
    <div
      className={`timeline-frame ${mode === "flow" ? "compact" : ""}`}
      style={{ width: `${FRAME_WIDTH}px`, minHeight: `${layout.frameHeight}px` }}
    >
      <TimelineAxis ticks={ticks} frameWidth={FRAME_WIDTH} />
      <RelationshipLineLayer
        layouts={layoutIndex}
        relationships={relationships}
        focusedSet={focusedSet}
        focusActive={focusActive}
        frameWidth={FRAME_WIDTH}
        frameHeight={layout.frameHeight}
      />
      <div className="lanes" style={{ height: `${layout.frameHeight - layout.laneOffsetPx}px` }}>
        {layout.lanes.map((lane) => (
          <TimelineLane
            key={lane.type}
            icon={eventTypeIcons[lane.type]}
            label={eventTypeLabels[lane.type]}
            lane={lane}
            events={laneEvents.get(lane.type) ?? []}
            layouts={layoutIndex}
            density={density}
            selectedEventId={selectedEventId}
            focusedSet={focusedSet}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </div>
      <TimelineMiniMap
        layout={layout}
        ticks={ticks}
        selectedEventId={selectedEventId}
        focusedSet={focusedSet}
      />
    </div>
  );
}
