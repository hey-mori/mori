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
  StoredMemoryReviewAction,
} from "../storage/storageTypes";
import type { SourceRef, TimelineEvent } from "../../domain/types";
import { describeMemoryAuditAction } from "./memoryAuditTrail";

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
  title: "제목 일치",
  summary: "요약 일치",
  evidenceRef: "자료 참조 일치",
  sourceSession: "출처 세션 일치",
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

// ─── cross-source references ──────────────────────────────────────────

/**
 * A search hit outside accepted memory — a timeline event or an
 * evidence source from the active session. Lets Queryable Memory
 * answer "did we touch X?" against the real work, not just the
 * curated memory. Snippets are drawn from already-curated fields
 * (event title / summary, source title / detail) — never raw
 * transcripts or connector logs.
 */
export type QueryableMemoryReferenceKind =
  | "timelineEvent"
  | "evidenceSource"
  | "reviewAction";

export type QueryableMemoryReference = {
  resultKind: QueryableMemoryReferenceKind;
  refId: string;
  title: string;
  snippet: string;
  matchedField: "title" | "summary" | "detail" | "note";
  matchReason: string;
  /** Short context label — event type, source kind, or audit action. */
  contextLabel: string;
};

export type SearchProjectMemoryReferencesInput = {
  timelineEvents?: readonly TimelineEvent[];
  evidenceSources?: readonly SourceRef[];
  /** Memory Audit Trail review actions — only their reviewer notes are searched. */
  reviewActions?: readonly StoredMemoryReviewAction[];
};

/**
 * Search the active session's timeline events and evidence sources.
 * Returns `[]` for an empty query — references are a search feature,
 * not a browse-all surface (the Timeline / Evidence pages do that).
 */
export function searchProjectMemoryReferences(
  input: SearchProjectMemoryReferencesInput,
  query: QueryableMemoryQuery = {},
): QueryableMemoryReference[] {
  const text = normalise(query.text ?? "");
  if (text.length === 0) return [];

  const references: QueryableMemoryReference[] = [];

  for (const event of input.timelineEvents ?? []) {
    if (normalise(event.title).includes(text)) {
      references.push(eventReference(event, "title"));
    } else if (normalise(event.summary).includes(text)) {
      references.push(eventReference(event, "summary"));
    }
  }
  for (const source of input.evidenceSources ?? []) {
    if (normalise(source.title).includes(text)) {
      references.push(sourceReference(source, "title", text));
    } else if (normalise(source.detail).includes(text)) {
      references.push(sourceReference(source, "detail", text));
    }
  }
  for (const action of input.reviewActions ?? []) {
    // Only the reviewer's own note is searched — never the before /
    // after snapshots, which can carry memory titles / summaries.
    const note = typeof action.note === "string" ? action.note : "";
    if (note.length > 0 && normalise(note).includes(text)) {
      references.push(reviewActionReference(action, note, text));
    }
  }

  return references.sort(compareReferences);
}

function eventReference(
  event: TimelineEvent,
  matchedField: "title" | "summary",
): QueryableMemoryReference {
  return {
    resultKind: "timelineEvent",
    refId: event.id,
    title: event.title,
    snippet: truncate(event.summary || event.title),
    matchedField,
    matchReason: matchedField === "title" ? "Event title match" : "Event summary match",
    contextLabel: event.type,
  };
}

function sourceReference(
  source: SourceRef,
  matchedField: "title" | "detail",
  text: string,
): QueryableMemoryReference {
  return {
    resultKind: "evidenceSource",
    refId: source.id,
    title: source.title,
    snippet:
      matchedField === "detail"
        ? excerptAround(source.detail, text)
        : truncate(source.detail || source.title),
    matchedField,
    matchReason: matchedField === "title" ? "Source title match" : "Source detail match",
    contextLabel: source.kind,
  };
}

function reviewActionReference(
  action: StoredMemoryReviewAction,
  note: string,
  text: string,
): QueryableMemoryReference {
  return {
    resultKind: "reviewAction",
    refId: action.id,
    title: "검토 메모",
    snippet: excerptAround(note, text),
    matchedField: "note",
    matchReason: "검토 메모 일치",
    contextLabel: describeMemoryAuditAction(action.actionType),
  };
}

const REFERENCE_KIND_ORDER: Record<QueryableMemoryReferenceKind, number> = {
  timelineEvent: 0,
  evidenceSource: 1,
  reviewAction: 2,
};

function compareReferences(
  a: QueryableMemoryReference,
  b: QueryableMemoryReference,
): number {
  // Title matches first, then a stable kind order, then title.
  const tierA = a.matchedField === "title" ? 0 : 1;
  const tierB = b.matchedField === "title" ? 0 : 1;
  if (tierA !== tierB) return tierA - tierB;
  if (a.resultKind !== b.resultKind) {
    return REFERENCE_KIND_ORDER[a.resultKind] - REFERENCE_KIND_ORDER[b.resultKind];
  }
  return a.title.localeCompare(b.title);
}
