import type { StoredSessionSummary } from "../storage/storageTypes";
import type { ProductStateTone } from "../product-state/productState";

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
  sourceCount?: number;
  reviewCount?: number;
  memoryCandidateCount?: number;
  reportCount?: number;
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
    totalSources: number;
    reviewItems: number;
    memoryCandidates: number;
    savedReports: number;
    /** ISO timestamp of the project's most recent activity, or null. */
    lastActivity: string | null;
  };
  focusItems: ProjectFocusItem[];
  groups: ProjectSessionGroup[];
};

export type BuildProjectOverviewInput = {
  projectKey: string;
  sessions: ReadonlyArray<StoredSessionSummary>;
  sessionInsights?: ReadonlyArray<ProjectSessionInsightSnapshot>;
  /** Reference time for the recency buckets. Defaults to `Date.now()`. */
  now?: number;
};

export type ProjectSessionInsightSnapshot = {
  sessionId: string;
  sourceCount?: number;
  openIssues?: number;
  unconfirmedDecisions?: number;
  pendingNextActions?: number;
  decisionCount?: number;
  hasSummary?: boolean;
  reportCount?: number;
};

export type ProjectFocusDestination = "insights" | "evidence" | "memory" | "report";

export type ProjectFocusItem = {
  key: string;
  title: string;
  detail: string;
  count: number;
  statusLabel: string;
  tone: ProductStateTone;
  actionLabel: string;
  destination: ProjectFocusDestination;
  targetSessionId: string | null;
  enabled: boolean;
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
  const insights = new Map(
    (input.sessionInsights ?? []).map((snapshot) => [snapshot.sessionId, snapshot]),
  );
  const mine = input.sessions.filter(
    (summary) => normaliseLabel(summary.sourceLabel) === normaliseLabel(input.projectKey),
  );

  const rows: ProjectSessionRow[] = mine
    .map((summary) => toRow(summary, insights.get(summary.sessionId)))
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

  const stats = aggregateStats(rows);

  return {
    key: input.projectKey,
    shortName: shortName(input.projectKey),
    fullPath: input.projectKey,
    stats: {
      ...stats,
      sessions: rows.length,
      activeSessions: rows.length,
      lastActivity: rows[0]?.timestamp ?? null,
    },
    focusItems: buildFocusItems(rows, stats),
    groups: groupByRecency(rows, now),
  };
}

function toRow(
  summary: StoredSessionSummary,
  insight: ProjectSessionInsightSnapshot | undefined,
): ProjectSessionRow {
  const reviewCount =
    (insight?.openIssues ?? 0) +
    (insight?.unconfirmedDecisions ?? 0) +
    (insight?.pendingNextActions ?? 0);
  const memoryCandidateCount =
    (insight?.decisionCount ?? 0) +
    (insight?.pendingNextActions ?? 0) +
    (insight?.hasSummary ? 1 : 0);
  return {
    sessionId: summary.sessionId,
    title: summary.title?.trim() || "제목 없음",
    timestamp: summary.startedAt || summary.savedAt,
    status: summary.status,
    eventCount: summary.eventCount,
    sourceCount: insight?.sourceCount,
    reviewCount,
    memoryCandidateCount,
    reportCount: insight?.reportCount,
  };
}

function aggregateStats(rows: ProjectSessionRow[]): Pick<
  ProjectOverview["stats"],
  "totalEvents" | "totalSources" | "reviewItems" | "memoryCandidates" | "savedReports"
> {
  return rows.reduce(
    (stats, row) => ({
      totalEvents: stats.totalEvents + (row.eventCount ?? 0),
      totalSources: stats.totalSources + (row.sourceCount ?? 0),
      reviewItems: stats.reviewItems + (row.reviewCount ?? 0),
      memoryCandidates: stats.memoryCandidates + (row.memoryCandidateCount ?? 0),
      savedReports: stats.savedReports + (row.reportCount ?? 0),
    }),
    {
      totalEvents: 0,
      totalSources: 0,
      reviewItems: 0,
      memoryCandidates: 0,
      savedReports: 0,
    },
  );
}

function buildFocusItems(
  rows: ProjectSessionRow[],
  stats: Pick<
    ProjectOverview["stats"],
    "totalSources" | "reviewItems" | "memoryCandidates" | "savedReports"
  >,
): ProjectFocusItem[] {
  const latest = rows[0]?.sessionId ?? null;
  const reviewTarget = rows.find((row) => (row.reviewCount ?? 0) > 0)?.sessionId ?? latest;
  const evidenceTarget = rows.find((row) => (row.sourceCount ?? 0) > 0)?.sessionId ?? latest;
  const memoryTarget =
    rows.find((row) => (row.memoryCandidateCount ?? 0) > 0)?.sessionId ?? latest;
  const reportTarget = rows.find((row) => (row.reportCount ?? 0) > 0)?.sessionId ?? latest;

  return [
    {
      key: "review",
      title: "검토할 작업",
      detail:
        stats.reviewItems > 0
          ? "열린 이슈, 미확정 결정, 다음 액션을 정리하세요."
          : "확인할 리뷰 항목이 없습니다.",
      count: stats.reviewItems,
      statusLabel: `${stats.reviewItems}건`,
      tone: stats.reviewItems > 0 ? "warning" : "neutral",
      actionLabel: "검토",
      destination: "insights",
      targetSessionId: reviewTarget,
      enabled: Boolean(reviewTarget) && stats.reviewItems > 0,
    },
    {
      key: "evidence",
      title: "연결된 자료",
      detail:
        stats.totalSources > 0
          ? "가져온 소스가 이 프로젝트의 흐름을 받칩니다."
          : "아직 연결된 소스가 없습니다.",
      count: stats.totalSources,
      statusLabel: `${stats.totalSources}건`,
      tone: stats.totalSources > 0 ? "info" : "neutral",
      actionLabel: "자료",
      destination: "evidence",
      targetSessionId: evidenceTarget,
      enabled: Boolean(evidenceTarget) && stats.totalSources > 0,
    },
    {
      key: "memory",
      title: "메모리 후보",
      detail:
        stats.memoryCandidates > 0
          ? "결정, 액션, 요약이 프로젝트 메모리로 이어질 수 있습니다."
          : "분석 후 메모리 후보가 생깁니다.",
      count: stats.memoryCandidates,
      statusLabel: `${stats.memoryCandidates}건`,
      tone: stats.memoryCandidates > 0 ? "accent" : "neutral",
      actionLabel: "메모리",
      destination: "memory",
      targetSessionId: memoryTarget,
      enabled: Boolean(memoryTarget) && stats.memoryCandidates > 0,
    },
    {
      key: "report",
      title: "인계 리포트",
      detail:
        stats.savedReports > 0
          ? "저장된 리포트 패키지가 있습니다."
          : rows.length > 0
            ? "최근 세션에서 리포트를 만들 수 있습니다."
            : "세션이 생기면 리포트를 만들 수 있습니다.",
      count: stats.savedReports,
      statusLabel:
        stats.savedReports > 0 ? `${stats.savedReports}개` : rows.length > 0 ? "작성 가능" : "대기",
      tone: stats.savedReports > 0 ? "success" : "neutral",
      actionLabel: "리포트",
      destination: "report",
      targetSessionId: reportTarget,
      enabled: Boolean(reportTarget),
    },
  ];
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
