import { eventTypeTone } from "../../domain/constants";
import type { Relationship } from "../../domain/types";
import type { PositionedEvent } from "../../lib/timeline/layout";

export function RelationshipLineLayer({
  events,
  relationships,
  focusedSet,
  frameWidth,
  laneHeight,
  cardWidth,
  laneOffset,
}: {
  events: PositionedEvent[];
  relationships: Relationship[];
  focusedSet: Set<string>;
  frameWidth: number;
  laneHeight: number;
  cardWidth: number;
  laneOffset: number;
}) {
  if (!events.length) return null;
  const eventIndex = new Map(events.map((event) => [event.id, event] as const));
  const frameHeight = laneOffset + 8 * laneHeight;

  return (
    <svg
      className="connection-layer"
      viewBox={`0 0 ${frameWidth} ${frameHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {relationships.map((relationship) => {
        const from = eventIndex.get(relationship.fromId);
        const to = eventIndex.get(relationship.toId);
        if (!from || !to) return null;
        const active = focusedSet.has(from.id) && focusedSet.has(to.id);
        const x1 = (from.xPercent / 100) * frameWidth + cardWidth / 2;
        const y1 = laneOffset + from.laneIndex * laneHeight + laneHeight / 2;
        const x2 = (to.xPercent / 100) * frameWidth + cardWidth / 2;
        const y2 = laneOffset + to.laneIndex * laneHeight + laneHeight / 2;
        const mid = (x1 + x2) / 2;
        return (
          <path
            key={relationship.id}
            className={`connector tone-${eventTypeTone[from.type]} ${active ? "active" : "context"}`}
            d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
          />
        );
      })}
    </svg>
  );
}
