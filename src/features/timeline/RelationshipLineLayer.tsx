import { useMemo } from "react";
import type { Relationship } from "../../domain/types";
import type { LaidOutTimelineItem } from "../../lib/timeline/collisionLayout";
import { getActivityLaneVisuals, type ActivityLaneId } from "../../lib/timeline/activityModel";
import {
  buildVisibleConnectors,
  defaultConnectorCap,
} from "../../lib/timeline/relationshipPolicy";

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
  const connectors = useMemo(
    () =>
      buildVisibleConnectors({
        mode,
        focusedSet,
        focusActive,
        relationships,
        eventAnchorIndex: eventAnchorLayouts,
        toneOfLane: (laneType: ActivityLaneId) => getActivityLaneVisuals(laneType).tone,
        maxConnectors: defaultConnectorCap(mode),
      }),
    [mode, focusedSet, focusActive, relationships, eventAnchorLayouts],
  );

  if (!connectors.length) return null;

  return (
    <svg
      className="connection-layer"
      viewBox={`0 0 ${frameWidth} ${frameHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
    >
      {connectors.map((connector) => {
        const from = itemLayouts.get(connector.from.itemId) ?? connector.from;
        const to = itemLayouts.get(connector.to.itemId) ?? connector.to;
        const isForward = from.anchorRight.x <= to.anchorLeft.x;
        const start = isForward ? from.anchorRight : from.anchorLeft;
        const end = isForward ? to.anchorLeft : to.anchorRight;
        const midX = (start.x + end.x) / 2;
        const className = `connector tone-${connector.tone} ${mode} ${focusActive ? "active" : "subtle"}`;

        return (
          <path
            key={connector.id}
            className={className}
            strokeWidth={connector.weight > 1 ? 1.8 : 1.15}
            d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`}
          />
        );
      })}
    </svg>
  );
}
