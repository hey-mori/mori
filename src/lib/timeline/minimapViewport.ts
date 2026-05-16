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
