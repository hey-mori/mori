import { eventTypeTone } from "../../domain/constants";
import type { Relationship } from "../../domain/types";
import type { LaidOutEvent } from "../../lib/timeline/collisionLayout";

export function RelationshipLineLayer({
  layouts,
  relationships,
  focusedSet,
  focusActive,
  frameWidth,
  frameHeight,
}: {
  layouts: Map<string, LaidOutEvent>;
  relationships: Relationship[];
  focusedSet: Set<string>;
  focusActive: boolean;
  frameWidth: number;
  frameHeight: number;
}) {
  if (!layouts.size) return null;

  return (
    <svg
      className="connection-layer"
      viewBox={`0 0 ${frameWidth} ${frameHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
    >
      {relationships.map((relationship) => {
        const from = layouts.get(relationship.fromId);
        const to = layouts.get(relationship.toId);
        if (!from || !to) return null;
        const active = focusedSet.has(from.eventId) && focusedSet.has(to.eventId);
        if (focusActive && !active) return null;

        // Anchor at the right edge of the upstream card and the left edge of
        // the downstream card so the curve enters/exits at the card border
        // instead of crashing into card text.
        const isForward = from.anchorRight.x <= to.anchorLeft.x;
        const start = isForward ? from.anchorRight : from.anchorLeft;
        const end = isForward ? to.anchorLeft : to.anchorRight;
        const midX = (start.x + end.x) / 2;

        return (
          <path
            key={relationship.id}
            className={`connector tone-${eventTypeTone[from.type]} ${active ? "active" : "context"}`}
            d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`}
          />
        );
      })}
    </svg>
  );
}
