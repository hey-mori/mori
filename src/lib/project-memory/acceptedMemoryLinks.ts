/**
 * Resolve an accepted memory's provenance refs into concrete navigable
 * targets that the Project Memory drawer can hand off to existing app
 * navigation actions (`setSelectedEventId` + Timeline view,
 * `openReviewItem` + Review view). Only refs that still exist in the
 * active session view become targets — phantom links never appear.
 *
 * Pure module:
 *   - No IO, no mutation of inputs.
 *   - No new app-store actions are introduced; the helper produces
 *     plain selection objects that match `ReviewSelection` and an
 *     event id that the existing `setSelectedEventId` accepts.
 */
import type { Decision, Issue, TimelineEvent } from "../../domain/types";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import type { ReviewSelection } from "../review-workspace/reviewWorkspace";

/** A clickable target produced from a memory's provenance. */
export type AcceptedMemoryLinkTarget =
  | {
      kind: "timelineEvent";
      eventId: string;
      title: string;
      start: string;
    }
  | {
      kind: "review";
      selection: ReviewSelection;
      title: string;
    };

/** Grouped, resolved link targets for one accepted memory. */
export type AcceptedMemoryLinkTargets = {
  /** Timeline events the memory's `evidenceRefs` (kind="event") point at. */
  timelineEvents: AcceptedMemoryLinkTarget[];
  /** Related issues that exist in the active session view. */
  reviewIssues: AcceptedMemoryLinkTarget[];
  /** Related decisions that exist in the active session view. */
  reviewDecisions: AcceptedMemoryLinkTarget[];
};

/** Shape consumed for view-lookup; mirrors the subset of selectSessionView. */
export type AcceptedMemoryLinkViewSlice = {
  events: readonly TimelineEvent[];
  issues: readonly Issue[];
  decisions: readonly Decision[];
};

/**
 * Build the per-memory link targets. Filters out refs whose target item
 * is missing from the active view so the drawer never offers a navigation
 * that would land on nothing. Deduplicates event ids across `evidenceRefs`.
 */
export function buildAcceptedMemoryLinkTargets(
  memory: StoredAcceptedProjectMemory,
  view: AcceptedMemoryLinkViewSlice,
): AcceptedMemoryLinkTargets {
  const eventsById = new Map(view.events.map((event) => [event.id, event]));
  const issuesById = new Map(view.issues.map((issue) => [issue.id, issue]));
  const decisionsById = new Map(
    view.decisions.map((decision) => [decision.id, decision]),
  );

  const timelineEvents: AcceptedMemoryLinkTarget[] = [];
  const seenEventIds = new Set<string>();
  for (const ref of memory.evidenceRefs) {
    if (ref.kind !== "event") continue;
    if (seenEventIds.has(ref.eventId)) continue;
    const event = eventsById.get(ref.eventId);
    if (!event) continue;
    seenEventIds.add(ref.eventId);
    timelineEvents.push({
      kind: "timelineEvent",
      eventId: event.id,
      title: event.title,
      start: event.start,
    });
  }

  const reviewIssues: AcceptedMemoryLinkTarget[] = [];
  for (const issueId of memory.relatedIssueIds) {
    const issue = issuesById.get(issueId);
    if (!issue) continue;
    reviewIssues.push({
      kind: "review",
      selection: { kind: "issue", issueId: issue.id },
      title: issue.title,
    });
  }

  const reviewDecisions: AcceptedMemoryLinkTarget[] = [];
  for (const decisionId of memory.relatedDecisionIds) {
    const decision = decisionsById.get(decisionId);
    if (!decision) continue;
    reviewDecisions.push({
      kind: "review",
      selection: { kind: "decision", decisionId: decision.id },
      title: decision.title,
    });
  }

  return { timelineEvents, reviewIssues, reviewDecisions };
}

/**
 * Count of evidence refs that point at sessions / sources rather than
 * events. The drawer surfaces this so the user sees that some
 * provenance is not navigable from here (it lives in Evidence / the
 * session list) without inventing fake link buttons.
 */
export function countUnlinkableEvidenceRefs(
  memory: StoredAcceptedProjectMemory,
): number {
  let count = 0;
  for (const ref of memory.evidenceRefs) {
    if (ref.kind !== "event") count += 1;
  }
  return count;
}

/**
 * Event refs into a session the view holds whose event is no longer there.
 * A ref into another session cannot be checked from this view and is not
 * counted. The memory is never changed: the count only says what does not
 * resolve, so the drawer can say so instead of quietly showing less. Assumes
 * the view holds every event of a session it holds any of (true today; a
 * paged or filtered view would need its own rule).
 */
export function countUnresolvedEventRefs(
  memory: StoredAcceptedProjectMemory,
  view: AcceptedMemoryLinkViewSlice,
): number {
  const sessions = new Set(view.events.map((event) => event.sessionId));
  const events = new Set(view.events.map((event) => event.id));
  const missing = new Set<string>();
  for (const ref of memory.evidenceRefs) {
    if (ref.kind === "event" && sessions.has(ref.sessionId) && !events.has(ref.eventId)) {
      missing.add(`${ref.sessionId}:${ref.eventId}`);
    }
  }
  return missing.size;
}
