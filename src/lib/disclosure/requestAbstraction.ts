/**
 * Deterministic request abstraction: turns a user's raw request message
 * into a condensed `summary` and a content-free `abstract` (an intent
 * line such as "사용자가 구현 작업을 요청함"). The abstract is deliberately
 * coarse, it states the *kind* of request, not its specifics, so a
 * surface can show what a step was about without exposing the prompt.
 *
 * This is the always-available floor, mirroring the deterministic Quick
 * Pass provider: a local-LLM-backed abstraction can produce a richer
 * (still content-safe) line later, but this pure heuristic needs no
 * model, no network, and no IO. It feeds the `summary` / `abstract`
 * variants consumed by `projectDisclosure`.
 *
 * See `docs/design/local-llm-understanding-and-live-follow.md` (slice 5).
 */
export type RequestAbstraction = {
  /** Condensed gist (still derived from the raw text). */
  summary: string;
  /** Content-free intent line; safe to show when the original is withheld. */
  abstract: string;
};

export type RequestIntent =
  | "fix"
  | "implement"
  | "refactor"
  | "review"
  | "explain"
  | "question"
  | "task";

const INTENT_ABSTRACTS: Record<RequestIntent, string> = {
  fix: "사용자가 수정·디버깅을 요청함",
  implement: "사용자가 구현 작업을 요청함",
  refactor: "사용자가 정리·리팩터링을 요청함",
  review: "사용자가 검토를 요청함",
  explain: "사용자가 설명을 요청함",
  question: "사용자가 질문함",
  task: "사용자가 작업을 요청함",
};

// Checked in priority order: the most actionable category wins when a
// message mixes signals (e.g. "왜 안 되지? 고쳐줘" is a fix, not a question).
const INTENT_PATTERNS: Array<{ intent: RequestIntent; pattern: RegExp }> = [
  { intent: "fix", pattern: /고쳐|고치|수정|버그|오류|에러|안\s?돼|안\s?됨|실패|깨[지졌]|fix|bug|error|broken|debug|crash/i },
  // Note: avoid the bare polite suffix "해줘", which attaches to any verb
  // (검토해줘 / 설명해줘) and would shadow more specific intents.
  { intent: "implement", pattern: /만들|구현|추가|작성|개발|붙여|implement|add|create|build|write|support/i },
  { intent: "refactor", pattern: /리팩|리팩터|정리|개선|간소화|구조\s?변경|refactor|clean\s?up|simplify|restructure/i },
  { intent: "review", pattern: /리뷰|검토|확인|점검|봐줘|봐 줘|review|check|audit|inspect/i },
  { intent: "explain", pattern: /설명|알려|이해|describe|explain|what is|뭐하는|무엇을 하는/i },
  { intent: "question", pattern: /\?|왜|어떻게|어째서|무엇|뭐|언제|어디|누가|how|why|what|which|when|where/i },
];

const DEFAULT_MAX_SUMMARY_CHARS = 120;

const ABSTRACT_LINES = new Set(Object.values(INTENT_ABSTRACTS));

/** Classify the request's intent from its raw text. */
export function classifyRequestIntent(rawText: string): RequestIntent {
  const text = rawText.trim();
  if (!text) return "task";
  for (const { intent, pattern } of INTENT_PATTERNS) {
    if (pattern.test(text)) return intent;
  }
  return "task";
}

/**
 * Build the summary + abstract for a raw request. A blank input yields
 * empty strings (nothing to abstract). The summary is the first sentence
 * (or a truncated head) of the normalized text; the abstract is the
 * content-free intent line.
 */
export function buildRequestAbstraction(
  rawText: string,
  opts: { maxSummaryChars?: number } = {},
): RequestAbstraction {
  const normalized = rawText.replace(/\s+/g, " ").trim();
  if (!normalized) return { summary: "", abstract: "" };
  // Already an intent line (a view that disclosed it once): projecting it
  // again keeps it, so two surfaces never name one request differently.
  if (ABSTRACT_LINES.has(normalized)) return { summary: normalized, abstract: normalized };

  const maxChars = opts.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS;
  return {
    summary: firstSentence(normalized, maxChars),
    abstract: INTENT_ABSTRACTS[classifyRequestIntent(normalized)],
  };
}

function firstSentence(text: string, maxChars: number): string {
  // Prefer a natural sentence boundary; fall back to a hard truncation.
  const match = text.match(/^.*?[.!?。？！](\s|$)/);
  const candidate = match ? match[0].trim() : text;
  if (candidate.length <= maxChars) return candidate;
  return `${candidate.slice(0, maxChars).trimEnd()}…`;
}
