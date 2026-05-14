import { eventTypeTone } from "../../domain/constants";
import type { Relationship } from "../../domain/types";
import type { LaidOutTimelineItem } from "../../lib/timeline/collisionLayout";

export function RelationshipLineLayer({
  itemLayouts,
  eventAnchorLayouts,
  relationships,
  focusedSet,
  focusActive,
  mode,
  frameWidth,
  frameHeight,
}: {
  itemLayouts: Map<string, LaidOutTimelineItem>;
  eventAnchorLayouts: Map<string, LaidOutTimelineItem>;
  relationships: Relationship[];
  focusedSet: Set<string>;
  focusActive: boolean;
  mode: "timeline" | "flow";
  frameWidth: number;
  frameHeight: number;
}) {
  if (mode === "timeline") return null;
  if (!eventAnchorLayouts.size) return null;

  // Only render relationships that touch the focus neighbourhood. The previous
  // behaviour drew every edge by default, which buried the cards under a
  // curtain of lines. Selecting an event or entering Flow mode lights up the
  // relevant subgraph; otherwise the canvas stays clean.
  const visible = relationships
    .filter((relationship) => focusedSet.has(relationship.fromId) && focusedSet.has(relationship.toId))
    .slice(0, mode === "flow" ? 12 : 5);

  if (visible.length === 0) return null;

  const aggregated = new Map<string, { from: LaidOutTimelineItem; to: LaidOutTimelineItem; count: number; tone: string }>();
  for (const relationship of visible) {
    const from = eventAnchorLayouts.get(relationship.fromId);
    const to = eventAnchorLayouts.get(relationship.toId);
    if (!from || !to || from.itemId === to.itemId) continue;

    const key = `${from.itemId}->${to.itemId}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      aggregated.set(key, {
        from,
        to,
        count: 1,
        tone: eventTypeTone[from.laneType],
      });
    }
  }

  return (
    <svg
      className="connection-layer"
      viewBox={`0 0 ${frameWidth} ${frameHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
    >
      {[...aggregated.entries()].map(([key, aggregate]) => {
        const from = itemLayouts.get(aggregate.from.itemId) ?? aggregate.from;
        const to = itemLayouts.get(aggregate.to.itemId) ?? aggregate.to;
        const isForward = from.anchorRight.x <= to.anchorLeft.x;
        const start = isForward ? from.anchorRight : from.anchorLeft;
        const end = isForward ? to.anchorLeft : to.anchorRight;
        const midX = (start.x + end.x) / 2;

        return (
          <path
            key={key}
            className={`connector tone-${aggregate.tone} ${mode} ${focusActive ? "active" : "subtle"}`}
            strokeWidth={aggregate.count > 1 ? 1.8 : 1.15}
            d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`}
          />
        );
      })}
    </svg>
  );
}
