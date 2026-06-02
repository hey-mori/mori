import type { ProjectSessionRow } from "./projectOverview";

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
 * It is deliberately honest about its data basis. Today the only evidence is the
 * project's already-saved sessions, so every field is derived from saved session
 * rows and `basis` is always `"savedSessions"`. Deterministic rules decide the
 * signal status; no LLM and no background watcher is involved. `riskDetected`
 * and `blocked` are reserved for later live slices and are never produced from
 * saved data, so the strip cannot overclaim a liveness it does not have.
 */

export type ProjectSignalStatus =
  | "quiet"
  | "active"
  | "needsAttention"
  // Reserved for later live / risk slices — not derivable from saved sessions.
  | "riskDetected"
  | "blocked";

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
  /** Honest data basis: derived only from saved sessions, no live follow. */
  basis: "savedSessions";
  /** Whether the strip has something worth showing (hidden when quiet). */
  hasContent: boolean;
};

export type BuildProjectStateSummaryInput = {
  rows: ReadonlyArray<ProjectSessionRow>;
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

  const signalStatus: ProjectSignalStatus =
    needsReviewSessions > 0
      ? "needsAttention"
      : recentlyActiveSessions > 0
        ? "active"
        : "quiet";

  return {
    signalStatus,
    needsReviewSessions,
    recentlyActiveSessions,
    reviewItemCount,
    totalSessions: rows.length,
    latest,
    attention,
    basis: "savedSessions",
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
