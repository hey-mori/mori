/**
 * Revision coalescing · groups one continuous editing burst into one revision.
 *
 * The kernel's promise is that every change is visible and reversible. It never
 * promised that every 650ms autosave is its own audit entry, and treating it as
 * one is what made a single note cost 64x its own size: each revision carries a
 * full `before` AND `after` copy of the record, body included, so sixty typing
 * bursts on one 15k note measured 968k characters, 18.5% of a browser's 5MB.
 *
 * So a burst supersedes its own previous revision instead of appending a new
 * one: same id (the store keys by it, so the write overwrites), the ORIGINAL
 * `before` (so 되돌리기 reverts the whole burst, not the last keystroke of it),
 * and the newest `after`. Idle breaks the group, which is the same rule an
 * editor's undo stack uses.
 *
 * Reversibility is kept; only its granularity changes, from "each autosave" to
 * "each sitting". Fine-grained undo already lives in the editor itself.
 */
import type { KernelRevision } from "./kernelTypes";

/** Idle gap that ends a burst. Longer than the 650ms autosave debounce by a wide
 *  margin, so continuous writing stays one revision, while coming back to a note
 *  later is a new one worth reverting to separately. */
export const REVISION_COALESCE_WINDOW_MS = 90_000;

/**
 * May `next` supersede `previous` rather than be appended beside it? Only a
 * user's own consecutive plain edits to the same record within the idle window.
 * A status change, a different actor, or a create is always its own entry: those
 * are the events someone actually reads a history for.
 */
export function canCoalesceRevisions(
  previous: KernelRevision,
  next: KernelRevision,
  windowMs: number = REVISION_COALESCE_WINDOW_MS,
): boolean {
  if (previous.recordId !== next.recordId) return false;
  if (previous.operation !== "update" || next.operation !== "update") return false;
  if (previous.actor !== next.actor) return false;
  const gap = Date.parse(next.createdAt) - Date.parse(previous.createdAt);
  if (Number.isNaN(gap) || gap < 0) return false;
  return gap <= windowMs;
}

/**
 * The revision to actually write: either `next` untouched, or `next` rewritten
 * to take over `previous`'s identity and starting point.
 */
export function coalesceRevision(
  previous: KernelRevision | undefined,
  next: KernelRevision,
  windowMs: number = REVISION_COALESCE_WINDOW_MS,
): KernelRevision {
  if (!previous || !canCoalesceRevisions(previous, next, windowMs)) return next;
  return { ...next, id: previous.id, before: previous.before };
}
