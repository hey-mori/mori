/**
 * Discovery must not re-describe a kept session from another conversation.
 *
 * Each poll re-reads every transcript's metadata (title, activity time,
 * counts) from the file at the session's path. When the user kept a copy of
 * the session (보관한 원본) and the file there now has another head
 * fingerprint, it is a different conversation (see `historicalSource.ts`):
 * the session keeps the descriptor it had, so its title and activity stay its
 * own. A session with no copy kept, or a file whose fingerprint is unknown,
 * is described from the file as before.
 */
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import { autoImportedSessionId } from "./autoImportSessions";

export function holdReplacedSessions(
  discovered: readonly AgentWorkSessionMeta[],
  stored: ReadonlyMap<string, AgentWorkSessionMeta>,
  keptFingerprintOf: (sessionId: string) => string | null,
): AgentWorkSessionMeta[] {
  return discovered.map((meta) => {
    if (!meta.sourceId) return meta;
    const id = autoImportedSessionId(meta);
    const kept = keptFingerprintOf(id);
    if (!kept || kept === meta.sourceId) return meta;
    return stored.get(id) ?? meta;
  });
}
