import type { ViewKey } from "../../domain/types";

/**
 * The views that belong to the import / review flow, where a freshly-created
 * import session (one that exists but has nothing applied yet) is legitimately
 * still in play. `start` is the new-session screen; the rest are the Session
 * Detail workspace and its legacy aliases that host the Import Review.
 *
 * Leaving this set without applying means the user walked away from the review,
 * so the empty session should be cleaned up rather than left as an orphan with
 * a dangling review. See {@link isImportFlowView} and App's abandon-on-exit
 * effect.
 */
export const IMPORT_FLOW_VIEWS: readonly ViewKey[] = [
  "start",
  "session",
  "timeline",
  "flow",
  "evidence",
  "review",
  "reports",
];

/**
 * Whether `view` is part of the import / review flow. Used to decide if a
 * pending (not-yet-applied) import session should survive the current
 * navigation: while inside the flow it must, and on the way out it is abandoned
 * if still empty.
 */
export function isImportFlowView(view: ViewKey): boolean {
  return IMPORT_FLOW_VIEWS.includes(view);
}
