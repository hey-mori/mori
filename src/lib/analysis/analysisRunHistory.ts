import type { AnalysisResult } from "./analysisTypes";

/**
 * Append-only analysis run history for a session.
 *
 * Today a session stores a single `AnalysisResult` and re-running Quick
 * Pass (for example with a different local model) overwrites it, so the
 * prior understanding is lost. This helper keeps every run instead and
 * tracks which run is the currently-adopted understanding, so
 * re-analysis is reviewable rather than silently authoritative
 * (Product Principle: AI interpretation is a proposal; user correction
 * is first-class).
 *
 * Pure module: no storage, no IO, no UI. Persistence and surfaces are
 * later slices. See
 * `docs/design/local-llm-understanding-and-live-follow.md` (slice 1).
 */
export type AnalysisRunHistory = {
  sessionId: string;
  /** Chronological, oldest first. The newest run is last. */
  runs: AnalysisResult[];
  /** The run currently treated as the live understanding. */
  currentRunId: string;
};

/** Per-category counts of how the elements differ between two runs. */
export type AnalysisCategoryDiff = {
  /** Present in the newer run, absent in the older one. */
  added: number;
  /** Present in the older run, absent in the newer one. */
  removed: number;
  /** Present in both (by content key) but with a salient field changed. */
  changed: number;
  /** Present in both (by content key) and unchanged. */
  carried: number;
};

export type AnalysisRunDiff = {
  fromRunId: string;
  toRunId: string;
  issues: AnalysisCategoryDiff;
  decisions: AnalysisCategoryDiff;
  nextActions: AnalysisCategoryDiff;
  /**
   * Relationships reference run-stamped element ids, so cross-run
   * identity is coarse: matched by relationship type and endpoint
   * types only. `changed` is always 0 for this category.
   */
  relationships: AnalysisCategoryDiff;
};

/**
 * The inspectable reason a run came out the way it did: which model and
 * provider produced it, when, how long it took, its confidence, what it
 * yielded, and the provider's own notes. Answers "why was this
 * analysed this way" without re-running anything.
 */
export type AnalysisRunReason = {
  runId: string;
  providerName: AnalysisResult["providerName"];
  providerLabel: string;
  generatedAt: string;
  durationMs: number;
  confidence: number;
  inputEventCount: number;
  inputSourceCount: number;
  elementCounts: {
    issues: number;
    decisions: number;
    relationships: number;
    nextActions: number;
  };
  notes: string[];
};

/** Start a history from the first run. The first run is adopted. */
export function createAnalysisRunHistory(result: AnalysisResult): AnalysisRunHistory {
  return {
    sessionId: result.sessionId,
    runs: [result],
    currentRunId: result.runId,
  };
}

/**
 * Append a run and adopt it. A run with an id already present replaces
 * the existing entry in place (a re-materialized identical run is not
 * duplicated); the adopted pointer always moves to the appended run.
 */
export function appendAnalysisRun(
  history: AnalysisRunHistory,
  result: AnalysisResult,
): AnalysisRunHistory {
  const existingIndex = history.runs.findIndex((run) => run.runId === result.runId);
  const runs =
    existingIndex === -1
      ? [...history.runs, result]
      : history.runs.map((run, index) => (index === existingIndex ? result : run));
  return {
    sessionId: history.sessionId,
    runs,
    currentRunId: result.runId,
  };
}

/** The currently-adopted run, or null if the pointer is dangling. */
export function getCurrentRun(history: AnalysisRunHistory): AnalysisResult | null {
  return history.runs.find((run) => run.runId === history.currentRunId) ?? null;
}

/** Look up a run by id. */
export function getAnalysisRun(
  history: AnalysisRunHistory,
  runId: string,
): AnalysisResult | null {
  return history.runs.find((run) => run.runId === runId) ?? null;
}

/**
 * Adopt a different run as the live understanding. No-op (returns the
 * same shape) when the run id is not in the history, so a stale id can
 * never strand the pointer on a missing run.
 */
export function selectAnalysisRun(
  history: AnalysisRunHistory,
  runId: string,
): AnalysisRunHistory {
  if (!history.runs.some((run) => run.runId === runId)) return history;
  return { ...history, currentRunId: runId };
}

/** Runs newest first, for list surfaces. */
export function listAnalysisRunsNewestFirst(
  history: AnalysisRunHistory,
): AnalysisResult[] {
  return [...history.runs].reverse();
}

/** Derive the inspectable reason for a single run. */
export function describeAnalysisRunReason(result: AnalysisResult): AnalysisRunReason {
  return {
    runId: result.runId,
    providerName: result.providerName,
    providerLabel: result.providerLabel,
    generatedAt: result.generatedAt,
    durationMs: result.durationMs,
    confidence: result.confidence,
    inputEventCount: result.inputEventCount,
    inputSourceCount: result.inputSourceCount,
    elementCounts: {
      issues: result.issues.length,
      decisions: result.decisions.length,
      relationships: result.relationships.length,
      nextActions: result.nextActions.length,
    },
    notes: [...result.notes],
  };
}

/**
 * Summarise what changed between two runs so re-analysis is reviewable.
 * Elements are matched by a content key (normalized title) rather than
 * by id, because ids are run-stamped and never match across runs.
 */
export function diffAnalysisRuns(
  previous: AnalysisResult,
  next: AnalysisResult,
): AnalysisRunDiff {
  return {
    fromRunId: previous.runId,
    toRunId: next.runId,
    issues: diffByKey(
      previous.issues,
      next.issues,
      (issue) => normalizeKey(issue.title),
      (a, b) =>
        a.status !== b.status ||
        a.priority !== b.priority ||
        a.trustLevel !== b.trustLevel ||
        (a.description ?? "") !== (b.description ?? ""),
    ),
    decisions: diffByKey(
      previous.decisions,
      next.decisions,
      (decision) => normalizeKey(decision.title),
      (a, b) =>
        a.decision !== b.decision ||
        a.rationale !== b.rationale ||
        a.importance !== b.importance ||
        a.confirmed !== b.confirmed ||
        a.trustLevel !== b.trustLevel,
    ),
    nextActions: diffByKey(
      previous.nextActions,
      next.nextActions,
      (action) => normalizeKey(action.title),
      (a, b) => a.priority !== b.priority,
    ),
    relationships: diffByKey(
      previous.relationships,
      next.relationships,
      (rel) => `${rel.type}|${rel.fromType}|${rel.toType}`,
      () => false,
    ),
  };
}

function diffByKey<T>(
  previous: T[],
  next: T[],
  keyOf: (item: T) => string,
  hasChanged: (a: T, b: T) => boolean,
): AnalysisCategoryDiff {
  const previousByKey = indexByKey(previous, keyOf);
  const nextByKey = indexByKey(next, keyOf);

  let added = 0;
  let removed = 0;
  let changed = 0;
  let carried = 0;

  for (const [key, nextItem] of nextByKey) {
    const previousItem = previousByKey.get(key);
    if (!previousItem) {
      added += 1;
    } else if (hasChanged(previousItem, nextItem)) {
      changed += 1;
    } else {
      carried += 1;
    }
  }

  for (const key of previousByKey.keys()) {
    if (!nextByKey.has(key)) removed += 1;
  }

  return { added, removed, changed, carried };
}

/**
 * Index items by content key, keeping the first occurrence so a run
 * with two same-titled elements does not inflate the carried count.
 */
function indexByKey<T>(items: T[], keyOf: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    if (!map.has(key)) map.set(key, item);
  }
  return map;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
