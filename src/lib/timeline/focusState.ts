export type EventFocusState = "selected" | "related" | "context";

export type ComputeFocusStateInput = {
  itemId: string;
  itemEntityIds?: string[];
  selectedItemId: string | null | undefined;
  focusedSet: Set<string>;
};

/**
 * Map a timeline event into one of three explicit focus tiers used by both
 * the canvas card visuals and the mini-map dots. Keeping the mapping pure
 * means the same set of states is used everywhere so "dimmed" never silently
 * means three different things.
 */
export function getEventFocusState(input: ComputeFocusStateInput): EventFocusState {
  if (input.selectedItemId && input.itemId === input.selectedItemId) return "selected";
  const entityIds = input.itemEntityIds ?? [input.itemId];
  if (entityIds.some((entityId) => input.focusedSet.has(entityId))) return "related";
  return "context";
}

export function focusStateClassName(state: EventFocusState): string {
  switch (state) {
    case "selected":
      return "focus-selected";
    case "related":
      return "focus-related";
    case "context":
      return "focus-context";
  }
}
