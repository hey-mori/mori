export type EventFocusState = "selected" | "related" | "context";

export type ComputeFocusStateInput = {
  eventId: string;
  selectedEventId: string | null | undefined;
  focusedSet: Set<string>;
};

/**
 * Map a timeline event into one of three explicit focus tiers used by both
 * the canvas card visuals and the mini-map dots. Keeping the mapping pure
 * means the same set of states is used everywhere so "dimmed" never silently
 * means three different things.
 */
export function getEventFocusState(input: ComputeFocusStateInput): EventFocusState {
  if (input.selectedEventId && input.eventId === input.selectedEventId) return "selected";
  if (input.focusedSet.has(input.eventId)) return "related";
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
