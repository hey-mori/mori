import { describe, expect, it } from "vitest";

import { buildOffsets, computeVirtualRange } from "./virtualWindow";

describe("buildOffsets", () => {
  it("accumulates heights into top offsets with a trailing total", () => {
    expect(buildOffsets([10, 20, 30])).toEqual([0, 10, 30, 60]);
  });

  it("treats non-finite or negative heights as zero", () => {
    expect(buildOffsets([10, Number.NaN, -5, 20])).toEqual([0, 10, 10, 10, 30]);
  });

  it("returns just the zero total for an empty list", () => {
    expect(buildOffsets([])).toEqual([0]);
  });
});

describe("computeVirtualRange", () => {
  // 100 items of 20px each = 2000px total.
  const offsets = buildOffsets(new Array(100).fill(20));

  it("renders only the visible slice plus spacers that sum to the total", () => {
    const range = computeVirtualRange({ scrollTop: 0, viewportHeight: 100, offsets });
    expect(range.startIndex).toBe(0);
    // 100px viewport over 20px rows shows rows 0..4 (the 5th ends at 100).
    expect(range.endIndex).toBe(4);
    expect(range.paddingTop).toBe(0);
    expect(range.totalHeight).toBe(2000);
    // Spacers + rendered height reconstruct the full scroll height.
    const rendered = (range.endIndex - range.startIndex + 1) * 20;
    expect(range.paddingTop + rendered + range.paddingBottom).toBe(2000);
  });

  it("windows to the middle when scrolled, with correct top padding", () => {
    const range = computeVirtualRange({ scrollTop: 500, viewportHeight: 100, offsets });
    // Row containing 500px is index 25; viewport ends at 600 -> up to index 29.
    expect(range.startIndex).toBe(25);
    expect(range.endIndex).toBe(29);
    expect(range.paddingTop).toBe(500);
    expect(range.paddingBottom).toBe(2000 - 600);
  });

  it("applies overscan and clamps to the item bounds", () => {
    const mid = computeVirtualRange({ scrollTop: 500, viewportHeight: 100, offsets, overscan: 3 });
    expect(mid.startIndex).toBe(22);
    expect(mid.endIndex).toBe(32);

    // Overscan never runs off the top.
    const top = computeVirtualRange({ scrollTop: 0, viewportHeight: 100, offsets, overscan: 5 });
    expect(top.startIndex).toBe(0);

    // Overscan never runs off the bottom.
    const bottom = computeVirtualRange({ scrollTop: 1900, viewportHeight: 100, offsets, overscan: 5 });
    expect(bottom.endIndex).toBe(99);
    expect(bottom.paddingBottom).toBe(0);
  });

  it("handles variable row heights", () => {
    // Heights: 50, 10, 10, 100, 10 -> offsets 0,50,60,70,170,180.
    const varied = buildOffsets([50, 10, 10, 100, 10]);
    const range = computeVirtualRange({ scrollTop: 55, viewportHeight: 20, offsets: varied });
    // 55..75 spans row 1 (50-60), row 2 (60-70), row 3 (70-170 starts at 70 < 75).
    expect(range.startIndex).toBe(1);
    expect(range.endIndex).toBe(3);
    expect(range.paddingTop).toBe(50);
  });

  it("returns an empty range for no items", () => {
    const range = computeVirtualRange({ scrollTop: 0, viewportHeight: 100, offsets: buildOffsets([]) });
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(-1);
    expect(range.totalHeight).toBe(0);
    expect(range.paddingTop).toBe(0);
    expect(range.paddingBottom).toBe(0);
  });
});
