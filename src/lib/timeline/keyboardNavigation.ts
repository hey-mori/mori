import type { ActivityLaneId } from "./activityModel";
import type { TimelineDisplayItem } from "./displayItems";

/**
 * Keyboard navigation for the swimlane timeline.
 *
 *   ← / →  move to the previous / next item in the **same lane** (by time)
 *   ↑ / ↓  move to the nearest item in the adjacent non-empty lane
 *
 * Pure id-in / id-out helpers over the render model's display items, so they
 * are trivially testable and the canvas only has to wire a keydown handler.
 * Selection is resolved by display-item `id` (an event id or a bundle id),
 * which the render model already accepts, so a returned id can be handed
 * straight to `setSelectedEventId`.
 */

type NavItem = Pick<TimelineDisplayItem, "id" | "laneType" | "start" | "memberEventIds">;

function startMs(item: NavItem): number {
  return new Date(item.start).getTime();
}

function findSelected(
  items: readonly NavItem[],
  selectedId: string | null,
): NavItem | null {
  if (items.length === 0) return null;
  if (!selectedId) return items[0] ?? null;
  return (
    items.find((item) => item.id === selectedId) ??
    items.find((item) => item.memberEventIds.includes(selectedId)) ??
    null
  );
}

/**
 * Previous / next display item in the same lane, ordered by start time.
 * Returns the target item's id, or `null` when there is no neighbour (the
 * selection is at the lane edge).
 */
export function selectInLane(
  items: readonly NavItem[],
  selectedId: string | null,
  direction: "prev" | "next",
): string | null {
  const current = findSelected(items, selectedId);
  if (!current) return null;
  const lane = items
    .filter((item) => item.laneType === current.laneType)
    .sort((a, b) => startMs(a) - startMs(b) || a.id.localeCompare(b.id));
  const index = lane.findIndex((item) => item.id === current.id);
  if (index === -1) return null;
  const target = lane[direction === "next" ? index + 1 : index - 1];
  return target ? target.id : null;
}

/**
 * Move to the nearest item (by start time) in the next non-empty lane up or
 * down, walking `laneOrder`. Returns the target item's id, or `null` when
 * there is no lane in that direction.
 */
export function selectAcrossLane(
  items: readonly NavItem[],
  selectedId: string | null,
  direction: "up" | "down",
  laneOrder: readonly ActivityLaneId[],
): string | null {
  const current = findSelected(items, selectedId);
  if (!current) return null;
  const lanesWithItems = laneOrder.filter((lane) =>
    items.some((item) => item.laneType === lane),
  );
  const laneIndex = lanesWithItems.indexOf(current.laneType);
  if (laneIndex === -1) return null;
  const targetLane = lanesWithItems[laneIndex + (direction === "down" ? 1 : -1)];
  if (!targetLane) return null;

  const at = startMs(current);
  let best: NavItem | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const item of items) {
    if (item.laneType !== targetLane) continue;
    const delta = Math.abs(startMs(item) - at);
    if (delta < bestDelta || (delta === bestDelta && best !== null && item.id < best.id)) {
      best = item;
      bestDelta = delta;
    }
  }
  return best ? best.id : null;
}
