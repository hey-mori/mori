/**
 * Mori data pipeline contract.
 *
 * Every piece of data the user sees in Mori flows through one canonical path:
 *
 *   SourceInput
 *     → EvidenceSource         (SourceRef)
 *     → NormalizedEventCandidate (NormalizedImportCandidate.events)
 *     → ImportReviewDraft      (review/reviewDraft.ts)
 *     → AppliedTimelineEvent   (TimelineEvent persisted on the session)
 *     → AnalysisResult         (lib/analysis)
 *     → ReviewItem             (Issue / Decision / NextAction)
 *     → ReportContext          (lib/reports/reportContext.ts)
 *     → ProjectMemorySnapshot  (lib/memory/projectMemoryContext.ts)
 *
 * This module is the **type contract** for that path plus thin adapters that
 * make it easy to walk from one stage to the next. It deliberately does NOT
 * re-implement the math — the implementations live in their existing modules
 * (`lib/import`, `lib/review`, `lib/evidence`, `lib/analysis`, `lib/reports`,
 * `lib/memory`). The point of having this layer is so future connectors enter
 * the same path and the documentation has a single home.
 */
import type {
  Decision,
  Issue,
  MockSession,
  NextAction,
  SourceRef,
  TimelineEvent,
} from "../domain/types";
import type { AnalysisResult } from "../lib/analysis";
import type { NormalizedImportCandidate } from "../lib/import";
import type { ImportReviewDraft } from "../lib/review";
import { createImportReviewDraft } from "../lib/review/reviewDraft";
import { getProvenanceSummary, getSessionEvidenceSummary } from "../lib/evidence";
import { deriveReportContext, type ReportContext } from "../lib/reports/reportContext";
import {
  deriveProjectMemoryContext,
  type ProjectMemorySnapshot,
} from "../lib/memory/projectMemoryContext";
import type { ProjectMemoryDataScope } from "../lib/project-memory/projectMemory";

// ─── Pipeline stage types ───────────────────────────────────────────────────

/**
 * Raw text or structured payload before any normalization. Each capture
 * surface produces one of these.
 */
export type SourceInput = {
  /** Where the input came from (matches a CaptureSurfaceId). */
  origin: string;
  /** Raw text. `null` when the input is a structured payload (e.g. JSONL row). */
  text: string | null;
  /** Optional structured payload (e.g. parsed connector JSONL event). */
  payload?: unknown;
  /** ISO timestamp when the user clicked "import" / the hook fired. */
  capturedAt: string;
};

/**
 * Normalized output of a `lib/import/normalize*` call. Already canonical;
 * carries `SourceRef` + the normalized `TimelineEvent[]` candidates.
 */
export type NormalizedEventCandidate = NormalizedImportCandidate;

/**
 * Provenance summary attached to anything Mori renders. Every event / issue /
 * decision / report row should be able to answer the questions in this type.
 *
 * - `sourceIds` — SourceRefs that justify this item.
 * - `createdBy` — `"user" | "import" | "ai" | "system"`.
 * - `trustLevel` — `"verified" | "observed" | "inferred"`.
 * - `confidence` — number in [0, 1], or null when not applicable.
 * - `rawDataPolicy` — what Mori promised about retention.
 * - `userCorrectable` — whether the UI should expose an edit affordance.
 */
export type ProvenanceRecord = {
  itemId: string;
  itemKind: "source" | "event" | "issue" | "decision" | "nextAction" | "report" | "bundle";
  sourceIds: string[];
  createdBy: "user" | "import" | "ai" | "system";
  trustLevel: "verified" | "observed" | "inferred";
  confidence: number | null;
  rawDataPolicy: "retained" | "summaryOnly" | "redacted" | "notCaptured" | "referenceOnly" | "unknown";
  userCorrectable: boolean;
};

export type AppliedTimelineEvent = TimelineEvent;
export type ReviewItem = Issue | Decision | NextAction;
export type { ReportContext, ProjectMemorySnapshot, AnalysisResult, ImportReviewDraft };

// ─── Adapters ───────────────────────────────────────────────────────────────

/**
 * The canonical list of SourceRefs for the current view, in capture order.
 */
export function deriveEvidenceSources(view: MockSession): SourceRef[] {
  return view.sources.slice().sort((left, right) => {
    return new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime();
  });
}

/**
 * Convenience: walk every imported candidate and return its event list,
 * flattened in chronological order. Useful for the Import Review draft
 * builder and tests.
 */
export function deriveTimelineCandidates(
  candidates: ReadonlyArray<NormalizedEventCandidate>,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const candidate of candidates) {
    events.push(...candidate.events);
  }
  return events.sort((left, right) => {
    return new Date(left.start).getTime() - new Date(right.start).getTime();
  });
}

/**
 * Build a review draft directly from a single normalized candidate. Wrapper
 * around `createImportReviewDraft` so callers don't import deep paths.
 */
export function deriveReviewContext(args: {
  candidate: NormalizedEventCandidate;
  origin: ImportReviewDraft["origin"];
}): ImportReviewDraft {
  return createImportReviewDraft(args.candidate, args.origin);
}

/**
 * Walk an event back to a ProvenanceRecord using the canonical evidence
 * helpers. Used wherever the UI needs to render "where did this come from?".
 */
export function getProvenanceForEvent(
  event: TimelineEvent,
  view: MockSession,
): ProvenanceRecord {
  const sources = view.sources.filter((source) => event.sourceRefs.includes(source.id));
  const rawDataPolicy = unifyRawDataPolicy(sources);
  return {
    itemId: event.id,
    itemKind: "event",
    sourceIds: event.sourceRefs,
    createdBy: event.createdBy,
    trustLevel: event.trustLevel,
    confidence: Number.isFinite(event.confidence) ? event.confidence : null,
    rawDataPolicy,
    userCorrectable: event.createdBy !== "system",
  };
}

export function getProvenanceForIssue(
  issue: Issue,
  view: MockSession,
): ProvenanceRecord {
  const events = view.events.filter((event) => issue.sourceEventIds.includes(event.id));
  const sourceIds = new Set(events.flatMap((event) => event.sourceRefs));
  const sources = view.sources.filter((source) => sourceIds.has(source.id));
  return {
    itemId: issue.id,
    itemKind: "issue",
    sourceIds: [...sourceIds],
    createdBy: issue.trustLevel === "inferred" ? "ai" : "import",
    trustLevel: issue.trustLevel,
    confidence: Number.isFinite(issue.confidence) ? issue.confidence : null,
    rawDataPolicy: unifyRawDataPolicy(sources),
    userCorrectable: true,
  };
}

export function getProvenanceForDecision(
  decision: Decision,
  view: MockSession,
): ProvenanceRecord {
  const events = view.events.filter((event) => decision.sourceEventIds.includes(event.id));
  const indirect = new Set(events.flatMap((event) => event.sourceRefs));
  const direct = new Set(decision.relatedSourceIds);
  const allIds = new Set<string>([...indirect, ...direct]);
  const sources = view.sources.filter((source) => allIds.has(source.id));
  return {
    itemId: decision.id,
    itemKind: "decision",
    sourceIds: [...allIds],
    createdBy: decision.trustLevel === "inferred" ? "ai" : "import",
    trustLevel: decision.trustLevel,
    confidence: null,
    rawDataPolicy: unifyRawDataPolicy(sources),
    userCorrectable: true,
  };
}

export function getProvenanceForSource(source: SourceRef): ProvenanceRecord {
  return {
    itemId: source.id,
    itemKind: "source",
    sourceIds: [source.id],
    createdBy: "import",
    trustLevel: source.trustLevel,
    confidence: null,
    rawDataPolicy: mapRetention(source.rawRetention),
    userCorrectable: false,
  };
}

/**
 * Re-export so callers can pull the rendered provenance labels through one
 * named path without separately importing `lib/evidence`.
 */
export { getProvenanceSummary };

/**
 * Roll up a list of raw-data policies into one report-level policy. If any
 * source retains raw text, the report inherits "retained" unless redaction
 * applied. `notCaptured` short-circuits to itself; mixed sets become
 * "summaryOnly" by default.
 */
function unifyRawDataPolicy(sources: SourceRef[]): ProvenanceRecord["rawDataPolicy"] {
  if (sources.length === 0) return "unknown";
  const policies = new Set(sources.map((source) => mapRetention(source.rawRetention)));
  if (policies.size === 1) {
    const only = [...policies][0]!;
    return only;
  }
  if (policies.has("notCaptured")) return "notCaptured";
  if (policies.has("summaryOnly")) return "summaryOnly";
  return "retained";
}

function mapRetention(
  retention: SourceRef["rawRetention"],
): "retained" | "summaryOnly" | "notCaptured" {
  if (retention === "deleted") return "notCaptured";
  return retention;
}

// ─── Report context + memory snapshot adapters ──────────────────────────────

/**
 * Thin re-export of `deriveReportContext`. Living here so the Reports view
 * imports a stable path from the pipeline layer.
 */
export { deriveReportContext };

/**
 * Thin re-export of `deriveProjectMemoryContext` under the pipeline's name.
 */
export function deriveProjectMemorySnapshot(args: {
  view: MockSession;
  scope: ProjectMemoryDataScope;
  savedSessions: Parameters<typeof deriveProjectMemoryContext>[0]["savedSessions"];
  reportCount: number;
  hasAnalysis: boolean;
}): ProjectMemorySnapshot {
  return deriveProjectMemoryContext({
    view: args.view,
    scope: args.scope,
    savedSessions: args.savedSessions,
    reportCount: args.reportCount,
    hasAnalysis: args.hasAnalysis,
  });
}

// ─── Session-wide pipeline overview ─────────────────────────────────────────

export type SessionPipelineOverview = {
  sourceCount: number;
  eventCount: number;
  issueCount: number;
  decisionCount: number;
  nextActionCount: number;
  hasAnalysis: boolean;
  dataBasis: string;
};

/**
 * One-shot summary that the Reports / Memory / Settings status strips can
 * consume without re-walking the view.
 */
export function getSessionPipelineOverview(
  view: MockSession,
  hasAnalysis: boolean,
): SessionPipelineOverview {
  const evidence = getSessionEvidenceSummary(view);
  return {
    sourceCount: view.sources.length,
    eventCount: view.events.length,
    issueCount: view.issues.length,
    decisionCount: view.decisions.length,
    nextActionCount: view.nextActions.length,
    hasAnalysis,
    dataBasis: evidence.dataBasis,
  };
}
