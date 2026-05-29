import type { Issue, NextAction } from "../../domain/types";
import type { AnalysisResult } from "../analysis";

export function buildNextActionFromIssue(issue: Issue): NextAction {
  return {
    id: `nact-user-${issue.id}`,
    sessionId: issue.sessionId,
    title: issue.suggestedNextAction.trim() || `Resolve: ${issue.title}`,
    priority: issue.priority,
    relatedIssueIds: [issue.id],
    relatedEventIds: [...issue.sourceEventIds],
  };
}

export function findNextActionForIssue(
  nextActions: readonly NextAction[],
  issueId: string,
): NextAction | null {
  return nextActions.find((action) => action.relatedIssueIds.includes(issueId)) ?? null;
}

export function promoteIssueToNextAction(
  analysis: AnalysisResult,
  issueId: string,
): { analysis: AnalysisResult; nextAction: NextAction | null; changed: boolean } {
  const issue = analysis.issues.find((entry) => entry.id === issueId);
  if (!issue) return { analysis, nextAction: null, changed: false };

  const existing = findNextActionForIssue(analysis.nextActions, issueId);
  if (existing) {
    return { analysis, nextAction: existing, changed: false };
  }

  const nextAction = buildNextActionFromIssue(issue);
  return {
    analysis: {
      ...analysis,
      nextActions: [...analysis.nextActions, nextAction],
    },
    nextAction,
    changed: true,
  };
}
