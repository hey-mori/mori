/**
 * Ask Mori — orchestration: retrieve → ground → answer → cite.
 *
 * Pure except for the optional injected LLM port. Retrieval reuses the
 * shipped deterministic search (`searchAcceptedMemories` /
 * `searchProjectMemoryReferences`); the answer is grounded only in those
 * reviewed items. With no LLM (or on LLM error) it degrades honestly to a
 * deterministic listing of the retrieved memory. Nothing is persisted;
 * the answer is a proposal, never durable memory.
 */
import {
  searchAcceptedMemories,
  searchProjectMemoryReferences,
  type QueryableMemoryReference,
  type QueryableMemoryResult,
  type SearchProjectMemoryReferencesInput,
} from "../project-memory/queryableMemory";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import { expandSemanticTerms } from "../project-memory/semanticTerms";
import { buildAskMoriContext, extractQueryTerms } from "./askMoriContext";
import type { AskMoriAnswer, AskMoriCitation, AskMoriLlm } from "./askMoriTypes";

export type AnswerFromMemoryInput = {
  question: string;
  acceptedMemories: readonly StoredAcceptedProjectMemory[];
  /** Active-session evidence to search alongside accepted memory. */
  references?: SearchProjectMemoryReferencesInput;
  /** Max accepted-memory candidates to ground on (default 6). */
  maxMemories?: number;
  /** Max active-session references to ground on (default 4). */
  maxReferences?: number;
  /**
   * How many retrieval rounds to run (default 1). With `> 1`, Ask Mori does a
   * deterministic "search → read → search again" loop: after each round it
   * mines the hits' titles for salient terms the question never named and
   * searches again, so evidence phrased in different words than the question
   * still surfaces. Still local + deterministic — no LLM drives the loop, no
   * embeddings. Capped, so it always terminates.
   */
  expandRounds?: number;
};

const MAX_EXPANSION_TERMS = 4;
const MAX_ROUNDS = 4;

export type AnswerFromMemoryDeps = {
  /** Optional Local LLM. Absent or throwing → deterministic fallback. */
  llm?: AskMoriLlm;
};

const DEFAULT_MAX_MEMORIES = 6;
const DEFAULT_MAX_REFERENCES = 4;

export async function answerFromMemory(
  input: AnswerFromMemoryInput,
  deps: AnswerFromMemoryDeps = {},
): Promise<AskMoriAnswer> {
  const question = input.question.trim();
  const maxMemories = input.maxMemories ?? DEFAULT_MAX_MEMORIES;
  const maxReferences = input.maxReferences ?? DEFAULT_MAX_REFERENCES;
  const rounds = Math.min(MAX_ROUNDS, Math.max(1, input.expandRounds ?? 1));

  // Round 1: the question's own terms, bridged with curated synonyms /
  // translations (so a Korean question reaches English evidence and vice
  // versa). Later rounds widen the term set with salient words mined from the
  // hits so far, then re-retrieve over the union. `retrieve*` dedup and cap, so
  // re-running with a larger set is idempotent.
  const terms = new Set(expandSemanticTerms(queryTerms(question)));
  let memoryResults = retrieveMemories(input.acceptedMemories, [...terms], maxMemories);
  let references = retrieveReferences(input.references ?? {}, [...terms], maxReferences);
  for (let round = 1; round < rounds; round += 1) {
    const fresh = expandTerms(terms, memoryResults, references);
    if (fresh.length === 0) break;
    for (const term of fresh) terms.add(term);
    memoryResults = retrieveMemories(input.acceptedMemories, [...terms], maxMemories);
    references = retrieveReferences(input.references ?? {}, [...terms], maxReferences);
  }

  if (memoryResults.length === 0 && references.length === 0) {
    return {
      question,
      text: "이 질문과 관련된 검토된 메모리를 찾지 못했습니다.",
      citations: [],
      basis: "noMemory",
      usedLlm: false,
      llmFailed: false,
      containsNonCurrent: false,
      containsProvisional: false,
      dataBasis: `${input.acceptedMemories.length} accepted memories searched · local-only · no match.`,
    };
  }

  const { prompt, citations } = buildAskMoriContext({
    question,
    memoryResults,
    references,
  });
  const containsNonCurrent = citations.some((citation) => !citation.isCurrent);
  const containsProvisional = citations.some((citation) => citation.provisional);

  let llmFailed = false;
  if (deps.llm) {
    try {
      const text = (await deps.llm(prompt)).trim();
      if (text.length === 0) throw new Error("empty LLM response");
      return {
        question,
        text,
        citations,
        basis: "llm",
        usedLlm: true,
        llmFailed: false,
        containsNonCurrent,
        containsProvisional,
        dataBasis: dataBasisLine(memoryResults.length, references.length, "llm"),
      };
    } catch {
      // An LLM was configured but errored — fall back, but flag the failure so
      // the surface says "failed", not "not connected".
      llmFailed = true;
    }
  }

  return {
    question,
    text: deterministicAnswerText(citations, llmFailed),
    citations,
    basis: "deterministicFallback",
    usedLlm: false,
    llmFailed,
    containsNonCurrent,
    containsProvisional,
    dataBasis: dataBasisLine(memoryResults.length, references.length, "deterministicFallback"),
  };
}

// ─── retrieval ────────────────────────────────────────────────────────

function queryTerms(question: string): string[] {
  const terms = extractQueryTerms(question);
  // Fall back to the whole question (exact-title questions still match).
  if (terms.length === 0 && question.length > 0) return [question.toLowerCase()];
  return terms;
}

function retrieveMemories(
  acceptedMemories: readonly StoredAcceptedProjectMemory[],
  terms: readonly string[],
  limit: number,
): QueryableMemoryResult[] {
  const byId = new Map<string, QueryableMemoryResult>();
  for (const term of terms) {
    const { results } = searchAcceptedMemories(acceptedMemories, { text: term });
    for (const result of results) {
      const existing = byId.get(result.memoryId);
      if (!existing || matchTier(result) < matchTier(existing)) {
        byId.set(result.memoryId, result);
      }
    }
  }
  return [...byId.values()].sort(compareMemoryResults).slice(0, limit);
}

/**
 * Mine the current hits' titles for salient terms the term set does not yet
 * have. This is the "read" step of the search → read → search loop: a round-1
 * hit titled "인증 미들웨어" contributes "미들웨어", which then surfaces a memory
 * the question's word ("인증") alone would have missed. Deterministic, bounded.
 */
function expandTerms(
  existing: ReadonlySet<string>,
  memoryResults: readonly QueryableMemoryResult[],
  references: readonly QueryableMemoryReference[],
): string[] {
  const seen = new Set(existing);
  const out: string[] = [];
  const titles = [
    ...memoryResults.map((result) => result.title),
    ...references.map((reference) => reference.title),
  ];
  for (const title of titles) {
    for (const term of extractQueryTerms(title)) {
      if (seen.has(term)) continue;
      seen.add(term);
      out.push(term);
      if (out.length >= MAX_EXPANSION_TERMS) return out;
    }
  }
  return out;
}

function retrieveReferences(
  input: SearchProjectMemoryReferencesInput,
  terms: readonly string[],
  limit: number,
): QueryableMemoryReference[] {
  const byId = new Map<string, QueryableMemoryReference>();
  for (const term of terms) {
    for (const reference of searchProjectMemoryReferences(input, { text: term })) {
      if (!byId.has(reference.refId)) byId.set(reference.refId, reference);
    }
  }
  return [...byId.values()].slice(0, limit);
}

const MATCH_TIER: Record<NonNullable<QueryableMemoryResult["matchedField"]>, number> = {
  title: 0,
  summary: 1,
  evidenceRef: 2,
  sourceSession: 3,
};

const IMPORTANCE_RANK: Record<QueryableMemoryResult["importance"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function matchTier(result: QueryableMemoryResult): number {
  return result.matchedField ? MATCH_TIER[result.matchedField] : 4;
}

function compareMemoryResults(a: QueryableMemoryResult, b: QueryableMemoryResult): number {
  const tier = matchTier(a) - matchTier(b);
  if (tier !== 0) return tier;
  if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
  const importance = IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];
  if (importance !== 0) return importance;
  return a.title.localeCompare(b.title);
}

// ─── deterministic fallback ───────────────────────────────────────────

function deterministicAnswerText(
  citations: readonly AskMoriCitation[],
  llmFailed: boolean,
): string {
  const lines = citations.map((citation) => {
    const flag = citation.isCurrent ? "" : " (확정 아님)";
    return `• ${citation.label}${flag}: ${citation.snippet} [${citation.tag}]`;
  });
  const lead = llmFailed
    ? "로컬 LLM 분석에 실패해 규칙 기반으로 정리했습니다. 설정에서 엔진과 모델 이름을 확인하세요."
    : "로컬 LLM이 연결되어 있지 않아, 질문과 관련된 검토 메모리를 정리해 보여드립니다.";
  return [lead, ...lines].join("\n");
}

function dataBasisLine(
  memoryCount: number,
  referenceCount: number,
  mode: "llm" | "deterministicFallback",
): string {
  const modeLabel = mode === "llm" ? "LLM answer" : "deterministic listing";
  return `${memoryCount} accepted memories + ${referenceCount} session references · local-only · ${modeLabel}.`;
}
