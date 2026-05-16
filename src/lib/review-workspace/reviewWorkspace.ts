import type {
  Decision,
  Issue,
  IssueStatus,
  NextAction,
  Priority,
  TimelineEvent,
} from "../../domain/types";

/**
 * Pure derivations for the Review workspace. These helpers stay free of
 * React + storage code so the UI can render any session state (demo,
 * draft, post-Quick-Pass) without scattering filter logic across components.
 */

export type IssuePriorityCounts = Record<Priority, number>;

export type IssueStatusCounts = Record<IssueStatus, number>;

export type DecisionImportanceCounts = Record<Priority, number>;

export const ISSUE_STATUS_ORDER: IssueStatus[] = ["open", "inProgress", "resolved", "watching"];

/**
 * Group issues by their status. Always returns one entry per status so the
 * kanban can render empty columns deterministically.
 */
export function groupIssuesByStatus(issues: Issue[]): Record<IssueStatus, Issue[]> {
  const buckets: Record<IssueStatus, Issue[]> = {
    open: [],
    inProgress: [],
    resolved: [],
    watching: [],
  };
  for (const issue of issues) {
    buckets[issue.status].push(issue);
  }
  return buckets;
}

export function countIssueStatuses(issues: Issue[]): IssueStatusCounts {
  const counts: IssueStatusCounts = { open: 0, inProgress: 0, resolved: 0, watching: 0 };
  for (const issue of issues) counts[issue.status] += 1;
  return counts;
}

export function countIssuePriorities(issues: Issue[]): IssuePriorityCounts {
  const counts: IssuePriorityCounts = { high: 0, medium: 0, low: 0 };
  for (const issue of issues) counts[issue.priority] += 1;
  return counts;
}

export function countDecisionImportance(decisions: Decision[]): DecisionImportanceCounts {
  const counts: DecisionImportanceCounts = { high: 0, medium: 0, low: 0 };
  for (const decision of decisions) counts[decision.importance] += 1;
  return counts;
}

export type ReviewSummary = {
  issueCount: number;
  decisionCount: number;
  nextActionCount: number;
  unresolvedIssueCount: number;
  inProgressIssueCount: number;
  resolvedIssueCount: number;
  watchingIssueCount: number;
  unconfirmedDecisionCount: number;
  highPriorityIssueCount: number;
  highImportanceDecisionCount: number;
  lowConfidenceCount: number;
};

const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Aggregate counts used by the right summary panel. "Unresolved" rolls up
 * open issues, unconfirmed decisions, and any low-confidence inferred item
 * so the summary chip line can stay honest about what still needs review.
 */
export function getReviewSummary({
  issues,
  decisions,
  nextActions,
}: {
  issues: Issue[];
  decisions: Decision[];
  nextActions: NextAction[];
}): ReviewSummary {
  const issueStatuses = countIssueStatuses(issues);
  const issuePriorities = countIssuePriorities(issues);
  const importanceCounts = countDecisionImportance(decisions);
  const unconfirmedDecisionCount = decisions.filter((decision) => !decision.confirmed).length;
  const lowConfidenceItems = countLowConfidenceItems(issues, decisions);

  return {
    issueCount: issues.length,
    decisionCount: decisions.length,
    nextActionCount: nextActions.length,
    unresolvedIssueCount: issueStatuses.open,
    inProgressIssueCount: issueStatuses.inProgress,
    resolvedIssueCount: issueStatuses.resolved,
    watchingIssueCount: issueStatuses.watching,
    unconfirmedDecisionCount,
    highPriorityIssueCount: issuePriorities.high,
    highImportanceDecisionCount: importanceCounts.high,
    lowConfidenceCount: lowConfidenceItems,
  };
}

function countLowConfidenceItems(issues: Issue[], decisions: Decision[]): number {
  let count = 0;
  for (const issue of issues) {
    if (issue.trustLevel === "inferred" && issue.confidence < LOW_CONFIDENCE_THRESHOLD) count += 1;
  }
  for (const decision of decisions) {
    if (decision.trustLevel === "inferred" && !decision.confirmed) count += 1;
  }
  return count;
}

/**
 * Discriminated union of items shown in the Unresolved tab. The Review UI
 * uses the `kind` discriminator to pick the right row renderer.
 */
export type UnresolvedItem =
  | { kind: "issue"; issue: Issue; reason: UnresolvedReason }
  | { kind: "decision"; decision: Decision; reason: UnresolvedReason }
  | { kind: "nextAction"; nextAction: NextAction; reason: UnresolvedReason };

export type UnresolvedReason =
  | "open-issue"
  | "in-progress-issue"
  | "low-confidence-issue"
  | "unconfirmed-decision"
  | "low-confidence-decision"
  | "pending-next-action";

/**
 * Compute the "Unresolved" tab feed. Items appear in a stable priority order
 * so the panel does not jitter between renders.
 */
export function getUnresolvedItems({
  issues,
  decisions,
  nextActions,
}: {
  issues: Issue[];
  decisions: Decision[];
  nextActions: NextAction[];
}): UnresolvedItem[] {
  const items: UnresolvedItem[] = [];

  for (const issue of issues) {
    if (issue.status === "open") {
      items.push({ kind: "issue", issue, reason: "open-issue" });
      continue;
    }
    if (issue.status === "inProgress") {
      items.push({ kind: "issue", issue, reason: "in-progress-issue" });
      continue;
    }
    if (issue.trustLevel === "inferred" && issue.confidence < LOW_CONFIDENCE_THRESHOLD) {
      items.push({ kind: "issue", issue, reason: "low-confidence-issue" });
    }
  }

  for (const decision of decisions) {
    if (!decision.confirmed && decision.trustLevel === "inferred") {
      items.push({ kind: "decision", decision, reason: "low-confidence-decision" });
      continue;
    }
    if (!decision.confirmed) {
      items.push({ kind: "decision", decision, reason: "unconfirmed-decision" });
    }
  }

  for (const nextAction of nextActions) {
    items.push({ kind: "nextAction", nextAction, reason: "pending-next-action" });
  }

  return sortUnresolved(items);
}

const REASON_ORDER: Record<UnresolvedReason, number> = {
  "open-issue": 0,
  "in-progress-issue": 1,
  "low-confidence-issue": 2,
  "unconfirmed-decision": 3,
  "low-confidence-decision": 4,
  "pending-next-action": 5,
};

function sortUnresolved(items: UnresolvedItem[]): UnresolvedItem[] {
  return [...items].sort((a, b) => {
    const aWeight = REASON_ORDER[a.reason];
    const bWeight = REASON_ORDER[b.reason];
    if (aWeight !== bWeight) return aWeight - bWeight;
    const aPriority = priorityWeight(itemPriority(a));
    const bPriority = priorityWeight(itemPriority(b));
    if (aPriority !== bPriority) return aPriority - bPriority;
    return itemId(a).localeCompare(itemId(b));
  });
}

function itemPriority(item: UnresolvedItem): Priority {
  if (item.kind === "issue") return item.issue.priority;
  if (item.kind === "decision") return item.decision.importance;
  return item.nextAction.priority;
}

function itemId(item: UnresolvedItem): string {
  if (item.kind === "issue") return item.issue.id;
  if (item.kind === "decision") return item.decision.id;
  return item.nextAction.id;
}

function priorityWeight(priority: Priority): number {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

export type ReviewSelection =
  | { kind: "issue"; issueId: string }
  | { kind: "decision"; decisionId: string }
  | { kind: "nextAction"; nextActionId: string }
  | { kind: "none" };

/**
 * Choose a default selection so the right-side detail panel is never empty
 * when content exists. Priority order matches user expectation:
 *
 *   open issues -> in-progress issues -> first decision -> first next action
 */
export function pickDefaultReviewSelection({
  issues,
  decisions,
  nextActions,
}: {
  issues: Issue[];
  decisions: Decision[];
  nextActions: NextAction[];
}): ReviewSelection {
  const grouped = groupIssuesByStatus(issues);
  const open = grouped.open[0];
  if (open) return { kind: "issue", issueId: open.id };
  const inProgress = grouped.inProgress[0];
  if (inProgress) return { kind: "issue", issueId: inProgress.id };
  if (issues[0]) return { kind: "issue", issueId: issues[0].id };
  if (decisions[0]) return { kind: "decision", decisionId: decisions[0].id };
  if (nextActions[0]) return { kind: "nextAction", nextActionId: nextActions[0].id };
  return { kind: "none" };
}

export function priorityTone(priority: Priority): "red" | "orange" | "blue" {
  if (priority === "high") return "red";
  if (priority === "medium") return "orange";
  return "blue";
}

export function issueStatusTone(status: IssueStatus): "red" | "orange" | "green" | "gray" {
  if (status === "open") return "red";
  if (status === "inProgress") return "orange";
  if (status === "resolved") return "green";
  return "gray";
}

/**
 * Compose a stable hash for a unresolved reason → label mapping. Pure so
 * the row renderer never invents new copy.
 */
export const UNRESOLVED_REASON_LABEL: Record<UnresolvedReason, string> = {
  "open-issue": "Open 이슈",
  "in-progress-issue": "진행 중 이슈",
  "low-confidence-issue": "낮은 신뢰도 이슈",
  "unconfirmed-decision": "미확정 결정",
  "low-confidence-decision": "추론된 결정",
  "pending-next-action": "다음 액션",
};

/**
 * Find which timeline events are referenced by a set of source-event ids.
 * Kept as a tiny pure helper so the detail panel does not need its own
 * lookup map.
 */
export function findEvents(events: TimelineEvent[], ids: string[]): TimelineEvent[] {
  const set = new Set(ids);
  return events.filter((event) => set.has(event.id));
}
