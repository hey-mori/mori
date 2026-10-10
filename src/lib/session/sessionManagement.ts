import type { Session } from "../../domain/types";

/**
 * Pure session-lifecycle edits — rename.
 *
 * These are the safe, non-destructive session-management operations the
 * Workspace sessions browser offers. They are intentionally pure functions
 * over a `Session` so they can be unit-tested without storage and reused for
 * both the active draft and a stored draft loaded by id. The store wires the
 * persistence (localStorage + desktop SQLite) around them.
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
  // The user's own name for it now, not the request it began with.
  const { titleFromRequest: _fromRequest, ...rest } = session;
  return { ...rest, title: next };
}
