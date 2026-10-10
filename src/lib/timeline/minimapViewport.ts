/**
 * Minimap viewport rectangle — the "you are here" indicator on the
 * Timeline minimap.
 *
 * The minimap renders every event as a dot across the full session
 * span; the viewport rectangle marks which horizontal slice of that
 * span is currently visible inside the scrolling canvas. Before this
 * helper the rectangle was a hard-coded CSS inset that never moved —
 * an honest-looking control that tracked nothing.
 *
 * Pure: derives the rectangle from the scroller's scroll geometry, so
 * it is unit-testable without a DOM.
 */

export type MinimapViewport = {
  /** Left edge of the viewport rectangle, 0–100 (percent of the span). */
  leftPercent: number;
  /** Width of the viewport rectangle, 0–100 (percent of the span). */
  widthPercent: number;
};

/** The whole span is visible — viewport covers the full minimap. */
export const FULL_MINIMAP_VIEWPORT: MinimapViewport = {
  leftPercent: 0,
  widthPercent: 100,
};

/** Time-axis zoom bounds. 1 = whole span fits; MAX = most zoomed-in. A high
 *  ceiling lets a dense burst be spread far enough apart that its time-
 *  positioned cards stop overlapping. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 40;

/** The narrowest the minimap brush can get — the inverse of MAX_ZOOM. */
export const MIN_BRUSH_FRACTION = 1 / MAX_ZOOM;

/** Events per whole-span width a session opens with: about as many as a
 *  frame shows with room for their labels. */
const EVENTS_PER_SPAN_WIDTH = 24;
/** The most a session opens zoomed in; the stepper goes further. */
const MAX_DEFAULT_ZOOM = 8;

/**
 * The zoom a session opens at: wide enough that a dense session's cards stop
 * overlapping, and 1 (the whole span) for a short one, which a fixed 8x
 * spread over eight screens with nothing between its few cards.
 */
export function defaultZoomFor(eventCount: number): number {
  if (!Number.isFinite(eventCount) || eventCount <= EVENTS_PER_SPAN_WIDTH) return MIN_ZOOM;
  return Math.min(MAX_DEFAULT_ZOOM, Math.round(eventCount / EVENTS_PER_SPAN_WIDTH));
}

/** Clamp a raw zoom factor into the supported range. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Zoom factor for a brush of the given width fraction (0–1). A half-width
 * brush means the visible slice is half the span → zoom 2. Clamped.
 */
export function brushWidthToZoom(widthFraction: number): number {
  if (!Number.isFinite(widthFraction) || widthFraction <= 0) return MAX_ZOOM;
  return clampZoom(1 / widthFraction);
}

/**
 * Derive the viewport rectangle from a scroller's geometry.
 *
 * When the content fits (or the inputs are degenerate) the viewport
 * covers the full width — there is nothing off-screen to indicate.
 * Otherwise the rectangle is `clientWidth / scrollWidth` wide and
 * offset by `scrollLeft / scrollWidth`, clamped so it never overflows
 * the minimap track.
 */
export function computeMinimapViewport(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): MinimapViewport {
  if (
    !Number.isFinite(scrollLeft) ||
    !Number.isFinite(clientWidth) ||
    !Number.isFinite(scrollWidth) ||
    scrollWidth <= 0 ||
    clientWidth <= 0 ||
    clientWidth >= scrollWidth
  ) {
    return FULL_MINIMAP_VIEWPORT;
  }
  const widthPercent = Math.min(100, (clientWidth / scrollWidth) * 100);
  const maxLeft = 100 - widthPercent;
  const rawLeft = (Math.max(0, scrollLeft) / scrollWidth) * 100;
  const leftPercent = Math.max(0, Math.min(maxLeft, rawLeft));
  return { leftPercent, widthPercent };
}

/**
 * Scroll position for a minimap click. `fraction` (0–1) is where along
 * the minimap track the user clicked; the result centres the visible
 * viewport on that point, clamped to the real scrollable range.
 *
 * Returns 0 when the content fits — there is nowhere to scroll.
 */
export function minimapClickToScrollLeft(
  fraction: number,
  clientWidth: number,
  scrollWidth: number,
): number {
  if (
    !Number.isFinite(fraction) ||
    !Number.isFinite(clientWidth) ||
    !Number.isFinite(scrollWidth) ||
    scrollWidth <= clientWidth
  ) {
    return 0;
  }
  const clampedFraction = Math.max(0, Math.min(1, fraction));
  const centred = clampedFraction * scrollWidth - clientWidth / 2;
  return Math.max(0, Math.min(scrollWidth - clientWidth, centred));
}

/** Breathing room kept between a revealed item and the scroller's edge. */
export const REVEAL_MARGIN_PX = 48;

/**
 * The scrollLeft that brings an item (`left` / `width` in scroller content
 * pixels) into view, or `null` when it is already fully visible. An item off
 * either edge is placed a third of the way in, so the lane's next items stay
 * readable after it. Clamped to the scrollable range.
 */
export function revealScrollLeft(
  left: number,
  width: number,
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): number | null {
  if (![left, width, scrollLeft, clientWidth, scrollWidth].every(Number.isFinite)) return null;
  if (clientWidth <= 0 || scrollWidth <= clientWidth) return null;
  const visibleFrom = scrollLeft + REVEAL_MARGIN_PX;
  const visibleTo = scrollLeft + clientWidth - REVEAL_MARGIN_PX;
  if (left >= visibleFrom && left + width <= visibleTo) return null;
  const target = left - clientWidth / 3;
  return Math.round(Math.max(0, Math.min(scrollWidth - clientWidth, target)));
}
