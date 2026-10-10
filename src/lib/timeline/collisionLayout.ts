import type { TimelineDisplayItem } from "./displayItems";
import { timestampToXPercent, type TimelineRange } from "./layout";
import type { ActivityLaneId } from "./activityModel";

export type TimelineDensity = "comfortable" | "compact" | "dense";

export type TimelineLayoutOptions = {
  frameWidth: number;
  density?: TimelineDensity;
  cardGapPx?: number;
  laneOffsetPx?: number;
  laneLabelWidthPx?: number;
  contentRightPaddingPx?: number;
  laneOrder: ActivityLaneId[];
};

export type LaidOutTimelineItem = {
  itemId: string;
  kind: TimelineDisplayItem["kind"];
  laneType: ActivityLaneId;
  memberEventIds: string[];
  rowIndex: number;
  x: number;
  y: number;
  width: number;
  /**
   * Free space to the right of the item, up to the next item in its lane (or
   * the content edge), capped at LABEL_ROOM_MAX. A card too narrow for text
   * prints its title here, beside its honest-width tick, so time and duration
   * stay exact while the timeline can still be read. 0 when there is no room.
   */
  labelRoom: number;
  /**
   * Free space to the LEFT of the item for its title, used only when there is
   * no room to the right (the last item before the content edge, or one
   * crowded by its successor). 0 otherwise. See `labelSides`.
   */
  labelLeftRoom: number;
  height: number;
  laneTop: number;
  laneHeight: number;
  anchorLeft: { x: number; y: number };
  anchorRight: { x: number; y: number };
  anchorCenter: { x: number; y: number };
};

export type LaneLayout = {
  type: ActivityLaneId;
  top: number;
  height: number;
  rowCount: number;
};

export type TimelineLayout = {
  items: LaidOutTimelineItem[];
  lanes: LaneLayout[];
  frameWidth: number;
  frameHeight: number;
  laneOffsetPx: number;
  laneLabelWidthPx: number;
  contentLeftPx: number;
  contentWidthPx: number;
  density: TimelineDensity;
  cardWidth: number;
  cardHeight: number;
  rowHeight: number;
};

// Event cards and bundle cards share one height per density mode, so the lane
// row height stays constant regardless of which items the lane carries. Compact
// cards are one-line time tokens; prose lives in the hover preview.
const DENSITY_CARD_HEIGHT: Record<TimelineDensity, number> = {
  comfortable: 68,
  compact: 56,
  dense: 28,
};

// Per-density widths. Event cards are drawn at their honest pixel span (see
// computeItemWidth), so `eventMin` is only the frame's minimum content width;
// a card too narrow for text prints its title beside it (labelRoom).
const DENSITY_WIDTH_BOUNDS: Record<
  TimelineDensity,
  { eventMin: number; eventMax: number; bundleMin: number; bundleMax: number }
> = {
  comfortable: { eventMin: 120, eventMax: 300, bundleMin: 168, bundleMax: 324 },
  compact: { eventMin: 74, eventMax: 168, bundleMin: 92, bundleMax: 190 },
  dense: { eventMin: 58, eventMax: 124, bundleMin: 74, bundleMax: 140 },
};

const DEFAULT_LANE_OFFSET = 48;
const DEFAULT_LANE_LABEL_WIDTH = 148;
const DEFAULT_CONTENT_RIGHT_PADDING = 20;
const LANE_VERTICAL_PADDING = 8;

export function computeTimelineLayout(
  items: TimelineDisplayItem[],
  range: TimelineRange,
  options: TimelineLayoutOptions,
): TimelineLayout {
  const density: TimelineDensity = options.density ?? "comfortable";
  const cardHeight = DENSITY_CARD_HEIGHT[density];
  // `cardWidth` is now the minimum (cardlet) width; actual widths vary by
  // event duration. Kept on the layout result as the content-area floor.
  const cardWidth = DENSITY_WIDTH_BOUNDS[density].eventMin;
  const laneOffsetPx = options.laneOffsetPx ?? DEFAULT_LANE_OFFSET;
  const laneLabelWidthPx = options.laneLabelWidthPx ?? DEFAULT_LANE_LABEL_WIDTH;
  const contentRightPadding = options.contentRightPaddingPx ?? DEFAULT_CONTENT_RIGHT_PADDING;
  const rowHeight = cardHeight;
  const contentLeftPx = laneLabelWidthPx;
  const contentWidthPx = Math.max(cardWidth, options.frameWidth - contentLeftPx - contentRightPadding);

  const grouped = new Map<ActivityLaneId, TimelineDisplayItem[]>();
  for (const lane of options.laneOrder) grouped.set(lane, []);
  for (const item of items) {
    const bucket = grouped.get(item.laneType);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(item.laneType, [item]);
    }
  }
  for (const [, laneItems] of grouped) {
    laneItems.sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
  }

  // Every lane is a single row of one uniform height — empty lanes included.
  // A consistent band height makes the swimlane read as one even grid (the
  // user explicitly wants equal-height lanes); an empty lane shows just its
  // label in a full-height, de-emphasised band rather than a slim sliver.
  const baseLaneHeight = LANE_VERTICAL_PADDING * 2 + cardHeight;

  const placed: LaidOutTimelineItem[] = [];
  const lanes: LaneLayout[] = [];
  let cursorY = laneOffsetPx;
  for (const type of options.laneOrder) {
    const laneItems = grouped.get(type) ?? [];
    const laneTop = cursorY;
    const placements = layoutLaneRow(
      laneItems,
      range,
      contentLeftPx,
      contentWidthPx,
    );
    const hasItems = placements.length > 0;
    const rowCount = hasItems ? 1 : 0;
    const thisLaneHeight = baseLaneHeight;
    const rooms = labelSides(placements, contentLeftPx, contentLeftPx + contentWidthPx);
    for (const [index, placement] of placements.entries()) {
      const y = laneTop + LANE_VERTICAL_PADDING;
      placed.push({
        itemId: placement.item.id,
        kind: placement.item.kind,
        laneType: type,
        memberEventIds: placement.item.memberEventIds,
        rowIndex: 0,
        x: placement.x,
        y,
        width: placement.width,
        labelRoom: rooms.right[index]!,
        labelLeftRoom: rooms.left[index]!,
        height: cardHeight,
        laneTop,
        laneHeight: thisLaneHeight,
        anchorLeft: { x: placement.x, y: y + cardHeight / 2 },
        anchorRight: { x: placement.x + placement.width, y: y + cardHeight / 2 },
        anchorCenter: { x: placement.x + placement.width / 2, y: y + cardHeight / 2 },
      });
    }
    lanes.push({ type, top: laneTop, height: thisLaneHeight, rowCount });
    cursorY += thisLaneHeight;
  }

  return {
    items: placed,
    lanes,
    frameWidth: options.frameWidth,
    frameHeight: cursorY,
    laneOffsetPx,
    laneLabelWidthPx,
    contentLeftPx,
    contentWidthPx,
    density,
    cardWidth,
    cardHeight,
    rowHeight,
  };
}

export function indexLayout(layout: TimelineLayout): Map<string, LaidOutTimelineItem> {
  const map = new Map<string, LaidOutTimelineItem>();
  for (const item of layout.items) map.set(item.itemId, item);
  return map;
}

export function indexEventAnchors(layout: TimelineLayout): Map<string, LaidOutTimelineItem> {
  const map = new Map<string, LaidOutTimelineItem>();
  for (const item of layout.items) {
    for (const eventId of item.memberEventIds) {
      map.set(eventId, item);
    }
  }
  return map;
}

type RowPlacement = {
  item: TimelineDisplayItem;
  x: number;
  width: number;
  rowIndex: number;
};

/**
 * Lay out one lane as a single compact rail.
 *
 * The Timeline is a scanning map, not a transcript. Cards keep the x-position
 * implied by their timestamp and remain on one row; dense detail is exposed in
 * the hover preview / conversation view instead of growing the swimlane.
 */
function layoutLaneRow(
  items: TimelineDisplayItem[],
  range: TimelineRange,
  contentLeftPx: number,
  contentWidthPx: number,
): RowPlacement[] {
  if (items.length === 0) return [];

  const initial = items.map((item) => {
    const width = computeItemWidth(item, range, contentWidthPx);
    const x = computeItemLeft(item.start, range, contentLeftPx, contentWidthPx, width);
    return { item, x, width };
  });

  return initial.map((placement) => ({ ...placement, rowIndex: 0 }));
}

/** Where a printed label starts, right of its tick (card border included). */
export const LABEL_OFFSET_PX = 5;
/** Gap kept between a printed label and the next item in the lane. */
const LABEL_GAP_PX = 6;
/** A label narrower than this would show only an ellipsis: none is printed. */
export const LABEL_ROOM_MIN = 44;
/** Labels stop growing here, so one sparse lane does not print a paragraph. */
export const LABEL_ROOM_MAX = 220;

/**
 * Label room per placement (same order): from where the label starts to the
 * next item in the lane (by x), or the content edge. None when an earlier,
 * wider item still covers the tick, so a label is never printed over another
 * card. Never moves or resizes an item.
 */
export function labelRooms(placements: readonly { x: number; width: number }[], contentRightPx: number): number[] {
  const order = placements.map((_, index) => index).sort((a, b) => placements[a]!.x - placements[b]!.x);
  const rooms = new Array<number>(placements.length).fill(0);
  let coveredTo = -Infinity;
  for (let k = 0; k < order.length; k += 1) {
    const item = placements[order[k]!]!;
    const end = item.x + item.width;
    const next = k + 1 < order.length ? placements[order[k + 1]!]! : null;
    const limit = next ? next.x : contentRightPx;
    const room = Math.min(LABEL_ROOM_MAX, limit - end - LABEL_OFFSET_PX - LABEL_GAP_PX);
    rooms[order[k]!] = coveredTo <= end && room >= LABEL_ROOM_MIN ? room : 0;
    coveredTo = Math.max(coveredTo, end);
  }
  return rooms;
}

/**
 * Label rooms on both sides. An item with no room to its right (the last one
 * before the content edge, typically where the session ended) prints its
 * title to its left instead, in space no earlier item or label uses. When the
 * previous item's right label would fill that space, the gap is shared, so
 * both titles stay readable. Items never move.
 */
export function labelSides(
  placements: readonly { x: number; width: number }[],
  contentLeftPx: number,
  contentRightPx: number,
): { right: number[]; left: number[] } {
  const right = labelRooms(placements, contentRightPx);
  const left = new Array<number>(placements.length).fill(0);
  const order = placements.map((_, index) => index).sort((a, b) => placements[a]!.x - placements[b]!.x);
  let coveredTo = contentLeftPx;
  for (let k = 0; k < order.length; k += 1) {
    const index = order[k]!;
    const item = placements[index]!;
    const coveredBefore = coveredTo;
    coveredTo = Math.max(coveredTo, item.x + item.width);
    if (right[index]! > 0 || coveredBefore > item.x) continue;
    const prevIndex = k > 0 ? order[k - 1]! : null;
    const prevRight = prevIndex === null ? 0 : right[prevIndex]!;
    // Where the free space starts: after every earlier item, and after the
    // previous item's own right label when it has one.
    const prev = prevIndex === null ? null : placements[prevIndex]!;
    const occupied = prev && prevRight > 0 ? Math.max(coveredBefore, prev.x + prev.width + LABEL_OFFSET_PX + prevRight) : coveredBefore;
    const free = item.x - occupied - LABEL_GAP_PX - LABEL_OFFSET_PX;
    if (free >= LABEL_ROOM_MIN) {
      left[index] = Math.min(LABEL_ROOM_MAX, free);
      continue;
    }
    if (!prev || prevRight <= 0) continue;
    // Share the gap with the previous item's label.
    const gap = item.x - Math.max(coveredBefore, prev.x + prev.width);
    const half = Math.floor((gap - 2 * LABEL_OFFSET_PX - LABEL_GAP_PX) / 2);
    if (half < LABEL_ROOM_MIN) continue;
    right[prevIndex!] = Math.min(prevRight, half);
    left[index] = Math.min(LABEL_ROOM_MAX, half);
  }
  return { right, left };
}

/**
 * Zero / sub-pixel-duration events still need a small, clickable footprint, so
 * widths floor at this tick. Everything is otherwise drawn at its true pixel
 * span (see below).
 */
export const ITEM_TICK_WIDTH = 6;

/**
 * Honest item width: the exact pixel span of the item's [start, end] on the
 * time scale. There is deliberately NO inflating minimum and NO maximum cap —
 * a card's width is a faithful read of how long the work actually took, so a
 * 30-second command is a thin tick and a two-hour run is a long bar. Only a
 * zero-duration (or end-less) event floors to ITEM_TICK_WIDTH so it stays
 * visible and clickable. Readable detail lives in the card body when there is
 * room, and in the hover preview otherwise; zoom in to give short events space.
 */
export function computeItemWidth(
  item: TimelineDisplayItem,
  range: TimelineRange,
  contentWidthPx: number,
): number {
  const startPct = timestampToXPercent(item.start, range);
  const endPct = timestampToXPercent(item.end ?? item.start, range);
  const spanPx = ((endPct - startPct) / 100) * contentWidthPx;
  if (!Number.isFinite(spanPx) || spanPx <= ITEM_TICK_WIDTH) return ITEM_TICK_WIDTH;
  return spanPx;
}

function computeItemLeft(
  start: string,
  range: TimelineRange,
  contentLeftPx: number,
  contentWidthPx: number,
  width: number,
): number {
  const percent = timestampToXPercent(start, range);
  const ideal = contentLeftPx + (percent / 100) * contentWidthPx;
  const maxLeft = contentLeftPx + Math.max(0, contentWidthPx - width);
  return Math.min(maxLeft, Math.max(contentLeftPx, ideal));
}
