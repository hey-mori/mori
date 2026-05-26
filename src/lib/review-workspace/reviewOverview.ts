/**
 * View model for the Review **main-canvas** overview strip.
 *
 * The session-level review status (how much still needs attention, the issue
 * lifecycle breakdown, the priority distribution) used to live in a tall
 * right-rail summary panel — which meant the user had to read the side panel
 * to understand the page. This helper derives that same signal as a compact,
 * presentation-ready model so the strip can sit in the main canvas and the
 * rail can stay a pure context inspector for the selected item.
 *
 * Pure data only: counts and percentages, no copy. The component owns the
 * Korean labels so tests assert numbers, not strings.
 */
import type { IssuePriorityCounts, ReviewSummary } from "./reviewWorkspace";

/** The three things that still need a reviewer's attention, in display order. */
export type ReviewAttentionKey =
  | "unresolvedIssues"
  | "unconfirmedDecisions"
  | "lowConfidence";

export type ReviewOverviewModel = {
  /** False when there is nothing to summarize (no issues / decisions / actions). */
  visible: boolean;
  /** Sum of open issues + unconfirmed decisions + low-confidence inferred items. */
  attentionTotal: number;
  /** True when `attentionTotal` is zero — everything has been reviewed. */
  allClear: boolean;
  /** Only the non-zero attention buckets, in stable display order. */
  attention: { key: ReviewAttentionKey; value: number }[];
  /** Issue lifecycle counts. */
  issueStatus: {
    open: number;
    inProgress: number;
    resolved: number;
    watching: number;
  };
  /** Issue priority distribution + bar segment widths (0–100, rounded). */
  priority: {
    high: number;
    medium: number;
    low: number;
    total: number;
    highPct: number;
    mediumPct: number;
    lowPct: number;
  };
};

export function buildReviewOverviewModel({
  summary,
  priorities,
}: {
  summary: ReviewSummary;
  /** Issue priority counts from `countIssuePriorities`, used for the bar. */
  priorities: IssuePriorityCounts;
}): ReviewOverviewModel {
  const attentionEntries: { key: ReviewAttentionKey; value: number }[] = [
    { key: "unresolvedIssues", value: summary.unresolvedIssueCount },
    { key: "unconfirmedDecisions", value: summary.unconfirmedDecisionCount },
    { key: "lowConfidence", value: summary.lowConfidenceCount },
  ];
  const attention = attentionEntries.filter((entry) => entry.value > 0);
  const attentionTotal = attentionEntries.reduce((sum, entry) => sum + entry.value, 0);

  const { high, medium, low } = priorities;
  const total = high + medium + low;
  const denominator = total > 0 ? total : 1;

  return {
    visible:
      summary.issueCount > 0 ||
      summary.decisionCount > 0 ||
      summary.nextActionCount > 0,
    attentionTotal,
    allClear: attentionTotal === 0,
    attention,
    issueStatus: {
      open: summary.unresolvedIssueCount,
      inProgress: summary.inProgressIssueCount,
      resolved: summary.resolvedIssueCount,
      watching: summary.watchingIssueCount,
    },
    priority: {
      high,
      medium,
      low,
      total,
      highPct: Math.round((high / denominator) * 100),
      mediumPct: Math.round((medium / denominator) * 100),
      lowPct: Math.round((low / denominator) * 100),
    },
  };
}
