/**
 * Per-project session activity — a compact, timestamp-only summary.
 *
 * A full event timeline needs every session's body loaded; that is too heavy
 * for a project overview. This pure helper instead buckets the project's
 * session *timestamps* into a weekly (or monthly, for long-lived projects)
 * activity series, plus the span and recency — enough to render a sparkline
 * and a "기간 · N세션 · 최근" line without touching session content.
 */

export type ProjectActivityBucket = {
  /** Bucket start (ISO, local week/month start). */
  start: string;
  count: number;
};

export type ProjectActivity = {
  buckets: ProjectActivityBucket[];
  granularity: "week" | "month";
  total: number;
  firstAt: string | null;
  lastAt: string | null;
  /** Largest bucket count, for scaling a sparkline (>= 1 when any sessions). */
  maxCount: number;
};

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** Above this many weeks of span, switch to monthly buckets so the strip stays compact. */
const WEEK_LIMIT = 26;

function startOfLocalWeek(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return d.getTime();
}

function startOfLocalMonth(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

function addMonths(epoch: number, months: number): number {
  const d = new Date(epoch);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

export function buildProjectActivity(
  timestamps: ReadonlyArray<string>,
  now: number = Date.now(),
): ProjectActivity {
  const epochs = timestamps
    .map((t) => new Date(t).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (epochs.length === 0) {
    return { buckets: [], granularity: "week", total: 0, firstAt: null, lastAt: null, maxCount: 0 };
  }

  const first = epochs[0]!;
  const last = epochs[epochs.length - 1]!;
  const spanWeeks = Math.floor((now - first) / WEEK_MS) + 1;
  const granularity: "week" | "month" = spanWeeks > WEEK_LIMIT ? "month" : "week";

  // Build the bucket boundaries from the first session to now.
  const boundaries: number[] = [];
  if (granularity === "week") {
    let cursor = startOfLocalWeek(first);
    const end = startOfLocalWeek(now);
    while (cursor <= end) {
      boundaries.push(cursor);
      cursor += WEEK_MS;
    }
  } else {
    let cursor = startOfLocalMonth(first);
    const end = startOfLocalMonth(now);
    while (cursor <= end) {
      boundaries.push(cursor);
      cursor = addMonths(cursor, 1);
    }
  }

  const counts = boundaries.map(() => 0);
  for (const epoch of epochs) {
    // Find the last boundary <= epoch.
    let idx = 0;
    for (let i = 0; i < boundaries.length; i += 1) {
      if (boundaries[i]! <= epoch) idx = i;
      else break;
    }
    counts[idx] = (counts[idx] ?? 0) + 1;
  }

  const buckets = boundaries.map((start, i) => ({
    start: new Date(start).toISOString(),
    count: counts[i] ?? 0,
  }));

  return {
    buckets,
    granularity,
    total: epochs.length,
    firstAt: new Date(first).toISOString(),
    lastAt: new Date(last).toISOString(),
    maxCount: Math.max(1, ...counts),
  };
}
