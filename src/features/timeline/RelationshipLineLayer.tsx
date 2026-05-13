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

  // Only render relationships that touch the focus neighbourhood. The previous
  // behaviour drew every edge by default, which buried the cards under a
  // curtain of lines. Selecting an event or entering Flow mode lights up the
  // relevant subgraph; otherwise the canvas stays clean.
  const visible = relationships.filter((relationship) => {
    return focusedSet.has(relationship.fromId) && focusedSet.has(relationship.toId);
  });

  if (visible.length === 0) return null;

  return (
    <svg
      className="connection-layer"
      viewBox={`0 0 ${frameWidth} ${frameHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
    >
      {visible.map((relationship) => {
        const from = layouts.get(relationship.fromId);
        const to = layouts.get(relationship.toId);
        if (!from || !to) return null;
        const isForward = from.anchorRight.x <= to.anchorLeft.x;
        const start = isForward ? from.anchorRight : from.anchorLeft;
        const end = isForward ? to.anchorLeft : to.anchorRight;
        const midX = (start.x + end.x) / 2;

        return (
          <path
            key={relationship.id}
            className={`connector tone-${eventTypeTone[from.type]} ${focusActive ? "active" : "subtle"}`}
            d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`}
          />
        );
      })}
    </svg>
  );
}
