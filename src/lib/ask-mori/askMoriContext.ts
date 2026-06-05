/**
 * Ask Mori — question understanding + grounded-prompt assembly (pure).
 *
 * `extractQueryTerms` turns a natural-language question into the keyword
 * terms used for deterministic retrieval (`searchAcceptedMemories` matches
 * substrings, so the raw question string would rarely match). It strips
 * punctuation, a small Korean/English stopword set, and common trailing
 * Korean particles so "인증은" retrieves a memory titled "인증".
 *
 * `buildAskMoriContext` assembles the citation-tagged prompt from the
 * already-retrieved candidates. Snippets come only from curated fields
 * (queryableMemory guarantees this), never raw transcripts.
 */
import type {
  QueryableMemoryReference,
  QueryableMemoryResult,
} from "../project-memory/queryableMemory";
import type { AskMoriCitation, AskMoriPrompt } from "./askMoriTypes";

export type AskMoriContextInput = {
  question: string;
  memoryResults: readonly QueryableMemoryResult[];
  references: readonly QueryableMemoryReference[];
};

export type AskMoriContext = {
  prompt: AskMoriPrompt;
  citations: AskMoriCitation[];
};

// ─── question understanding ───────────────────────────────────────────

const STOPWORDS = new Set<string>([
  // English question words / fillers
  "the", "a", "an", "is", "are", "was", "were", "how", "what", "why",
  "when", "where", "who", "which", "did", "do", "does", "we", "i", "you",
  "it", "to", "of", "in", "on", "for", "and", "or", "about", "with",
  // Korean question words / fillers (post particle-strip forms included)
  "이", "그", "저", "것", "무엇", "뭐", "어떻게", "어떤", "왜", "언제",
  "어디", "누가", "했지", "했나", "하는", "그리고", "또는", "관해", "대해",
]);

// Longest-first so multi-char particles strip before their prefixes.
const KOREAN_PARTICLES = [
  "에서", "으로", "에게", "한테", "까지", "부터", "마다",
  "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도", "만",
];

/**
 * Extract deterministic keyword terms from a question. Returns a deduped,
 * order-preserving list. Empty for a question with no content words.
 */
export function extractQueryTerms(question: string): string[] {
  const rawTokens = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);

  const terms: string[] = [];
  const seen = new Set<string>();
  for (const token of rawTokens) {
    const stripped = stripKoreanParticle(token);
    if (stripped.length < 2) continue;
    if (STOPWORDS.has(stripped)) continue;
    if (seen.has(stripped)) continue;
    seen.add(stripped);
    terms.push(stripped);
  }
  return terms;
}

function stripKoreanParticle(token: string): string {
  if (!/[가-힣]$/u.test(token)) return token;
  for (const particle of KOREAN_PARTICLES) {
    if (token.length > particle.length + 1 && token.endsWith(particle)) {
      return token.slice(0, token.length - particle.length);
    }
  }
  return token;
}

// ─── grounded prompt ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Mori's memory assistant. You answer a user's question using ONLY the reviewed project memory provided below (each item is tagged like [M1] or [R1]).

Rules:
- Answer in Korean, concisely and factually.
- Use ONLY the provided memory items. Never invent facts, files, or decisions.
- Cite the tags you relied on inline, e.g. "...로 결정했습니다 [M1]".
- Items tagged "(non-current)" are stale, contradicted, or unconfirmed references. Do not present them as settled guidance; mention the caveat if you use them.
- If the provided memory does not answer the question, say "관련된 검토 메모리에서 답을 찾지 못했습니다." and stop. Do not guess.
- Output prose only. No JSON, no markdown fences.`;

export function buildAskMoriContext(input: AskMoriContextInput): AskMoriContext {
  const citations: AskMoriCitation[] = [];

  const memoryLines: string[] = [];
  input.memoryResults.forEach((result, index) => {
    const tag = `M${index + 1}`;
    const flag = result.isCurrent ? "" : " (non-current)";
    memoryLines.push(
      `[${tag}]${flag} ${result.kind}: ${result.title}\n  ${result.snippet}`,
    );
    citations.push({
      kind: "acceptedMemory",
      refId: result.memoryId,
      tag,
      label: result.title,
      snippet: result.snippet,
      isCurrent: result.isCurrent,
      contextLabel: result.kind,
    });
  });

  const referenceLines: string[] = [];
  input.references.forEach((reference, index) => {
    const tag = `R${index + 1}`;
    // Name the session a cross-session hit came from, so the LLM and the cited
    // row both show where the evidence lives (e.g. "타임라인 · ng-gw 라우팅").
    const contextLabel = reference.sessionLabel
      ? `${reference.contextLabel} · ${reference.sessionLabel}`
      : reference.contextLabel;
    referenceLines.push(
      `[${tag}] (non-current) ${contextLabel}: ${reference.title}\n  ${reference.snippet}`,
    );
    citations.push({
      kind: referenceCitationKind(reference.resultKind),
      refId: reference.refId,
      tag,
      label: reference.title,
      snippet: reference.snippet,
      isCurrent: false,
      contextLabel,
    });
  });

  const userPrompt = [
    `Question: ${input.question.trim()}`,
    "",
    "Reviewed accepted memory:",
    memoryLines.length > 0 ? memoryLines.join("\n") : "(none)",
    "",
    "Reviewed session references:",
    referenceLines.length > 0 ? referenceLines.join("\n") : "(none)",
    "",
    "Answer the question per the system rules, citing tags.",
  ].join("\n");

  return { prompt: { systemPrompt: SYSTEM_PROMPT, userPrompt }, citations };
}

function referenceCitationKind(
  kind: QueryableMemoryReference["resultKind"],
): AskMoriCitation["kind"] {
  if (kind === "timelineEvent") return "timelineEvent";
  if (kind === "evidenceSource") return "evidenceSource";
  return "reviewAction";
}
