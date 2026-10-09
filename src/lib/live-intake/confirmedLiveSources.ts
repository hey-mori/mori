/**
 * Which observed sessions belong to a reviewed project · the bridge between
 * the operator's membership decision and what Live Intake observed.
 *
 * Membership decides which work is relevant: the project's confirmed sessions
 * (`buildProjectSearchInventory`, the same authority project search uses).
 * Observation decides what happened: intake rows, keyed by the session file the
 * follower read (`IntakeRequestRow.sessionKey`).
 *
 * The join is the session's discovery descriptor: its source file is the file
 * the follower reads. Both come from the same discovery listing under the
 * agent's projects root, so the path is spelled the same on both sides; no
 * basename, title or folder is ever compared. A file named by two confirmed
 * sessions is read once and opens neither, because which one is meant is not
 * known.
 */
import type { ProjectSearchEntry } from "../session/projectSearch";

export type LiveSourceScope = {
  /** Source files to read intake rows for, each once. */
  keys: string[];
  /** The confirmed session a source file opens, or null when ambiguous. */
  sessionByKey: ReadonlyMap<string, string | null>;
};

export function liveSourcesOf(entries: readonly ProjectSearchEntry[]): LiveSourceScope {
  const sessionByKey = new Map<string, string | null>();
  for (const entry of entries) {
    if (!entry.sourcePath) continue;
    sessionByKey.set(entry.sourcePath, sessionByKey.has(entry.sourcePath) ? null : entry.sessionId);
  }
  return { keys: [...sessionByKey.keys()].sort(), sessionByKey };
}
