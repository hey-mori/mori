import type { FollowReaction } from "./followController";
import { selectNewFollowEventIds } from "./followSource";

/**
 * One foreground Live Follow poll, composed from the tested pure pieces.
 *
 * The interactive shell (a desktop interval effect) supplies the IO via
 * `deps`: `read` returns the followed session's candidate connector events
 * just read from the inbox, `importEvents` runs the normal Import path for
 * the genuinely-new ones, and `applyPoll` is the store action that advances
 * the follow brain and returns the reaction. Keeping the orchestration here
 * (deps injected) means the read -> match -> import -> poll sequence is unit
 * tested without a timer, the file system, or Tauri; only the thin adapters
 * remain for the desktop wiring.
 *
 * Errors from `read` / `importEvents` propagate to the caller, which records
 * them via `setFollowError`. Following stays explicit and foreground only.
 */
export type FollowPollDeps<TEvent extends { id: string }> = {
  /** Identities the session has already imported (the follow source keys). */
  knownIds: readonly string[];
  /** Read the session's current candidate connector events from the inbox. */
  read: () => Promise<TEvent[]>;
  /** Import the genuinely-new events through the normal Import path. */
  importEvents: (events: TEvent[]) => Promise<void> | void;
  /** Store action: advance the follow brain and return the reaction. */
  applyPoll: (incomingEventIds: string[], at: string) => FollowReaction;
  /** ISO timestamp for this poll. */
  at: string;
};

export type FollowPollOutcome = {
  reaction: FollowReaction;
  importedCount: number;
};

export async function runFollowPoll<TEvent extends { id: string }>(
  deps: FollowPollDeps<TEvent>,
): Promise<FollowPollOutcome> {
  const events = await deps.read();
  const candidateIds = events.map((event) => event.id);
  const newIds = selectNewFollowEventIds(deps.knownIds, candidateIds);

  if (newIds.length > 0) {
    const newSet = new Set(newIds);
    await deps.importEvents(events.filter((event) => newSet.has(event.id)));
  }

  // The session's current event id set = previously known plus the new ones;
  // the follow brain diffs this against its seeded known set.
  const sessionIds = [...new Set([...deps.knownIds, ...newIds])];
  const reaction = deps.applyPoll(sessionIds, deps.at);
  return { reaction, importedCount: newIds.length };
}
