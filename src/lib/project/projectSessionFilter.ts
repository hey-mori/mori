import type { ProjectSessionRow } from "./projectOverview";

/**
 * Project session list — status-first filtering.
 *
 * The project workspace should let the user focus the session list on what
 * needs attention, not just scroll a flat recency list (the "작업 상황실"
 * direction). This pure helper filters the already-derived `ProjectSessionRow`s
 * by a small, honest set of saved-data signals.
 *
 * Honesty boundary: only signals derivable from saved sessions are offered.
 * "확인 필요" is a real review-item count and "최근" is the activity window;
 * live-only states (진행 중 / 막힘) are intentionally absent until a live
 * follow slice can populate them, so the filter never implies a liveness Mori
 * does not have.
 */

export type ProjectSessionStatusFilter = "all" | "needsReview" | "recent";

export type ProjectSessionFilterCounts = Record<ProjectSessionStatusFilter, number>;

const DEFAULT_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

function toEpoch(timestamp: string): number {
  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

function isRecent(timestamp: string, now: number, windowMs: number): boolean {
  const age = now - toEpoch(timestamp);
  return age >= 0 && age <= windowMs;
}

function matches(
  row: ProjectSessionRow,
  filter: ProjectSessionStatusFilter,
  now: number,
  windowMs: number,
): boolean {
  switch (filter) {
    case "needsReview":
      return (row.reviewCount ?? 0) > 0;
    case "recent":
      return isRecent(row.timestamp, now, windowMs);
    case "all":
    default:
      return true;
  }
}

export type ProjectSessionFilterOptions = {
  filter: ProjectSessionStatusFilter;
  /** Reference time for the recency window. Defaults to `Date.now()`. */
  now?: number;
  recentWindowMs?: number;
};

/** Filter session rows by status, preserving their incoming order. */
export function filterProjectSessions(
  rows: ReadonlyArray<ProjectSessionRow>,
  options: ProjectSessionFilterOptions,
): ProjectSessionRow[] {
  const now = options.now ?? Date.now();
  const windowMs = options.recentWindowMs ?? DEFAULT_RECENT_WINDOW_MS;
  return rows.filter((row) => matches(row, options.filter, now, windowMs));
}

/** Count how many rows each filter would show, for the filter labels. */
export function countProjectSessionFilters(
  rows: ReadonlyArray<ProjectSessionRow>,
  options?: { now?: number; recentWindowMs?: number },
): ProjectSessionFilterCounts {
  const now = options?.now ?? Date.now();
  const windowMs = options?.recentWindowMs ?? DEFAULT_RECENT_WINDOW_MS;
  let needsReview = 0;
  let recent = 0;
  for (const row of rows) {
    if ((row.reviewCount ?? 0) > 0) needsReview += 1;
    if (isRecent(row.timestamp, now, windowMs)) recent += 1;
  }
  return { all: rows.length, needsReview, recent };
}
