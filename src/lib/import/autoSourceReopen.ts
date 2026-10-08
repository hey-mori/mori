/**
 * Reopening an auto-discovered agent session · what to do with its import.
 *
 * Opening a discovered session reads its transcript and builds an import
 * candidate. That candidate's source id ends in the capture time
 * (`createImportId`), so before this policy every reopen stored another copy
 * of the same transcript (#167).
 *
 * The logical source is the id without that capture-time suffix: the import
 * prefix plus the agent and its session id (`src-claude-code-<id>`,
 * `src-ai-<agent>-<id>`). The same rule reads imports stored by older builds,
 * whose ids carry their own capture times.
 *
 * - No stored import of the source: add it.
 * - One, unchanged (same event ids and transcript text): nothing is written.
 * - One, and the transcript only grew (its stored event ids are an exact
 *   prefix of the new read; event ids are stable across reads: session id,
 *   turn index and turn time): the new turns are appended.
 *   - A last stored turn that was a prompt still waiting for its reply takes
 *     the answered turn. That turn's id changes (a turn is dated by its
 *     reply), so the plan names the replaced id for references to follow. If
 *     the user edited that prompt, the edit stays and only later turns are
 *     added. Only fields that come from the transcript are
 *   refreshed, and never on an event the user edited (`userModified`): links,
 *   relationships and edits made in Mori stay as they are.
 * - One that no longer matches (the transcript was rewritten, or the user
 *   split or merged its events): kept as it is, not refreshed.
 * - Several (copies stored by older builds): none is changed, and no further
 *   copy is added. Choosing between them is an explicit cleanup, not a reopen.
 *
 * Capture time stays provenance: an import keeps the time it was first taken.
 */
import type { TimelineEvent } from "../../domain/types";
import type { StoredSessionImport } from "../storage/storageTypes";
import type { NormalizedImportCandidate } from "./types";

/** The event fields that come from the transcript itself. */
const TRANSCRIPT_FIELDS = ["title", "summary", "actor", "toolName", "openedByUser", "tokenUsage", "fileTouches"] as const;

/** The stored event with the read's transcript fields, or the stored event
 *  itself when nothing differs or the user edited it. */
function refreshedEvent(stored: TimelineEvent, fresh: TimelineEvent): TimelineEvent {
  if (stored.userModified) return stored;
  let changed = false;
  const next: TimelineEvent = { ...stored };
  for (const field of TRANSCRIPT_FIELDS) {
    if (JSON.stringify(stored[field]) === JSON.stringify(fresh[field])) continue;
    changed = true;
    if (fresh[field] === undefined) delete next[field];
    else (next as Record<string, unknown>)[field] = fresh[field];
  }
  return changed ? next : stored;
}

const CAPTURE_SUFFIX = /-\d{14}$/;

/** The source id without its capture-time suffix, or null when it has none. */
export function logicalSourceKey(sourceId: string): string | null {
  return CAPTURE_SUFFIX.test(sourceId) ? sourceId.replace(CAPTURE_SUFFIX, "") : null;
}

export type ReopenPlan =
  | { kind: "add" }
  | { kind: "unchanged"; importId: string }
  | {
      kind: "update";
      next: StoredSessionImport;
      added: number;
      refreshed: number;
      /** Event ids replaced by the read (an answered last prompt). */
      renamed: { from: string; to: string }[];
    }
  | { kind: "keep"; reason: "diverged" | "ambiguous"; importIds: string[] };

/** Stored imports of the same logical source as the candidate. */
export function storedImportsOfSource(
  imports: readonly StoredSessionImport[],
  candidate: NormalizedImportCandidate,
): StoredSessionImport[] {
  const key = logicalSourceKey(candidate.source.id);
  if (!key) return [];
  return imports.filter(
    (entry) => entry.source.kind === candidate.source.kind && logicalSourceKey(entry.source.id) === key,
  );
}

export function planSourceReopen(
  imports: readonly StoredSessionImport[],
  candidate: NormalizedImportCandidate,
): ReopenPlan {
  const stored = storedImportsOfSource(imports, candidate);
  if (stored.length === 0) return { kind: "add" };
  if (stored.length > 1) return { kind: "keep", reason: "ambiguous", importIds: stored.map((entry) => entry.id) };

  const existing = stored[0]!;
  const storedIds = existing.events.map((event) => event.id);
  const freshIds = candidate.events.map((event) => event.id);
  if (storedIds.length > freshIds.length) return { kind: "keep", reason: "diverged", importIds: [existing.id] };
  const lastIndex = storedIds.length - 1;
  const renamed: { from: string; to: string }[] = [];
  for (let index = 0; index < storedIds.length; index += 1) {
    if (storedIds[index] === freshIds[index]) continue;
    const stored = existing.events[index]!;
    const fresh = candidate.events[index]!;
    // Only the last stored turn may differ, and only as the same turn now
    // answered (dated later).
    const answered =
      index === lastIndex &&
      stored.turnIndex !== undefined &&
      stored.turnIndex === fresh.turnIndex &&
      Date.parse(stored.start) <= Date.parse(fresh.start);
    if (!answered) return { kind: "keep", reason: "diverged", importIds: [existing.id] };
    if (!stored.userModified) renamed.push({ from: stored.id, to: fresh.id });
  }

  let refreshed = 0;
  const kept = existing.events.map((event, index) => {
    const fresh = candidate.events[index]!;
    if (event.id !== fresh.id) {
      // The answered prompt, unless the user edited it: then the edit stays.
      if (event.userModified) return event;
      refreshed += 1;
      return { ...fresh, sessionId: existing.sessionId, sourceRefs: [existing.source.id] };
    }
    const next = refreshedEvent(event, fresh);
    if (next !== event) refreshed += 1;
    return next;
  });
  if (refreshed === 0 && storedIds.length === freshIds.length) return { kind: "unchanged", importId: existing.id };

  // The turns the transcript gained, re-pointed at the stored source.
  const added = candidate.events.slice(storedIds.length).map((event) => ({
    ...event,
    sessionId: existing.sessionId,
    sourceRefs: event.sourceRefs.map((ref) => (ref === candidate.source.id ? existing.source.id : ref)),
  }));
  const relatedEventIds = [...kept, ...added].map((event) => event.id);
  return {
    kind: "update",
    added: added.length,
    refreshed,
    renamed,
    next: {
      ...existing,
      source: {
        ...existing.source,
        relatedEventIds,
        ...(candidate.source.fileTouches ? { fileTouches: candidate.source.fileTouches } : {}),
      },
      events: [...kept, ...added],
    },
  };
}
