/**
 * Contribution grid (the "잔디") view model.
 *
 * A GitHub-style activity heatmap for the Home dashboard: one cell per day for
 * the last N weeks, coloured by how many sessions were captured that day. It is
 * honest by construction — every cell traces to real stored-session anchor
 * dates handed in by the caller; this module never reads storage and never
 * invents activity. Empty days stay empty.
 *
 * Layout matches the familiar contribution graph: 7 rows (Sun…Sat), one column
 * per week, oldest week first, the current (possibly partial) week last. Future
 * days in the current week render as padding cells with `date: null`.
 */

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
const DEFAULT_WEEKS = 17;

export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export type ContributionDay = {
  /** Local ISO date (yyyy-mm-dd), or null for a future padding cell. */
  date: string | null;
  /** Activity count for the day (sessions captured). */
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
  /** Total activity across the window. */
  total: number;
  /** Number of distinct days with any activity. */
  activeDays: number;
  /** Busiest single-day count in the window. */
  maxCount: number;
  /** Month labels aligned to week columns. */
  months: ContributionMonthLabel[];
  /** Window length in weeks. */
  weekCount: number;
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

/** Map a per-day count onto the 0–4 intensity scale. */
function levelForCount(count: number): ContributionLevel {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

/**
 * Build the contribution grid from a flat list of activity timestamps (ISO
 * strings — typically session anchor dates). Pure and clock-injectable.
 */
export function buildContributionGrid(input: {
  timestamps: string[];
  now?: number;
  weeks?: number;
}): ContributionGrid {
  const now = input.now ?? Date.now();
  const weekCount = Math.max(1, Math.floor(input.weeks ?? DEFAULT_WEEKS));

  const todayMid = startOfLocalDay(now);
  const todayDow = new Date(todayMid).getDay(); // 0 = Sunday
  const totalCells = weekCount * DAYS_PER_WEEK;
  // Today sits in the last column at its weekday row; later weekdays this week
  // are future padding.
  const todayIndex = (weekCount - 1) * DAYS_PER_WEEK + todayDow;

  // Bucket counts by local day.
  const countByDay = new Map<string, number>();
  for (const iso of input.timestamps) {
    const epoch = new Date(iso).getTime();
    if (Number.isNaN(epoch)) continue;
    const key = localDayKey(epoch);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const weeks: ContributionDay[][] = [];
  const months: ContributionMonthLabel[] = [];
  let total = 0;
  let activeDays = 0;
  let maxCount = 0;
  let prevMonth = -1;

  for (let col = 0; col < weekCount; col += 1) {
    const week: ContributionDay[] = [];
    for (let row = 0; row < DAYS_PER_WEEK; row += 1) {
      const index = col * DAYS_PER_WEEK + row;
      if (index > todayIndex) {
        week.push({ date: null, count: 0, level: 0 });
        continue;
      }
      const dateMs = todayMid - (todayIndex - index) * DAY_MS;
      const key = localDayKey(dateMs);
      const count = countByDay.get(key) ?? 0;
      total += count;
      if (count > 0) activeDays += 1;
      if (count > maxCount) maxCount = count;
      week.push({ date: key, count, level: levelForCount(count) });

      // The Sunday (row 0) anchors the column's month label.
      if (row === 0) {
        const month = new Date(dateMs).getMonth();
        if (month !== prevMonth) {
          months.push({ col, label: `${month + 1}월` });
          prevMonth = month;
        }
      }
    }
    weeks.push(week);
  }

  return { weeks, total, activeDays, maxCount, months, weekCount };
}
