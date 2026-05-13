import type { EventType, TimelineEvent } from "../../domain/types";
import { timestampToXPercent, type TimelineRange } from "./layout";

export type TimelineDensity = "comfortable" | "compact";

export type TimelineLayoutOptions = {
  frameWidth: number;
  density?: TimelineDensity;
  cardGapPx?: number;
  rowGapPx?: number;
  laneOffsetPx?: number;
  /** Width of the fixed left lane-label column. Cards are placed inside the
   *  remaining content area. Defaults to 140px so 8 lanes feel like a real
   *  swim-lane diagram. */
  laneLabelWidthPx?: number;
  /** Right padding inside the content area. */
  contentRightPaddingPx?: number;
  laneOrder: EventType[];
};

export type LaidOutEvent = {
  eventId: string;
  type: EventType;
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
  type: EventType;
  top: number;
  height: number;
  rowCount: number;
};

export type TimelineLayout = {
  events: LaidOutEvent[];
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

const DENSITY_CARD_DIMENSIONS: Record<TimelineDensity, { width: number; height: number }> = {
  comfortable: { width: 188, height: 88 },
  compact: { width: 152, height: 56 },
};

const DEFAULT_LANE_OFFSET = 40;
const DEFAULT_LANE_LABEL_WIDTH = 148;
const DEFAULT_CONTENT_RIGHT_PADDING = 20;
const DEFAULT_CARD_GAP = 8;
const DEFAULT_ROW_GAP = 6;
const LANE_VERTICAL_PADDING = 12;

/**
 * Compute a deterministic, collision-free Timeline layout in swim-lane form.
 *
 * Lane labels sit in a fixed-width left column. Each lane is a horizontal
 * band; cards are positioned by time inside the content area and packed
 * greedily into sub-rows so two cards never visually collide. Lane height is
 * derived from row count, so busy lanes grow taller and quiet lanes stay a
 * single row.
 */
export function computeTimelineLayout(
  events: TimelineEvent[],
  range: TimelineRange,
  options: TimelineLayoutOptions,
): TimelineLayout {
  const density: TimelineDensity = options.density ?? "comfortable";
  const { width: cardWidth, height: cardHeight } = DENSITY_CARD_DIMENSIONS[density];
  const cardGap = options.cardGapPx ?? DEFAULT_CARD_GAP;
  const rowGap = options.rowGapPx ?? DEFAULT_ROW_GAP;
  const laneOffsetPx = options.laneOffsetPx ?? DEFAULT_LANE_OFFSET;
  const laneLabelWidthPx = options.laneLabelWidthPx ?? DEFAULT_LANE_LABEL_WIDTH;
  const contentRightPadding = options.contentRightPaddingPx ?? DEFAULT_CONTENT_RIGHT_PADDING;
  const rowHeight = cardHeight + rowGap;
  const contentLeftPx = laneLabelWidthPx;
  const contentWidthPx = Math.max(cardWidth, options.frameWidth - contentLeftPx - contentRightPadding);

  const grouped = new Map<EventType, TimelineEvent[]>();
  for (const lane of options.laneOrder) grouped.set(lane, []);
  for (const event of events) {
    if (!grouped.has(event.type)) grouped.set(event.type, []);
    grouped.get(event.type)!.push(event);
  }
  for (const [, laneEvents] of grouped) {
    laneEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  const placed: LaidOutEvent[] = [];
  const lanes: LaneLayout[] = [];
  let cursorY = laneOffsetPx;

  for (const type of options.laneOrder) {
    const laneEvents = grouped.get(type) ?? [];
    const rowEnds: number[] = [];
    const laneTop = cursorY;
    const laneEventsLayout: LaidOutEvent[] = [];

    for (const event of laneEvents) {
      const x = computeCardLeft(event, range, contentLeftPx, contentWidthPx, cardWidth);
      const rowIndex = pickRow(rowEnds, x, cardGap);
      rowEnds[rowIndex] = x + cardWidth;
      laneEventsLayout.push({
        eventId: event.id,
        type,
        rowIndex,
        x,
        y: 0,
        width: cardWidth,
        height: cardHeight,
        laneTop,
        laneHeight: 0,
        anchorLeft: { x: 0, y: 0 },
        anchorRight: { x: 0, y: 0 },
        anchorCenter: { x: 0, y: 0 },
      });
    }

    // Empty lanes collapse to a short header strip so a quiet category does
    // not blow up the canvas height. Lanes that contain at least one event
    // grow with row count.
    const hasEvents = rowEnds.length > 0;
    const rowCount = hasEvents ? rowEnds.length : 0;
    const laneHeight = hasEvents
      ? LANE_VERTICAL_PADDING * 2 + rowCount * cardHeight + Math.max(0, rowCount - 1) * rowGap
      : 36;

    for (const item of laneEventsLayout) {
      const y = laneTop + LANE_VERTICAL_PADDING + item.rowIndex * rowHeight;
      item.y = y;
      item.laneHeight = laneHeight;
      item.anchorLeft = { x: item.x, y: y + cardHeight / 2 };
      item.anchorRight = { x: item.x + cardWidth, y: y + cardHeight / 2 };
      item.anchorCenter = { x: item.x + cardWidth / 2, y: y + cardHeight / 2 };
    }

    placed.push(...laneEventsLayout);
    lanes.push({ type, top: laneTop, height: laneHeight, rowCount });
    cursorY += laneHeight;
  }

  return {
    events: placed,
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

export function indexLayout(layout: TimelineLayout): Map<string, LaidOutEvent> {
  const map = new Map<string, LaidOutEvent>();
  for (const item of layout.events) map.set(item.eventId, item);
  return map;
}

function computeCardLeft(
  event: TimelineEvent,
  range: TimelineRange,
  contentLeftPx: number,
  contentWidthPx: number,
  cardWidth: number,
): number {
  const percent = timestampToXPercent(event.start, range);
  const ideal = contentLeftPx + (percent / 100) * contentWidthPx;
  const maxLeft = contentLeftPx + Math.max(0, contentWidthPx - cardWidth);
  return Math.min(maxLeft, Math.max(contentLeftPx, ideal));
}

function pickRow(rowEnds: number[], cardLeft: number, cardGap: number): number {
  for (let row = 0; row < rowEnds.length; row += 1) {
    if (rowEnds[row] + cardGap <= cardLeft) {
      return row;
    }
  }
  rowEnds.push(0);
  return rowEnds.length - 1;
}
