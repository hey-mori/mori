/**
 * Pure transform for the Timeline "split event" correction.
 *
 * The AI sometimes bundles two distinct steps into one long event. Split
 * cuts the selected event at its temporal midpoint into two: the original
 * event keeps its id (and therefore every issue / relationship reference)
 * and is trimmed to the first half; a fresh second-half event is inserted
 * right after it, carrying the same evidence sources but no derived links —
 * the user re-links or edits it afterwards.
 *
 * Because the original id is preserved, a split never dangles a reference,
 * so — unlike merge — it needs no analysis remap.
 *
 * Honesty contract: a split is never invented. An event with no genuine
 * end (instantaneous, or `end <= start`) cannot be split, and the helper
 * returns its input by reference so callers skip the persistence write.
 */
import type { TimelineEvent } from "../../domain/types";
import type { StoredSessionImport } from "../storage/storageTypes";

/** True when the event spans a real range that can be cut in two. */
export function canSplitEvent(event: TimelineEvent): boolean {
  if (!event.end) return false;
  return new Date(event.end).getTime() > new Date(event.start).getTime();
}

/** ISO timestamp halfway between two ISO timestamps. */
function midpointIso(start: string, end: string): string {
  const mid = (new Date(start).getTime() + new Date(end).getTime()) / 2;
  return new Date(mid).toISOString();
}

/**
 * Split the event with `eventId` at its temporal midpoint. The original
 * event is trimmed to `[start, mid]`; a new `[mid, end]` event is inserted
 * directly after it within the same import. Returns the original imports
 * array when the event is missing or cannot be split.
 */
export function splitEventAtMidpoint(
  imports: StoredSessionImport[],
  eventId: string,
): StoredSessionImport[] {
  const original = imports
    .flatMap((entry) => entry.events)
    .find((event) => event.id === eventId);
  if (!original || !canSplitEvent(original)) return imports;

  const mid = midpointIso(original.start, original.end as string);
  // A deterministic, collision-free id: the next free `-split-N` index.
  const existingSplits = imports
    .flatMap((entry) => entry.events)
    .filter((event) => event.id.startsWith(`${eventId}-split-`)).length;
  const newId = `${eventId}-split-${existingSplits + 1}`;

  const firstHalf: TimelineEvent = { ...original, end: mid, userModified: true };
  const secondHalf: TimelineEvent = {
    ...original,
    id: newId,
    start: mid,
    end: original.end,
    title: `${original.title} (분할)`,
    // Same evidence backs both halves; derived links stay on the original.
    sourceRefs: [...original.sourceRefs],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    artifactIds: original.artifactIds ? [] : undefined,
    userModified: true,
    userNote: undefined,
    connectorEventId: undefined,
  };

  return imports.map((entry) => {
    const index = entry.events.findIndex((event) => event.id === eventId);
    if (index === -1) return entry;
    const events = entry.events.slice();
    events.splice(index, 1, firstHalf, secondHalf);
    return { ...entry, events };
  });
}
