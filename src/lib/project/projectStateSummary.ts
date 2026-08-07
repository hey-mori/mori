import type { ProjectSessionRow } from "./projectOverview";
import type { ProjectProjection } from "../live-intake";

/**
 * Project current-state summary — the pure derivation behind the project
 * workspace "현재 상황" glance.
 *
 * The Live Project Intelligence plan (docs/live-project-intelligence.md) splits
 * project awareness into Signal / Summary / Trace. This helper produces the
 * Summary glance the project page shows above its session list: how many
 * sessions are waiting for the user, how much is recently active, and the single
 * latest meaningful update.
 *
 * It is deliberately honest about its data basis. There are two independent
 * inputs and a project may have either, both, or neither: already-saved sessions
 * (retrospective) and the live intake projection (present tense, when Mori was
 * recently watching). `basis` reports which actually contributed, so the strip
 * never implies a reach it lacks. `savedOnly` is the ordinary case for work
 * imported before Mori ever observed it, and it can only ever be retrospective.
 *
 * Deterministic rules decide the signal status; no LLM and no background watcher
 * is involved. `blocked` became derivable once the projection landed. Present
 * tense is bounded by the projection's own freshness rule: it zeroes its live
 * counts once its newest observation goes stale, so a summary built from an
 * aged projection reports no liveness rather than a false one. `riskDetected`
 * stays reserved for the cross-session risk slice.
 */

export type ProjectSignalStatus =
  | "quiet"
  | "active"
  | "needsAttention"
  /** Derived from the live projection: an observed run stopped on a failure. */
  | "blocked"
  // Reserved for the cross-session risk slice; not derivable yet.
  | "riskDetected";

/**
 * Which evidence actually backed this summary.
 *
 * `savedOnly` is not a degraded state, it is the honest description of a project
 * Mori has never watched run. Naming it is what keeps the surface from looking
 * broken on work that predates live observation.
 */
export type ProjectStateBasis = "liveAndSaved" | "liveOnly" | "savedOnly" | "none";

/** The present-tense slice, absent when no live observation contributed. */
export type ProjectStateLive = {
  /** How current the backing observation is; the projection owns this rule. */
  freshness: ProjectProjection["freshness"];
  observedAt: string;
  runningCount: number;
  waitingCount: number;
  blockedCount: number;
  /** In-flight requests, longest-running first. */
  running: ProjectProjection["running"];
};

export type ProjectStateAttentionRow = {
  sessionId: string;
  title: string;
  timestamp: string;
  reviewItemCount: number;
};

export type ProjectStateLatest = {
  sessionId: string;
  title: string;
  timestamp: string;
  reviewItemCount: number;
};

export type ProjectStateSummary = {
  signalStatus: ProjectSignalStatus;
  /** Sessions that hold at least one open review item. */
  needsReviewSessions: number;
  /** Sessions whose last activity falls inside the recent window. */
  recentlyActiveSessions: number;
  /** Total open review items across the project. */
  reviewItemCount: number;
  totalSessions: number;
  /** Most-recent session, or null when the project has none. */
  latest: ProjectStateLatest | null;
  /** Sessions needing review, ranked by review weight then recency, capped. */
  attention: ProjectStateAttentionRow[];
  /** Present-tense state, or null when no live observation contributed. */
  live: ProjectStateLive | null;
  /** Which evidence actually backed this summary. */
  basis: ProjectStateBasis;
  /** Whether the strip has something worth showing (hidden when quiet). */
  hasContent: boolean;
};

export type BuildProjectStateSummaryInput = {
  rows: ReadonlyArray<ProjectSessionRow>;
  /**
   * This project's live projection, when Mori has observed it. The caller is
   * responsible for passing the projection that belongs to the same project as
   * `rows`; this helper does not re-check the identity.
   */
  projection?: ProjectProjection | null;
  /** Reference time for the recency window. Defaults to `Date.now()`. */
  now?: number;
  /** Recency window in ms; a session newer than this counts as active. */
  recentWindowMs?: number;
  /** Max attention rows returned. */
  attentionLimit?: number;
};

const DEFAULT_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ATTENTION_LIMIT = 4;

export function buildProjectStateSummary(
  input: BuildProjectStateSummaryInput,
): ProjectStateSummary {
  const now = input.now ?? Date.now();
  const recentWindowMs = input.recentWindowMs ?? DEFAULT_RECENT_WINDOW_MS;
  const attentionLimit = Math.max(
    1,
    input.attentionLimit ?? DEFAULT_ATTENTION_LIMIT,
  );

  // Most-recent first. Saved rows usually arrive sorted, but the derivation
  // owns its ordering so callers cannot break "latest" by passing them raw.
  const rows = [...input.rows].sort(
    (a, b) => toEpoch(b.timestamp) - toEpoch(a.timestamp),
  );

  let reviewItemCount = 0;
  let needsReviewSessions = 0;
  let recentlyActiveSessions = 0;
  for (const row of rows) {
    const review = row.reviewCount ?? 0;
    reviewItemCount += review;
    if (review > 0) needsReviewSessions += 1;
    if (isRecent(row.timestamp, now, recentWindowMs)) recentlyActiveSessions += 1;
  }

  const attention = rows
    .filter((row) => (row.reviewCount ?? 0) > 0)
    .sort((a, b) => {
      const byReview = (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
      if (byReview !== 0) return byReview;
      return toEpoch(b.timestamp) - toEpoch(a.timestamp);
    })
    .slice(0, attentionLimit)
    .map((row) => ({
      sessionId: row.sessionId,
      title: row.title,
      timestamp: row.timestamp,
      reviewItemCount: row.reviewCount ?? 0,
    }));

  const latestRow = rows[0] ?? null;
  const latest: ProjectStateLatest | null = latestRow
    ? {
        sessionId: latestRow.sessionId,
        title: latestRow.title,
        timestamp: latestRow.timestamp,
        reviewItemCount: latestRow.reviewCount ?? 0,
      }
    : null;

  const projection = input.projection ?? null;
  // The projection already zeroes its counts once its observation is stale, so
  // reading them here cannot resurrect a present tense it withdrew.
  const live: ProjectStateLive | null = projection
    ? {
        freshness: projection.freshness,
        observedAt: projection.observedAt,
        runningCount: projection.runningCount,
        waitingCount: projection.waitingCount,
        blockedCount: projection.blockedCount,
        running: projection.running,
      }
    : null;

  // Blocked outranks review: a stopped run is time-sensitive in a way a queue of
  // review items is not, and it is the one thing here the user may need now.
  const signalStatus: ProjectSignalStatus =
    live && live.blockedCount > 0
      ? "blocked"
      : needsReviewSessions > 0
        ? "needsAttention"
        : (live && (live.runningCount > 0 || live.waitingCount > 0)) ||
            recentlyActiveSessions > 0
          ? "active"
          : "quiet";

  const basis: ProjectStateBasis =
    live && rows.length > 0
      ? "liveAndSaved"
      : live
        ? "liveOnly"
        : rows.length > 0
          ? "savedOnly"
          : "none";

  return {
    signalStatus,
    needsReviewSessions,
    recentlyActiveSessions,
    reviewItemCount,
    totalSessions: rows.length,
    latest,
    attention,
    live,
    basis,
    hasContent: signalStatus !== "quiet",
  };
}

function isRecent(timestamp: string, now: number, windowMs: number): boolean {
  const age = now - toEpoch(timestamp);
  return age >= 0 && age <= windowMs;
}

/**
 * Parse an ISO timestamp to epoch ms. An unparseable timestamp sinks to the
 * oldest position (so it never wins "latest") and reads as non-recent.
 */
function toEpoch(timestamp: string): number {
  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}
