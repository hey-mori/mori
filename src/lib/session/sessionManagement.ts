import type { Session } from "../../domain/types";

/**
 * Pure session-lifecycle edits — rename / archive / unarchive.
 *
 * These are the safe, non-destructive session-management operations the
 * Workspace sessions browser offers. They are intentionally pure functions
 * over a `Session` so they can be unit-tested without storage and reused for
 * both the active draft and a stored draft loaded by id. The store wires the
 * persistence (localStorage + desktop SQLite) around them.
 *
 * Archiving uses an additive `archivedAt` timestamp rather than a new status
 * enum value. This keeps the existing `status` union ("recording" |
 * "analyzing" | "complete") — and every reader of it — untouched, and means a
 * session can be archived in any status and restored to exactly that status.
 */

/** Normalise a candidate title; returns `null` when it is blank. */
export function normalizeSessionTitle(title: string): string | null {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Return a session with a renamed title, or the original reference when the
 * title is blank or unchanged (so callers can skip a redundant write).
 */
export function applySessionRename(session: Session, title: string): Session {
  const next = normalizeSessionTitle(title);
  if (next === null || next === session.title) return session;
  return { ...session, title: next };
}

/**
 * Stamp a session as archived. Idempotent — re-archiving an already-archived
 * session returns the original reference. `now` is injected for deterministic
 * tests.
 */
export function applySessionArchive(session: Session, now: string): Session {
  if (session.archivedAt) return session;
  return { ...session, archivedAt: now };
}

/**
 * Clear the archive flag, restoring the session to the default list. Returns
 * the original reference when the session was not archived.
 */
export function applySessionUnarchive(session: Session): Session {
  if (!session.archivedAt) return session;
  const { archivedAt: _archivedAt, ...rest } = session;
  return rest;
}

/** Whether a session is currently archived. */
export function isSessionArchived(session: Pick<Session, "archivedAt">): boolean {
  return Boolean(session.archivedAt);
}
