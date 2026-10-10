/**
 * Which file is a session's history: one rule for every way into it.
 *
 * Opening a session, its latest reply and project search all read the
 * original transcript at the session's path. When the user kept a copy
 * (보관한 원본), the file at that path has to still be that conversation
 * before it stands for the session:
 *
 * - original read, no copy kept, or the copy's fingerprint matches and the
 *   file has not shrunk below the copy: the original;
 * - original read, but a different conversation (other head fingerprint) or
 *   smaller than the copy (so not a continuation of what was kept): the kept
 *   copy, said to stand in for a replaced original; if the copy cannot be
 *   used, a stated failure, never the other file;
 * - original gone: the kept copy; if it is missing or damaged, that failure;
 *   with nothing kept, "missing";
 * - original present but unreadable, or any other failure: that failure. A
 *   copy is not read in place of a file that may still be there.
 *
 * The fingerprint proves the same first line (the same session in every
 * format seen), not the same bytes; the size check adds "not cut short".
 */
import { classifyWindowError, type LoadedSessionWindow, type SessionWindowError } from "./sessionWindow";
import { isUsableArchive, keptArchiveIdentity, keptArchiveRead, type KeptArchiveRead } from "./sessionArchiveRead";

export type HistoricalSource =
  | { kind: "original" }
  | { kind: "archive"; path: string; archive: NonNullable<LoadedSessionWindow["archive"]> }
  | { kind: "failed"; error: SessionWindowError };

/** The original file is not there (as opposed to there but unreadable). */
export function isSourceGone(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("SOURCE_MISSING") || /No such file|not found|cannot find/i.test(message);
}

/** Why a kept copy cannot stand in for its gone original. */
export function archiveFailure(kept: KeptArchiveRead): SessionWindowError {
  return kept.integrity === "missing"
    ? { kind: "archiveMissing", message: "ARCHIVE_MISSING" }
    : { kind: "archiveDamaged", message: "ARCHIVE_DAMAGED" };
}

/** The original was read (`sourceId`, `fileBytes` from that read). */
export async function historicalSourceAfterRead(
  sessionId: string,
  read: { sourceId?: string | null; fileBytes?: number },
): Promise<HistoricalSource> {
  if (!read.sourceId) return { kind: "original" };
  const kept = await keptArchiveIdentity(sessionId);
  if (!kept) return { kind: "original" };
  const replaced = kept.sourceId !== read.sourceId;
  const cutShort = !replaced && read.fileBytes !== undefined && read.fileBytes < kept.bytes;
  if (!replaced && !cutShort) return { kind: "original" };
  return keptInstead(sessionId, true, { kind: "changed", message: "SOURCE_CHANGED" });
}

/** Reading the original failed with `error`. */
export async function historicalSourceAfterFailure(sessionId: string, error: unknown): Promise<Exclude<HistoricalSource, { kind: "original" }>> {
  const failure = classifyWindowError(error);
  if (!isSourceGone(error)) return { kind: "failed", error: failure };
  return keptInstead(sessionId, false, failure);
}

async function keptInstead(
  sessionId: string,
  replacedOriginal: boolean,
  otherwise: SessionWindowError,
): Promise<Exclude<HistoricalSource, { kind: "original" }>> {
  const kept = await keptArchiveRead(sessionId);
  if (!kept) return { kind: "failed", error: otherwise };
  if (!isUsableArchive(kept)) return { kind: "failed", error: archiveFailure(kept) };
  return { kind: "archive", path: kept.path, archive: replacedOriginal ? { ...kept.archive, replacedOriginal: true } : kept.archive };
}
