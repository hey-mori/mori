import { describe, expect, it } from "vitest";
import {
  brushWidthToZoom,
  clampZoom,
  computeMinimapViewport,
  FULL_MINIMAP_VIEWPORT,
  MAX_ZOOM,
  MIN_ZOOM,
  minimapClickToScrollLeft,
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

describe("minimapClickToScrollLeft", () => {
  it("returns 0 when the content fits", () => {
    expect(minimapClickToScrollLeft(0.5, 1200, 1200)).toBe(0);
    expect(minimapClickToScrollLeft(0.5, 1400, 1200)).toBe(0);
  });

  it("centres the viewport on the clicked point", () => {
    // click at 50% of a 2000px span, 1000px visible → centre 1000, left 500.
    expect(minimapClickToScrollLeft(0.5, 1000, 2000)).toBe(500);
  });

  it("clamps to the start when the click is near the left edge", () => {
    expect(minimapClickToScrollLeft(0, 1000, 2000)).toBe(0);
    expect(minimapClickToScrollLeft(0.1, 1000, 2000)).toBe(0);
  });

  it("clamps to the end when the click is near the right edge", () => {
    expect(minimapClickToScrollLeft(1, 1000, 2000)).toBe(1000);
    expect(minimapClickToScrollLeft(0.95, 1000, 2000)).toBe(1000);
  });

  it("clamps an out-of-range fraction", () => {
    expect(minimapClickToScrollLeft(-1, 1000, 2000)).toBe(0);
    expect(minimapClickToScrollLeft(2, 1000, 2000)).toBe(1000);
  });

  it("returns 0 for degenerate geometry", () => {
    expect(minimapClickToScrollLeft(0.5, 0, 0)).toBe(0);
    expect(minimapClickToScrollLeft(Number.NaN, 1000, 2000)).toBe(0);
  });
});

describe("clampZoom", () => {
  it("keeps a zoom inside [MIN_ZOOM, MAX_ZOOM]", () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });

  it("falls back to MIN_ZOOM for non-finite input", () => {
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
  });
});

describe("brushWidthToZoom", () => {
  it("maps a full-width brush to no zoom", () => {
    expect(brushWidthToZoom(1)).toBe(MIN_ZOOM);
  });

  it("maps a half-width brush to 2x zoom", () => {
    expect(brushWidthToZoom(0.5)).toBe(2);
  });

  it("clamps a hair-thin brush to MAX_ZOOM", () => {
    expect(brushWidthToZoom(0.01)).toBe(MAX_ZOOM);
    expect(brushWidthToZoom(0)).toBe(MAX_ZOOM);
  });
});
