import type { StoredSessionSummary } from "../storage/storageTypes";

/**
 * Project workspace — pure derivation helper.
 *
 * The project page aggregates every session that shares a `sourceLabel`
 * (the Claude project path, the manual project name, …). The model below
 * is the read-only view-model the renderer consumes: identifying info,
 * the sessions grouped by recency, and the headline counts.
 *
 * Keeping the derivation pure means tests can assert grouping / counts
 * without touching the React tree, and a future producer (Cmd+K project
 * jump, deep link) can resolve a project key into a real overview with
 * the same path.
 */

export type ProjectRecencyBucket = "today" | "thisWeek" | "earlier";

export type ProjectSessionRow = {
  sessionId: string;
  title: string;
  /** Sort timestamp — `startedAt` when present, else `savedAt`. */
  timestamp: string;
  status: StoredSessionSummary["status"];
  eventCount?: number;
};

export type ProjectSessionGroup = {
  bucket: ProjectRecencyBucket;
  label: string;
  rows: ProjectSessionRow[];
};

export type ProjectOverview = {
  /** Key the page was opened with — usually the `sourceLabel`. */
  key: string;
  /** Display label (last path segment). */
  shortName: string;
  /** Full source path / label. */
  fullPath: string;
  /** Aggregated counts across every session in the project. */
  stats: {
    sessions: number;
    activeSessions: number;
    totalEvents: number;
    /** ISO timestamp of the project's most recent activity, or null. */
    lastActivity: string | null;
  };
  groups: ProjectSessionGroup[];
};

export type BuildProjectOverviewInput = {
  projectKey: string;
  sessions: ReadonlyArray<StoredSessionSummary>;
  /** Reference time for the recency buckets. Defaults to `Date.now()`. */
  now?: number;
};

const RECENCY_LABELS: Record<ProjectRecencyBucket, string> = {
  today: "오늘",
  thisWeek: "이번 주",
  earlier: "이전",
};

const RECENCY_ORDER: ProjectRecencyBucket[] = ["today", "thisWeek", "earlier"];

const DAY_MS = 86_400_000;

export function buildProjectOverview(input: BuildProjectOverviewInput): ProjectOverview {
  const now = input.now ?? Date.now();
  const mine = input.sessions.filter(
    (summary) => normaliseLabel(summary.sourceLabel) === normaliseLabel(input.projectKey),
  );

  const rows: ProjectSessionRow[] = mine
    .map(toRow)
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

  return {
    key: input.projectKey,
    shortName: shortName(input.projectKey),
    fullPath: input.projectKey,
    stats: {
      sessions: rows.length,
      activeSessions: rows.length,
      totalEvents: rows.reduce((sum, row) => sum + (row.eventCount ?? 0), 0),
      lastActivity: rows[0]?.timestamp ?? null,
    },
    groups: groupByRecency(rows, now),
  };
}

function toRow(summary: StoredSessionSummary): ProjectSessionRow {
  return {
    sessionId: summary.sessionId,
    title: summary.title?.trim() || "제목 없음",
    timestamp: summary.startedAt || summary.savedAt,
    status: summary.status,
    eventCount: summary.eventCount,
  };
}

function groupByRecency(
  rows: ProjectSessionRow[],
  now: number,
): ProjectSessionGroup[] {
  const today = startOfLocalDay(now);
  const weekStart = today - 6 * DAY_MS;

  const map: Record<ProjectRecencyBucket, ProjectSessionRow[]> = {
    today: [],
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

function normaliseLabel(value: string | undefined): string {
  return (value ?? "").trim();
}

function shortName(value: string): string {
  const parts = value.split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) return value || "기타";
  return parts[parts.length - 1]!;
}

function startOfLocalDay(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
