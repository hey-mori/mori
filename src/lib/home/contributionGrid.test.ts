import { describe, expect, it } from "vitest";
import { buildContributionGrid } from "./contributionGrid";

const DAY = 86_400_000;
// 2026-05-22 14:00 local — mid-day so day-boundary math is unambiguous.
const NOW = new Date(2026, 4, 22, 14, 0, 0).getTime();

describe("buildContributionGrid", () => {
  it("produces a weeks x 7 grid for the requested window", () => {
    const grid = buildContributionGrid({ timestamps: [], now: NOW, weeks: 17 });
    expect(grid.weekCount).toBe(17);
    expect(grid.weeks).toHaveLength(17);
    for (const week of grid.weeks) expect(week).toHaveLength(7);
    expect(grid.total).toBe(0);
    expect(grid.activeDays).toBe(0);
    expect(grid.maxCount).toBe(0);
  });

  it("buckets activity by local day and scales the intensity level", () => {
    const timestamps = [
      new Date(2026, 4, 22, 9, 0).toISOString(),
      new Date(2026, 4, 22, 18, 0).toISOString(), // same day -> count 2
      new Date(2026, 4, 21, 12, 0).toISOString(), // yesterday -> count 1
    ];
    const grid = buildContributionGrid({ timestamps, now: NOW, weeks: 17 });
    expect(grid.total).toBe(3);
    expect(grid.activeDays).toBe(2);
    expect(grid.maxCount).toBe(2);

    const dow = new Date(2026, 4, 22).getDay();
    const todayCell = grid.weeks[grid.weeks.length - 1][dow];
    expect(todayCell.date).toBe("2026-05-22");
    expect(todayCell.count).toBe(2);
    expect(todayCell.level).toBe(2);
  });

  it("marks future days in the current week as padding cells", () => {
    const grid = buildContributionGrid({ timestamps: [], now: NOW, weeks: 17 });
    const dow = new Date(2026, 4, 22).getDay();
    const lastWeek = grid.weeks[grid.weeks.length - 1];
    for (let row = 0; row < 7; row += 1) {
      if (row > dow) expect(lastWeek[row].date).toBeNull();
      else expect(lastWeek[row].date).not.toBeNull();
    }
  });

  it("ignores invalid and out-of-window timestamps", () => {
    const timestamps = [
      "not-a-date",
      new Date(NOW - 200 * DAY).toISOString(), // older than the 17-week window
    ];
    const grid = buildContributionGrid({ timestamps, now: NOW, weeks: 17 });
    expect(grid.total).toBe(0);
  });

  it("labels the first column and each month change", () => {
    const grid = buildContributionGrid({ timestamps: [], now: NOW, weeks: 17 });
    expect(grid.months.length).toBeGreaterThan(0);
    expect(grid.months[0].col).toBe(0);
    expect(grid.months.every((m) => /^\d{1,2}월$/.test(m.label))).toBe(true);
  });
});
