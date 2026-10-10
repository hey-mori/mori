/**
 * Which event ids a reopen must not rename.
 *
 * Reopening a discovered session can give its last stored prompt a new id
 * once the reply is in (`planSourceReopen`). The adopted analysis, and the
 * memory body projected from it, follow that rename. Anything else that
 * cites the old id cannot, so such an event keeps its id:
 *
 * - accepted project memory evidence. On desktop it lives in SQLite
 *   (`AcceptedMemoryRepository`), so it must be read from there (plus any a
 *   failed SQLite save left in app storage);
 * - analysis runs other than the adopted one. Only the adopted run is
 *   remapped, and adopting an older run later must not land on an event
 *   that no longer exists.
 *
 * When accepted memory could not be read from where it lives, the answer is
 * unknown and the caller treats every event as cited: a prompt that keeps
 * its old id loses nothing, a citation that dangles loses its evidence.
 */
import type { AnalysisResult } from "../analysis";
import type { AnalysisRunHistory } from "../analysis/analysisRunHistory";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

/** Event ids one analysis run cites. */
export function eventIdsCitedByAnalysis(analysis: AnalysisResult): string[] {
  // Stored runs come from older builds too: a missing list cites nothing.
  return [
    ...(analysis.issues ?? []).flatMap((issue) => issue.sourceEventIds ?? []),
    ...(analysis.decisions ?? []).flatMap((decision) => decision.sourceEventIds ?? []),
    ...(analysis.nextActions ?? []).flatMap((action) => action.relatedEventIds ?? []),
    ...(analysis.relationships ?? []).flatMap((relationship) => [relationship.fromId, relationship.toId]),
  ];
}

/**
 * @param accepted every accepted project memory, or null when they could not
 *   be read from their store (the result is then null: unknown).
 */
export function eventIdsCitedOutsideAdoptedRun(
  sessionId: string,
  accepted: readonly StoredAcceptedProjectMemory[] | null,
  history: AnalysisRunHistory | null,
): Set<string> | null {
  if (accepted === null) return null;
  const cited = new Set<string>();
  for (const memory of accepted) {
    for (const ref of memory.evidenceRefs) {
      if (ref.kind === "event" && ref.sessionId === sessionId) cited.add(ref.eventId);
    }
  }
  for (const run of history?.runs ?? []) {
    if (run.runId === history!.currentRunId) continue;
    for (const id of eventIdsCitedByAnalysis(run)) cited.add(id);
  }
  return cited;
}
