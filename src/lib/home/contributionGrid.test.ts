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

  it("buckets activity by local day and scales the intensity level relative to the window max", () => {
    const timestamps = [
      new Date(2026, 4, 22, 9, 0).toISOString(),
      new Date(2026, 4, 22, 18, 0).toISOString(), // same day -> count 2
      new Date(2026, 4, 21, 12, 0).toISOString(), // yesterday -> count 1
    ];
    const grid = buildContributionGrid({ timestamps, now: NOW, weeks: 17 });
    expect(grid.total).toBe(3);
    expect(grid.activeDays).toBe(2);
    expect(grid.maxCount).toBe(2);
    expect(grid.metric).toBe("sessions");

    const dow = new Date(2026, 4, 22).getDay();
    const todayCell = grid.weeks[grid.weeks.length - 1][dow];
    expect(todayCell.date).toBe("2026-05-22");
    expect(todayCell.count).toBe(2);
    // Relative bucketing: the busiest day (count 2) is the window max -> level 4.
    expect(todayCell.level).toBe(4);
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

  describe("weighted samples + relative quantile bucketing", () => {
    it("sums sample values per local day instead of counting occurrences", () => {
      const samples = [
        { iso: new Date(2026, 4, 22, 9, 0).toISOString(), value: 12_000 },
        { iso: new Date(2026, 4, 22, 18, 0).toISOString(), value: 400 }, // same day -> 12_400
        { iso: new Date(2026, 4, 21, 12, 0).toISOString(), value: 6_000 },
      ];
      const grid = buildContributionGrid({ samples, metric: "tokens", now: NOW, weeks: 17 });
      expect(grid.total).toBe(18_400);
      expect(grid.maxCount).toBe(12_400);
      expect(grid.metric).toBe("tokens");

      const dow = new Date(2026, 4, 22).getDay();
      const todayCell = grid.weeks[grid.weeks.length - 1][dow];
      expect(todayCell.count).toBe(12_400);
    });

    it("scales four buckets relative to the window max so any unit self-scales", () => {
      // Max day = 100; quarter thresholds at 25 / 50 / 75.
      const day = (offset: number, value: number) => ({
        iso: new Date(NOW - offset * DAY).toISOString(),
        value,
      });
      const grid = buildContributionGrid({
        samples: [day(0, 100), day(1, 75), day(2, 50), day(3, 25), day(4, 1)],
        metric: "activity",
        now: NOW,
        weeks: 17,
      });
      const levelFor = (offset: number) => {
        const key = isoDayKey(NOW - offset * DAY);
        for (const week of grid.weeks) {
          for (const cell of week) if (cell.date === key) return cell.level;
        }
        throw new Error(`no cell for offset ${offset}`);
      };
      expect(levelFor(0)).toBe(4); // window max
      expect(levelFor(1)).toBe(3); // 75 -> q3
      expect(levelFor(2)).toBe(2); // 50 -> q2
      expect(levelFor(3)).toBe(1); // 25 -> q1
      expect(levelFor(4)).toBe(1); // a small non-zero day still registers
    });

    it("keeps a lone non-zero day at the top bucket (no washed-out single-session window)", () => {
      const grid = buildContributionGrid({
        samples: [{ iso: new Date(2026, 4, 22, 9, 0).toISOString(), value: 1 }],
        now: NOW,
        weeks: 17,
      });
      expect(grid.maxCount).toBe(1);
      const dow = new Date(2026, 4, 22).getDay();
      expect(grid.weeks[grid.weeks.length - 1][dow].level).toBe(4);
    });

    it("treats zero-value days as level 0 even alongside busy days", () => {
      const grid = buildContributionGrid({
        samples: [
          { iso: new Date(2026, 4, 22, 9, 0).toISOString(), value: 50 },
          { iso: new Date(2026, 4, 21, 9, 0).toISOString(), value: 0 },
        ],
        now: NOW,
        weeks: 17,
      });
      let yesterdayLevel: number | null = null;
      for (const week of grid.weeks) {
        for (const cell of week) if (cell.date === "2026-05-21") yesterdayLevel = cell.level;
      }
      expect(yesterdayLevel).toBe(0);
    });

    it("ignores non-finite sample values without crashing", () => {
      const grid = buildContributionGrid({
        samples: [
          { iso: new Date(2026, 4, 22, 9, 0).toISOString(), value: Number.NaN },
          { iso: new Date(2026, 4, 22, 9, 0).toISOString(), value: 5 },
        ],
        now: NOW,
        weeks: 17,
      });
      expect(grid.total).toBe(5);
    });

    it("defaults the metric tag to sessions when none is given", () => {
      const grid = buildContributionGrid({ timestamps: [], now: NOW, weeks: 17 });
      expect(grid.metric).toBe("sessions");
    });

    it("prefers samples over timestamps when both are passed", () => {
      const grid = buildContributionGrid({
        timestamps: [new Date(2026, 4, 22, 9, 0).toISOString()],
        samples: [{ iso: new Date(2026, 4, 22, 9, 0).toISOString(), value: 9 }],
        now: NOW,
        weeks: 17,
      });
      expect(grid.total).toBe(9);
    });
  });
});

function isoDayKey(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
