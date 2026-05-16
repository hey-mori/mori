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
