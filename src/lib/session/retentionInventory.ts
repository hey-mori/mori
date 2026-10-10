/**
 * Which source conversations the retention view considers, and what Mori
 * keeps of each, from what Mori already stores: the reopen metas of the
 * sessions it registered, its kernel sources (saved passages, archives) and
 * its imports. Nothing here reads a transcript or the agent's folders.
 *
 * Presence starts unknown. Absence from a discovery pass proves nothing (a
 * failed read lists nothing), so the caller checks only that the few files
 * near or past their cleanup estimate still exist.
 */
import type { KernelSource, MoriRecord, SourceLink } from "../record-kernel/kernelTypes";
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import { autoImportedSessionId } from "./autoImportSessions";
import { keptArchiveOf, parseArchiveLocator } from "./sessionArchive";
import type { RetentionSourceInput } from "./retentionRisk";

const PASSAGE_KEY_PREFIX = "mori:session/";

export type RetentionInventoryInputs = {
  metas: readonly AgentWorkSessionMeta[];
  sources: readonly KernelSource[];
  links: readonly SourceLink[];
  records: readonly MoriRecord[];
  /** Mori session ids with imported events. */
  importedSessionIds: ReadonlySet<string>;
};

/**
 * Sessions Mori keeps something of: a kept archive or a saved passage. Their
 * reopen descriptors must outlive the original transcript, or what was kept
 * could no longer be opened from the session list.
 */
export function sessionsWithKeptEvidence(sources: readonly KernelSource[]): Set<string> {
  const ids = new Set<string>();
  for (const source of sources) {
    if (source.kind !== "agent-session" || source.retention === "notCaptured" || !source.locator) continue;
    if (source.locator.startsWith(PASSAGE_KEY_PREFIX)) {
      const rest = source.locator.slice(PASSAGE_KEY_PREFIX.length);
      const hash = rest.indexOf("#");
      if (hash > 0) ids.add(rest.slice(0, hash));
      continue;
    }
    const archive = parseArchiveLocator(source.locator);
    if (archive) ids.add(archive.sessionId);
  }
  return ids;
}

/** Passages saved from each session that still back a live record. */
export function passageCounts(
  sources: readonly KernelSource[],
  links: readonly SourceLink[],
  records: readonly MoriRecord[],
): Map<string, number> {
  const live = new Set(records.filter((r) => r.status !== "discarded" && r.status !== "archived").map((r) => r.id));
  const sessionOf = new Map<string, string>();
  for (const source of sources) {
    if (source.kind !== "agent-session" || !source.locator?.startsWith(PASSAGE_KEY_PREFIX)) continue;
    const rest = source.locator.slice(PASSAGE_KEY_PREFIX.length);
    const hash = rest.indexOf("#");
    if (hash > 0) sessionOf.set(source.id, rest.slice(0, hash));
  }
  const recordsBySession = new Map<string, Set<string>>();
  for (const link of links) {
    const sessionId = sessionOf.get(link.sourceId);
    if (!sessionId || !live.has(link.recordId)) continue;
    const set = recordsBySession.get(sessionId) ?? new Set<string>();
    set.add(link.recordId);
    recordsBySession.set(sessionId, set);
  }
  return new Map([...recordsBySession].map(([id, set]) => [id, set.size]));
}

/** Every Claude Code transcript Mori registered, with what it keeps of it. */
export function retentionSources(inputs: RetentionInventoryInputs): RetentionSourceInput[] {
  const passages = passageCounts(inputs.sources, inputs.links, inputs.records);
  return inputs.metas
    .filter((meta) => meta.importKind === "claude-code" && Boolean(meta.sourceFilePath))
    .map((meta) => {
      const sessionId = autoImportedSessionId(meta);
      const kept = keptArchiveOf(inputs.sources, sessionId);
      return {
        sessionId,
        title: meta.title || meta.projectName || "제목 없는 대화",
        // Metas stored before the file time was kept: the last activity is
        // the closest stand-in (never later than the file's own change).
        modifiedAt: meta.modifiedAt ?? meta.updatedAt,
        bytes: meta.fileBytes,
        presence: "unknown" as const,
        excerpts: passages.get(sessionId) ?? 0,
        archive: kept ? { archivedAt: kept.source.capturedAt, bytes: kept.locator.bytes } : null,
        imported: inputs.importedSessionIds.has(sessionId),
        sourcePath: meta.sourceFilePath,
        projectLabel: meta.projectPath || meta.projectName || undefined,
        // A count read from only the head of a long transcript is a lower
        // bound: not shown as the session's length.
        messageCount: meta.messageCountComplete !== false && meta.messageCount > 0 ? meta.messageCount : undefined,
        prCount: meta.evidence?.prs.length || undefined,
      };
    });
}
