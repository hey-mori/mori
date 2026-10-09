/**
 * The two user actions on a session's kept copy: keep one (보관), and remove
 * one (보관한 원본 지우기). Both are explicit; neither touches the original.
 */
import { archiveClaudeCodeSession, removeClaudeCodeArchive } from "../../lib/claude/claudeTauri";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import {
  archiveSourceFor,
  keptArchiveOf,
  parseArchiveLocator,
  removedArchiveSource,
  type KeptArchive,
} from "../../lib/session/sessionArchive";

export async function loadKeptArchive(sessionId: string): Promise<KeptArchive | null> {
  const sources = await getKernelRepository().listSources();
  return keptArchiveOf(sources.data, sessionId);
}

/** Copy the transcript now and record that Mori keeps it. */
export async function keepSessionArchive(sessionId: string, sourcePath: string): Promise<KeptArchive> {
  const archive = await archiveClaudeCodeSession(sourcePath);
  const repo = getKernelRepository();
  const existing = keptArchiveOf((await repo.listSources()).data, sessionId);
  // The same bytes kept again: one record of it is enough.
  if (existing && existing.locator.sha256 === archive.sha256) return existing;
  const source = archiveSourceFor(sessionId, archive);
  await repo.saveSource(source);
  return { source, locator: parseArchiveLocator(source.locator)! };
}

/** Delete the kept copy's file; the source stays as history (not captured). */
export async function removeSessionArchive(kept: KeptArchive): Promise<void> {
  const repo = getKernelRepository();
  // The file is named by its content: another session keeping identical bytes
  // still needs it. Only the last keeper's removal deletes it.
  const others = (await repo.listSources()).data.filter((source) => {
    if (source.id === kept.source.id || source.retention !== "retained") return false;
    return parseArchiveLocator(source.locator)?.fileName === kept.locator.fileName;
  });
  if (others.length === 0) await removeClaudeCodeArchive(kept.locator.fileName);
  await repo.saveSource(removedArchiveSource(kept.source));
}
