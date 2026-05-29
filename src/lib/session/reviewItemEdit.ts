import type { Decision, Issue, NextAction, Priority } from "../../domain/types";
import type { AnalysisResult } from "../analysis";

export type IssueEditFields = Partial<Pick<Issue, "title" | "description" | "priority">>;
export type DecisionEditFields = Partial<Pick<Decision, "title" | "decision" | "rationale" | "importance">>;
export type NextActionEditFields = Partial<Pick<NextAction, "title" | "priority">>;

const VALID_PRIORITIES: ReadonlySet<Priority> = new Set(["high", "medium", "low"] as const);

function isValidPriority(value: unknown): value is Priority {
  return typeof value === "string" && VALID_PRIORITIES.has(value as Priority);
}

function cleanOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.trim();
}

function hasChanged(current: object, edits: Record<string, unknown>): boolean {
  const record = current as Record<string, unknown>;
  return Object.entries(edits).some(([key, value]) => record[key] !== value);
}

export function setIssueFields(issue: Issue, fields: IssueEditFields, now: string): Issue {
  const edits: IssueEditFields = {};
  const title = cleanOptional(fields.title);
  const description = cleanOptional(fields.description);

  if (title) edits.title = title;
  if (description !== undefined) edits.description = description;
  if (isValidPriority(fields.priority) && fields.priority !== issue.priority) {
    edits.priority = fields.priority;
  }
  if (!hasChanged(issue, edits as Record<string, unknown>)) return issue;

  return {
    ...issue,
    ...edits,
    updatedAt: now,
    editedByUser: true,
    editedAt: now,
  };
}

export function setDecisionFields(
  decision: Decision,
  fields: DecisionEditFields,
  now: string,
): Decision {
  const edits: DecisionEditFields = {};
  const title = cleanOptional(fields.title);
  const decisionText = cleanOptional(fields.decision);
  const rationale = cleanOptional(fields.rationale);

  if (title) edits.title = title;
  if (decisionText !== undefined) edits.decision = decisionText;
  if (rationale !== undefined) edits.rationale = rationale;
  if (isValidPriority(fields.importance) && fields.importance !== decision.importance) {
    edits.importance = fields.importance;
  }
  if (!hasChanged(decision, edits as Record<string, unknown>)) return decision;

  return {
    ...decision,
    ...edits,
    editedByUser: true,
    editedAt: now,
  };
}

export function applyIssueEdit(
  analysis: AnalysisResult,
  issueId: string,
  fields: IssueEditFields,
  now: string,
): AnalysisResult {
  let changed = false;
  const issues = analysis.issues.map((issue) => {
    if (issue.id !== issueId) return issue;
    const next = setIssueFields(issue, fields, now);
    changed = changed || next !== issue;
    return next;
  });

  return changed ? { ...analysis, issues } : analysis;
}

export function applyDecisionEdit(
  analysis: AnalysisResult,
  decisionId: string,
  fields: DecisionEditFields,
  now: string,
): AnalysisResult {
  let changed = false;
  const decisions = analysis.decisions.map((decision) => {
    if (decision.id !== decisionId) return decision;
    const next = setDecisionFields(decision, fields, now);
    changed = changed || next !== decision;
    return next;
  });

  return changed ? { ...analysis, decisions } : analysis;
}

export function setNextActionFields(
  nextAction: NextAction,
  fields: NextActionEditFields,
  now: string,
): NextAction {
  const edits: NextActionEditFields = {};
  const title = cleanOptional(fields.title);

  if (title) edits.title = title;
  if (isValidPriority(fields.priority) && fields.priority !== nextAction.priority) {
    edits.priority = fields.priority;
  }
  if (!hasChanged(nextAction, edits as Record<string, unknown>)) return nextAction;

  return {
    ...nextAction,
    ...edits,
    editedByUser: true,
    editedAt: now,
  };
}

export function applyNextActionEdit(
  analysis: AnalysisResult,
  nextActionId: string,
  fields: NextActionEditFields,
  now: string,
): AnalysisResult {
  let changed = false;
  const nextActions = analysis.nextActions.map((action) => {
    if (action.id !== nextActionId) return action;
    const next = setNextActionFields(action, fields, now);
    changed = changed || next !== action;
    return next;
  });

  return changed ? { ...analysis, nextActions } : analysis;
}
