import type { TimelineRange } from "./layout";

export type AxisTick = {
  /** ISO timestamp at this tick. */
  iso: string;
  /** Position along the axis, 0..100. */
  xPercent: number;
  /** Display label, e.g. "13:00" or "May 12". */
  label: string;
};

export type TimeScaleOptions = {
  /** Maximum number of ticks to produce. Default 6. */
  maxTicks?: number;
};

/**
 * Pick human-friendly axis ticks for a timeline range. Picks a coarse step
 * (15m / 30m / 1h / 6h / 1 day) so the axis stays readable across short and
 * long sessions. Falls back to a single tick when the range collapses or the
 * inputs are unparseable.
 */
export function computeAxisTicks(range: TimelineRange, options: TimeScaleOptions = {}): AxisTick[] {
  const start = new Date(range.start).getTime();
  const end = new Date(range.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

  if (end <= start) {
    return [{ iso: new Date(start).toISOString(), xPercent: 0, label: formatLabel(start, start, end) }];
  }

  const maxTicks = Math.max(2, options.maxTicks ?? 6);
  const spanMs = end - start;
  const step = pickStep(spanMs, maxTicks);
  const first = Math.ceil(start / step) * step;
  const ticks: AxisTick[] = [];
  for (let cursor = first; cursor <= end + 1; cursor += step) {
    const x = ((cursor - start) / spanMs) * 100;
    if (x < 0 || x > 100.5) continue;
    ticks.push({
      iso: new Date(cursor).toISOString(),
      xPercent: Math.min(100, Math.max(0, x)),
      label: formatLabel(cursor, start, end),
    });
    if (ticks.length >= maxTicks) break;
  }

  if (ticks.length === 0) {
    return [{ iso: range.start, xPercent: 0, label: formatLabel(start, start, end) }];
  }
  return ticks;
}

export type RangeSummary = {
  startLabel: string;
  endLabel: string;
  durationLabel: string;
};

export function summarizeTimelineRange(range: TimelineRange): RangeSummary {
  const start = new Date(range.start).getTime();
  const end = new Date(range.end).getTime();
  const sameDay =
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    new Date(start).toDateString() === new Date(end).toDateString();
  return {
    startLabel: Number.isFinite(start)
      ? new Date(start).toLocaleString([], {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : range.start,
    endLabel: Number.isFinite(end)
      ? sameDay
        ? new Date(end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : new Date(end).toLocaleString([], {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
      : range.end,
    durationLabel: formatDuration(Math.max(0, end - start)),
  };
}

function pickStep(spanMs: number, maxTicks: number): number {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const candidates = [
    5 * minute,
    10 * minute,
    15 * minute,
    30 * minute,
    hour,
    2 * hour,
    3 * hour,
    6 * hour,
    12 * hour,
    day,
    2 * day,
    7 * day,
    14 * day,
    30 * day,
  ];
  for (const step of candidates) {
    if (spanMs / step <= maxTicks) return step;
  }
  return candidates[candidates.length - 1];
}

function formatLabel(timestamp: number, rangeStart: number, rangeEnd: number): string {
  const date = new Date(timestamp);
  const sameDay = new Date(rangeStart).toDateString() === new Date(rangeEnd).toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes - hours * 60;
  if (hours < 24) return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours - days * 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}
