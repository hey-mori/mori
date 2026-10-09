/**
 * When each session's conversation last moved, by source file, for 현재 상황 to
 * tell an observation a session has since moved past (see `sourceActiveAt` in
 * the projection).
 *
 * Two refusals keep it honest. A session Mori is following right now gets no
 * time at all: its rows are what Mori sees, however old their last write. And
 * only `lastMessageAt` counts (the last user or assistant record), never the
 * file's last record: Claude Code writes `away_summary`, queue operations and
 * links minutes after a turn ends, while the agent is still waiting.
 */
import type { AgentWorkSessionMeta } from "../../lib/trace/sources/ai/workSessions";

export type SourceActivity = {
  activeAt: (sessionKey: string) => string | undefined;
  titleOf: (sessionKey: string) => string | undefined;
};

export function buildSourceActivity(input: {
  metas: readonly Pick<AgentWorkSessionMeta, "sourceFilePath" | "lastMessageAt" | "id" | "agentId">[];
  followedKeys: ReadonlySet<string>;
  /** A session's title by its descriptor. */
  titleOfMeta: (meta: Pick<AgentWorkSessionMeta, "id" | "agentId">) => string | undefined;
}): SourceActivity {
  const byKey = new Map<string, { activeAt?: string; title?: string }>();
  for (const meta of input.metas) {
    if (!meta.sourceFilePath) continue;
    byKey.set(meta.sourceFilePath, { activeAt: meta.lastMessageAt || undefined, title: input.titleOfMeta(meta) });
  }
  return {
    activeAt: (key) => (input.followedKeys.has(key) ? undefined : byKey.get(key)?.activeAt),
    titleOf: (key) => byKey.get(key)?.title,
  };
}
