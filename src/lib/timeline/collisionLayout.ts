import type { EventType } from "../../domain/types";
import type { TimelineDisplayItem } from "./displayItems";
import { timestampToXPercent, type TimelineRange } from "./layout";

export type TimelineDensity = "comfortable" | "compact" | "dense";

export type TimelineLayoutOptions = {
  frameWidth: number;
  density?: TimelineDensity;
  cardGapPx?: number;
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
const LANE_VERTICAL_PADDING = 5;

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

  const placed: LaidOutTimelineItem[] = [];
  const lanes: LaneLayout[] = [];
  let cursorY = laneOffsetPx;

  for (const type of options.laneOrder) {
    const laneItems = grouped.get(type) ?? [];
    const laneTop = cursorY;
    const laneHeight = laneItems.length > 0
      ? LANE_VERTICAL_PADDING * 2 + DENSITY_CARD_HEIGHT[density]
      : 18;
    const y = laneTop + LANE_VERTICAL_PADDING;
    const laneLayouts = layoutLaneItems(
      laneItems,
      type,
      range,
      density,
      contentLeftPx,
      contentWidthPx,
      laneTop,
      laneHeight,
      y,
      cardGap,
    );

    placed.push(...laneLayouts);
    lanes.push({ type, top: laneTop, height: laneHeight, rowCount: laneItems.length > 0 ? 1 : 0 });
    cursorY += laneHeight;
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

function layoutLaneItems(
  items: TimelineDisplayItem[],
  laneType: EventType,
  range: TimelineRange,
  density: TimelineDensity,
  contentLeftPx: number,
  contentWidthPx: number,
  laneTop: number,
  laneHeight: number,
  y: number,
  cardGap: number,
): LaidOutTimelineItem[] {
  const maxRight = contentLeftPx + contentWidthPx;
  const placements = items.map((item) => {
    const height = DENSITY_CARD_HEIGHT[density];
    const width = computeItemWidth(item, range, contentWidthPx, density);
    const idealX = computeItemLeft(item.start, range, contentLeftPx, contentWidthPx, width);

    return {
      item,
      x: idealX,
      idealX,
      width,
      height,
    };
  });

  for (let index = 1; index < placements.length; index += 1) {
    const previous = placements[index - 1]!;
    const current = placements[index]!;
    current.x = Math.max(current.idealX, previous.x + previous.width + cardGap);
  }

  const last = placements[placements.length - 1];
  if (last) {
    let overflow = last.x + last.width - maxRight;

    for (let index = placements.length - 1; index >= 0 && overflow > 0; index -= 1) {
      const current = placements[index]!;
      const minLeft =
        index === 0 ? contentLeftPx : placements[index - 1]!.x + placements[index - 1]!.width + cardGap;
      const shift = Math.min(overflow, current.x - minLeft);
      current.x -= shift;
      overflow -= shift;
    }
  }

  return placements.map(({ item, x, width, height }) => ({
    itemId: item.id,
    kind: item.kind,
    laneType,
    memberEventIds: item.memberEventIds,
    x,
    y,
    width,
    height,
    laneTop,
    laneHeight,
    anchorLeft: { x, y: y + height / 2 },
    anchorRight: { x: x + width, y: y + height / 2 },
    anchorCenter: { x: x + width / 2, y: y + height / 2 },
  }));
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
