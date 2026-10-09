/**
 * Search a project's conversations · eligibility and per-source state.
 *
 * In-session search (`sessionSearch`) finds a passage once you know the
 * session. This finds the session: from one reviewed project it searches the
 * sessions the operator confirmed as its members, on request, and says what it
 * searched and what it could not.
 *
 * Authority. A session is searched only when its kernel record's reviewed
 * `contextIds` place it in the project or one of its active descendants
 * (`membershipState`, the one membership rule every reader shares). A session
 * the 프로젝트 page merely suggests from its checkout, a folder alias, a
 * matching name, a `belongs-to` relation, an unfiled or rejected session: none
 * of them is searched. An archived or missing project is not searched at all,
 * never widened to something similar.
 *
 * Sources. A confirmed session's source is its discovery descriptor (the
 * auto-import meta stored under the same id). Claude Code transcripts are
 * searched with the native step from #172; other agents are counted as not
 * searchable rather than skipped silently. Two sessions that name the same
 * source file are read once.
 *
 * Nothing here reads a file or writes anything: it is the plan and the
 * bookkeeping. `projectSearchStore` runs the native steps.
 */
import type { KernelContext, MoriRecord } from "../record-kernel/kernelTypes";
import { membershipState } from "../record-kernel/projectMembership";
import type { ClaudeCodeSearchBatch, ClaudeCodeSearchHit } from "../claude/types";
import { resolveProjectScope } from "../../features/record-ledger/projectScope";
import { inArchivedSubtree } from "../../features/record-ledger/contextTree";
import type { SessionWindowError } from "./sessionWindow";

/** Native steps one phase runs at most before it stops and offers to go on.
 *  A step reads at most 16 MiB (Rust `SEARCH_SCAN_BYTES`), so a phase reads at
 *  most 384 MiB. */
export const PROJECT_SEARCH_PHASE_STEPS = 24;
/** Native steps in flight at once. */
export const PROJECT_SEARCH_CONCURRENCY = 2;
/** Matches one native step returns at most. */
export const PROJECT_SEARCH_STEP_HITS = 20;
/** Matches held for the whole search; past this the user narrows the phrase. */
export const PROJECT_SEARCH_MAX_HITS = 200;

/** Where a confirmed session's source can be read, as far as discovery says. */
export type SourceDescriptor = { agentName: string; importKind: string; sourcePath: string | null };

export type ProjectSearchEntry = {
  sessionId: string;
  /** The reviewed project (or descendant) the session is filed under. */
  contextId: string;
  title: string;
  agentName: string;
  lastActiveAt: string;
  sourcePath: string | null;
  /** `searchable`: a Claude Code transcript. `unsupported`: another agent's
   *  format. `no-source`: no discovery descriptor to read it from. */
  kind: "searchable" | "unsupported" | "no-source";
  /** Another entry reads the same source file; it is searched there. */
  sameSourceAs?: string;
};

export type ProjectSearchInventory =
  | { kind: "unavailable" }
  | {
      kind: "ok";
      projectId: string;
      label: string;
      /** Confirmed sessions, most recently active first. */
      entries: ProjectSearchEntry[];
      /** Active descendant projects whose confirmed sessions are included. */
      descendants: number;
    };

/**
 * The confirmed sessions of a project and how each can be read. Pure: the
 * caller passes the kernel records and contexts it holds now, and how to look
 * up a session's descriptor and its title and activity.
 */
export function buildProjectSearchInventory(input: {
  projectId: string;
  contexts: readonly KernelContext[];
  records: readonly MoriRecord[];
  descriptorOf: (sessionId: string) => SourceDescriptor | null;
  sessionOf?: (sessionId: string) => { title?: string; lastActiveAt?: string } | null;
}): ProjectSearchInventory {
  const scope = resolveProjectScope(input.projectId, input.contexts);
  if (scope.kind !== "ok") return { kind: "unavailable" };
  const entries: ProjectSearchEntry[] = [];
  for (const record of input.records) {
    if (record.schemaId !== "agent-session") continue;
    if (record.status !== "active" && record.status !== "provisional") continue;
    const state = membershipState(record, input.contexts);
    if (state.kind !== "member" || !scope.contextIds.has(state.context.id)) continue;
    const descriptor = input.descriptorOf(record.id);
    const session = input.sessionOf?.(record.id) ?? null;
    entries.push({
      sessionId: record.id,
      contextId: state.context.id,
      title: session?.title?.trim() || record.title.trim() || "제목 없음",
      agentName: descriptor?.agentName || "에이전트",
      lastActiveAt: session?.lastActiveAt || record.occurredEnd || record.occurredStart || record.capturedAt,
      sourcePath: descriptor?.sourcePath ?? null,
      kind: !descriptor || !descriptor.sourcePath
        ? "no-source"
        : descriptor.importKind === "claude-code"
          ? "searchable"
          : "unsupported",
    });
  }
  entries.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt) || a.sessionId.localeCompare(b.sessionId));
  // The same file under two sessions is read once, by the more recent entry.
  const readerOf = new Map<string, string>();
  for (const entry of entries) {
    if (entry.kind !== "searchable" || !entry.sourcePath) continue;
    const reader = readerOf.get(entry.sourcePath);
    if (reader) entry.sameSourceAs = reader;
    else readerOf.set(entry.sourcePath, entry.sessionId);
  }
  return {
    kind: "ok",
    projectId: scope.project.id,
    label: scope.label,
    entries,
    descendants: [...scope.contextIds].filter((id) => id !== scope.project.id && !inArchivedSubtree(id, input.contexts)).length,
  };
}

export type SourceStatus =
  | "pending"
  | "searching"
  /** Searched from the end back to `cursor`; more remains. */
  | "partial"
  /** Searched to the start of the transcript. */
  | "done"
  | "changed"
  | "missing"
  | "error"
  /** No longer a confirmed member: its results are not offered. */
  | "excluded";

export type ProjectSearchSource = {
  sessionId: string;
  sourcePath: string;
  status: SourceStatus;
  sourceId: string | null;
  scanEnd: number | null;
  cursor: { beforeOffset: number; anchor: string } | null;
  hits: ClaudeCodeSearchHit[];
  unsearchableRecords: number;
  steps: number;
  error: SessionWindowError | null;
};

export type ProjectSearchState = {
  projectId: string;
  label: string;
  query: string;
  status: "searching" | "idle" | "stopped";
  entries: ProjectSearchEntry[];
  descendants: number;
  /** Searchable sources by session id, in round-robin order. */
  order: string[];
  sources: Record<string, ProjectSearchSource>;
  /** Where the next round-robin pick starts. */
  next: number;
  /** Native steps run in the current phase. */
  phaseSteps: number;
};

export function startedProjectSearch(
  inventory: Extract<ProjectSearchInventory, { kind: "ok" }>,
  query: string,
): ProjectSearchState {
  const readers = inventory.entries.filter((entry) => entry.kind === "searchable" && !entry.sameSourceAs);
  return {
    projectId: inventory.projectId,
    label: inventory.label,
    query,
    status: "searching",
    entries: inventory.entries,
    descendants: inventory.descendants,
    order: readers.map((entry) => entry.sessionId),
    sources: Object.fromEntries(
      readers.map((entry) => [
        entry.sessionId,
        {
          sessionId: entry.sessionId,
          sourcePath: entry.sourcePath!,
          status: "pending" as const,
          sourceId: null,
          scanEnd: null,
          cursor: null,
          hits: [],
          unsearchableRecords: 0,
          steps: 0,
          error: null,
        },
      ]),
    ),
    next: 0,
    phaseSteps: 0,
  };
}

const open = (source: ProjectSearchSource) => source.status === "pending" || source.status === "partial";

export function heldHits(state: ProjectSearchState): number {
  return state.order.reduce((sum, id) => sum + state.sources[id]!.hits.length, 0);
}

/**
 * The next sources to step, round-robin from `next`, skipping busy ones and
 * those with nothing left: every unfinished source gets a step before any
 * gets a second, so one large transcript cannot starve the others.
 */
export function pickSources(state: ProjectSearchState, busy: ReadonlySet<string>, slots: number): { picked: string[]; next: number } {
  const picked: string[] = [];
  const count = state.order.length;
  let next = state.next;
  for (let looked = 0; looked < count && picked.length < slots; looked += 1) {
    const id = state.order[(state.next + looked) % count]!;
    if (!busy.has(id) && open(state.sources[id]!)) {
      picked.push(id);
      next = (state.next + looked + 1) % count;
    }
  }
  return { picked, next };
}

/** Is there anything left to search, within the result limit? */
export function canContinue(state: ProjectSearchState): boolean {
  return heldHits(state) < PROJECT_SEARCH_MAX_HITS && state.order.some((id) => open(state.sources[id]!));
}

function withSource(state: ProjectSearchState, source: ProjectSearchSource): ProjectSearchState {
  return { ...state, sources: { ...state.sources, [source.sessionId]: source } };
}

/** Mark sources as being stepped, and count the steps against the phase. */
export function markSearching(state: ProjectSearchState, ids: readonly string[], next: number): ProjectSearchState {
  let result: ProjectSearchState = { ...state, next, phaseSteps: state.phaseSteps + ids.length };
  for (const id of ids) result = withSource(result, { ...result.sources[id]!, status: "searching" });
  return result;
}

/**
 * Fold one native step into its source. It must continue that source: same
 * file identity, and it must end where the last step stopped. Anything else is
 * a stale reply and changes nothing (the caller reports it as changed).
 */
export function applySourceBatch(state: ProjectSearchState, sessionId: string, batch: ClaudeCodeSearchBatch): ProjectSearchState {
  const source = state.sources[sessionId];
  if (!source || source.status !== "searching") return state;
  if (source.sourceId !== null && batch.sourceId !== source.sourceId) return state;
  if (source.cursor ? batch.scanEnd !== source.cursor.beforeOffset : source.scanEnd !== null) return state;
  const room = Math.max(0, PROJECT_SEARCH_MAX_HITS - heldHits(state));
  const held = new Set(source.hits.map((hit) => `${hit.recordStart}:${hit.messageId}`));
  const fresh = batch.hits.filter((hit) => !held.has(`${hit.recordStart}:${hit.messageId}`)).slice(0, room);
  return withSource(state, {
    ...source,
    status: batch.reachedStart ? "done" : "partial",
    sourceId: batch.sourceId,
    scanEnd: source.scanEnd ?? batch.scanEnd,
    cursor: batch.reachedStart ? null : { beforeOffset: batch.scanStart, anchor: batch.scanStartAnchor },
    hits: [...source.hits, ...fresh],
    unsearchableRecords: source.unsearchableRecords + batch.unsearchableRecords,
    steps: source.steps + 1,
  });
}

export function applySourceError(state: ProjectSearchState, sessionId: string, error: SessionWindowError): ProjectSearchState {
  const source = state.sources[sessionId];
  if (!source || source.status !== "searching") return state;
  const status: SourceStatus = error.kind === "missing" ? "missing" : error.kind === "changed" ? "changed" : "error";
  return withSource(state, { ...source, status, error });
}

/**
 * Sources whose session is no longer a confirmed member stop being searched,
 * and their results are no longer offered. Nothing is added: a newly
 * confirmed session joins on the next search.
 */
export function restrictToMembers(state: ProjectSearchState, eligible: ReadonlySet<string>): ProjectSearchState {
  let result = state;
  for (const id of state.order) {
    const source = state.sources[id]!;
    if (!eligible.has(id) && source.status !== "excluded") result = withSource(result, { ...source, status: "excluded" });
  }
  return result;
}

export type ProjectSearchCoverage = {
  confirmed: number;
  searchable: number;
  done: number;
  partial: number;
  pending: number;
  unsupported: number;
  unavailable: number;
  excluded: number;
  sameSource: number;
  unsearchableRecords: number;
  hits: number;
  sessionsWithHits: number;
  /** Every searchable source was searched to its start. */
  complete: boolean;
};

export function projectSearchCoverage(state: ProjectSearchState): ProjectSearchCoverage {
  const sources = state.order.map((id) => state.sources[id]!);
  const count = (status: SourceStatus) => sources.filter((source) => source.status === status).length;
  const done = count("done");
  return {
    confirmed: state.entries.length,
    searchable: sources.length,
    done,
    partial: count("partial") + count("searching"),
    pending: count("pending"),
    unsupported: state.entries.filter((entry) => entry.kind === "unsupported").length,
    unavailable:
      state.entries.filter((entry) => entry.kind === "no-source").length +
      count("missing") +
      count("changed") +
      count("error"),
    excluded: count("excluded"),
    sameSource: state.entries.filter((entry) => entry.sameSourceAs).length,
    unsearchableRecords: sources.reduce((sum, source) => sum + source.unsearchableRecords, 0),
    hits: sources.filter((source) => source.status !== "excluded").reduce((sum, source) => sum + source.hits.length, 0),
    sessionsWithHits: sources.filter((source) => source.status !== "excluded" && source.hits.length > 0).length,
    complete: sources.length > 0 && done === sources.length,
  };
}

/**
 * The one-line status. "찾지 못했습니다" for the project is said only when
 * every confirmed session was searchable and searched to its start; anything
 * less says what was searched.
 */
export function projectSearchStatusLine(state: ProjectSearchState): string {
  const c = projectSearchCoverage(state);
  const scope = `확정된 세션 ${c.confirmed}개 · 찾는 대상 ${c.searchable}개 · 완료 ${c.done}개`;
  if (c.confirmed === 0) return "이 프로젝트에 확정된 세션이 없습니다";
  if (c.searchable === 0) return `확정된 세션 ${c.confirmed}개 · 찾을 수 있는 대화가 없습니다`;
  const found = c.hits > 0 ? `세션 ${c.sessionsWithHits}개에서 메시지 ${c.hits}개` : null;
  if (state.status === "searching") return `찾는 중… ${scope}${found ? ` · ${found}` : ""}`;
  const whole = c.complete && c.unsupported === 0 && c.unavailable === 0 && c.excluded === 0;
  if (c.hits >= PROJECT_SEARCH_MAX_HITS) return `${scope} · ${PROJECT_SEARCH_MAX_HITS}개까지만 보여 줍니다`;
  if (found) return `${scope} · ${found}`;
  if (whole) return `${scope} · 확정된 대화 전체에서 찾지 못했습니다`;
  if (c.complete) return `${scope} · 찾은 대화에서는 없었습니다`;
  return `${scope} · 아직 찾지 않은 부분이 있습니다`;
}
