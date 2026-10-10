/**
 * Reopening an auto-discovered agent session · what to do with its import.
 *
 * Opening a discovered session reads its transcript and builds an import
 * candidate. That candidate's source id ends in the capture time
 * (`createImportId`), so before this policy every reopen stored another copy
 * of the same transcript (#167).
 *
 * The logical source is the id without that capture-time suffix: the import
 * prefix plus the agent and its session id (`src-claude-code-<id>`,
 * `src-ai-<agent>-<id>`). The same rule reads imports stored by older builds,
 * whose ids carry their own capture times.
 *
 * - No stored import of the source: add it.
 * - One, unchanged (same event ids and text): nothing is written.
 * - One, and the transcript only grew (its stored event ids are an exact
 *   prefix of the new read; ids are stable across reads: session id, turn
 *   index and turn time): the new turns are appended, and the token total and
 *   file touches the reader attaches later are updated. A changed text under
 *   the same id is a rewrite, not growth: the import is kept as stored.
 *   - A last stored turn still waiting for its reply (a prompt, or a tool
 *     result read while the agent was mid tool loop) takes the answered turn. Its id changes (a turn is dated by its reply), so the
 *     plan names the replaced id for references to follow. The event keeps
 *     its note, links and every other field; only its text and identity come
 *     from the read. If something that cannot follow a rename cites it
 *     (accepted project memory, an analysis run not adopted), it takes the
 *     reply but keeps its id; later reads know it by its turn key and time.
 *     If the user edited the prompt, it stays as stored and only later turns
 *     are added, at this reopen and every later one.
 * - One that no longer matches (rewritten, truncated, or events the user
 *   split or merged): kept as it is, not refreshed.
 * - Several (copies stored by older builds): none is changed, and no further
 *   copy is added. Choosing between them is an explicit cleanup, not a reopen.
 *
 * Capture time stays provenance: an import keeps the time it was first taken.
 */
import type { TimelineEvent } from "../../domain/types";
import type { StoredSessionImport } from "../storage/storageTypes";
import type { NormalizedImportCandidate } from "./types";

/** What a turn says. In an append-only transcript a turn's text never
 *  changes once written, so a difference here, under the same event id, is a
 *  rewrite, not growth. */
const CONTENT_FIELDS = ["title", "summary", "actor", "toolName", "openedByUser"] as const;
/** What the reader may legitimately attach later: the session's token total
 *  moves to the newest reply, and file touches are attributed per reply. */
const ENRICHMENT_FIELDS = ["tokenUsage", "fileTouches"] as const;

type EventField = (typeof CONTENT_FIELDS)[number] | (typeof ENRICHMENT_FIELDS)[number];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A tool result as the reader renders it ("↳ 도구 결과: …", "↳ 도구 오류: …",
 *  "↳ (도구 결과 없음)"). Not anything the user or the agent wrote. */
const TOOL_RESULT_TEXT = /^\s*↳\s*\(?\s*도구\s*(결과|오류)/;

/**
 * Whether a turn differs from its stored copy only in how the reader renders
 * a tool result: a tool turn with no tool name and no reply (a result read
 * mid tool loop), whose stored and fresh summaries are both tool-result
 * renderings, and nothing else in what it says changed. A reader upgrade
 * (terminal codes dropped, an image result named) changes that text without
 * the transcript changing, so it is refreshed rather than taken as a rewrite.
 */
function onlyToolResultRendering(stored: TimelineEvent, fresh: TimelineEvent): boolean {
  if (stored.actor !== "tool" || stored.toolName || fresh.actor !== "tool" || fresh.toolName) return false;
  if (!TOOL_RESULT_TEXT.test(stored.summary) || !TOOL_RESULT_TEXT.test(fresh.summary)) return false;
  return CONTENT_FIELDS.every((field) => field === "title" || field === "summary" || same(stored[field], fresh[field]));
}

/** The text fields a reader-rendering refresh takes from the read. */
const RENDERED_FIELDS = ["title", "summary"] as const;

/** `stored` with `fields` taken from `fresh`. Every other field (notes, links,
 *  relationships, artifacts, extra source references, edits) stays. */
function withFields(stored: TimelineEvent, fresh: TimelineEvent, fields: readonly EventField[]): TimelineEvent {
  const next: TimelineEvent = { ...stored };
  for (const field of fields) {
    if (fresh[field] === undefined) delete next[field];
    else (next as Record<string, unknown>)[field] = fresh[field];
  }
  return next;
}

const CAPTURE_SUFFIX = /-\d{14}$/;

/** The source id without its capture-time suffix, or null when it has none. */
export function logicalSourceKey(sourceId: string): string | null {
  return CAPTURE_SUFFIX.test(sourceId) ? sourceId.replace(CAPTURE_SUFFIX, "") : null;
}

export type ReopenPlan =
  | { kind: "add" }
  | { kind: "unchanged"; importId: string }
  | {
      kind: "update";
      /** The import as stored before, to put back if a dependent write fails. */
      previous: StoredSessionImport;
      next: StoredSessionImport;
      added: number;
      refreshed: number;
      /** Event ids replaced by the read (an answered last prompt). */
      renamed: { from: string; to: string }[];
    }
  | { kind: "keep"; reason: "diverged" | "ambiguous"; importIds: string[] };

/** Stored imports of the same logical source as the candidate. */
export function storedImportsOfSource(
  imports: readonly StoredSessionImport[],
  candidate: NormalizedImportCandidate,
): StoredSessionImport[] {
  const key = logicalSourceKey(candidate.source.id);
  if (!key) return [];
  return imports.filter(
    (entry) => entry.source.kind === candidate.source.kind && logicalSourceKey(entry.source.id) === key,
  );
}

/**
 * @param isCited an event id that a durable record outside the import cites
 *   and that cannot be re-pointed here (accepted project memory). Such an
 *   event never takes a new id.
 */
export function planSourceReopen(
  imports: readonly StoredSessionImport[],
  candidate: NormalizedImportCandidate,
  isCited: (eventId: string) => boolean = () => false,
): ReopenPlan {
  const stored = storedImportsOfSource(imports, candidate);
  if (stored.length === 0) return { kind: "add" };
  if (stored.length > 1) return { kind: "keep", reason: "ambiguous", importIds: stored.map((entry) => entry.id) };

  const existing = stored[0]!;
  const storedIds = existing.events.map((event) => event.id);
  const freshIds = candidate.events.map((event) => event.id);
  if (storedIds.length > freshIds.length) return { kind: "keep", reason: "diverged", importIds: [existing.id] };
  const lastIndex = storedIds.length - 1;
  const renamed: { from: string; to: string }[] = [];
  let refreshed = 0;
  const kept: TimelineEvent[] = [];
  for (let index = 0; index < storedIds.length; index += 1) {
    const stored = existing.events[index]!;
    const fresh = candidate.events[index]!;
    if (stored.id === fresh.id) {
      // Same turn. Its text must not have changed unless the user changed it.
      const rerendered =
        !stored.userModified &&
        CONTENT_FIELDS.some((field) => !same(stored[field], fresh[field])) &&
        onlyToolResultRendering(stored, fresh);
      if (!stored.userModified && !rerendered && CONTENT_FIELDS.some((field) => !same(stored[field], fresh[field]))) {
        return { kind: "keep", reason: "diverged", importIds: [existing.id] };
      }
      const enriched = ENRICHMENT_FIELDS.some((field) => !same(stored[field], fresh[field]));
      if (enriched || rerendered) refreshed += 1;
      const fields: EventField[] = [...(enriched ? ENRICHMENT_FIELDS : []), ...(rerendered ? RENDERED_FIELDS : [])];
      kept.push(fields.length > 0 ? withFields(stored, fresh, fields) : stored);
      continue;
    }
    // The same turn under a pinned id: answered at an earlier reopen while a
    // citation held its id (below), so it kept that id and took the reply's
    // time. Same turn key and the same time: compared like an unchanged id.
    const sameTurnKey =
      stored.turnIndex !== undefined &&
      stored.turnIndex === fresh.turnIndex &&
      stored.connectorEventId !== undefined &&
      stored.connectorEventId === fresh.connectorEventId;
    // (Not "and no longer waiting": a reply can itself read as a tool turn
    // with no tool name. A turn truly still waiting with this start has this
    // id and never gets here.)
    const waiting = stored.actor === "user" || (stored.actor === "tool" && !stored.toolName);
    if (sameTurnKey && stored.start === fresh.start) {
      const rerendered =
        !stored.userModified &&
        CONTENT_FIELDS.some((field) => !same(stored[field], fresh[field])) &&
        onlyToolResultRendering(stored, fresh);
      if (!stored.userModified && !rerendered && CONTENT_FIELDS.some((field) => !same(stored[field], fresh[field]))) {
        return { kind: "keep", reason: "diverged", importIds: [existing.id] };
      }
      const enriched = ENRICHMENT_FIELDS.some((field) => !same(stored[field], fresh[field]));
      if (enriched || rerendered) refreshed += 1;
      const fields: EventField[] = [...(enriched ? ENRICHMENT_FIELDS : []), ...(rerendered ? RENDERED_FIELDS : [])];
      kept.push(fields.length > 0 ? withFields(stored, fresh, fields) : stored);
      continue;
    }
    // Otherwise only a turn that was waiting for its reply and has it now may
    // differ: a prompt, or a tool result read mid tool loop (a tool turn with
    // no reply has no tool name). The same turn, now dated by its reply. It is
    // the last stored turn, or one an earlier reopen left waiting because the
    // user edited it (later turns were added after it since).
    const answered =
      (index === lastIndex || stored.userModified) &&
      stored.turnIndex !== undefined &&
      stored.turnIndex === fresh.turnIndex &&
      waiting &&
      fresh.actor !== "user" &&
      Date.parse(stored.start) <= Date.parse(fresh.start);
    if (!answered) return { kind: "keep", reason: "diverged", importIds: [existing.id] };
    if (stored.userModified) {
      // The user's edit wins: the prompt stays as stored, and only later turns
      // are added.
      kept.push(stored);
      continue;
    }
    // Keep the stored event and everything Mori or the user added to it; take
    // the turn's text and time from the read.
    const answeredTurn = {
      ...withFields(stored, fresh, [...CONTENT_FIELDS, ...ENRICHMENT_FIELDS]),
      start: fresh.start,
    };
    refreshed += 1;
    if (isCited(stored.id)) {
      // A citation that cannot follow a new id: the turn keeps its id (and its
      // turn id), so what cites it still lands on it, now answered.
      kept.push(answeredTurn);
      continue;
    }
    renamed.push({ from: stored.id, to: fresh.id });
    kept.push({ ...answeredTurn, id: fresh.id, ...(fresh.turnId !== undefined ? { turnId: fresh.turnId } : {}) });
  }
  if (refreshed === 0 && storedIds.length === freshIds.length) return { kind: "unchanged", importId: existing.id };

  // The turns the transcript gained, re-pointed at the stored source.
  const added = candidate.events.slice(storedIds.length).map((event) => ({
    ...event,
    sessionId: existing.sessionId,
    sourceRefs: event.sourceRefs.map((ref) => (ref === candidate.source.id ? existing.source.id : ref)),
  }));
  const relatedEventIds = [...kept, ...added].map((event) => event.id);
  return {
    kind: "update",
    previous: existing,
    added: added.length,
    refreshed,
    renamed,
    next: {
      ...existing,
      source: {
        ...existing.source,
        relatedEventIds,
        ...(candidate.source.fileTouches ? { fileTouches: candidate.source.fileTouches } : {}),
      },
      events: [...kept, ...added],
    },
  };
}
