/**
 * Memory API — the public capability layer of Mori's memory service.
 *
 * One documented surface every consumer imports from, instead of reaching
 * into `project-memory/*`, `ask-mori/*`, or `glossary/*` internals. Each
 * operation runs against a `MemoryCapabilityInput` (see `memoryApiTypes.ts`):
 * plain data in, evidence-cited data + an honest `dataBasis` out, with any
 * LLM behind an injected port. Read + propose only; nothing is persisted
 * and the consolidation review gate is untouched.
 */
import { answerFromMemory, type AnswerFromMemoryDeps } from "../ask-mori/askMoriAnswer";
import type { AskMoriAnswer } from "../ask-mori/askMoriTypes";
import {
  defineGlossaryTerm,
  type DefineGlossaryTermDeps,
  type GlossaryDefinition,
} from "../glossary/glossaryDefinition";
import { extractGlossaryTerms } from "../glossary/extractGlossaryTerms";
import type { GlossaryResult, GlossaryTerm } from "../glossary/glossaryTypes";
import {
  searchAcceptedMemories,
  searchProjectMemoryReferences,
  type QueryableMemoryQuery,
  type QueryableMemoryReference,
  type QueryableMemoryResultSet,
  type SearchProjectMemoryReferencesInput,
} from "../project-memory/queryableMemory";
import type { MemoryCapabilityInput } from "./memoryApiTypes";

/**
 * Build the references-search input from the capability input. When
 * `sessionEvidence` is present, search spans every loaded session (attributed)
 * and the active-session top-level evidence is omitted to avoid double-counting
 * — the active session is one entry in `sessionEvidence`. Absent → the
 * active-session `events` / `sources`, exactly as before.
 */
function referencesInput(input: MemoryCapabilityInput): SearchProjectMemoryReferencesInput {
  if (input.sessionEvidence && input.sessionEvidence.length > 0) {
    return { reviewActions: input.reviewActions, sessions: input.sessionEvidence };
  }
  return {
    timelineEvents: input.events,
    evidenceSources: input.sources,
    reviewActions: input.reviewActions,
  };
}

export type MemorySearchResult = {
  /** Accepted-memory hits (title-ranked, evidence-cited). */
  memories: QueryableMemoryResultSet;
  /** Active-session references (timeline events, sources, review notes). */
  references: QueryableMemoryReference[];
};

/**
 * Structured local search across accepted memory and the active session's
 * references. Deterministic, no LLM.
 */
export function memorySearch(
  input: MemoryCapabilityInput,
  query: QueryableMemoryQuery,
): MemorySearchResult {
  return {
    memories: searchAcceptedMemories(input.acceptedMemories, query),
    references: searchProjectMemoryReferences(referencesInput(input), query),
  };
}

/**
 * Answer a natural-language question from reviewed memory. Uses the
 * injected LLM when present, else degrades to a deterministic listing.
 */
export function memoryAsk(
  input: MemoryCapabilityInput,
  question: string,
  deps: AnswerFromMemoryDeps = {},
): Promise<AskMoriAnswer> {
  return answerFromMemory(
    {
      question,
      acceptedMemories: input.acceptedMemories,
      references: referencesInput(input),
      // Ask runs the multi-round "search → read → search again" retrieval so
      // evidence phrased differently from the question still surfaces.
      expandRounds: 2,
    },
    deps,
  );
}

export type MemoryGlossaryOptions = {
  maxTerms?: number;
};

/**
 * Extract the recurring technical terms in the active session's evidence.
 * Deterministic, no LLM.
 */
export function memoryGlossary(
  input: MemoryCapabilityInput,
  options: MemoryGlossaryOptions = {},
): GlossaryResult {
  return extractGlossaryTerms({
    events: input.events,
    sources: input.sources,
    maxTerms: options.maxTerms,
  });
}

/**
 * Define one glossary term, grounded in its occurrences. Uses the injected
 * LLM when present, else lists where the term appears.
 */
export function memoryDefineTerm(
  term: GlossaryTerm,
  deps: DefineGlossaryTermDeps = {},
): Promise<GlossaryDefinition> {
  return defineGlossaryTerm(term, deps);
}
