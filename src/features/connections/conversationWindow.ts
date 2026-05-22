/**
 * conversationWindow — pure windowing math for the ConversationViewer list.
 *
 * The viewer renders one chat bubble per message. A 3–5k-message Claude Code
 * session would mount thousands of DOM nodes and stutter on every scroll, so
 * we render only the slice that is on screen (plus a small overscan margin)
 * and pad the top/bottom with spacer space so the scrollbar still reflects
 * the full conversation.
 *
 * Bubbles have variable heights (wrapped text, tool-result `<details>`), so we
 * keep a per-index measured-height cache and fall back to an estimate for rows
 * that haven't been rendered (and therefore measured) yet. All the math lives
 * here as pure functions so it can be unit-tested without a DOM.
 */

/** Resolve the height of one row: a real measurement when we have it, else the estimate. */
export type RowHeight = (index: number) => number;

export type VisibleRange = {
  /** First message index to render (inclusive), already widened by overscan. */
  startIndex: number;
  /** Last message index to render (inclusive), already widened by overscan. */
  endIndex: number;
  /** Pixel offset of `startIndex` from the top of the list — the top spacer height. */
  offsetTop: number;
  /** Total pixel height of every row — drives the scroll container's full extent. */
  totalHeight: number;
};

export type ComputeVisibleRangeArgs = {
  /** Number of messages in the conversation. */
  itemCount: number;
  /** Current scrollTop of the scroll container. */
  scrollTop: number;
  /** Visible (client) height of the scroll container. */
  viewportHeight: number;
  /** Height of row `index` — measured when available, otherwise an estimate. */
  rowHeight: RowHeight;
  /** Extra rows to render above and below the viewport to hide scroll seams. */
  overscan?: number;
};

/**
 * Compute which message rows fall inside the viewport (plus overscan) given a
 * scroll position. Walks the row heights once to find the first visible row,
 * then again to find the last — O(n) over the conversation, which is cheap
 * compared with mounting every bubble. Returns the render slice together with
 * the top spacer and total list height the caller needs to size the scroller.
 */
export function computeVisibleRange({
  itemCount,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan = 6,
}: ComputeVisibleRangeArgs): VisibleRange {
  if (itemCount <= 0) {
    return { startIndex: 0, endIndex: -1, offsetTop: 0, totalHeight: 0 };
  }

  const safeScrollTop = Math.max(0, scrollTop);
  const safeViewport = Math.max(0, viewportHeight);
  const viewportBottom = safeScrollTop + safeViewport;

  let offsetBeforeStart = 0;
  let runningTop = 0;
  let firstVisible = itemCount - 1;
  let lastVisible = 0;
  let foundFirst = false;

  for (let index = 0; index < itemCount; index += 1) {
    const height = Math.max(0, rowHeight(index));
    const rowBottom = runningTop + height;

    // The first row whose bottom edge crosses into the viewport.
    if (!foundFirst && rowBottom > safeScrollTop) {
      firstVisible = index;
      offsetBeforeStart = runningTop;
      foundFirst = true;
    }
    // Keep extending the visible window while rows still start before the
    // viewport's bottom edge.
    if (foundFirst && runningTop < viewportBottom) {
      lastVisible = index;
    }

    runningTop = rowBottom;
  }

  const totalHeight = runningTop;

  // No row crossed the viewport (e.g. scrolled past the end after a resize):
  // clamp to the last row so we always render something sensible.
  if (!foundFirst) {
    firstVisible = itemCount - 1;
    lastVisible = itemCount - 1;
    offsetBeforeStart = Math.max(0, totalHeight - rowHeight(itemCount - 1));
  }

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(itemCount - 1, lastVisible + overscan);

  // Recompute the spacer to match the overscan-widened start so the rendered
  // slice lines up exactly with where the scrollbar thinks it is.
  let offsetTop = offsetBeforeStart;
  for (let index = startIndex; index < firstVisible; index += 1) {
    offsetTop -= Math.max(0, rowHeight(index));
  }

  return {
    startIndex,
    endIndex,
    offsetTop: Math.max(0, offsetTop),
    totalHeight,
  };
}

/**
 * Pixel offset of a row from the top of the list — the scrollTop that pins
 * row `index` to the top of the viewport. Used by the search-jump to scroll a
 * matched message into view even when that row isn't currently mounted (so
 * `scrollIntoView` on a real node isn't available).
 */
export function offsetForIndex(index: number, rowHeight: RowHeight): number {
  if (index <= 0) return 0;
  let top = 0;
  for (let i = 0; i < index; i += 1) {
    top += Math.max(0, rowHeight(i));
  }
  return top;
}
