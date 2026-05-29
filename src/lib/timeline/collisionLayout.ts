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
  compact: 34,
  dense: 28,
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
  compact: { eventMin: 74, eventMax: 168, bundleMin: 92, bundleMax: 190 },
  dense: { eventMin: 58, eventMax: 124, bundleMin: 74, bundleMax: 140 },
};

const DEFAULT_LANE_OFFSET = 38;
const DEFAULT_LANE_LABEL_WIDTH = 148;
const DEFAULT_CONTENT_RIGHT_PADDING = 20;
const LANE_VERTICAL_PADDING = 7;

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
      density,
      contentLeftPx,
      contentWidthPx,
    );
    const hasItems = placements.length > 0;
    const rowCount = hasItems ? 1 : 0;
    const thisLaneHeight = baseLaneHeight;
    for (const placement of placements) {
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
  density: TimelineDensity,
  contentLeftPx: number,
  contentWidthPx: number,
): RowPlacement[] {
  if (items.length === 0) return [];

  const initial = items.map((item) => {
    const width = computeItemWidth(item, range, contentWidthPx, density);
    const x = computeItemLeft(item.start, range, contentLeftPx, contentWidthPx, width);
    return { item, x, width };
  });

  return initial.map((placement) => ({ ...placement, rowIndex: 0 }));
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
