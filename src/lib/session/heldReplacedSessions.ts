/**
 * Discovery must not re-describe a kept session from another conversation.
 *
 * Each poll re-reads every transcript's metadata (title, activity time,
 * counts) from the file at the session's path. When the user kept a copy of
 * the session (보관한 원본) and the file there is no longer that conversation
 * by the same rule as `historicalSource.ts` (another head fingerprint, or
 * smaller than the copy), the listing does not describe the session:
 *
 * - the stored descriptor still describes the kept conversation (its
 *   fingerprint is the copy's, or it predates fingerprints): its title,
 *   activity and counts stay, with the file's current location from the
 *   listing;
 * - otherwise (none, or it already describes the other file): the entry is
 *   left out of this pass, so nothing new is written under the session.
 *
 * A session with no copy kept, or a listed file whose fingerprint is unknown,
 * is described from the file as before. A descriptor an older build already
 * rewrote from another file is not repaired here.
 */
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import { autoImportedSessionId } from "./autoImportSessions";

export type KeptFingerprint = { sourceId: string; bytes: number };

export function holdReplacedSessions(
  discovered: readonly AgentWorkSessionMeta[],
  stored: ReadonlyMap<string, AgentWorkSessionMeta>,
  keptOf: (sessionId: string) => KeptFingerprint | null,
): AgentWorkSessionMeta[] {
  const out: AgentWorkSessionMeta[] = [];
  for (const meta of discovered) {
    if (!meta.sourceId) {
      out.push(meta);
      continue;
    }
    const id = autoImportedSessionId(meta);
    const kept = keptOf(id);
    const other = kept && (kept.sourceId !== meta.sourceId || (meta.fileBytes !== undefined && meta.fileBytes < kept.bytes));
    if (!kept || !other) {
      out.push(meta);
      continue;
    }
    const held = stored.get(id);
    if (held && (!held.sourceId || held.sourceId === kept.sourceId)) {
      // What describes the session stays; where its file lives now comes
      // from the listing (a restore into another home moves every path), so
      // the shared source rule reads that file and finds the kept copy.
      out.push({ ...held, filePath: meta.filePath, sourceFilePath: meta.sourceFilePath, projectPath: meta.projectPath });
    }
  }
  return out;
}

/** Whether a listed file's fingerprint differs from the one its stored
 *  descriptor recorded: the cue to refresh what is kept before trusting it. */
export function fingerprintChanged(
  discovered: readonly AgentWorkSessionMeta[],
  stored: ReadonlyMap<string, AgentWorkSessionMeta>,
): boolean {
  return discovered.some((meta) => {
    const was = stored.get(autoImportedSessionId(meta))?.sourceId;
    return Boolean(meta.sourceId && was && was !== meta.sourceId);
  });
}

/**
 * Listed sessions whose file is no longer where their stored descriptor says,
 * as the descriptor to store: the stored one with the listed location (or the
 * listed meta when nothing is stored). Paths are where a file is, not what
 * the session is, so this never changes a title or what is counted as new.
 */
export function movedSessions(
  discovered: readonly AgentWorkSessionMeta[],
  stored: ReadonlyMap<string, AgentWorkSessionMeta>,
): AgentWorkSessionMeta[] {
  const out: AgentWorkSessionMeta[] = [];
  for (const meta of discovered) {
    const was = stored.get(autoImportedSessionId(meta));
    if (!was) continue;
    if (was.filePath === meta.filePath && was.sourceFilePath === meta.sourceFilePath) continue;
    out.push({ ...was, filePath: meta.filePath, sourceFilePath: meta.sourceFilePath, projectPath: meta.projectPath });
  }
  return out;
}
