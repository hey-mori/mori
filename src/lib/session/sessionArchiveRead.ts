/**
 * Reading a session's kept copy (보관한 원본) when its original is gone.
 *
 * The copy is verified before it stands in for the original: present, the
 * recorded size, and hashing to its content name. Verification reads the
 * whole file, so it runs here (when a copy is about to be read) and once per
 * file per run, never on render.
 */
import { claudeCodeArchiveDir, verifyClaudeCodeArchive } from "../claude/claudeTauri";
import { getKernelRepository } from "../record-kernel/kernelRepository";
import { keptArchiveOf } from "./sessionArchive";

export type ArchiveIntegrity = "ok" | "missing" | "damaged" | "unknown";

export type KeptArchiveRead = {
  path: string;
  archive: { archivedAt: string; bytes: number };
  /** "unknown" when the check itself could not run; the reader still parses. */
  integrity: ArchiveIntegrity;
};

const verified = new Map<string, ArchiveIntegrity>();

/**
 * Where to read a session's kept copy (보관한 원본), when the user kept one:
 * the newest archive still held, resolved against Mori's archive directory,
 * with whether it is still the file that was kept. Null when there is none.
 */
export async function keptArchiveRead(sessionId: string): Promise<KeptArchiveRead | null> {
  try {
    const sources = await getKernelRepository().listSources();
    const kept = keptArchiveOf(sources.data, sessionId);
    if (!kept) return null;
    const dir = await claudeCodeArchiveDir();
    const key = `${kept.locator.fileName}:${kept.locator.bytes}`;
    let integrity = verified.get(key);
    if (!integrity || integrity !== "ok") {
      try {
        integrity = await verifyClaudeCodeArchive(kept.locator.fileName, kept.locator.bytes);
      } catch {
        integrity = "unknown";
      }
      // Only a good result is remembered: a missing or damaged copy is checked
      // again next time, in case the user put the file back.
      if (integrity === "ok") verified.set(key, integrity);
    }
    return {
      path: `${dir.replace(/[\\/]+$/, "")}/${kept.locator.fileName}`,
      archive: { archivedAt: kept.source.capturedAt, bytes: kept.locator.bytes },
      integrity,
    };
  } catch {
    return null;
  }
}

/**
 * The fingerprint of the original the session's kept copy was taken from, or
 * null when nothing is kept. No file is read: it comes from the record.
 */
export async function keptArchiveSourceId(sessionId: string): Promise<string | null> {
  try {
    const sources = await getKernelRepository().listSources();
    return keptArchiveOf(sources.data, sessionId)?.locator.sourceId ?? null;
  } catch {
    return null;
  }
}

/** Whether a kept copy may stand in for its original. */
export function isUsableArchive(kept: KeptArchiveRead): boolean {
  return kept.integrity === "ok" || kept.integrity === "unknown";
}
