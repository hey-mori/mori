import { describe, expect, it } from "vitest";
import { computeVisibleRange, offsetForIndex } from "./conversationWindow";

/** Fixed-height row accessor — the common case for these assertions. */
function fixed(height: number) {
  return () => height;
}

describe("computeVisibleRange", () => {
  it("returns an empty range for an empty conversation", () => {
    const range = computeVisibleRange({
      itemCount: 0,
      scrollTop: 0,
      viewportHeight: 500,
      rowHeight: fixed(100),
      overscan: 4,
    });
    expect(range).toEqual({ startIndex: 0, endIndex: -1, offsetTop: 0, totalHeight: 0 });
  });

  it("renders only the visible window plus overscan at the top", () => {
    const range = computeVisibleRange({
      itemCount: 100,
      scrollTop: 0,
      viewportHeight: 500,
      rowHeight: fixed(100),
      overscan: 2,
    });
    // 5 rows fit in 500px; +2 overscan below, clamped to 0 above.
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(6);
    expect(range.offsetTop).toBe(0);
    expect(range.totalHeight).toBe(10_000);
  });

  it("offsets the window and the top spacer when scrolled into the middle", () => {
    const range = computeVisibleRange({
      itemCount: 100,
      scrollTop: 1000,
      viewportHeight: 500,
      rowHeight: fixed(100),
      overscan: 2,
    });
    // First visible row is index 10 (top=1000); overscan widens to 8.
    expect(range.startIndex).toBe(8);
    // Last row starting before bottom (1500) is index 14; +2 overscan = 16.
    expect(range.endIndex).toBe(16);
    // Spacer = 8 rows * 100px.
    expect(range.offsetTop).toBe(800);
  });

  it("clamps the end index to the last row near the bottom", () => {
    const range = computeVisibleRange({
      itemCount: 20,
      scrollTop: 1500,
      viewportHeight: 500,
      rowHeight: fixed(100),
      overscan: 3,
    });
    expect(range.endIndex).toBe(19);
    expect(range.startIndex).toBe(12);
  });

  it("clamps to the last row when scrolled past the end", () => {
    const range = computeVisibleRange({
      itemCount: 10,
      scrollTop: 99_999,
      viewportHeight: 500,
      rowHeight: fixed(100),
      overscan: 2,
    });
    expect(range.endIndex).toBe(9);
    expect(range.totalHeight).toBe(1000);
    // The window still includes the final rows.
    expect(range.startIndex).toBeLessThanOrEqual(9);
  });

  it("handles variable row heights", () => {
    // Rows: 0→50, 1→150, 2→50, 3→300, 4→100, then 100 each.
    const heights = [50, 150, 50, 300, 100];
    const rowHeight = (i: number) => heights[i] ?? 100;
    const range = computeVisibleRange({
      itemCount: 10,
      scrollTop: 200,
      viewportHeight: 100,
      rowHeight,
      overscan: 0,
    });
    // Cumulative tops: 0,50,200,250,550. scrollTop=200 lands on row 2
    // (bottom 250 > 200); viewport bottom 300 → still row 3 (top 250 < 300).
    expect(range.startIndex).toBe(2);
    expect(range.endIndex).toBe(3);
    expect(range.offsetTop).toBe(200);
    expect(range.totalHeight).toBe(50 + 150 + 50 + 300 + 100 + 5 * 100);
  });
});

describe("offsetForIndex", () => {
  it("returns 0 for the first row or out-of-range", () => {
    expect(offsetForIndex(0, fixed(100))).toBe(0);
    expect(offsetForIndex(-3, fixed(100))).toBe(0);
  });

  it("sums the heights of all preceding rows", () => {
    expect(offsetForIndex(5, fixed(100))).toBe(500);
  });

  it("respects variable row heights", () => {
    const heights = [40, 60, 200, 100];
    const rowHeight = (i: number) => heights[i] ?? 100;
    expect(offsetForIndex(3, rowHeight)).toBe(40 + 60 + 200);
  });
});
