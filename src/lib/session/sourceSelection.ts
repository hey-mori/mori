/**
 * Start Session source selection.
 *
 * The Start Session picker lets the user choose which explicit-import
 * sources a new session will draw from. Selection is held as a set of
 * source ids in the view; these pure helpers keep the rules in one
 * tested place:
 *
 *  - only `available` sources can ever be selected — a `planned`
 *    integration must never imply Mori will capture it;
 *  - applying the set back onto the option list is the single bridge
 *    into `createSessionDraft`.
 */

import type { SourceOption } from "../../domain/types";

/** Ids that start selected — the available sources flagged pre-selected. */
export function initialSelectedSourceIds(
  options: readonly SourceOption[],
): Set<string> {
  return new Set(
    options
      .filter((option) => option.status === "available" && option.selected)
      .map((option) => option.id),
  );
}

/**
 * Toggle one source's membership in the selection set. Planned sources
 * are inert — toggling one returns the set unchanged.
 */
export function toggleSourceSelection(
  selected: ReadonlySet<string>,
  option: SourceOption,
): Set<string> {
  if (option.status !== "available") return new Set(selected);
  const next = new Set(selected);
  if (next.has(option.id)) {
    next.delete(option.id);
  } else {
    next.add(option.id);
  }
  return next;
}

/**
 * Project the selection set back onto the option list. Planned sources
 * always come back unselected regardless of the set, so a stale id can
 * never re-enable a not-yet-built integration.
 */
export function applySourceSelection(
  options: readonly SourceOption[],
  selectedIds: ReadonlySet<string>,
): SourceOption[] {
  return options.map((option) => ({
    ...option,
    selected: option.status === "available" && selectedIds.has(option.id),
  }));
}
