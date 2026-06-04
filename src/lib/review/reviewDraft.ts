import type { NormalizedImportCandidate } from "../import";
import type {
  ImportReviewDraft,
  ReviewCounts,
  ReviewEventItem,
  ReviewItemKind,
  ReviewItemStatus,
  ReviewOrigin,
} from "./types";

/**
 * Generate a stable draft id without pulling in a uuid dependency. The id is
 * only used for React keys + telemetry, never as a primary key, so the
 * coarse timestamp + random tail is enough.
 */
function createDraftId(): string {
  return `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build an Import Review draft from a normalized import candidate.
 *
 * An explicitly-connected AI conversation (`ai-transcript`) is a low-stakes,
 * reversible import the user already chose to bring in whole, so its events
 * default to `accepted` — the user just applies once instead of accepting
 * hundreds of turns. Every other origin (connector JSONL, manual note, git
 * diff, URL) keeps per-event `pending` review so the user inspects what is
 * written. Durable memory still requires the separate consolidation gate;
 * this only relaxes the raw-timeline import step.
 */
export function createImportReviewDraft(
  candidate: NormalizedImportCandidate,
  origin: ReviewOrigin,
): ImportReviewDraft {
  const defaultEventStatus: ReviewItemStatus =
    origin === "ai-transcript" ? "accepted" : "pending";
  return {
    id: createDraftId(),
    source: candidate.source,
    events: candidate.events.map<ReviewEventItem>((event) => ({
      id: event.id,
      event,
      status: defaultEventStatus,
    })),
    issues: [],
    decisions: [],
    nextActions: [],
    candidate,
    createdAt: new Date().toISOString(),
    origin,
  };
}

/**
 * Patch a single item's status. Returns a new draft (immutable update) so the
 * store can simply replace `draft` to trigger a React rerender.
 */
export function setReviewItemStatus(
  draft: ImportReviewDraft,
  kind: ReviewItemKind,
  itemId: string,
  status: ReviewItemStatus,
): ImportReviewDraft {
  switch (kind) {
    case "event":
      return {
        ...draft,
        events: draft.events.map((item) =>
          item.id === itemId ? { ...item, status } : item,
        ),
      };
    case "issue":
      return {
        ...draft,
        issues: draft.issues.map((item) =>
          item.id === itemId ? { ...item, status } : item,
        ),
      };
    case "decision":
      return {
        ...draft,
        decisions: draft.decisions.map((item) =>
          item.id === itemId ? { ...item, status } : item,
        ),
      };
    case "nextAction":
      return {
        ...draft,
        nextActions: draft.nextActions.map((item) =>
          item.id === itemId ? { ...item, status } : item,
        ),
      };
  }
}

/**
 * Bulk set all items of a kind to the same status. Used by the "accept all"
 * / "discard all" buttons on the review toolbar.
 */
export function setAllItemsStatus(
  draft: ImportReviewDraft,
  status: ReviewItemStatus,
): ImportReviewDraft {
  return {
    ...draft,
    events: draft.events.map((item) => ({ ...item, status })),
    issues: draft.issues.map((item) => ({ ...item, status })),
    decisions: draft.decisions.map((item) => ({ ...item, status })),
    nextActions: draft.nextActions.map((item) => ({ ...item, status })),
  };
}

/**
 * Apply inline edits to an event item without changing its accept/discard
 * status. The `edits` shape is merged so callers can set fields piecewise.
 */
export function editReviewEvent(
  draft: ImportReviewDraft,
  itemId: string,
  edits: NonNullable<ReviewEventItem["edits"]>,
): ImportReviewDraft {
  return {
    ...draft,
    events: draft.events.map((item) =>
      item.id === itemId
        ? { ...item, edits: { ...(item.edits ?? {}), ...edits } }
        : item,
    ),
  };
}

/**
 * Compute counts (pending / accepted / discarded / total) across every item
 * kind. The review toolbar uses these to show progress without re-walking
 * each list.
 */
export function getReviewCounts(draft: ImportReviewDraft): ReviewCounts {
  const all = [
    ...draft.events,
    ...draft.issues,
    ...draft.decisions,
    ...draft.nextActions,
  ];
  const counts: ReviewCounts = { pending: 0, accepted: 0, discarded: 0, total: all.length };
  for (const item of all) {
    counts[item.status] += 1;
  }
  return counts;
}

/**
 * Build a NormalizedImportCandidate from a draft, keeping only `accepted`
 * events and applying inline edits.
 *
 * Returns `null` if no events were accepted, signalling the caller should
 * not commit anything to the session store.
 */
export function buildAcceptedCandidate(
  draft: ImportReviewDraft,
): NormalizedImportCandidate | null {
  const acceptedEvents = draft.events
    .filter((item) => item.status === "accepted")
    .map((item) => {
      const edits = item.edits ?? {};
      const next = { ...item.event };
      if (edits.title?.trim()) next.title = edits.title.trim();
      if (edits.summary?.trim()) next.summary = edits.summary.trim();
      if (edits.type) next.type = edits.type;
      if (edits.title?.trim() || edits.summary?.trim() || edits.type) {
        next.userModified = true;
      }
      return next;
    });

  if (acceptedEvents.length === 0) return null;

  const acceptedIds = new Set(acceptedEvents.map((event) => event.id));
  const filteredSource = {
    ...draft.source,
    relatedEventIds: draft.source.relatedEventIds.filter((id) => acceptedIds.has(id)),
  };

  return {
    source: filteredSource,
    events: acceptedEvents,
  };
}

/**
 * Returns true if the draft can be applied — at least one event is accepted.
 */
export function isReviewApplyable(draft: ImportReviewDraft): boolean {
  return draft.events.some((item) => item.status === "accepted");
}
