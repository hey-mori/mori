/**
 * Kernel-record rows for the command palette, kept pure so their rules are
 * testable apart from the palette's effects.
 *
 * - A row names the record's PROJECT, resolved like everywhere else
 *   (`projectScope.recordProject`): a routine or topic listed first in
 *   `contextIds` is never presented as the project, and two projects that share
 *   a name show their paths.
 * - An agent-session record opens the session itself; the palette falls back to
 *   the record when the session cannot be resolved.
 * - One logical session is one row: when a session already matched as a record
 *   (with its project and body match), its title-matched session command is
 *   dropped.
 */
import type { CommandEntry } from "../../lib/commandPalette/commandPalette";
import type { KernelContext, KernelRelation, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { formatDate } from "../../lib/formatting/time";
import { matchingPassage, PASSAGE_MATCH_LABEL } from "../../lib/capture/passageSearch";
import { displayTime, schemaLabel } from "../../features/record-ledger/recordPresentation";
import { projectLabel, recordProject } from "../../features/record-ledger/projectScope";

function bodySnippet(body: string): string {
  const clean = body.trim().replace(/\s+/g, " ");
  return clean.length > 64 ? `${clean.slice(0, 64)}…` : clean;
}

/** A calm palette row: title (or a body snippet) plus one quiet meta line
 *  (schema · activity date · project). */
export function recordToEntry(
  record: MoriRecord,
  registry: SchemaRegistry,
  contexts: readonly KernelContext[],
  relations: readonly KernelRelation[] = [],
): CommandEntry {
  const label = record.title.trim() || bodySnippet(record.body) || "제목 없음";
  const activity = displayTime(record);
  const project = recordProject(record, contexts, relations);
  const hint = [
    schemaLabel(record, registry),
    activity.iso ? formatDate(activity.iso) : null,
    project ? projectLabel(project, contexts) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: `record:${record.id}`,
    group: "record",
    label,
    hint: hint || undefined,
    target:
      record.schemaId === "agent-session"
        ? { kind: "openAgentSession", sessionId: record.id }
        : { kind: "openRecord", recordId: record.id },
  };
}

/** The same row, saying it was found through the passage it was saved from. */
export function viaSavedPassage(entry: CommandEntry): CommandEntry {
  return { ...entry, hint: entry.hint ? `${PASSAGE_MATCH_LABEL} · ${entry.hint}` : PASSAGE_MATCH_LABEL };
}

/**
 * Records whose saved passage holds the query but which the text search did
 * not return (their body was rewritten), up to `limit`. The caller fetches
 * them and drops any that are discarded or archived.
 */
export function passageOnlyRecordIds(
  passages: ReadonlyMap<string, readonly string[]>,
  query: string,
  alreadyFound: ReadonlySet<string>,
  limit: number,
): string[] {
  const needle = query.trim().normalize("NFC").toLowerCase();
  if (!needle || limit <= 0) return [];
  const ids: string[] = [];
  for (const [recordId, texts] of passages) {
    if (alreadyFound.has(recordId) || !matchingPassage(texts, needle)) continue;
    ids.push(recordId);
    if (ids.length >= limit) break;
  }
  return ids;
}

/** Drop a session command whose session already appears as a record row. */
export function withoutDuplicateSessions(
  commands: readonly CommandEntry[],
  recordEntries: readonly CommandEntry[],
): CommandEntry[] {
  const shown = new Set(
    recordEntries.flatMap((entry) => (entry.target.kind === "openAgentSession" ? [entry.target.sessionId] : [])),
  );
  return commands.filter((entry) => !(entry.target.kind === "openSession" && shown.has(entry.target.sessionId)));
}
