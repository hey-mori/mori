/**
 * Reading a session's kept copy (보관한 원본) when its original is gone.
 */
import { claudeCodeArchiveDir } from "../claude/claudeTauri";
import { getKernelRepository } from "../record-kernel/kernelRepository";
import { keptArchiveOf } from "./sessionArchive";

export type KeptArchiveRead = { path: string; archive: { archivedAt: string; bytes: number } };

/**
 * Where to read a session's kept copy (보관한 원본), when the user kept one:
 * the newest archive still held, resolved against Mori's archive directory.
 * Null when there is none or it cannot be located.
 */
export async function keptArchiveRead(sessionId: string): Promise<KeptArchiveRead | null> {
  try {
    const sources = await getKernelRepository().listSources();
    const kept = keptArchiveOf(sources.data, sessionId);
    if (!kept) return null;
    const dir = await claudeCodeArchiveDir();
    return {
      path: `${dir.replace(/[\\/]+$/, "")}/${kept.locator.fileName}`,
      archive: { archivedAt: kept.source.capturedAt, bytes: kept.locator.bytes },
    };
  } catch {
    return null;
  }
}
