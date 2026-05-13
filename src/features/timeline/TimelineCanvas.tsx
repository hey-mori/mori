import { Search } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { eventTypeIcons, eventTypeLabels, laneOrder } from "../../domain/constants";
import type { Relationship } from "../../domain/types";
import { groupEventsByLane, type PositionedEvent } from "../../lib/timeline/layout";
import { computeAxisTicks } from "../../lib/timeline/timeScale";
import type { TimelineRange } from "../../lib/timeline/layout";
import { TimelineAxis } from "./TimelineAxis";
import { TimelineLane } from "./TimelineLane";
import { TimelineMiniMap } from "./TimelineMiniMap";
import { RelationshipLineLayer } from "./RelationshipLineLayer";

export type TimelineCanvasProps = {
  events: PositionedEvent[];
  relationships: Relationship[];
  range: TimelineRange;
  selectedEventId: string | null;
  focusedSet: Set<string>;
  mode: "timeline" | "flow";
  onSelect: (eventId: string) => void;
  onHover: (eventId: string | null) => void;
};

const LANE_OFFSET = 56;
const FRAME_WIDTH = 1180;

export function TimelineCanvas({
  events,
  relationships,
  range,
  selectedEventId,
  focusedSet,
  mode,
  onSelect,
  onHover,
}: TimelineCanvasProps) {
  if (!events.length) {
    return (
      <EmptyState
        icon={Search}
        title="No events match your current filters"
        description="Adjust the filters above, or import a source from Sources / Evidence to populate this timeline."
      />
    );
  }

  const grouped = groupEventsByLane(events, laneOrder);
  const laneHeight = mode === "flow" ? 102 : 122;
  const cardWidth = mode === "flow" ? 184 : 198;
  const ticks = computeAxisTicks(range, { maxTicks: 6 });

  return (
    <div className={`timeline-frame ${mode === "flow" ? "compact" : ""}`}>
      <TimelineAxis ticks={ticks} />
      <RelationshipLineLayer
        events={events}
        relationships={relationships}
        focusedSet={focusedSet}
        frameWidth={FRAME_WIDTH}
        laneHeight={laneHeight}
        cardWidth={cardWidth}
        laneOffset={LANE_OFFSET}
      />
      <div className="lanes">
        {laneOrder.map((type) => (
          <TimelineLane
            key={type}
            icon={eventTypeIcons[type]}
            label={eventTypeLabels[type]}
            events={grouped[type] ?? []}
            height={laneHeight}
            cardWidth={cardWidth}
            selectedEventId={selectedEventId}
            focusedSet={focusedSet}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </div>
      <TimelineMiniMap
        events={events}
        ticks={ticks}
        selectedEventId={selectedEventId}
        focusedSet={focusedSet}
      />
    </div>
  );
}
