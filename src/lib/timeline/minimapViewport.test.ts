import { describe, expect, it } from "vitest";
import {
  computeMinimapViewport,
  FULL_MINIMAP_VIEWPORT,
} from "./minimapViewport";

describe("computeMinimapViewport", () => {
  it("covers the full width when the content fits the scroller", () => {
    expect(computeMinimapViewport(0, 1200, 1200)).toEqual(FULL_MINIMAP_VIEWPORT);
    expect(computeMinimapViewport(0, 1400, 1200)).toEqual(FULL_MINIMAP_VIEWPORT);
  });

  it("covers the full width for degenerate geometry", () => {
    expect(computeMinimapViewport(0, 0, 0)).toEqual(FULL_MINIMAP_VIEWPORT);
    expect(computeMinimapViewport(0, 1200, 0)).toEqual(FULL_MINIMAP_VIEWPORT);
    expect(computeMinimapViewport(Number.NaN, 1200, 2400)).toEqual(
      FULL_MINIMAP_VIEWPORT,
    );
  });

  it("sizes the rectangle to the visible fraction of the span", () => {
    const viewport = computeMinimapViewport(0, 1000, 2000);
    expect(viewport.widthPercent).toBe(50);
    expect(viewport.leftPercent).toBe(0);
  });

  it("offsets the rectangle by the scroll position", () => {
    const viewport = computeMinimapViewport(500, 1000, 2000);
    expect(viewport.widthPercent).toBe(50);
    expect(viewport.leftPercent).toBe(25);
  });

  it("clamps the rectangle so it never overflows the track", () => {
    // scrollLeft beyond the real max still keeps left + width <= 100.
    const viewport = computeMinimapViewport(99999, 1000, 2000);
    expect(viewport.widthPercent).toBe(50);
    expect(viewport.leftPercent).toBe(50);
    expect(viewport.leftPercent + viewport.widthPercent).toBeLessThanOrEqual(100);
  });

  it("treats a negative scroll position as the start", () => {
    expect(computeMinimapViewport(-40, 1000, 2000).leftPercent).toBe(0);
  });
});
