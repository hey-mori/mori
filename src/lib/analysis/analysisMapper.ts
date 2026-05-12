import type { Decision, Issue, NextAction, Relationship } from "../../domain/types";
import type {
  AnalysisDecisionCandidate,
  AnalysisIssueCandidate,
  AnalysisNextActionCandidate,
  AnalysisRelationshipCandidate,
  MoriAnalysisInput,
} from "./analysisTypes";

type IdContext = {
  runId: string;
  projectId: string;
  sessionId: string;
  generatedAt: string;
};

export function materializeIssue(
  candidate: AnalysisIssueCandidate,
  index: number,
  context: IdContext,
): Issue {
  const id = `issue-${context.runId}-${index + 1}`;
  return {
    id,
    projectId: context.projectId,
    sessionId: context.sessionId,
    title: candidate.title,
    description: candidate.description,
    status: candidate.status,
    priority: candidate.priority,
    sourceEventIds: candidate.sourceEventIds,
    relatedDecisionIds: candidate.relatedDecisionIds,
    relatedFileIds: candidate.relatedFileIds,
    suggestedNextAction: candidate.suggestedNextAction,
    assignee: candidate.assignee,
    dueDate: candidate.dueDate,
    createdAt: context.generatedAt,
    updatedAt: context.generatedAt,
    confidence: candidate.confidence,
    trustLevel: candidate.trustLevel,
  };
}

export function materializeDecision(
  candidate: AnalysisDecisionCandidate,
  index: number,
  context: IdContext,
): Decision {
  const id = `decision-${context.runId}-${index + 1}`;
  return {
    id,
    projectId: context.projectId,
    sessionId: context.sessionId,
    title: candidate.title,
    decision: candidate.decision,
    rationale: candidate.rationale,
    rejectedOptions: candidate.rejectedOptions,
    impact: candidate.impact,
    sourceEventIds: candidate.sourceEventIds,
    relatedIssueIds: candidate.relatedIssueIds,
    relatedSourceIds: candidate.relatedSourceIds,
    createdAt: context.generatedAt,
    importance: candidate.importance,
    trustLevel: candidate.trustLevel,
    confirmed: candidate.confirmed,
  };
}

export function materializeRelationship(
  candidate: AnalysisRelationshipCandidate,
  index: number,
  context: IdContext,
): Relationship {
  return {
    id: `rel-${context.runId}-${index + 1}`,
    fromId: candidate.fromId,
    fromType: candidate.fromType,
    toId: candidate.toId,
    toType: candidate.toType,
    type: candidate.type,
    confidence: candidate.confidence,
    reason: candidate.reason,
  };
}

export function materializeNextAction(
  candidate: AnalysisNextActionCandidate,
  index: number,
  context: IdContext,
): NextAction {
  return {
    id: `nact-${context.runId}-${index + 1}`,
    sessionId: context.sessionId,
    title: candidate.title,
    priority: candidate.priority,
    relatedIssueIds: candidate.relatedIssueIds,
    relatedEventIds: candidate.relatedEventIds,
  };
}

export function createRunId(input: MoriAnalysisInput, generatedAt: string): string {
  const stamp = generatedAt.replace(/[^0-9]/g, "").slice(0, 14);
  return `run-${input.session.id}-${stamp}`;
}
