/**
 * Promote a Timeline event into a Review issue — pure transform.
 *
 * The Timeline inspector lets the user flag an AI-derived event as an issue
 * worth tracking. The new issue is user-asserted (not an AI inference), so it
 * carries full confidence and an `observed` trust level. Promotion is
 * idempotent: the deterministic `issue-from-<eventId>` id means one event
 * can spawn at most one issue.
 */
import type { Issue, TimelineEvent } from "../../domain/types";
import type { MoriAnalysisResult } from "../analysis";

/** Deterministic id for the issue promoted from a given event. */
export function eventIssueId(eventId: string): string {
  return `issue-from-${eventId}`;
}

/** True when the event has already been promoted to an issue. */
export function isEventPromotedToIssue(
  analysis: MoriAnalysisResult,
  eventId: string,
): boolean {
  const id = eventIssueId(eventId);
  return analysis.issues.some((issue) => issue.id === id);
}

/**
 * Append a user-asserted issue derived from the event. Returns the original
 * analysis unchanged when the event was already promoted, so the caller can
 * skip persistence.
 */
export function createIssueFromEvent(
  analysis: MoriAnalysisResult,
  event: TimelineEvent,
  now: string,
): { analysis: MoriAnalysisResult; changed: boolean } {
  if (isEventPromotedToIssue(analysis, event.id)) {
    return { analysis, changed: false };
  }

  const issue: Issue = {
    id: eventIssueId(event.id),
    projectId: event.projectId,
    sessionId: event.sessionId,
    title: event.title,
    description: event.summary,
    status: "open",
    priority: "medium",
    sourceEventIds: [event.id],
    relatedDecisionIds: [],
    relatedFileIds: [],
    suggestedNextAction: "",
    createdAt: now,
    updatedAt: now,
    editedByUser: true,
    editedAt: now,
    confidence: 1,
    trustLevel: "observed",
  };

  return {
    analysis: { ...analysis, issues: [...analysis.issues, issue] },
    changed: true,
  };
}
