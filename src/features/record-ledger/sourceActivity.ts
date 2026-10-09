/**
 * When each session's conversation last moved, by source file, for 현재 상황 to
 * tell an observation a session has since moved past (see `sourceActiveAt` in
 * the projection).
 *
 * Two refusals keep it honest. A session the live feed is reporting on right
 * now gets no time at all: the intake writer writes exactly the feed's
 * requests, so its rows are what Mori sees, however old their last write. A
 * session merely FOLLOWED is not enough: when its last prompt lies before the
 * follower's tail, it yields no request and no row, and its old rows would
 * stand unchallenged. And
 * only `lastMessageAt` counts (the last user or assistant record), never the
 * file's last record: Claude Code writes `away_summary`, queue operations and
 * links minutes after a turn ends, while the agent is still waiting.
 */
import type { AgentWorkSessionMeta } from "../../lib/trace/sources/ai/workSessions";

/** The sessions the live feed holds a request for. */
export function reportedSessionKeys(feed: readonly { sessionKey: string }[]): Set<string> {
  return new Set(feed.map((request) => request.sessionKey));
}

export type SourceActivity = {
  activeAt: (sessionKey: string) => string | undefined;
  titleOf: (sessionKey: string) => string | undefined;
};

export function buildSourceActivity(input: {
  metas: readonly Pick<AgentWorkSessionMeta, "sourceFilePath" | "lastMessageAt" | "id" | "agentId">[];
  /** Sessions the live feed is reporting on (`reportedSessionKeys`). */
  reportedKeys: ReadonlySet<string>;
  /** A session's title by its descriptor. */
  titleOfMeta: (meta: Pick<AgentWorkSessionMeta, "id" | "agentId">) => string | undefined;
}): SourceActivity {
  const byKey = new Map<string, { activeAt?: string; title?: string }>();
  for (const meta of input.metas) {
    if (!meta.sourceFilePath) continue;
    byKey.set(meta.sourceFilePath, { activeAt: meta.lastMessageAt || undefined, title: input.titleOfMeta(meta) });
  }
  return {
    activeAt: (key) => (input.reportedKeys.has(key) ? undefined : byKey.get(key)?.activeAt),
    titleOf: (key) => byKey.get(key)?.title,
  };
}
