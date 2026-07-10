/**
 * Virtual windowing math: given item offsets and a scroll position, decide the
 * slice of items to actually render plus the top / bottom spacer heights that
 * hold the scrollbar honest. Pure and dependency-free so the fiddly index math
 * is unit-tested away from React, the DOM, and any measurement.
 *
 * The offsets array is cumulative: `offsets[i]` is the top edge of item `i`, so
 * item `i` spans `[offsets[i], offsets[i + 1])` and `offsets[count]` is the
 * total height. `buildOffsets` turns a heights array into that shape.
 */

export type VirtualRange = {
  /** First item index to render (inclusive). */
  startIndex: number;
  /** Last item index to render (inclusive). `-1` when there is nothing. */
  endIndex: number;
  /** Spacer height above the rendered slice, in px. */
  paddingTop: number;
  /** Spacer height below the rendered slice, in px. */
  paddingBottom: number;
  /** Total scrollable height of all items, in px. */
  totalHeight: number;
};

/**
 * Cumulative top offsets for a heights array. Returns `count + 1` entries, the
 * last being the total height. A non-finite or negative height is treated as 0
 * so one bad measurement never corrupts every offset after it.
 */
export function buildOffsets(heights: readonly number[]): number[] {
  const offsets = new Array<number>(heights.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < heights.length; i += 1) {
    const h = heights[i];
    const safe = Number.isFinite(h) && h > 0 ? h : 0;
    offsets[i + 1] = offsets[i] + safe;
  }
  return offsets;
}

/** Largest index `i` in `[0, offsets.length - 1)` with `offsets[i] <= value`. */
function lastOffsetAtOrBelow(offsets: readonly number[], value: number): number {
  let lo = 0;
  let hi = offsets.length - 1; // exclusive upper item bound is length-1 items
  // Binary search over item starts offsets[0..count-1].
  let best = 0;
  while (lo <= hi - 1) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= value) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return best;
}

/**
 * Decide which items to render for a viewport, with an overscan margin so a
 * fast scroll does not flash blank rows. Clamps to the item bounds and always
 * returns spacer heights that sum with the rendered slice to `totalHeight`, so
 * the scroll container's height never jumps.
 */
export function computeVirtualRange(input: {
  scrollTop: number;
  viewportHeight: number;
  offsets: readonly number[];
  overscan?: number;
}): VirtualRange {
  const { offsets } = input;
  const count = offsets.length - 1;
  const totalHeight = count >= 0 ? offsets[count] : 0;
  if (count <= 0) {
    return { startIndex: 0, endIndex: -1, paddingTop: 0, paddingBottom: 0, totalHeight };
  }

  const overscan = Math.max(0, Math.floor(input.overscan ?? 0));
  const viewStart = Math.max(0, input.scrollTop);
  const viewEnd = viewStart + Math.max(0, input.viewportHeight);

  // First item whose bottom edge is past the viewport top.
  let startIndex = lastOffsetAtOrBelow(offsets, viewStart);
  // Walk forward if the found item ends before the viewport starts (can happen
  // at exact boundaries), so the first rendered item truly intersects.
  while (startIndex < count - 1 && offsets[startIndex + 1] <= viewStart) {
    startIndex += 1;
  }

  // Last item whose top edge is before the viewport bottom.
  let endIndex = startIndex;
  while (endIndex < count - 1 && offsets[endIndex + 1] < viewEnd) {
    endIndex += 1;
  }

  startIndex = Math.max(0, startIndex - overscan);
  endIndex = Math.min(count - 1, endIndex + overscan);

  const paddingTop = offsets[startIndex];
  const paddingBottom = totalHeight - offsets[endIndex + 1];
  return {
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom: Math.max(0, paddingBottom),
    totalHeight,
  };
}
