import type { NextAction } from "../../domain/types";

/**
 * Next Action completion — pure helpers.
 *
 * Next Action completion is a user correction, not an automatic AI act.
 * These helpers stay free of React + storage code so every surface
 * (Review, Workspace, Reports, Resume, Project Memory, Companion)
 * derives pending / completed state the same way. A `NextAction`
 * without a `done` field is treated as pending — old sessions saved
 * before this capability stay valid.
 */

/** True when the user has explicitly marked the action done. */
export function isNextActionCompleted(action: NextAction): boolean {
  return action.done === true;
}

/**
 * Return a copy of the action with the requested completion state.
 * Completing stamps `completedAt`; reopening clears it so a reopened
 * action never carries a stale completion timestamp.
 */
export function withNextActionCompletion(
  action: NextAction,
  completed: boolean,
  now: string,
): NextAction {
  if (completed) {
    return { ...action, done: true, completedAt: now };
  }
  return { ...action, done: false, completedAt: undefined };
}

/** Split actions into pending and completed, preserving order. */
export function splitNextActionsByCompletion(actions: NextAction[]): {
  pending: NextAction[];
  completed: NextAction[];
} {
  const pending: NextAction[] = [];
  const completed: NextAction[] = [];
  for (const action of actions) {
    (isNextActionCompleted(action) ? completed : pending).push(action);
  }
  return { pending, completed };
}

/** Count totals so progress surfaces never re-derive the split. */
export function countNextActionCompletion(actions: NextAction[]): {
  total: number;
  pending: number;
  completed: number;
} {
  const completed = actions.filter(isNextActionCompleted).length;
  return { total: actions.length, pending: actions.length - completed, completed };
}
