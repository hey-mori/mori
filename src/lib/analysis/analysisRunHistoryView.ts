import type { AnalysisProviderName } from "./analysisTypes";
import {
  describeAnalysisRunReason,
  diffAnalysisRuns,
  type AnalysisRunDiff,
  type AnalysisRunHistory,
  type AnalysisRunReason,
} from "./analysisRunHistory";

/**
 * Display-ready projection of an analysis run history: every run newest
 * first, each carrying its inspectable reason and a compact Korean
 * summary of what changed versus the immediately-previous (older) run.
 * Pure presentation derivation, no IO. Surfaces render this so the run
 * list, the adopted-run marker, the run reason, and the re-analysis diff
 * all come from one tested source.
 */
export type AnalysisRunRowViewModel = {
  runId: string;
  /** The run currently adopted as the live understanding. */
  isCurrent: boolean;
  providerName: AnalysisProviderName;
  providerLabel: string;
  generatedAt: string;
  durationMs: number;
  confidence: number;
  reason: AnalysisRunReason;
  /** Diff against the immediately-previous (older) run; null for the oldest. */
  diffVsPrevious: AnalysisRunDiff | null;
  /**
   * Compact Korean change summary versus the previous run, e.g.
   * "이슈 +1 ~1 · 결정 -1" or "변화 없음". Null for the oldest run, which
   * has nothing to compare against.
   */
  changeSummary: string | null;
};

export type AnalysisRunHistoryViewModel = {
  sessionId: string;
  runCount: number;
  currentRunId: string;
  /** Newest run first. */
  rows: AnalysisRunRowViewModel[];
  /** True once a re-analysis has produced more than one run. */
  hasMultipleRuns: boolean;
};

export function buildAnalysisRunHistoryViewModel(
  history: AnalysisRunHistory,
): AnalysisRunHistoryViewModel {
  const { runs } = history;
  // Diffs are computed oldest-first so each run compares against the one
  // before it; rows are reversed to newest-first for display.
  const rows: AnalysisRunRowViewModel[] = runs.map((run, index) => {
    const previous = index > 0 ? runs[index - 1] : null;
    const diffVsPrevious = previous ? diffAnalysisRuns(previous, run) : null;
    return {
      runId: run.runId,
      isCurrent: run.runId === history.currentRunId,
      providerName: run.providerName,
      providerLabel: run.providerLabel,
      generatedAt: run.generatedAt,
      durationMs: run.durationMs,
      confidence: run.confidence,
      reason: describeAnalysisRunReason(run),
      diffVsPrevious,
      changeSummary: diffVsPrevious ? summarizeRunDiff(diffVsPrevious) : null,
    };
  });
  rows.reverse();

  return {
    sessionId: history.sessionId,
    runCount: runs.length,
    currentRunId: history.currentRunId,
    rows,
    hasMultipleRuns: runs.length > 1,
  };
}

const CATEGORY_LABELS: Array<{ key: keyof Omit<AnalysisRunDiff, "fromRunId" | "toRunId">; label: string }> = [
  { key: "issues", label: "이슈" },
  { key: "decisions", label: "결정" },
  { key: "nextActions", label: "다음 할 일" },
  { key: "relationships", label: "관계" },
];

/**
 * Render a run diff as a compact Korean line. Each changed category
 * contributes `+추가 -제거 ~변경` tokens (carried elements are omitted as
 * noise); a diff with no change reads "변화 없음".
 */
export function summarizeRunDiff(diff: AnalysisRunDiff): string {
  const parts: string[] = [];
  for (const { key, label } of CATEGORY_LABELS) {
    const category = diff[key];
    const tokens: string[] = [];
    if (category.added > 0) tokens.push(`+${category.added}`);
    if (category.removed > 0) tokens.push(`-${category.removed}`);
    if (category.changed > 0) tokens.push(`~${category.changed}`);
    if (tokens.length > 0) parts.push(`${label} ${tokens.join(" ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "변화 없음";
}
