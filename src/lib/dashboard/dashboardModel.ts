import { createBrowserDraftRepository } from "../storage/localStorageAdapter";
import { projectDisplayName } from "../projects/userProjects";
import { buildDemoSessionContent } from "../demo/demoSessionContent";
import { isDemoSessionId } from "../demo/demoSessionFixtures";
import { isNextActionCompleted } from "../session/nextActionCompletion";
import type { UserProject } from "../projects/userProjects";
import type { Issue, Decision, NextAction } from "../../domain/types";
import type { StoredSessionSummary } from "../storage/storageTypes";
import type { SessionProjectGroup, SessionRow } from "../workspace/sessionsBrowser";

/**
 * Pure derivations behind the Dashboard Summary surface.
 *
 * Everything here is a deterministic function of already-imported local data
 * (stored session summaries + per-session memory bodies). Nothing is fabricated
 * and nothing reaches the network. The view layer (`DashboardView`) and the
 * chart components import these so the math stays testable in the node-only
 * Vitest harness, separate from JSX.
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

export type ProjectStatus = {
  key: string;
  name: string;
  sourceLabel: string | null;
  sessionCount: number;
  analyzedSessions: number;
  lastActiveIso: string | null;
  eventCount: number;
  tokenTotal: number;
  openIssues: number;
  unconfirmedDecisions: number;
  pendingNextActions: number;
  attentionScore: number;
  coverageScore: number;
  activityScore: number;
  recentSessions: number;
};

export type DashboardTotals = ReturnType<typeof summarizeProjects>;
export type DashboardStatus = ReturnType<typeof buildDashboardStatus>;
export type SortKey = "recent" | "tokens" | "attention" | "activity";

export type DashboardTimeRange = "week" | "month" | "year" | "all";

export const DASHBOARD_TIME_RANGE_OPTIONS: readonly {
  key: DashboardTimeRange;
  label: string;
}[] = [
  { key: "week", label: "1주" },
  { key: "month", label: "1개월" },
  { key: "year", label: "1년" },
  { key: "all", label: "전체" },
];

/** Which review category the dashboard is focused on, or "all" for none. */
export type AttentionLens = "all" | "issues" | "decisions" | "next";
/** A concrete review lens (never "all"), used by hover highlighting. */
export type ConcreteLens = Exclude<AttentionLens, "all">;

type DashboardRepository = ReturnType<typeof createBrowserDraftRepository>;
type DashboardMemoryBody = {
  issues: Issue[];
  decisions: Decision[];
  nextActions: NextAction[];
};

export function buildProjectStatuses({
  groups,
  storedSessions,
  repository,
  userProjects,
  includeCreatedProjects = true,
}: {
  groups: SessionProjectGroup[];
  storedSessions: StoredSessionSummary[];
  repository: DashboardRepository;
  userProjects: UserProject[];
  includeCreatedProjects?: boolean;
}): ProjectStatus[] {
  const byId = new Map(storedSessions.map((session) => [session.sessionId, session]));
  const now = Date.now();
  const statuses: ProjectStatus[] = groups.map((group) => {
    const sessions = group.sessions;
    const stored = sessions
      .map((row) => byId.get(row.sessionId))
      .filter((entry): entry is StoredSessionSummary => Boolean(entry));
    let openIssues = 0;
    let unconfirmedDecisions = 0;
    let pendingNextActions = 0;
    let analyzedSessions = 0;
    for (const row of sessions) {
      const body = safeLoadMemoryBody(repository, row.sessionId);
      if (!body) continue;
      analyzedSessions += 1;
      openIssues += body.issues.filter((issue) => issue.status === "open").length;
      unconfirmedDecisions += body.decisions.filter((decision) => !decision.confirmed).length;
      pendingNextActions += body.nextActions.filter(
        (action) => !isNextActionCompleted(action),
      ).length;
    }
    const latest = latestSession(sessions);
    const sourceLabel = group.isUnsourced ? null : group.label;
    const eventCount = stored.reduce((sum, entry) => sum + (entry.eventCount ?? 0), 0);
    const tokenTotal = stored.reduce((sum, entry) => sum + (entry.tokenTotal ?? 0), 0);
    const recentSessions = sessions.filter((row) => {
      const iso = row.savedAt ?? row.startedAt;
      return iso ? now - new Date(iso).getTime() <= WEEK_MS : false;
    }).length;
    const attentionScore = openIssues + unconfirmedDecisions + pendingNextActions;
    return {
      key: group.key,
      name: sourceLabel ? projectDisplayName(sourceLabel, userProjects) : group.label,
      sourceLabel,
      sessionCount: sessions.length,
      analyzedSessions,
      lastActiveIso: latest?.savedAt ?? latest?.startedAt ?? null,
      eventCount,
      tokenTotal,
      openIssues,
      unconfirmedDecisions,
      pendingNextActions,
      attentionScore,
      coverageScore: sessions.length === 0 ? 0 : analyzedSessions / sessions.length,
      activityScore: eventCount + sessions.length,
      recentSessions,
    };
  });

  const sessionProjectKeys = new Set(
    statuses.map((project) => project.sourceLabel).filter(Boolean),
  );
  if (includeCreatedProjects) {
    for (const project of userProjects) {
      if (!project.created || sessionProjectKeys.has(project.key)) continue;
      statuses.push({
        key: `created:${project.key}`,
        name: projectDisplayName(project.key, userProjects),
        sourceLabel: project.key,
        sessionCount: 0,
        analyzedSessions: 0,
        lastActiveIso: null,
        eventCount: 0,
        tokenTotal: 0,
        openIssues: 0,
        unconfirmedDecisions: 0,
        pendingNextActions: 0,
        attentionScore: 0,
        coverageScore: 0,
        activityScore: 0,
        recentSessions: 0,
      });
    }
  }

  return statuses;
}

export function sortProjects(projects: ProjectStatus[], sort: SortKey): ProjectStatus[] {
  const next = [...projects];
  switch (sort) {
    case "tokens":
      next.sort((a, b) => b.tokenTotal - a.tokenTotal || byRecent(a, b));
      break;
    case "attention":
      next.sort((a, b) => b.attentionScore - a.attentionScore || byRecent(a, b));
      break;
    case "activity":
      next.sort((a, b) => b.activityScore - a.activityScore || byRecent(a, b));
      break;
    default:
      next.sort(byRecent);
  }
  return next;
}

function byRecent(a: ProjectStatus, b: ProjectStatus): number {
  if (a.lastActiveIso && b.lastActiveIso) return b.lastActiveIso.localeCompare(a.lastActiveIso);
  if (a.lastActiveIso) return -1;
  if (b.lastActiveIso) return 1;
  return a.name.localeCompare(b.name, "ko");
}

export function summarizeProjects(projects: ProjectStatus[]) {
  return projects.reduce(
    (sum, project) => ({
      projectCount: sum.projectCount + 1,
      sessionCount: sum.sessionCount + project.sessionCount,
      analyzedSessions: sum.analyzedSessions + project.analyzedSessions,
      eventCount: sum.eventCount + project.eventCount,
      tokenTotal: sum.tokenTotal + project.tokenTotal,
      tokenInput: sum.tokenInput,
      openIssues: sum.openIssues + project.openIssues,
      unconfirmedDecisions: sum.unconfirmedDecisions + project.unconfirmedDecisions,
      pendingNextActions: sum.pendingNextActions + project.pendingNextActions,
    }),
    {
      projectCount: 0,
      sessionCount: 0,
      analyzedSessions: 0,
      eventCount: 0,
      tokenTotal: 0,
      tokenInput: 0,
      openIssues: 0,
      unconfirmedDecisions: 0,
      pendingNextActions: 0,
    },
  );
}

export function buildDashboardStatus(totals: DashboardTotals, projects: ProjectStatus[]) {
  const attentionCount =
    totals.openIssues + totals.unconfirmedDecisions + totals.pendingNextActions;
  const maxTokenTotal = Math.max(...projects.map((project) => project.tokenTotal), 0);
  const maxEventCount = Math.max(...projects.map((project) => project.eventCount), 0);
  const maxAttention = Math.max(...projects.map((project) => project.attentionScore), 1);
  const recentSessions = projects.reduce((sum, project) => sum + project.recentSessions, 0);
  return {
    attentionCount,
    recentSessions,
    maxTokenTotal,
    maxEventCount,
    maxAttention,
  };
}

/** Why a project is being spotlighted in the dashboard lead banner. */
export type SpotlightReason = "review" | "recent" | "empty";

export type DashboardSpotlight = {
  project: ProjectStatus | null;
  reason: SpotlightReason;
};

/**
 * The single most useful "go here next" project for the dashboard lead banner.
 * A review backlog is the actionable signal, so the project with the most open
 * review items wins; absent any backlog, the most recently active project is
 * the natural place to resume. Deterministic and honest, derived only from
 * already-imported data, never a synthetic score.
 */
export function buildSpotlight(projects: ProjectStatus[]): DashboardSpotlight {
  const needsReview = projects
    .filter((project) => project.attentionScore > 0)
    .sort((a, b) => b.attentionScore - a.attentionScore || byRecent(a, b));
  if (needsReview.length > 0) return { project: needsReview[0]!, reason: "review" };
  const active = projects.filter((project) => project.lastActiveIso).sort(byRecent);
  if (active.length > 0) return { project: active[0]!, reason: "recent" };
  return { project: null, reason: "empty" };
}

/**
 * Weekly buckets for the last `weeks` weeks, oldest first. `metric` selects the
 * accumulated value: session count, or summed `tokenTotal`. Honest re-bucketing
 * of the same timestamps, so the 12주 / 26주 toggle never invents data.
 */
export function buildWeeklySeries(
  sessions: StoredSessionSummary[],
  weeks: number,
  metric: "sessions" | "tokens",
  now: number = Date.now(),
): number[] {
  const span = Math.max(1, Math.floor(weeks));
  const buckets = new Array<number>(span).fill(0);
  for (const session of sessions) {
    const iso = session.savedAt ?? session.startedAt;
    if (!iso) continue;
    const epoch = new Date(iso).getTime();
    if (Number.isNaN(epoch)) continue;
    const weeksAgo = Math.floor((now - epoch) / WEEK_MS);
    if (weeksAgo < 0 || weeksAgo >= span) continue;
    buckets[span - 1 - weeksAgo] += metric === "tokens" ? session.tokenTotal ?? 0 : 1;
  }
  return buckets;
}

/** Activity trend range: the same global dashboard time filter. */
export type TrendRange = DashboardTimeRange;

export type TrendPoint = {
  value: number;
  /** Korean-relative bucket label, e.g. "오늘", "3일 전", "이번 달", "5개월 전". */
  label: string;
  isCurrent: boolean;
};

export type ActivityTrend = {
  points: TrendPoint[];
  startLabel: string;
  endLabel: string;
};

const TREND_CONFIG: Record<TrendRange, { count: number; stepMs: number; unit: string; endLabel: string }> = {
  week: { count: 7, stepMs: DAY_MS, unit: "일", endLabel: "오늘" },
  month: { count: 30, stepMs: DAY_MS, unit: "일", endLabel: "오늘" },
  year: { count: 12, stepMs: 30 * DAY_MS, unit: "개월", endLabel: "이번 달" },
  all: { count: 12, stepMs: 30 * DAY_MS, unit: "개월", endLabel: "오늘" },
};

const RANGE_WINDOW_MS: Record<DashboardTimeRange, number | null> = {
  week: WEEK_MS,
  month: MONTH_MS,
  year: YEAR_MS,
  all: null,
};

export function dashboardRangeLabel(range: DashboardTimeRange): string {
  return DASHBOARD_TIME_RANGE_OPTIONS.find((option) => option.key === range)?.label ?? range;
}

export function filterSessionsByDashboardRange(
  sessions: StoredSessionSummary[],
  range: DashboardTimeRange,
  now: number = Date.now(),
): StoredSessionSummary[] {
  const windowMs = RANGE_WINDOW_MS[range];
  if (windowMs === null) return sessions;
  const start = now - windowMs;
  return sessions.filter((session) => {
    const epoch = sessionTimestamp(session);
    return epoch !== null && epoch > start && epoch <= now;
  });
}

/**
 * Session counts over a rolling window, oldest bucket first. The bucket unit
 * adapts to the range so each option reads naturally: a week of days, a month
 * of days, a year of (30-day) months. Rolling epoch math keeps it deterministic
 * and timezone-independent, and it only re-buckets already-imported timestamps,
 * never inventing activity.
 */
export function buildActivityTrend(
  sessions: StoredSessionSummary[],
  range: TrendRange,
  now: number = Date.now(),
): ActivityTrend {
  if (range === "all") {
    return buildAllActivityTrend(sessions, now);
  }
  const config = TREND_CONFIG[range];
  const buckets = new Array<number>(config.count).fill(0);
  for (const session of sessions) {
    const iso = session.savedAt ?? session.startedAt;
    if (!iso) continue;
    const epoch = new Date(iso).getTime();
    if (Number.isNaN(epoch)) continue;
    const ago = Math.floor((now - epoch) / config.stepMs);
    if (ago < 0 || ago >= config.count) continue;
    buckets[config.count - 1 - ago] += 1;
  }
  const points: TrendPoint[] = buckets.map((value, index) => {
    const ago = config.count - 1 - index;
    return {
      value,
      label: ago === 0 ? config.endLabel : `${ago}${config.unit} 전`,
      isCurrent: ago === 0,
    };
  });
  return { points, startLabel: `${config.count}${config.unit} 전`, endLabel: config.endLabel };
}

function buildAllActivityTrend(
  sessions: StoredSessionSummary[],
  now: number,
): ActivityTrend {
  const epochs = sessions
    .map(sessionTimestamp)
    .filter((epoch): epoch is number => epoch !== null && epoch <= now);
  if (epochs.length === 0) {
    const config = TREND_CONFIG.all;
    return {
      points: Array.from({ length: config.count }, (_, index) => ({
        value: 0,
        label: index === config.count - 1 ? config.endLabel : `${config.count - 1 - index}${config.unit} 전`,
        isCurrent: index === config.count - 1,
      })),
      startLabel: "전체",
      endLabel: config.endLabel,
    };
  }

  const count = TREND_CONFIG.all.count;
  const first = Math.min(...epochs);
  const span = Math.max(now - first, count * DAY_MS);
  const start = now - span;
  const stepMs = Math.max(span / count, DAY_MS);
  const buckets = new Array<number>(count).fill(0);
  for (const epoch of epochs) {
    const index = Math.min(Math.floor((epoch - start) / stepMs), count - 1);
    buckets[index] += 1;
  }
  const points: TrendPoint[] = buckets.map((value, index) => {
    const bucketStart = start + stepMs * index;
    return {
      value,
      label: index === count - 1 ? "오늘" : formatBucketDate(bucketStart),
      isCurrent: index === count - 1,
    };
  });
  return { points, startLabel: formatBucketDate(start), endLabel: "오늘" };
}

function sessionTimestamp(session: StoredSessionSummary): number | null {
  const iso = session.savedAt ?? session.startedAt;
  if (!iso) return null;
  const epoch = new Date(iso).getTime();
  return Number.isNaN(epoch) ? null : epoch;
}

function formatBucketDate(epoch: number): string {
  const date = new Date(epoch);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export type KpiDelta = {
  /** Value over the current 7-day window. */
  current: number;
  /** Value over the prior 7-day window. */
  previous: number;
  delta: number;
  direction: "up" | "down" | "flat";
  /** Whether any session predates this week, so a comparison is honest. */
  hasPrior: boolean;
};

export type KpiDeltas = { sessions: KpiDelta; tokens: KpiDelta };

/**
 * Honest week-over-week deltas for the session and token KPIs, derived only
 * from session timestamps + `tokenTotal`. When no session predates the current
 * week, `hasPrior` is false so the UI can say "이전 기록 없음" rather than
 * implying a comparison against a fabricated zero baseline.
 */
export function buildKpiDeltas(
  sessions: StoredSessionSummary[],
  now: number = Date.now(),
): KpiDeltas {
  const weekAgo = now - WEEK_MS;
  const twoWeeksAgo = now - 2 * WEEK_MS;
  let curSessions = 0;
  let prevSessions = 0;
  let curTokens = 0;
  let prevTokens = 0;
  let hasPrior = false;
  for (const session of sessions) {
    const iso = session.savedAt ?? session.startedAt;
    if (!iso) continue;
    const epoch = new Date(iso).getTime();
    if (Number.isNaN(epoch)) continue;
    const tokens = session.tokenTotal ?? 0;
    if (epoch <= weekAgo) hasPrior = true;
    if (epoch > weekAgo && epoch <= now) {
      curSessions += 1;
      curTokens += tokens;
    } else if (epoch > twoWeeksAgo && epoch <= weekAgo) {
      prevSessions += 1;
      prevTokens += tokens;
    }
  }
  return {
    sessions: toDelta(curSessions, prevSessions, hasPrior),
    tokens: toDelta(curTokens, prevTokens, hasPrior),
  };
}

function toDelta(current: number, previous: number, hasPrior: boolean): KpiDelta {
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    hasPrior,
  };
}

/** Open count for a given review lens. "all" returns the combined score. */
export function attentionValue(project: ProjectStatus, lens: AttentionLens): number {
  switch (lens) {
    case "issues":
      return project.openIssues;
    case "decisions":
      return project.unconfirmedDecisions;
    case "next":
      return project.pendingNextActions;
    default:
      return project.attentionScore;
  }
}

/**
 * The single source of truth for the project matrix order + membership: text
 * query, then an optional sticky project focus, then an optional review lens
 * (which both filters to non-zero rows and re-ranks by that category). With no
 * focus or lens the chosen `SortControl` sort applies.
 */
export function applyDashboardFilters(
  projects: ProjectStatus[],
  opts: { query: string; sort: SortKey; focusKey: string | null; lens: AttentionLens },
): ProjectStatus[] {
  const needle = opts.query.trim().toLowerCase();
  let base = needle
    ? projects.filter((project) =>
        `${project.name} ${project.sourceLabel ?? ""}`.toLowerCase().includes(needle),
      )
    : projects;
  if (opts.focusKey) {
    base = base.filter((project) => project.key === opts.focusKey);
  }
  if (opts.lens !== "all") {
    const lens = opts.lens;
    return [...base]
      .filter((project) => attentionValue(project, lens) > 0)
      .sort((a, b) => attentionValue(b, lens) - attentionValue(a, lens) || byRecent(a, b));
  }
  return sortProjects(base, opts.sort);
}

function latestSession(rows: SessionRow[]): SessionRow | null {
  return (
    [...rows].sort((a, b) => {
      const aKey = a.savedAt ?? a.startedAt ?? "";
      const bKey = b.savedAt ?? b.startedAt ?? "";
      return bKey.localeCompare(aKey);
    })[0] ?? null
  );
}

export function safeLoadMemoryBody(
  repository: DashboardRepository,
  sessionId: string,
): DashboardMemoryBody | null {
  if (isDemoSessionId(sessionId)) {
    const demo = buildDemoSessionContent(sessionId);
    if (demo) {
      return {
        issues: demo.issues,
        decisions: demo.decisions,
        nextActions: demo.nextActions,
      };
    }
  }
  try {
    return repository.loadSessionMemoryBody(sessionId);
  } catch {
    return null;
  }
}

export function fraction(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || value <= 0 || max <= 0) return 0;
  return Math.min(value / max, 1);
}

export function formatCount(value: number): string {
  if (value < 1000) return String(value);
  const k = value / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
}
