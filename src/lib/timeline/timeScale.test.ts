import { describe, expect, it } from "vitest";
import { computeAxisTicks, summarizeTimelineRange } from "./timeScale";

describe("computeAxisTicks", () => {
  it("emits hourly ticks for a 5-hour same-day range", () => {
    const ticks = computeAxisTicks({
      start: "2026-05-12T13:00:00Z",
      end: "2026-05-12T18:00:00Z",
    });
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks[0].xPercent).toBeGreaterThanOrEqual(0);
    expect(ticks[ticks.length - 1].xPercent).toBeLessThanOrEqual(100);
    expect(ticks[0].label.length).toBeGreaterThan(0);
  });

  it("collapses degenerate ranges to a single tick", () => {
    const ticks = computeAxisTicks({
      start: "2026-05-12T13:00:00Z",
      end: "2026-05-12T13:00:00Z",
    });
    expect(ticks).toHaveLength(1);
    expect(ticks[0].xPercent).toBe(0);
  });

  it("returns an empty array for unparseable timestamps", () => {
    expect(computeAxisTicks({ start: "not-a-date", end: "also-bad" })).toEqual([]);
  });

  it("respects a smaller maxTicks", () => {
    const ticks = computeAxisTicks(
      { start: "2026-05-12T13:00:00Z", end: "2026-05-12T18:00:00Z" },
      { maxTicks: 3 },
    );
    expect(ticks.length).toBeLessThanOrEqual(3);
  });
});

describe("summarizeTimelineRange", () => {
  it("produces a duration label for a same-day range", () => {
    const summary = summarizeTimelineRange({
      start: "2026-05-12T13:00:00Z",
      end: "2026-05-12T15:30:00Z",
    });
    expect(summary.durationLabel).toBe("2h 30m");
    expect(summary.startLabel).not.toBe("");
    expect(summary.endLabel).not.toBe("");
  });

  it("formats a multi-day range with day units", () => {
    const summary = summarizeTimelineRange({
      start: "2026-05-12T13:00:00Z",
      end: "2026-05-14T13:00:00Z",
    });
    expect(summary.durationLabel).toBe("2d");
  });

  it("clamps negative durations to 0m", () => {
    const summary = summarizeTimelineRange({
      start: "2026-05-12T15:00:00Z",
      end: "2026-05-12T14:00:00Z",
    });
    expect(summary.durationLabel).toBe("0m");
  });
});
