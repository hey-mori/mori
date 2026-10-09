/**
 * 보관한 원본 as a kernel source: the record that Mori holds a point-in-time
 * copy of one session's transcript, and where (by name, never by absolute
 * path, so a moved storage directory still finds it).
 *
 * The archive is a source, not a record: it has no body in the kernel (its
 * bytes live in the archive file) and nothing about it is a claim. Removing
 * the archive keeps this source with retention `notCaptured`, so the history
 * says it was kept and then removed.
 */
import type { KernelSource } from "../record-kernel/kernelTypes";
import { createKernelId } from "../record-kernel/recordFactory";
import type { ClaudeCodeSessionArchive } from "../claude/types";

export type SessionArchiveLocatorV1 = {
  v: 1;
  kind: "claude-code-archive";
  sessionId: string;
  fileName: string;
  bytes: number;
  sha256: string;
  /** The original's fingerprint: passages saved from it verify against the copy. */
  sourceId: string;
};

const PREFIX = "mori-archive:v1:";

export function formatArchiveLocator(locator: SessionArchiveLocatorV1): string {
  return `${PREFIX}${JSON.stringify(locator)}`;
}

export function parseArchiveLocator(value: string | undefined): SessionArchiveLocatorV1 | null {
  if (!value || !value.startsWith(PREFIX)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.slice(PREFIX.length));
  } catch {
    return null;
  }
  const l = parsed as Record<string, unknown> | null;
  if (!l || l.v !== 1 || l.kind !== "claude-code-archive") return null;
  if (typeof l.sessionId !== "string" || !l.sessionId) return null;
  if (typeof l.fileName !== "string" || !/^[0-9a-f]{64}\.jsonl$/.test(l.fileName)) return null;
  if (typeof l.sha256 !== "string" || l.fileName !== `${l.sha256}.jsonl`) return null;
  if (typeof l.bytes !== "number" || !Number.isInteger(l.bytes) || l.bytes < 0) return null;
  if (typeof l.sourceId !== "string" || !l.sourceId) return null;
  return l as unknown as SessionArchiveLocatorV1;
}

/** The source recording a fresh archive of a session. */
export function archiveSourceFor(sessionId: string, archive: ClaudeCodeSessionArchive, now: () => Date = () => new Date()): KernelSource {
  return {
    id: createKernelId("src"),
    kind: "agent-session",
    locator: formatArchiveLocator({
      v: 1,
      kind: "claude-code-archive",
      sessionId,
      fileName: archive.fileName,
      bytes: archive.bytes,
      sha256: archive.sha256,
      sourceId: archive.sourceId,
    }),
    contentHash: archive.sha256,
    capturedAt: now().toISOString(),
    retention: "retained",
  };
}

export type KeptArchive = { source: KernelSource; locator: SessionArchiveLocatorV1 };

/** The session's newest archive that is still kept, if any. */
export function keptArchiveOf(sources: readonly KernelSource[], sessionId: string): KeptArchive | null {
  let newest: KeptArchive | null = null;
  for (const source of sources) {
    if (source.kind !== "agent-session" || source.retention !== "retained") continue;
    const locator = parseArchiveLocator(source.locator);
    if (!locator || locator.sessionId !== sessionId) continue;
    if (!newest || source.capturedAt > newest.source.capturedAt) newest = { source, locator };
  }
  return newest;
}

/** The same source after its archive file was removed: kept as history. */
export function removedArchiveSource(source: KernelSource): KernelSource {
  return { ...source, retention: "notCaptured" };
}

export function formatArchiveBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
