/**
 * Queryable Memory — structured local search over accepted memory.
 *
 * Answers "what did we decide / record about X?" against the
 * project's accepted memories, deterministically and without any
 * network call, embedding, or LLM. The first capability slice
 * searches `StoredAcceptedProjectMemory[]`; later slices extend the
 * same result shape to review actions, timeline events, and evidence.
 *
 * Hard rules (see `docs/mori-project-goal.md`):
 *   - **Local + deterministic.** Same input → same output. No vector
 *     search, no LLM query interpretation.
 *   - **Evidence-first.** Every result carries its evidence count and
 *     source-session count; snippets are drawn only from curated
 *     fields (title / summary) — never raw transcripts or connector
 *     logs.
 *   - **Honest about lifecycle.** `stale` / `contradicted` /
 *     `superseded` / `retired` / `watching` / `deferred` memories are
 *     still searchable but flagged `isCurrent: false` so the caller
 *     never presents them as current guidance.
 *   - **Pure.** No IO. The caller supplies the accepted memories.
 */
import type {
  StoredAcceptedProjectMemory,
  StoredAcceptedProjectMemoryReportEligibility,
  StoredAcceptedProjectMemorySensitivity,
  StoredAcceptedProjectMemoryStatus,
} from "../storage/storageTypes";

export type QueryableMemoryFilters = {
  kind?: StoredAcceptedProjectMemory["kind"];
  status?: StoredAcceptedProjectMemoryStatus;
  sensitivity?: StoredAcceptedProjectMemorySensitivity;
  resumeEligible?: boolean;
  reportEligibility?: StoredAcceptedProjectMemoryReportEligibility;
};

export type QueryableMemoryQuery = {
  /** Free text. Empty / absent → filter-only browse of all memories. */
  text?: string;
  filters?: QueryableMemoryFilters;
};

export type QueryableMemoryMatchField =
  | "title"
  | "summary"
  | "evidenceRef"
  | "sourceSession";

export type QueryableMemoryResult = {
  memoryId: string;
  kind: StoredAcceptedProjectMemory["kind"];
  status: StoredAcceptedProjectMemoryStatus;
  title: string;
  importance: "high" | "medium" | "low";
  /** Short excerpt from the matched curated field. Never raw content. */
  snippet: string;
  /** Which field the text matched; null for a filter-only browse. */
  matchedField: QueryableMemoryMatchField | null;
  /** Human "why it matched" line. */
  matchReason: string;
  evidenceCount: number;
  sourceSessionCount: number;
  /** True only for `accepted` / `edited`; false for every other status. */
  isCurrent: boolean;
};

export type QueryableMemoryResultSet = {
  results: QueryableMemoryResult[];
  /** Accepted memories considered (before text/filter narrowing). */
  totalSearched: number;
  matchCount: number;
  /** Honest one-line description of what was searched. */
  dataBasis: string;
};

const SNIPPET_LIMIT = 140;

const IMPORTANCE_RANK: Record<"high" | "medium" | "low", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const MATCH_TIER: Record<QueryableMemoryMatchField, number> = {
  title: 0,
  summary: 1,
  evidenceRef: 2,
  sourceSession: 3,
};

const MATCH_REASON: Record<QueryableMemoryMatchField, string> = {
  title: "Title match",
  summary: "Summary match",
  evidenceRef: "Evidence reference match",
  sourceSession: "Source session match",
};

export function searchAcceptedMemories(
  acceptedMemories: readonly StoredAcceptedProjectMemory[],
  query: QueryableMemoryQuery = {},
): QueryableMemoryResultSet {
  const text = normalise(query.text ?? "");
  const filters = query.filters ?? {};

  const results: QueryableMemoryResult[] = [];
  for (const memory of acceptedMemories) {
    if (!passesFilters(memory, filters)) continue;

    const matchedField = text.length === 0 ? null : matchField(memory, text);
    if (text.length > 0 && matchedField === null) continue;

    results.push(toResult(memory, matchedField, text));
  }

  results.sort(compareResults);

  return {
    results,
    totalSearched: acceptedMemories.length,
    matchCount: results.length,
    dataBasis: `${acceptedMemories.length} accepted project ${
      acceptedMemories.length === 1 ? "memory" : "memories"
    } searched · local-only · no transcripts or connector logs.`,
  };
}

// ─── filtering ────────────────────────────────────────────────────────

function passesFilters(
  memory: StoredAcceptedProjectMemory,
  filters: QueryableMemoryFilters,
): boolean {
  if (filters.kind !== undefined && memory.kind !== filters.kind) return false;
  if (filters.status !== undefined && memory.status !== filters.status) return false;
  if (filters.sensitivity !== undefined && memory.sensitivity !== filters.sensitivity) {
    return false;
  }
  if (filters.resumeEligible !== undefined && memory.resumeEligible !== filters.resumeEligible) {
    return false;
  }
  if (
    filters.reportEligibility !== undefined &&
    memory.reportEligibility !== filters.reportEligibility
  ) {
    return false;
  }
  return true;
}

// ─── matching ─────────────────────────────────────────────────────────

function matchField(
  memory: StoredAcceptedProjectMemory,
  text: string,
): QueryableMemoryMatchField | null {
  if (normalise(memory.title).includes(text)) return "title";
  if (normalise(memory.summary).includes(text)) return "summary";
  if (matchesEvidenceRef(memory, text)) return "evidenceRef";
  if (memory.sourceSessionIds.some((id) => normalise(id).includes(text))) return "sourceSession";
  return null;
}

function matchesEvidenceRef(memory: StoredAcceptedProjectMemory, text: string): boolean {
  for (const ref of memory.evidenceRefs) {
    if (normalise(ref.sessionId).includes(text)) return true;
    if (ref.kind === "session" && ref.sessionTitle && normalise(ref.sessionTitle).includes(text)) {
      return true;
    }
    if (ref.kind === "event" && normalise(ref.eventId).includes(text)) return true;
    if (ref.kind === "source" && normalise(ref.sourceId).includes(text)) return true;
  }
  return false;
}

// ─── result construction ──────────────────────────────────────────────

function toResult(
  memory: StoredAcceptedProjectMemory,
  matchedField: QueryableMemoryMatchField | null,
  text: string,
): QueryableMemoryResult {
  return {
    memoryId: memory.id,
    kind: memory.kind,
    status: memory.status,
    title: memory.title,
    importance: memory.importance,
    snippet: buildSnippet(memory, matchedField, text),
    matchedField,
    matchReason: matchedField === null ? "Filter match" : MATCH_REASON[matchedField],
    evidenceCount: memory.evidenceRefs.length,
    sourceSessionCount: memory.sourceSessionIds.length,
    isCurrent: memory.status === "accepted" || memory.status === "edited",
  };
}

function buildSnippet(
  memory: StoredAcceptedProjectMemory,
  matchedField: QueryableMemoryMatchField | null,
  text: string,
): string {
  // Snippets come only from curated fields. Title / summary matches
  // excerpt around the hit; ref matches fall back to the summary so
  // the caller always has readable context.
  if (matchedField === "summary") return excerptAround(memory.summary, text);
  if (matchedField === "title") return truncate(memory.summary || memory.title);
  // null (filter browse) and evidence/source matches: show the summary.
  return truncate(memory.summary || memory.title);
}

function excerptAround(field: string, text: string): string {
  const collapsed = collapse(field);
  if (collapsed.length <= SNIPPET_LIMIT || text.length === 0) return truncate(collapsed);
  const index = collapsed.toLowerCase().indexOf(text);
  if (index < 0) return truncate(collapsed);
  const start = Math.max(0, index - Math.floor((SNIPPET_LIMIT - text.length) / 2));
  const end = Math.min(collapsed.length, start + SNIPPET_LIMIT);
  const slice = collapsed.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${slice}${end < collapsed.length ? "…" : ""}`;
}

// ─── ranking ──────────────────────────────────────────────────────────

function compareResults(a: QueryableMemoryResult, b: QueryableMemoryResult): number {
  // Better match field first (title beats summary beats refs).
  const tierA = a.matchedField ? MATCH_TIER[a.matchedField] : 0;
  const tierB = b.matchedField ? MATCH_TIER[b.matchedField] : 0;
  if (tierA !== tierB) return tierA - tierB;
  // Current memory ahead of non-current.
  if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
  const importance = IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];
  if (importance !== 0) return importance;
  return a.title.localeCompare(b.title);
}

// ─── helpers ──────────────────────────────────────────────────────────

function normalise(value: string): string {
  return collapse(value).toLowerCase();
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string): string {
  const collapsed = collapse(value);
  if (collapsed.length <= SNIPPET_LIMIT) return collapsed;
  return `${collapsed.slice(0, SNIPPET_LIMIT - 1).trimEnd()}…`;
}
