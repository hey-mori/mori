/**
 * Pure transform for Timeline event corrections.
 *
 * Timeline events are AI-derived proposals — the user can correct an
 * event's title or summary from the inspector. Events live inside the
 * session's `StoredSessionImport[]`, so an edit rewrites the one import
 * that owns the event and stamps `userModified` so the correction stays
 * visible as provenance.
 *
 * Honesty contract: an edit is never invented. When the requested change
 * is a no-op (event missing, or every field blank / unchanged) the helper
 * returns the *same* imports reference so callers can skip persistence.
 */
import type { TimelineEvent } from "../../domain/types";
import type { StoredSessionImport } from "../storage/storageTypes";

/**
 * Editable text of a Timeline event. `title` / `summary` are AI-content
 * corrections — blank values are ignored. `note` is the user's own
 * annotation and may be deliberately cleared to empty.
 */
export type TimelineEventEdits = {
  title?: string;
  summary?: string;
  note?: string;
};

/**
 * Apply a title / summary correction and / or a user note to the event with
 * `eventId`, wherever it lives across the session's imports. `title` /
 * `summary` are applied only when present, non-blank after trimming, and
 * changed — and a content change stamps `userModified: true`. `note` may be
 * cleared to empty and never touches `userModified`, since a note is
 * annotation, not a correction. Returns the original imports array on a
 * no-op so the caller can skip the persistence write.
 */
export function applyEventEdits(
  imports: StoredSessionImport[],
  eventId: string,
  edits: TimelineEventEdits,
): StoredSessionImport[] {
  let changed = false;

  const next = imports.map((entry) => {
    const index = entry.events.findIndex((event) => event.id === eventId);
    if (index === -1) return entry;

    const event = entry.events[index];
    const patch: Partial<TimelineEvent> = {};
    let contentChanged = false;

    const title = edits.title?.trim();
    if (title && title !== event.title) {
      patch.title = title;
      contentChanged = true;
    }
    const summary = edits.summary?.trim();
    if (summary && summary !== event.summary) {
      patch.summary = summary;
      contentChanged = true;
    }
    if (edits.note !== undefined) {
      const note = edits.note.trim();
      if (note !== (event.userNote ?? "")) patch.userNote = note;
    }

    if (Object.keys(patch).length === 0) return entry;

    changed = true;
    const events = entry.events.slice();
    events[index] = {
      ...event,
      ...patch,
      ...(contentChanged ? { userModified: true } : {}),
    };
    return { ...entry, events };
  });

  return changed ? next : imports;
}
