import type { EventType } from "../../domain/types";
import type { TimelineDisplayItem } from "./displayItems";
import { timestampToXPercent, type TimelineRange } from "./layout";

export type TimelineDensity = "comfortable" | "compact" | "dense";

export type TimelineLayoutOptions = {
  frameWidth: number;
  density?: TimelineDensity;
  cardGapPx?: number;
  /** Vertical gap between stacked rows inside a lane. */
  rowGapPx?: number;
  laneOffsetPx?: number;
  laneLabelWidthPx?: number;
  contentRightPaddingPx?: number;
  laneOrder: EventType[];
};

export type LaidOutTimelineItem = {
  itemId: string;
  kind: TimelineDisplayItem["kind"];
  laneType: EventType;
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
  type: EventType;
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
const DEFAULT_ROW_GAP = 6;
const LANE_VERTICAL_PADDING = 7;
/** Lanes with no items render as a slim, de-emphasised band — not a full
 *  content-height row of dead space. */
const EMPTY_LANE_HEIGHT = 64;

/**
 * Hard cap on stacked rows inside one lane. Beyond this a card falls back
 * onto the last row (rare — bundling absorbs most bursts first). Every lane
 * renders at one uniform height (the busiest lane's row count), so this
 * also bounds how tall the whole timeline gets.
 */
export const MAX_ROWS_PER_LANE = 2;

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

  const grouped = new Map<EventType, TimelineDisplayItem[]>();
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

  const rowGap = options.rowGapPx ?? DEFAULT_ROW_GAP;

  // Phase 1: pack each lane into rows. Row assignment depends only on a
  // lane's own items — a card keeps its true time-position and stacks
  // downward when it would overlap a neighbour.
  const packs = options.laneOrder.map((type) => ({
    type,
    ...packLaneRows(
      grouped.get(type) ?? [],
      range,
      density,
      contentLeftPx,
      contentWidthPx,
      cardGap,
    ),
  }));

  // Phase 2: one uniform lane height for the whole timeline, driven by the
  // busiest lane. Uniform heights keep the swimlanes reading as an even
  // grid instead of a jagged stack of differently-sized bands.
  const globalRowCount = Math.min(
    MAX_ROWS_PER_LANE,
    Math.max(1, ...packs.map((pack) => pack.rowCount)),
  );
  const laneHeight =
    LANE_VERTICAL_PADDING * 2 + globalRowCount * cardHeight + (globalRowCount - 1) * rowGap;

  // Phase 3: stack the lanes and resolve every item's absolute coordinates.
  // Content lanes all share `laneHeight`; empty lanes collapse to a slim
  // band so the timeline does not carry tall stretches of dead space.
  const placed: LaidOutTimelineItem[] = [];
  const lanes: LaneLayout[] = [];
  let cursorY = laneOffsetPx;
  for (const pack of packs) {
    const laneTop = cursorY;
    const thisLaneHeight = pack.placements.length === 0 ? EMPTY_LANE_HEIGHT : laneHeight;
    for (const placement of pack.placements) {
      const y = laneTop + LANE_VERTICAL_PADDING + placement.row * (cardHeight + rowGap);
      placed.push({
        itemId: placement.item.id,
        kind: placement.item.kind,
        laneType: pack.type,
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
    lanes.push({ type: pack.type, top: laneTop, height: thisLaneHeight, rowCount: pack.rowCount });
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
  row: number;
};

/**
 * Assign each item in a lane to a row.
 *
 * A card's x is its *true* start time and is never pushed sideways. Greedy
 * first-fit packing drops a card onto the first row whose last card already
 * ended (in px, including the gap) before this card starts; otherwise a new
 * row opens, up to MAX_ROWS_PER_LANE. Returns only row assignments — the
 * caller resolves absolute y once the uniform lane height is known.
 */
function packLaneRows(
  items: TimelineDisplayItem[],
  range: TimelineRange,
  density: TimelineDensity,
  contentLeftPx: number,
  contentWidthPx: number,
  cardGap: number,
): { placements: RowPlacement[]; rowCount: number } {
  if (items.length === 0) return { placements: [], rowCount: 0 };

  const placements: RowPlacement[] = items.map((item) => {
    const width = computeItemWidth(item, range, contentWidthPx, density);
    const x = computeItemLeft(item.start, range, contentLeftPx, contentWidthPx, width);
    return { item, x, width, row: 0 };
  });

  const rowEndX: number[] = [];
  for (const placement of placements) {
    let row = 0;
    while (row < rowEndX.length && placement.x < rowEndX[row]!) row += 1;
    if (row >= MAX_ROWS_PER_LANE) row = MAX_ROWS_PER_LANE - 1;
    if (row === rowEndX.length) rowEndX.push(0);
    rowEndX[row] = placement.x + placement.width + cardGap;
    placement.row = row;
  }

  return { placements, rowCount: Math.max(1, rowEndX.length) };
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
