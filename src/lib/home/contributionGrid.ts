/**
 * Contribution grid (the "잔디") view model.
 *
 * A GitHub-style activity heatmap for the Home dashboard: one cell per day for
 * the last N weeks, coloured by how much of the selected metric landed that
 * day. It is honest by construction — every cell traces to real stored-session
 * data handed in by the caller; this module never reads storage and never
 * invents activity. Empty days stay empty.
 *
 * The grid is metric-agnostic: callers hand in *weighted samples* — an ISO
 * timestamp plus a numeric value — and tag the grid with the `metric` so the
 * cell value's unit (sessions / activity steps / tokens) is unambiguous. The
 * intensity ramp is *relative*: it scales the four colour buckets against the
 * window's own maximum, so token sums (thousands), activity-step sums (dozens),
 * and session counts (single digits) each self-scale and stay readable on the
 * same five-step palette.
 *
 * Layout matches the familiar contribution graph: 7 rows (Sun…Sat), one column
 * per week, oldest week first, the current (possibly partial) week last. Future
 * days in the current week render as padding cells with `date: null`.
 */

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
const DEFAULT_WEEKS = 17;

export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Which lens the grid's per-day value represents. Tags the view model so
 * callers and tooltips know the unit without guessing. `sessions` is the
 * default lens (one sample of value 1 per session anchor day).
 */
export type ContributionMetric = "sessions" | "activity" | "tokens";

/**
 * One weighted activity sample: an ISO timestamp anchoring it to a local day
 * and a numeric `value` summed into that day. For the sessions metric the
 * value is 1 per session; for activity it is a per-session event count; for
 * tokens it is a per-session token total.
 */
export type ContributionSample = {
  iso: string;
  value: number;
};

export type ContributionDay = {
  /** Local ISO date (yyyy-mm-dd), or null for a future padding cell. */
  date: string | null;
  /** Summed metric value for the day (sessions / activity steps / tokens). */
  count: number;
  /** Intensity bucket 0–4, driving the cell colour. */
  level: ContributionLevel;
};

export type ContributionMonthLabel = {
  /** Week-column index the label aligns to. */
  col: number;
  /** Short Korean month label, e.g. "5월". */
  label: string;
};

export type ContributionGrid = {
  /** Week columns, oldest first; each is 7 days (row 0 = Sunday). */
  weeks: ContributionDay[][];
  /** Total metric value across the window. */
  total: number;
  /** Number of distinct days with any activity. */
  activeDays: number;
  /** Busiest single-day summed value in the window. */
  maxCount: number;
  /** Month labels aligned to week columns. */
  months: ContributionMonthLabel[];
  /** Window length in weeks. */
  weekCount: number;
  /** Which lens the cell values represent. */
  metric: ContributionMetric;
};

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function localDayKey(ms: number): string {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Build a relative 0–4 bucketer for a window of per-day summed values.
 *
 * The four non-zero buckets are scaled against the window's *maximum* day, so
 * the same five-step palette reads well whether the busiest day holds 3
 * sessions, 47 activity steps, or 12,400 tokens. A day with value 0 is always
 * level 0; the top quarter of the range is level 4. With a single non-zero
 * value the bucketer collapses sensibly (everything non-zero lands at the top
 * bucket), so a sparse window never looks washed-out.
 */
function makeLevelForValue(maxCount: number): (value: number) => ContributionLevel {
  if (maxCount <= 0) return () => 0;
  // Quarter-of-range thresholds. The busiest day always reaches level 4 and a
  // lone non-zero day is not stuck at level 1 when the max is small.
  const q1 = maxCount * 0.25;
  const q2 = maxCount * 0.5;
  const q3 = maxCount * 0.75;
  return (value: number): ContributionLevel => {
    if (value <= 0) return 0;
    if (value <= q1) return 1;
    if (value <= q2) return 2;
    if (value <= q3) return 3;
    return 4;
  };
}

export type BuildContributionGridInput = {
  /**
   * Weighted samples — one per activity occurrence — summed per local day.
   * Use this for any metric whose per-day value is not a bare count.
   */
  samples?: ContributionSample[];
  /**
   * Back-compat convenience for the sessions lens: a flat list of ISO
   * timestamps, each counted as a value of 1. Equivalent to passing
   * `samples: timestamps.map((iso) => ({ iso, value: 1 }))`. When both are
   * given, `samples` wins.
   */
  timestamps?: string[];
  /** Lens tag carried on the grid. Defaults to `sessions`. */
  metric?: ContributionMetric;
  now?: number;
  weeks?: number;
};

/**
 * Build the contribution grid from weighted activity samples (or, for the
 * sessions lens, a flat timestamp list). Per-day values are summed and then
 * bucketed onto a relative 0–4 intensity scale. Pure and clock-injectable.
 */
export function buildContributionGrid(input: BuildContributionGridInput): ContributionGrid {
  const now = input.now ?? Date.now();
  const weekCount = Math.max(1, Math.floor(input.weeks ?? DEFAULT_WEEKS));
  const metric: ContributionMetric = input.metric ?? "sessions";

  const todayMid = startOfLocalDay(now);
  const todayDow = new Date(todayMid).getDay(); // 0 = Sunday
  // Today sits in the last column at its weekday row; later weekdays this week
  // are future padding.
  const todayIndex = (weekCount - 1) * DAYS_PER_WEEK + todayDow;

  // Normalise the two input shapes into one weighted-sample list. `samples`
  // wins when both are present; otherwise each timestamp is a value of 1.
  const samples: ContributionSample[] =
    input.samples ?? (input.timestamps ?? []).map((iso) => ({ iso, value: 1 }));

  // Sum metric value by local day.
  const valueByDay = new Map<string, number>();
  for (const sample of samples) {
    const epoch = new Date(sample.iso).getTime();
    if (Number.isNaN(epoch)) continue;
    if (!Number.isFinite(sample.value)) continue;
    const key = localDayKey(epoch);
    valueByDay.set(key, (valueByDay.get(key) ?? 0) + sample.value);
  }

  // First pass over the visible window: collect per-day totals and the window
  // max so the relative bucketer can be calibrated before colours are assigned.
  type Cell = { key: string; dateMs: number; value: number };
  const cells: Cell[] = [];
  let maxCount = 0;
  for (let index = 0; index <= todayIndex; index += 1) {
    const dateMs = todayMid - (todayIndex - index) * DAY_MS;
    const key = localDayKey(dateMs);
    const value = valueByDay.get(key) ?? 0;
    if (value > maxCount) maxCount = value;
    cells.push({ key, dateMs, value });
  }

  const levelForValue = makeLevelForValue(maxCount);

  const weeks: ContributionDay[][] = [];
  const months: ContributionMonthLabel[] = [];
  let total = 0;
  let activeDays = 0;
  let prevMonth = -1;

  for (let col = 0; col < weekCount; col += 1) {
    const week: ContributionDay[] = [];
    for (let row = 0; row < DAYS_PER_WEEK; row += 1) {
      const index = col * DAYS_PER_WEEK + row;
      if (index > todayIndex) {
        week.push({ date: null, count: 0, level: 0 });
        continue;
      }
      const cell = cells[index]!;
      total += cell.value;
      if (cell.value > 0) activeDays += 1;
      week.push({ date: cell.key, count: cell.value, level: levelForValue(cell.value) });

      // The Sunday (row 0) anchors the column's month label.
      if (row === 0) {
        const month = new Date(cell.dateMs).getMonth();
        if (month !== prevMonth) {
          months.push({ col, label: `${month + 1}월` });
          prevMonth = month;
        }
      }
    }
    weeks.push(week);
  }

  return { weeks, total, activeDays, maxCount, months, weekCount, metric };
}
