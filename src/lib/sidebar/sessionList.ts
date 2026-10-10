import type { StoredSessionSummary } from "../storage/storageTypes";
import { sessionLastActiveAt } from "../session/sessionActivity";

/**
 * Sidebar session list — pure grouping + filtering helpers.
 *
 * The primary sidebar is a conversation list (like Claude / Codex desktop):
 * a flat, scrollable list of sessions, grouped by recency. The user lands on
 * Mori, sees their last few sessions, picks one. Grouping is computed from a
 * single `now` so tests are deterministic; bucket boundaries are local-day
 * aligned (today / yesterday / this week / earlier) to match calendar intuition.
 *
 * Grouping is abstracted into a `SidebarGroupingMode` so a future workroom
 * model (Project = top-level, sessions nested) can switch the sidebar to
 * project-first grouping without rewriting the renderer. Today the default
 * stays `"recency"` — the audit recommendation is to ship the abstraction
 * but defer the UX switch until a multi-user backend lands.
 */

/**
 * How the sidebar groups sessions. `recency` is the today / yesterday /
 * this-week / earlier bucketing; `project` groups by `sourceLabel` (the
 * project the session belongs to). Add new modes here when they ship.
 */
export type SidebarGroupingMode = "recency" | "project";

export type SidebarSessionRow = {
  sessionId: string;
  title: string;
  /** When the session was last active (`sessionLastActiveAt`): the more
   *  recent of `startedAt` / `savedAt`. */
  timestamp: string;
  /** When the session started, if known: tells same-titled rows apart. */
  startedAt?: string;
  /** Optional grouping label (Claude project path). */
  sourceLabel?: string;
  /** True when the title is the user's first request (see `Session`). */
  titleFromRequest?: boolean;
};

/** Recency-mode buckets. The keys are the only ones that drive the recency
 *  grouping path; project-mode emits buckets with `"project"` / `"unsourced"`
 *  carried inline. */
export type RecencyBucket = "today" | "yesterday" | "thisWeek" | "earlier";

export type SidebarSessionBucket =
  | RecencyBucket
  /** Project-mode bucket id is the project label itself; the bucket is
   *  carried as `"project"` so the renderer can pick a project-tone style. */
  | "project"
  | "unsourced";

export type SidebarSessionGroup = {
  bucket: SidebarSessionBucket;
  label: string;
  rows: SidebarSessionRow[];
};

const RECENCY_LABELS: Record<RecencyBucket, string> = {
  today: "오늘",
  yesterday: "어제",
  thisWeek: "이번 주",
  earlier: "이전",
};

const RECENCY_ORDER: RecencyBucket[] = [
  "today",
  "yesterday",
  "thisWeek",
  "earlier",
];

export function toSidebarRow(summary: StoredSessionSummary): SidebarSessionRow {
  const timestamp = sessionLastActiveAt(summary);
  return {
    sessionId: summary.sessionId,
    title: summary.title?.trim() || "제목 없음",
    timestamp,
    startedAt: summary.startedAt || undefined,
    sourceLabel: summary.sourceLabel?.trim() || undefined,
    ...(summary.titleFromRequest ? { titleFromRequest: true } : {}),
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
 * Group rows into the chosen mode. `recency` (default) buckets rows by
 * today / yesterday / this week / earlier; `project` buckets by
 * `sourceLabel` and uses a trailing "기타" bucket for sessions without a
 * source label. Rows arrive most-recent-first; within each bucket the input
 * order is preserved. Empty buckets are dropped.
 */
export function groupSidebarRows(
  rows: SidebarSessionRow[],
  now: number = Date.now(),
  mode: SidebarGroupingMode = "recency",
): SidebarSessionGroup[] {
  return mode === "project" ? groupByProject(rows) : groupByRecency(rows, now);
}

function groupByRecency(
  rows: SidebarSessionRow[],
  now: number,
): SidebarSessionGroup[] {
  const today = startOfLocalDay(now);
  const yesterday = today - DAY_MS;
  const weekStart = today - 6 * DAY_MS;

  const map: Record<RecencyBucket, SidebarSessionRow[]> = {
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

  return RECENCY_ORDER.flatMap((bucket) =>
    map[bucket].length > 0
      ? [{ bucket, label: RECENCY_LABELS[bucket], rows: map[bucket] }]
      : [],
  );
}

const UNSOURCED_LABEL = "기타";

/**
 * Project-mode grouping. Buckets rows by `sourceLabel`; the catch-all bucket
 * for rows without a label sits at the end so labelled groups always lead.
 * Within a group the input order (most-recent-first from the caller) is
 * preserved, so a project's latest session is still the first row.
 */
function groupByProject(rows: SidebarSessionRow[]): SidebarSessionGroup[] {
  const order: string[] = [];
  const map = new Map<string, SidebarSessionRow[]>();
  for (const row of rows) {
    const label = row.sourceLabel?.trim() || UNSOURCED_LABEL;
    if (!map.has(label)) {
      map.set(label, []);
      order.push(label);
    }
    map.get(label)!.push(row);
  }
  return order
    .sort((a, b) => {
      if (a === UNSOURCED_LABEL) return 1;
      if (b === UNSOURCED_LABEL) return -1;
      return 0;
    })
    .map((label) => ({
      bucket: label === UNSOURCED_LABEL ? ("unsourced" as const) : ("project" as const),
      label,
      rows: map.get(label)!,
    }));
}

/**
 * Default visible-row caps used by the sidebar list before the user clicks
 * "더 보기". Centralised here so tests and the renderer agree on the same
 * numbers; tuned for ChatGPT/Codex-style behaviour where the *typical*
 * working set fits without expansion and the long tail is one click away.
 *
 *   - Project mode: each project folder shows its 5 most-recent sessions.
 *   - Recency mode: a single global cap across all buckets (오늘 → 이전),
 *     so the user lands on a calm column instead of a long "이전" tail.
 */
export const SIDEBAR_PROJECT_VISIBLE_LIMIT = 5;
export const SIDEBAR_RECENCY_VISIBLE_LIMIT = 12;

/**
 * Truncate a recency-mode group list to at most `limit` rows total, walking
 * buckets in order (today first). A bucket past the cap is dropped; a bucket
 * that the cap falls inside is sliced. Returns the truncated groups *and* the
 * count of hidden rows so the renderer can label the "더 보기" affordance.
 *
 * `limit <= 0` returns no rows (still tells the caller how many were hidden);
 * a non-finite or negative `limit` is treated as "no limit" and returns the
 * input unchanged. Pure / synchronous so it composes cheaply with `useMemo`.
 */
export function truncateRecencyGroups(
  groups: SidebarSessionGroup[],
  limit: number,
): { groups: SidebarSessionGroup[]; hiddenCount: number } {
  const totalRows = groups.reduce((sum, g) => sum + g.rows.length, 0);
  if (!Number.isFinite(limit) || limit < 0) {
    return { groups, hiddenCount: 0 };
  }
  if (totalRows <= limit) {
    return { groups, hiddenCount: 0 };
  }
  let remaining = limit;
  const out: SidebarSessionGroup[] = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    if (group.rows.length <= remaining) {
      out.push(group);
      remaining -= group.rows.length;
      continue;
    }
    out.push({ ...group, rows: group.rows.slice(0, remaining) });
    remaining = 0;
  }
  return { groups: out, hiddenCount: totalRows - limit };
}

/**
 * Short relative-time label used in the sidebar list — "방금", "12분 전",
 * "3시간 전", "어제", or a calendar date for older rows. Calendar dates are
 * rendered as "5월 24일" (Korean short form) — the longer "2026. 5. 24."
 * locale default reads as machine output next to "어제" / "4일 전".
 */
export function formatSidebarRelative(
  iso: string,
  now: number = Date.now(),
): string {
  const epoch = new Date(iso).getTime();
  if (Number.isNaN(epoch)) return "";
  const diff = now - epoch;
  // Future timestamps (clock skew, edits scheduled forward) fall through to
  // a short calendar label rather than the verbose locale string.
  if (diff < 0) return shortKoreanDate(epoch);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(diff / DAY_MS);
  if (days < 2) return "어제";
  if (days < 7) return `${days}일 전`;
  return shortKoreanDate(epoch);
}

const DAY_MS = 86_400_000;

function startOfLocalDay(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "5월 24일" — the short Korean calendar label used in the sidebar list. */
function shortKoreanDate(epoch: number): string {
  const d = new Date(epoch);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * Display label for a project folder in the sidebar tree. Trims a path
 * like "C:/dev/mori" down to "mori"; leaves a single-segment label
 * alone; falls back to "기타" for an empty input. The full path stays
 * available to render in a tooltip so the user never loses context.
 */
export function shortProjectLabel(sourceLabel: string | undefined): string {
  const trimmed = sourceLabel?.trim();
  if (!trimmed) return "기타";
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) return trimmed;
  return parts[parts.length - 1]!;
}
