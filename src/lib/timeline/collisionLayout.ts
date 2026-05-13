import type { EventType } from "../../domain/types";
import type { TimelineDisplayItem } from "./displayItems";
import { timestampToXPercent, type TimelineRange } from "./layout";

export type TimelineDensity = "comfortable" | "compact";

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

const DENSITY_EVENT_DIMENSIONS: Record<TimelineDensity, { width: number; height: number }> = {
  comfortable: { width: 188, height: 88 },
  compact: { width: 152, height: 56 },
};

const DENSITY_BUNDLE_DIMENSIONS: Record<TimelineDensity, { width: number; height: number }> = {
  comfortable: { width: 224, height: 102 },
  compact: { width: 180, height: 74 },
};

const DEFAULT_LANE_OFFSET = 40;
const DEFAULT_LANE_LABEL_WIDTH = 148;
const DEFAULT_CONTENT_RIGHT_PADDING = 20;
const DEFAULT_CARD_GAP = 8;
const LANE_VERTICAL_PADDING = 12;

export function computeTimelineLayout(
  items: TimelineDisplayItem[],
  range: TimelineRange,
  options: TimelineLayoutOptions,
): TimelineLayout {
  const density: TimelineDensity = options.density ?? "comfortable";
  const { width: cardWidth, height: cardHeight } = DENSITY_EVENT_DIMENSIONS[density];
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
      ? LANE_VERTICAL_PADDING * 2 + getLaneHeight(laneItems, density)
      : 36;
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
    const dimensions =
      item.kind === "bundle" ? DENSITY_BUNDLE_DIMENSIONS[density] : DENSITY_EVENT_DIMENSIONS[density];
    const idealX = computeItemLeft(item.start, range, contentLeftPx, contentWidthPx, dimensions.width);

    return {
      item,
      x: idealX,
      idealX,
      width: dimensions.width,
      height: dimensions.height,
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

function getLaneHeight(items: TimelineDisplayItem[], density: TimelineDensity): number {
  return Math.max(
    ...items.map((item) =>
      item.kind === "bundle" ? DENSITY_BUNDLE_DIMENSIONS[density].height : DENSITY_EVENT_DIMENSIONS[density].height,
    ),
  );
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
