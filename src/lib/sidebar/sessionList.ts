import type { StoredSessionSummary } from "../storage/storageTypes";

/**
 * Sidebar session list — pure grouping + filtering helpers.
 *
 * The primary sidebar is a conversation list (like Claude / Codex desktop):
 * a flat, scrollable list of sessions, grouped by recency. The user lands on
 * Mori, sees their last few sessions, picks one. Grouping is computed from a
 * single `now` so tests are deterministic; bucket boundaries are local-day
 * aligned (today / yesterday / this week / earlier) to match calendar intuition.
 */

export type SidebarSessionRow = {
  sessionId: string;
  title: string;
  /** Stable sort key — the more recent of `startedAt` / `savedAt`. */
  timestamp: string;
  /** Optional grouping label (Claude project path). */
  sourceLabel?: string;
  archived: boolean;
};

export type SidebarSessionBucket =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "earlier";

export type SidebarSessionGroup = {
  bucket: SidebarSessionBucket;
  label: string;
  rows: SidebarSessionRow[];
};

const BUCKET_LABELS: Record<SidebarSessionBucket, string> = {
  today: "오늘",
  yesterday: "어제",
  thisWeek: "이번 주",
  earlier: "이전",
};

const BUCKET_ORDER: SidebarSessionBucket[] = [
  "today",
  "yesterday",
  "thisWeek",
  "earlier",
];

export function toSidebarRow(summary: StoredSessionSummary): SidebarSessionRow {
  const timestamp = summary.startedAt || summary.savedAt;
  return {
    sessionId: summary.sessionId,
    title: summary.title?.trim() || "제목 없음",
    timestamp,
    sourceLabel: summary.sourceLabel?.trim() || undefined,
    archived: Boolean(summary.archivedAt),
  };
}

/**
 * Filter rows against a free-text query. Matches the title and source label,
 * case-insensitive, with whitespace-trimmed terms. Empty query passes through.
 */
export function filterSidebarRows(
  rows: SidebarSessionRow[],
  query: string,
): SidebarSessionRow[] {
  const term = query.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) => {
    const haystack = `${row.title} ${row.sourceLabel ?? ""}`.toLowerCase();
    return haystack.includes(term);
  });
}

/**
 * Group rows into recency buckets relative to `now`. Rows arrive
 * most-recent-first; within each bucket that order is preserved. Empty
 * buckets are dropped.
 */
export function groupSidebarRows(
  rows: SidebarSessionRow[],
  now: number = Date.now(),
): SidebarSessionGroup[] {
  const today = startOfLocalDay(now);
  const yesterday = today - DAY_MS;
  const weekStart = today - 6 * DAY_MS;

  const map: Record<SidebarSessionBucket, SidebarSessionRow[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  };

  for (const row of rows) {
    const epoch = new Date(row.timestamp).getTime();
    if (Number.isNaN(epoch)) {
      map.earlier.push(row);
      continue;
    }
    if (epoch >= today) {
      map.today.push(row);
    } else if (epoch >= yesterday) {
      map.yesterday.push(row);
    } else if (epoch >= weekStart) {
      map.thisWeek.push(row);
    } else {
      map.earlier.push(row);
    }
  }

  return BUCKET_ORDER.flatMap((bucket) =>
    map[bucket].length > 0
      ? [{ bucket, label: BUCKET_LABELS[bucket], rows: map[bucket] }]
      : [],
  );
}

/**
 * Short relative-time label used in the sidebar list — "방금", "12분 전",
 * "3시간 전", "어제", or a calendar date for older rows.
 */
export function formatSidebarRelative(
  iso: string,
  now: number = Date.now(),
): string {
  const epoch = new Date(iso).getTime();
  if (Number.isNaN(epoch)) return "";
  const diff = now - epoch;
  if (diff < 0) return new Date(epoch).toLocaleDateString();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(diff / DAY_MS);
  if (days < 2) return "어제";
  if (days < 7) return `${days}일 전`;
  return new Date(epoch).toLocaleDateString();
}

const DAY_MS = 86_400_000;

function startOfLocalDay(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
