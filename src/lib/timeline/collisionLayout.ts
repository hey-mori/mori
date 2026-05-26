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
  x: number;
  y: number;
  width: number;
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
// row height stays constant regardless of which items the lane carries. Card
// *width* is no longer fixed — it is duration-aware (`DENSITY_WIDTH_BOUNDS` +
// `computeItemWidth`). The dense tier (38px) fits icon + time + one truncated
// title row with no footer, tuned for day-scale (30-100+ event) scanning.
const DENSITY_CARD_HEIGHT: Record<TimelineDensity, number> = {
  comfortable: 68,
  compact: 54,
  dense: 38,
};

// Duration-aware card width. A card's width is the pixel span of its
// [start, end] on the time scale, clamped to a per-density readable range.
// A 5-minute event therefore renders near `*Min` (a compact cardlet) while a
// 45-minute event stretches toward `*Max` — width now signals real duration
// instead of every event looking identically heavy.
const DENSITY_WIDTH_BOUNDS: Record<
  TimelineDensity,
  { eventMin: number; eventMax: number; bundleMin: number; bundleMax: number }
> = {
  comfortable: { eventMin: 120, eventMax: 300, bundleMin: 168, bundleMax: 324 },
  compact: { eventMin: 108, eventMax: 252, bundleMin: 150, bundleMax: 272 },
  dense: { eventMin: 96, eventMax: 200, bundleMin: 128, bundleMax: 216 },
};

const DEFAULT_LANE_OFFSET = 38;
const DEFAULT_LANE_LABEL_WIDTH = 148;
const DEFAULT_CONTENT_RIGHT_PADDING = 20;
const DEFAULT_CARD_GAP = 12;
const LANE_VERTICAL_PADDING = 7;
/** Lanes with no items render as a slim, de-emphasised band — not a full
 *  content-height row of dead space. */
// Empty lanes collapse to zero height so they vanish from the canvas rather
// than reserving a dead band. The lane still exists in the lanes[] array
// (callers that snapshot lane shape stay stable), but it consumes no row in
// the laid-out timeline.
const EMPTY_LANE_HEIGHT = 0;

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
  const cardGap = options.cardGapPx ?? DEFAULT_CARD_GAP;
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

  // Every lane is a single row. Content lanes share one uniform height;
  // empty lanes collapse to a slim band so the timeline carries no tall
  // stretches of dead space.
  const laneHeight = LANE_VERTICAL_PADDING * 2 + cardHeight;

  const placed: LaidOutTimelineItem[] = [];
  const lanes: LaneLayout[] = [];
  let cursorY = laneOffsetPx;
  for (const type of options.laneOrder) {
    const laneItems = grouped.get(type) ?? [];
    const laneTop = cursorY;
    const hasItems = laneItems.length > 0;
    const thisLaneHeight = hasItems ? laneHeight : EMPTY_LANE_HEIGHT;
    const y = laneTop + LANE_VERTICAL_PADDING;
    const placements = layoutLaneRow(
      laneItems,
      range,
      density,
      contentLeftPx,
      contentWidthPx,
      cardGap,
    );
    for (const placement of placements) {
      placed.push({
        itemId: placement.item.id,
        kind: placement.item.kind,
        laneType: type,
        memberEventIds: placement.item.memberEventIds,
        x: placement.x,
        y,
        width: placement.width,
        height: cardHeight,
        laneTop,
        laneHeight: thisLaneHeight,
        anchorLeft: { x: placement.x, y: y + cardHeight / 2 },
        anchorRight: { x: placement.x + placement.width, y: y + cardHeight / 2 },
        anchorCenter: { x: placement.x + placement.width / 2, y: y + cardHeight / 2 },
      });
    }
    lanes.push({ type, top: laneTop, height: thisLaneHeight, rowCount: hasItems ? 1 : 0 });
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
};

/**
 * Lay out one lane on a single row.
 *
 * Each card starts at its true time position. A minimal left-to-right
 * declutter then slides a card right only far enough to clear its
 * neighbour — never a whole card width. Dense bursts are merged into
 * bundles upstream (see `bundleEvents.ts`, which keeps lanes single-row),
 * so residual nudges stay small. A trailing pass pulls the row back in if
 * the last card would run past the content edge.
 */
function layoutLaneRow(
  items: TimelineDisplayItem[],
  range: TimelineRange,
  density: TimelineDensity,
  contentLeftPx: number,
  contentWidthPx: number,
  cardGap: number,
): RowPlacement[] {
  if (items.length === 0) return [];

  const placements: RowPlacement[] = items.map((item) => {
    const width = computeItemWidth(item, range, contentWidthPx, density);
    const x = computeItemLeft(item.start, range, contentLeftPx, contentWidthPx, width);
    return { item, x, width };
  });

  // Forward declutter: nudge each card just clear of its predecessor.
  for (let index = 1; index < placements.length; index += 1) {
    const previous = placements[index - 1]!;
    const current = placements[index]!;
    const minX = previous.x + previous.width + cardGap;
    if (current.x < minX) current.x = minX;
  }

  // Backward overflow pass: if the row now spills past the content edge,
  // pull the trailing cards left as far as their neighbours allow.
  const maxRight = contentLeftPx + contentWidthPx;
  const last = placements[placements.length - 1]!;
  let overflow = last.x + last.width - maxRight;
  for (let index = placements.length - 1; index >= 0 && overflow > 0; index -= 1) {
    const current = placements[index]!;
    const minLeft =
      index === 0
        ? contentLeftPx
        : placements[index - 1]!.x + placements[index - 1]!.width + cardGap;
    const shift = Math.min(overflow, current.x - minLeft);
    current.x -= shift;
    overflow -= shift;
  }

  return placements;
}

/**
 * Duration-aware item width. The width is the pixel span of the item's
 * [start, end] on the time scale, clamped to the per-density readable range.
 * An item with no end (or an end before its start) collapses to the minimum
 * cardlet width.
 */
export function computeItemWidth(
  item: TimelineDisplayItem,
  range: TimelineRange,
  contentWidthPx: number,
  density: TimelineDensity,
): number {
  const bounds = DENSITY_WIDTH_BOUNDS[density];
  const min = item.kind === "bundle" ? bounds.bundleMin : bounds.eventMin;
  const max = item.kind === "bundle" ? bounds.bundleMax : bounds.eventMax;
  const startPct = timestampToXPercent(item.start, range);
  const endPct = timestampToXPercent(item.end ?? item.start, range);
  const spanPx = ((endPct - startPct) / 100) * contentWidthPx;
  if (!Number.isFinite(spanPx) || spanPx <= min) return min;
  return Math.min(max, spanPx);
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
