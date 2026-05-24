import type { Session } from "../../domain/types";
import type { ProductStateTone } from "../product-state/productStateLabels";
import { spanLabel } from "../session/workContext";
import type { StoredSessionSummary } from "../storage/storageTypes";
import {
  buildContributionGrid,
  type ContributionGrid,
  type ContributionMetric,
  type ContributionSample,
} from "./contributionGrid";

/**
 * Home overview view model.
 *
 * The Home dashboard answers four questions at a glance:
 *  1. **What have I worked on** — recent captured sessions across projects.
 *  2. **What needs my attention** — framed as *value the user gains* by acting,
 *     never as a bare "n candidates to review".
 *  3. **What's next** — the key actions (가져오기 / 이어가기 / 리포트) live in the
 *     view's action bar; the value cards point at them.
 *  4. **How am I using AI** — a calm strip of real metrics (session count,
 *     project count, recent activity, reconstructed items). No fabricated
 *     numbers, no charts unless there is genuinely enough data.
 *
 * This module is a pure transform: it never reads storage, never writes, and
 * never invents sessions. The view layer gathers the cheap per-session metric
 * snapshots (issue / decision / next-action / event counts already on disk in
 * the memory body, no full re-parse) and hands them in. That keeps the whole
 * derivation testable and the dashboard honest.
 */

/**
 * Cheap, already-persisted counts for one session. Derived from the stored
 * memory body (issues / decisions / next-actions) plus the import event count
 * — never from a fresh re-parse of the raw conversation. Every field is
 * optional so a session with no analysis yet contributes zero, not noise.
 */
export type HomeSessionMetricSnapshot = {
  sessionId: string;
  /**
   * Reconstructed timeline events. Only the *active* session carries this
   * cheaply (it is already loaded in memory); other sessions omit it rather
   * than pay a full import re-parse. Used only for the aggregate "재구성된
   * 단계" metric, never to gate next-actions.
   */
  events?: number;
  /**
   * Whether the session has any analysis-derived work on disk (issues /
   * decisions / next-actions / a summary snapshot). Cheap to read from the
   * stored memory body. Gates resume / report so they only appear once there
   * is genuinely something to carry forward or summarise.
   */
  hasReconstructedWork?: boolean;
  /** Open (unresolved) issues — carry-forward risk. */
  openIssues?: number;
  /** Total issues reconstructed for the session. */
  issues?: number;
  /** Decisions not yet confirmed by the user. */
  unconfirmedDecisions?: number;
  /** High-importance decisions — the ones worth promoting to memory. */
  importantDecisions?: number;
  /** Total decisions reconstructed for the session. */
  decisions?: number;
  /** Next actions still pending (not user-completed). */
  pendingNextActions?: number;
};

export type HomeOverviewInput = {
  /** Every stored session summary (any project). */
  storedSessions: StoredSessionSummary[];
  /** Cheap per-session counts, keyed nowhere — matched by `sessionId`. */
  sessionMetrics: HomeSessionMetricSnapshot[];
  /**
   * Number of real (non-demo) sessions the user has. Zero means the user is
   * still on the bundled demo — the honest "nothing captured yet" state.
   */
  realSessionCount: number;
  /** Whether the active session is the bundled demo. */
  isDemo: boolean;
  /**
   * The currently-loaded real session, when one is active (not the demo). The
   * view passes its id + real event count so the strip can show live numbers;
   * the rest of its display fields come from the matching stored summary. Null
   * when only the demo is loaded — the strip then falls back to the most-recent
   * captured session.
   */
  activeSession?: {
    sessionId: string;
    /** Real reconstructed event count from the loaded view. */
    eventCount: number;
  } | null;
  /**
   * Which lens the 잔디 heatmap shows. Defaults to `sessions`. When the
   * requested metric has no data anywhere (e.g. no token usage was imported),
   * the grid falls back to `sessions` so it is never empty — the UI disables
   * the unavailable pill rather than showing a blank grid.
   */
  metric?: ContributionMetric;
  /** Clock injection for relative-time labels and recent-activity windows. */
  now?: number;
  /** How many recent sessions to surface in the main list. */
  recentLimit?: number;
};

/** One real, calm metric in the work-summary strip. */
export type HomeMetric = {
  key: string;
  /** Big number / short value ("12", "3", "5월 21일"). */
  value: string;
  /** Small label under the value. */
  label: string;
  /** Optional one-line detail (e.g. "최근 활동 2시간 전"). */
  hint?: string;
};

/** A recent session row in the main list. */
export type HomeRecentSession = {
  sessionId: string;
  title: string;
  status: Session["status"];
  /** Grouping label (project path) or null for manual sessions. */
  projectLabel: string | null;
  /** How the session entered Mori — drives the origin chip. */
  origin: "imported" | "manual" | "demo";
  /** Honest work-span descriptor ("2시간 45분" / "5월 21일") or null. */
  spanLabel: string | null;
  /** Relative-time label for the row's timestamp ("2시간 전"). */
  relativeTime: string;
  /** ISO timestamp the row is anchored to (started, else saved). */
  anchorIso: string;
  /** A short factual count summary ("이벤트 12 · 결정 3") or null when empty. */
  countSummary: string | null;
  /** Whether the row can be opened (real, saved session). */
  canOpen: boolean;
};

/**
 * The kind of value-centric next action. Drives icon + routing in the view.
 * Each is framed around what the user *gains*, not a bare candidate count.
 */
export type HomeNextActionKind =
  | "import"
  | "resume"
  | "review_decisions"
  | "open_issues"
  | "report"
  | "explore_demo"
  | "open_memory";

export type HomeNextActionTone = "accent" | "info" | "success" | "neutral";

/** One value-centric "다음에 할 만한 것" card. */
export type HomeNextAction = {
  key: string;
  kind: HomeNextActionKind;
  /** Calm headline framed as value. */
  title: string;
  /** One sentence: what the user gains by doing this. */
  description: string;
  /** Action label on the card's button. */
  actionLabel: string;
  /** Where the action routes. */
  destination: "connections" | "reports" | "review" | "workspace" | "session" | "memory";
  /** When set, switch to this session before routing. */
  targetSessionId: string | null;
  tone: HomeNextActionTone;
};

/**
 * The current / most-recent session strip at the top of the dashboard.
 *
 * Mori captures runs; it does not stream a live agent. So this is never a
 * "녹화 중" ticker — it shows the *active* session when one is loaded, else the
 * *most-recent captured* session, with a status word that never implies
 * liveness. It is modelled as a `list` of strips (today always length 0 or 1)
 * so a future "multiple tracked sessions" view is a data change, not a
 * component rewrite.
 */
export type HomeCurrentSession = {
  sessionId: string;
  title: string;
  /** Whether this is the live active session (true) or the most-recent one. */
  isActive: boolean;
  /** Project / source grouping label, or null for a manual session. */
  projectLabel: string | null;
  /** How the session entered Mori — drives the origin chip. */
  origin: HomeRecentSession["origin"];
  /**
   * Status word derived from session status. Never "녹화 중" / never a ticker —
   * `최근 작업` for a captured session, `분석 완료` / `분석 중` from status.
   */
  statusLabel: string;
  statusTone: ProductStateTone;
  /** Honest work-span descriptor ("2시간 45분" / "5월 21일") or null. */
  spanLabel: string | null;
  /** Relative-time label for the anchor timestamp ("2시간 전"). */
  relativeTime: string;
  /** Real reconstructed event count — only shown when the session is active. */
  eventCount: number | null;
  /**
   * The single primary action. `resume` (→ reports) when the session has
   * reconstructed work to carry forward; otherwise `open` (→ workspace).
   */
  action: {
    kind: "resume" | "open";
    label: string;
    destination: "reports" | "workspace";
  };
};

/**
 * One mini-panel in the usage section. Each STATES ITS OWN SCOPE so no figure
 * reads as more complete than it is — the section never shows an empty chart
 * or a fabricated split.
 */
export type HomeUsagePanel = {
  key: "tokens" | "cadence" | "projects";
  /** Panel heading — leads with the thing, not a triage count. */
  label: string;
  /** Big value ("8.0K" / "주당 2.5개"). */
  value: string;
  /** One-line scope note — honest about how much data backs the figure. */
  context: string;
  /**
   * Optional tiny bar segments (already normalised to fractions of the whole).
   * Used for the token input/output split; omitted otherwise — no fake bars.
   */
  bar?: { fraction: number; tone: "accent" | "neutral"; label: string }[];
};

export type HomeOverview = {
  /** True when the user has no real sessions — show the honest empty state. */
  isEmpty: boolean;
  /** True when only the bundled demo exists (real count is zero). */
  onlyDemo: boolean;
  /**
   * The top-of-dashboard strip(s). Always 0 or 1 entry today; a list so the
   * future "multiple tracked sessions" feature is a data change, not a rewrite.
   */
  currentSessions: HomeCurrentSession[];
  /**
   * The usage section's mini-panels. Honest by absence: a panel whose data is
   * missing is omitted, and an all-empty section yields an empty array (the
   * view hides the whole band rather than showing zeros).
   */
  usagePanels: HomeUsagePanel[];
  metrics: HomeMetric[];
  recentSessions: HomeRecentSession[];
  nextActions: HomeNextAction[];
  /** Daily activity heatmap over the recent window (the "잔디"). */
  contributionGrid: ContributionGrid;
  /**
   * Whether each 잔디 lens has any non-zero data to show. `sessions` is true
   * whenever there is at least one stored session; `activity` / `tokens` are
   * true only when the derived totals are non-zero. The UI disables a pill
   * whose lens is unavailable rather than rendering an empty grid.
   */
  metricAvailability: Record<ContributionMetric, boolean>;
  /**
   * The lens actually rendered. Equals the requested `metric` when it has
   * data; otherwise falls back to `sessions` so the grid is never blank.
   */
  resolvedMetric: ContributionMetric;
};

/** Never surface more than this many next-action cards — the panel stays calm. */
export const MAX_HOME_NEXT_ACTIONS = 4;

const DEFAULT_RECENT_LIMIT = 6;

/**
 * Build the Home dashboard view model from stored session summaries plus the
 * cheap per-session metric snapshots. Pure and clock-injectable.
 */
export function buildHomeOverview(input: HomeOverviewInput): HomeOverview {
  const now = input.now ?? Date.now();
  const recentLimit = input.recentLimit ?? DEFAULT_RECENT_LIMIT;
  const metricsById = indexMetrics(input.sessionMetrics);

  // Sessions, newest first.
  const active = input.storedSessions
    .slice()
    .sort((a, b) => anchorEpoch(b, now) - anchorEpoch(a, now));

  const onlyDemo = input.realSessionCount === 0;
  const isEmpty = onlyDemo && active.length === 0;

  const recentSessions: HomeRecentSession[] = active
    .slice(0, recentLimit)
    .map((session) => toRecentSession(session, metricsById.get(session.sessionId), now));

  const metrics = isEmpty
    ? []
    : buildMetrics(active, input.sessionMetrics, now);

  const nextActions = isEmpty
    ? buildEmptyNextActions()
    : buildNextActions({ active, metricsById, onlyDemo, now });

  const currentSessions = isEmpty
    ? []
    : buildCurrentSessions({ active, metricsById, activeSession: input.activeSession ?? null, now });

  const usagePanels = isEmpty
    ? []
    : buildUsagePanels(active, now);

  // The activity heatmap spans every stored session's anchor date — archiving
  // organises the list but never erases that the work happened. Build one
  // weighted-sample set per lens; availability is "has any non-zero value".
  const sessionSamples: ContributionSample[] = input.storedSessions.map((session) => ({
    iso: anchorIso(session),
    value: 1,
  }));
  const activitySamples: ContributionSample[] = input.storedSessions.map((session) => ({
    iso: anchorIso(session),
    value: session.eventCount ?? 0,
  }));
  const tokenSamples: ContributionSample[] = input.storedSessions.map((session) => ({
    iso: anchorIso(session),
    value: session.tokenTotal ?? 0,
  }));

  const metricAvailability: Record<ContributionMetric, boolean> = {
    sessions: sessionSamples.some((s) => s.value > 0),
    activity: activitySamples.some((s) => s.value > 0),
    tokens: tokenSamples.some((s) => s.value > 0),
  };

  const requested: ContributionMetric = input.metric ?? "sessions";
  // Fall back to sessions when the requested lens has no data, so the grid is
  // never blank. sessions is available whenever any session exists.
  const resolvedMetric: ContributionMetric = metricAvailability[requested] ? requested : "sessions";

  const samplesForMetric: Record<ContributionMetric, ContributionSample[]> = {
    sessions: sessionSamples,
    activity: activitySamples,
    tokens: tokenSamples,
  };

  const contributionGrid = buildContributionGrid({
    samples: samplesForMetric[resolvedMetric],
    metric: resolvedMetric,
    now,
  });

  return {
    isEmpty,
    onlyDemo,
    currentSessions,
    usagePanels,
    metrics,
    recentSessions,
    nextActions,
    contributionGrid,
    metricAvailability,
    resolvedMetric,
  };
}

// ─── Current / most-recent session strip ──────────────────────────────────────

/**
 * Build the top-of-dashboard strip(s). Returns a list — today always 0 or 1
 * entry — so a future "multiple tracked sessions" surface only changes the
 * data, never the renderer. The chosen session is the *active* one when a real
 * session is loaded (it carries a live event count), otherwise the
 * *most-recent captured* session. Honest by construction: the status word is
 * derived from session status and never implies a live recording.
 */
function buildCurrentSessions(params: {
  active: StoredSessionSummary[];
  metricsById: Map<string, HomeSessionMetricSnapshot>;
  activeSession: { sessionId: string; eventCount: number } | null;
  now: number;
}): HomeCurrentSession[] {
  const { active, metricsById, activeSession, now } = params;

  // Prefer the loaded active session when it is one of the stored summaries;
  // otherwise fall back to the most-recent captured session.
  const activeSummary = activeSession
    ? active.find((session) => session.sessionId === activeSession.sessionId) ?? null
    : null;
  const summary = activeSummary ?? active[0] ?? null;
  if (!summary) return [];

  const isActive = activeSummary !== null;
  const metric = metricsById.get(summary.sessionId);
  const projectLabel = summary.sourceLabel?.trim() ? summary.sourceLabel.trim() : null;
  const eventCount = isActive ? activeSession?.eventCount ?? null : null;
  const hasReconstructedWork = hasWork(metric);

  return [
    {
      sessionId: summary.sessionId,
      title: summary.title,
      isActive,
      projectLabel,
      origin: projectLabel ? "imported" : "manual",
      ...describeCurrentStatus(summary.status),
      spanLabel: spanLabel(summary.startedAt ?? summary.savedAt, undefined),
      relativeTime: formatRelativeKo(anchorIso(summary), now),
      eventCount: eventCount && eventCount > 0 ? eventCount : null,
      action: hasReconstructedWork
        ? { kind: "resume", label: "이어가기", destination: "reports" }
        : { kind: "open", label: "열기", destination: "workspace" },
    },
  ];
}

/**
 * Map a session's lifecycle status to a calm status word + tone. Never
 * "녹화 중" and never a running timer — a captured session reads "최근 작업",
 * an analysing one "분석 중", a finished one "분석 완료".
 */
function describeCurrentStatus(status: Session["status"]): {
  statusLabel: string;
  statusTone: ProductStateTone;
} {
  switch (status) {
    case "analyzing":
      return { statusLabel: "분석 중", statusTone: "info" };
    case "complete":
      return { statusLabel: "분석 완료", statusTone: "success" };
    case "recording":
    default:
      // Mori does not record live; a "recording" session is one still being
      // assembled from imports — surface it as recent work, not a live capture.
      return { statusLabel: "최근 작업", statusTone: "neutral" };
  }
}

// ─── Usage section ────────────────────────────────────────────────────────────

/** Below this many sessions, sessions-per-week is too noisy to state. */
const MIN_SESSIONS_FOR_CADENCE = 2;

/**
 * Build the usage section's mini-panels from the active session summaries.
 * Every panel states its own scope, and any panel whose data is absent is
 * omitted (an all-empty section returns `[]`, and the view hides the band).
 * No fabricated splits, no empty charts.
 */
function buildUsagePanels(active: StoredSessionSummary[], now: number): HomeUsagePanel[] {
  const panels: HomeUsagePanel[] = [];

  const tokens = buildTokenPanel(active);
  if (tokens) panels.push(tokens);

  const cadence = buildCadencePanel(active, now);
  if (cadence) panels.push(cadence);

  const projects = buildProjectSpreadPanel(active);
  if (projects) panels.push(projects);

  return panels;
}

/**
 * Token total + input/output split, summed only across sessions that actually
 * carry token usage. Hidden entirely when no session has tokens — a zero would
 * be dishonest. The scope line states how many sessions backed the figure
 * rather than implying a complete total.
 */
function buildTokenPanel(active: StoredSessionSummary[]): HomeUsagePanel | null {
  let total = 0;
  let input = 0;
  let output = 0;
  let withTokens = 0;
  for (const session of active) {
    if (session.tokenTotal === undefined || session.tokenTotal <= 0) continue;
    withTokens += 1;
    total += session.tokenTotal;
    input += session.tokenInput ?? 0;
    output += session.tokenOutput ?? 0;
  }
  if (withTokens === 0 || total <= 0) return null;

  const splitTotal = input + output;
  const bar =
    splitTotal > 0
      ? [
          { fraction: input / splitTotal, tone: "accent" as const, label: `입력 ${formatCompactCount(input)}` },
          { fraction: output / splitTotal, tone: "neutral" as const, label: `출력 ${formatCompactCount(output)}` },
        ]
      : undefined;

  const context =
    withTokens === active.length
      ? "가져온 세션 전체 합계"
      : `토큰 정보가 있는 세션 ${withTokens}개`;

  return {
    key: "tokens",
    label: "토큰 사용량",
    value: formatCompactCount(total),
    context,
    bar,
  };
}

/**
 * Sessions-per-week from session anchor dates. The span is the calendar gap
 * between the oldest and newest anchor (at least one week), so a single
 * session — or a too-thin sample — yields no panel rather than a misleading
 * "주당 N개".
 */
function buildCadencePanel(active: StoredSessionSummary[], now: number): HomeUsagePanel | null {
  if (active.length < MIN_SESSIONS_FOR_CADENCE) return null;

  let oldest = now;
  let newest = 0;
  for (const session of active) {
    const epoch = anchorEpoch(session, now);
    if (epoch < oldest) oldest = epoch;
    if (epoch > newest) newest = epoch;
  }
  const spanMs = Math.max(newest - oldest, 0);
  const weeks = Math.max(spanMs / (7 * 86_400_000), 1);
  const perWeek = active.length / weeks;
  const value = perWeek >= 10 ? String(Math.round(perWeek)) : perWeek.toFixed(1).replace(/\.0$/, "");

  return {
    key: "cadence",
    label: "작업 빈도",
    value: `주당 ${value}개`,
    context: `세션 ${active.length}개 기준`,
  };
}

/**
 * Top 2–3 source labels by session count, via the existing project counting
 * convention (a source-labelled session groups by its label; a manual session
 * groups by project id, surfaced as "수동 세션"). Hidden when there is only one
 * group — the spread is not yet informative.
 */
function buildProjectSpreadPanel(active: StoredSessionSummary[]): HomeUsagePanel | null {
  const counts = new Map<string, number>();
  for (const session of active) {
    const label = session.sourceLabel?.trim();
    const key = label && label.length > 0 ? label : "수동 세션";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size < 2) return null;

  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => `${shortProjectLabel(label)} ${count}`);

  return {
    key: "projects",
    label: "프로젝트 분포",
    value: String(counts.size),
    context: top.join(" · "),
  };
}

/** Trim a long source path to its trailing segment for the spread context. */
function shortProjectLabel(label: string): string {
  const parts = label.split(/[\\/]/).filter(Boolean);
  const tail = parts.length > 0 ? parts[parts.length - 1]! : label;
  return tail.length <= 18 ? tail : `${tail.slice(0, 17)}…`;
}

// ─── Metrics strip ──────────────────────────────────────────────────────────

function buildMetrics(
  active: StoredSessionSummary[],
  allMetrics: HomeSessionMetricSnapshot[],
  now: number,
): HomeMetric[] {
  const metrics: HomeMetric[] = [];

  metrics.push({
    key: "sessions",
    value: String(active.length),
    label: "세션",
    hint: "가져온 작업 실행",
  });

  const projectCount = countProjects(active);
  metrics.push({
    key: "projects",
    value: String(projectCount),
    label: "프로젝트",
    hint: projectCount === 1 ? "현재 작업 중" : "작업이 걸쳐 있는",
  });

  const totalEvents = allMetrics.reduce((sum, m) => sum + (m.events ?? 0), 0);
  if (totalEvents > 0) {
    metrics.push({
      key: "events",
      value: formatCompactCount(totalEvents),
      label: "재구성된 단계",
      hint: "프롬프트 · 도구 · 결정",
    });
  }

  const mostRecent = active[0];
  if (mostRecent) {
    metrics.push({
      key: "recent",
      value: formatRelativeKo(anchorIso(mostRecent), now),
      label: "최근 활동",
      hint: mostRecent.title,
    });
  }

  return metrics;
}

function countProjects(sessions: StoredSessionSummary[]): number {
  const keys = new Set<string>();
  for (const session of sessions) {
    const label = session.sourceLabel?.trim();
    keys.add(label && label.length > 0 ? `src:${label}` : `proj:${session.projectId}`);
  }
  return keys.size;
}

// ─── Recent session rows ──────────────────────────────────────────────────────

function toRecentSession(
  session: StoredSessionSummary,
  metric: HomeSessionMetricSnapshot | undefined,
  now: number,
): HomeRecentSession {
  const projectLabel = session.sourceLabel?.trim() ? session.sourceLabel.trim() : null;
  const anchor = anchorIso(session);
  return {
    sessionId: session.sessionId,
    title: session.title,
    status: session.status,
    projectLabel,
    origin: projectLabel ? "imported" : "manual",
    spanLabel: spanLabel(session.startedAt ?? session.savedAt, undefined),
    relativeTime: formatRelativeKo(anchor, now),
    anchorIso: anchor,
    countSummary: buildCountSummary(metric),
    canOpen: true,
  };
}

/**
 * Compact factual count line for a recent-session row — only the counts that
 * actually carry signal, so the row stays scannable. Returns null when the
 * session has no reconstructed items yet.
 */
function buildCountSummary(metric: HomeSessionMetricSnapshot | undefined): string | null {
  if (!metric) return null;
  const parts: string[] = [];
  if ((metric.events ?? 0) > 0) parts.push(`이벤트 ${metric.events}`);
  if ((metric.decisions ?? 0) > 0) parts.push(`결정 ${metric.decisions}`);
  if ((metric.issues ?? 0) > 0) parts.push(`이슈 ${metric.issues}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ─── Value-centric next actions ──────────────────────────────────────────────

function buildNextActions(params: {
  active: StoredSessionSummary[];
  metricsById: Map<string, HomeSessionMetricSnapshot>;
  onlyDemo: boolean;
  now: number;
}): HomeNextAction[] {
  const { active, metricsById, onlyDemo } = params;
  const actions: HomeNextAction[] = [];

  // Demo-only: the single honest nudge — there is nothing real to act on yet.
  if (onlyDemo) {
    return buildEmptyNextActions();
  }

  // Aggregate the per-session metric snapshots once.
  let unconfirmedDecisions = 0;
  let importantDecisions = 0;
  let openIssues = 0;
  let pendingNextActions = 0;
  for (const session of active) {
    const metric = metricsById.get(session.sessionId);
    if (!metric) continue;
    unconfirmedDecisions += metric.unconfirmedDecisions ?? 0;
    importantDecisions += metric.importantDecisions ?? 0;
    openIssues += metric.openIssues ?? 0;
    pendingNextActions += metric.pendingNextActions ?? 0;
  }

  // The most recent session is the natural "이어가기" target.
  const mostRecent = active[0] ?? null;
  const recentMetric = mostRecent ? metricsById.get(mostRecent.sessionId) : undefined;

  const recentHasWork = hasWork(recentMetric);

  // 1. Resume — only when there is genuinely something to carry forward
  //    (reconstructed work on the most recent session). Framed as the
  //    context the user takes into the next run, not a bare prompt.
  if (mostRecent && recentHasWork) {
    const pending = recentMetric?.pendingNextActions ?? 0;
    actions.push({
      key: "resume",
      kind: "resume",
      title: `${truncateTitle(mostRecent.title)} 이어가기`,
      description:
        pending > 0
          ? `이 세션의 흐름과 다음 작업 ${pending}개를 다음 실행에 컨텍스트로 가져갈 수 있어요.`
          : "이 세션의 맥락을 Resume 프롬프트로 묶어 다음 실행에 그대로 이어갈 수 있어요.",
      actionLabel: "이어가기 준비",
      destination: "reports",
      targetSessionId: mostRecent.sessionId,
      tone: "info",
    });
  }

  // 2. Review decisions — value: confirming leaves them in project memory.
  if (unconfirmedDecisions > 0) {
    actions.push({
      key: "review-decisions",
      kind: "review_decisions",
      title: "결정을 확인해 메모리에 남기기",
      description: `확인되지 않은 결정 ${unconfirmedDecisions}개가 있어요. 확인하면 프로젝트 메모리에 남아 다음 작업에서 다시 활용됩니다.`,
      actionLabel: "결정 검토",
      destination: "review",
      targetSessionId: pickSessionWith(active, metricsById, (m) => (m.unconfirmedDecisions ?? 0) > 0),
      tone: "accent",
    });
  }

  // 3. Open issues — value: clearing risk before the next run.
  if (openIssues > 0) {
    actions.push({
      key: "open-issues",
      kind: "open_issues",
      title: "열린 이슈 정리하기",
      description: `아직 해결되지 않은 이슈 ${openIssues}개가 있어요. 다음 작업 전에 확인해 두면 같은 문제를 반복하지 않습니다.`,
      actionLabel: "이슈 보기",
      destination: "review",
      targetSessionId: pickSessionWith(active, metricsById, (m) => (m.openIssues ?? 0) > 0),
      tone: "neutral",
    });
  }

  // 4. Report — value: a durable, shareable record of the work.
  if (mostRecent && recentHasWork) {
    actions.push({
      key: "report",
      kind: "report",
      title: "작업을 리포트로 정리하기",
      description:
        "지금까지의 세션을 리포트로 묶으면 팀에 공유하거나 나중에 다시 돌아볼 수 있어요.",
      actionLabel: "리포트 만들기",
      destination: "reports",
      targetSessionId: mostRecent.sessionId,
      tone: "success",
    });
  }

  // Always keep import reachable, but only when nothing else outranks it —
  // otherwise it pushes a genuinely actionable card out of the calm cap.
  if (actions.length < MAX_HOME_NEXT_ACTIONS) {
    actions.push(importNextAction());
  }

  // Importance order: review (memory value) → resume → open issues → report →
  // import. Sort by a fixed rank so the most valuable card leads.
  return sortByRank(actions).slice(0, MAX_HOME_NEXT_ACTIONS);
}

/**
 * Demo / empty state next actions. The import front door leads, followed
 * by two soft entry points so a fresh install never reads as "one card
 * floating in an empty column": one to tour the bundled demo session and
 * one to peek at the memory surface so the user understands what's
 * waiting once real work arrives.
 */
function buildEmptyNextActions(): HomeNextAction[] {
  return [importNextAction(), exploreDemoAction(), openMemoryAction()];
}

function exploreDemoAction(): HomeNextAction {
  return {
    key: "explore-demo",
    kind: "explore_demo",
    title: "데모 세션 둘러보기",
    description:
      "실제 작업을 가져오기 전에 Mori가 세션을 어떻게 정리하는지 데모 세션으로 미리 확인할 수 있어요.",
    actionLabel: "데모 열기",
    destination: "session",
    targetSessionId: null,
    tone: "info",
  };
}

function openMemoryAction(): HomeNextAction {
  return {
    key: "open-memory",
    kind: "open_memory",
    title: "프로젝트 메모리 살펴보기",
    description:
      "결정과 이슈가 어떻게 누적되어 다음 세션의 컨텍스트가 되는지 메모리 페이지에서 미리 볼 수 있어요.",
    actionLabel: "메모리 열기",
    destination: "memory",
    targetSessionId: null,
    tone: "neutral",
  };
}

function importNextAction(): HomeNextAction {
  return {
    key: "import",
    kind: "import",
    title: "Claude 작업 가져오기",
    description:
      "연결에서 Claude 대화를 가져오면 작업이 세션으로 쌓이고, 여기에서 무엇을 했고 다음에 무엇을 하면 좋을지 한눈에 보입니다.",
    actionLabel: "가져오기",
    destination: "connections",
    targetSessionId: null,
    tone: "accent",
  };
}

const NEXT_ACTION_RANK: Record<HomeNextActionKind, number> = {
  review_decisions: 0,
  resume: 1,
  open_issues: 2,
  report: 3,
  import: 4,
  explore_demo: 5,
  open_memory: 6,
};

function sortByRank(actions: HomeNextAction[]): HomeNextAction[] {
  return [...actions].sort(
    (a, b) => NEXT_ACTION_RANK[a.kind] - NEXT_ACTION_RANK[b.kind],
  );
}

/**
 * Whether a session has analysis-derived work worth resuming / reporting.
 * Prefers the explicit `hasReconstructedWork` flag from the memory body;
 * falls back to a non-zero event count (the active session always carries
 * one) or any reconstructed item count.
 */
function hasWork(metric: HomeSessionMetricSnapshot | undefined): boolean {
  if (!metric) return false;
  if (metric.hasReconstructedWork) return true;
  if ((metric.events ?? 0) > 0) return true;
  return (
    (metric.decisions ?? 0) > 0 ||
    (metric.issues ?? 0) > 0 ||
    (metric.pendingNextActions ?? 0) > 0
  );
}

function pickSessionWith(
  sessions: StoredSessionSummary[],
  metricsById: Map<string, HomeSessionMetricSnapshot>,
  predicate: (metric: HomeSessionMetricSnapshot) => boolean,
): string | null {
  for (const session of sessions) {
    const metric = metricsById.get(session.sessionId);
    if (metric && predicate(metric)) return session.sessionId;
  }
  return null;
}

// ─── Origin chip presentation ───────────────────────────────────────────────

const ORIGIN_LABEL: Record<HomeRecentSession["origin"], string> = {
  imported: "가져옴",
  manual: "수동",
  demo: "데모",
};

const ORIGIN_TONE: Record<HomeRecentSession["origin"], ProductStateTone> = {
  imported: "neutral",
  manual: "neutral",
  demo: "accent",
};

export function describeHomeSessionOrigin(origin: HomeRecentSession["origin"]): {
  label: string;
  tone: ProductStateTone;
} {
  return { label: ORIGIN_LABEL[origin], tone: ORIGIN_TONE[origin] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function indexMetrics(
  metrics: HomeSessionMetricSnapshot[],
): Map<string, HomeSessionMetricSnapshot> {
  const map = new Map<string, HomeSessionMetricSnapshot>();
  for (const metric of metrics) map.set(metric.sessionId, metric);
  return map;
}

function anchorIso(session: StoredSessionSummary): string {
  return session.startedAt ?? session.savedAt;
}

function anchorEpoch(session: StoredSessionSummary, fallback: number): number {
  const parsed = new Date(anchorIso(session)).getTime();
  return Number.isNaN(parsed) ? fallback : parsed;
}

function truncateTitle(title: string, max = 24): string {
  const trimmed = title.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** Compact human label for a count: 1234 → "1.2K". Small counts stay exact. */
export function formatCompactCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count < 1000) return String(count);
  const k = count / 1000;
  return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
}

/** Compact Korean relative-time label, clock-injectable for tests. */
export function formatRelativeKo(iso: string, now: number = Date.now()): string {
  const epoch = new Date(iso).getTime();
  if (Number.isNaN(epoch)) return "";
  const diff = now - epoch;
  if (diff < 0) return formatDateKo(epoch);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return formatDateKo(epoch);
}

function formatDateKo(ms: number): string {
  const date = new Date(ms);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}
