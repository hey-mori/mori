/**
 * Rule-based proposer · the deterministic pilot for the Understand / Propose
 * stages (architecture doc §4). No LLM: it recognises the four pilot schemas
 * (운동 · 학습 · 자료 · 노트) from a capture and always falls back to a note
 * so nothing the user typed is ever dropped.
 *
 * This is the engine seam's floor, mirroring Quick Pass's deterministic
 * provider. An LLM proposer will register alongside it later and return the
 * same `RecordProposal[]`; consumers never branch on which ran.
 */
import type { RecordProposal } from "./captureTypes";
import type { CaptureInput } from "./captureTypes";
import { inferOccurredTime } from "./dateInference";

/** Injected clock keeps proposals deterministic in tests. */
export type ProposerOptions = {
  now?: () => Date;
  /** Canonical names Mori already knows, to flag genuinely new entities. */
  knownEntityNames?: Set<string>;
};

const EXERCISE_WORDS = [
  "운동",
  "러닝",
  "달리기",
  "조깅",
  "헬스",
  "웨이트",
  "스쿼트",
  "팔굽혀펴기",
  "푸시업",
  "플랭크",
  "턱걸이",
  "윗몸",
  "요가",
  "스트레칭",
  "수영",
  "자전거",
];

const STUDY_WORDS = [
  "공부",
  "학습",
  "복습",
  "예습",
  "강의",
  "인강",
  "영어",
  "단어",
  "표현",
  "문법",
  "문제풀이",
  "암기",
];

/** Subject-like words, distinct from activity words (복습 · 학습). The subject
 *  is the thing being studied, not the act of studying it. */
const SUBJECT_HINTS = [
  "영어",
  "수학",
  "국어",
  "과학",
  "역사",
  "코딩",
  "프로그래밍",
  "일본어",
  "중국어",
];

const DURATION_RE = /(\d+)\s*분/;
const SETS_RE = /(\d+)\s*세트/;
const URL_RE = /https?:\/\/[^\s]+/i;

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/** First line, trimmed and clipped, as a record title. */
function titleFrom(content: string, fallback: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const clipped = firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
  return clipped.length > 0 ? clipped : fallback;
}

function noteProposal(
  content: string,
  timeBasis: RecordProposal["timeBasis"],
  occurredStart?: string,
  timeConfidence?: number,
): RecordProposal {
  return {
    schemaId: "note",
    title: titleFrom(content, "메모"),
    body: content,
    properties: {},
    occurredStart,
    timeBasis,
    timeConfidence,
    // A note is the safe fallback: it never structures, so it is always a
    // faithful capture of what the user wrote. High confidence by design.
    confidence: 1,
    rationale: "구조화할 형식을 찾지 못해 노트로 저장합니다",
    entityMentions: [],
  };
}

function parseExercises(content: string): { mentions: string[]; durationMinutes?: number } {
  const mentions: string[] = [];
  for (const word of EXERCISE_WORDS) {
    if (content.includes(word) && word !== "운동") mentions.push(word);
  }
  const durationMatch = content.match(DURATION_RE);
  const durationMinutes = durationMatch ? Number(durationMatch[1]) : undefined;
  return { mentions, durationMinutes };
}

/**
 * Proposes records for a capture. For text, a schema match yields the typed
 * proposal AND the note is dropped (the typed record carries the raw body);
 * no match yields the note alone. URL captures propose a source-document.
 */
export function proposeRecords(input: CaptureInput, options: ProposerOptions = {}): RecordProposal[] {
  const known = options.knownEntityNames ?? new Set<string>();
  const content = input.content.trim();
  if (content.length === 0) return [];

  // Activity time: an explicit hint wins; otherwise infer from a date word in
  // the text (marked ai-inferred). Absent both, the record stays `unknown` and
  // no date is fabricated (three-time honesty).
  const now = (options.now ?? (() => new Date()))();
  const inferred = input.occurredHint ? null : inferOccurredTime(content, now);
  const occurredStart = input.occurredHint ?? inferred?.occurredStart;
  const timeBasis: RecordProposal["timeBasis"] = input.occurredHint
    ? "user-provided"
    : inferred
      ? "ai-inferred"
      : "unknown";
  const timeConfidence = inferred?.confidence;

  if (input.kind === "url" || URL_RE.test(content)) {
    const url = input.url ?? content.match(URL_RE)?.[0] ?? content;
    return [
      {
        schemaId: "source-document",
        title: titleFrom(input.url ? content : url, "자료"),
        body: content,
        properties: { url },
        occurredStart,
        timeBasis,
        timeConfidence,
        // The URL itself is certain; the page body is not fetched yet, so this
        // is a faithful pointer, not an interpretation of contents.
        confidence: 0.9,
        rationale: "URL을 자료로 기록합니다",
        entityMentions: [],
      },
    ];
  }

  if (includesAny(content, EXERCISE_WORDS) || SETS_RE.test(content) || DURATION_RE.test(content)) {
    const { mentions, durationMinutes } = parseExercises(content);
    // `exercises` is a json property: store a structured object (raw text plus
    // the recognised items), never a bare string.
    const properties: RecordProposal["properties"] = {
      exercises: { raw: content, items: mentions.map((name) => ({ name })) },
    };
    if (durationMinutes !== undefined) properties.durationMinutes = durationMinutes;
    const introducesNewEntity = mentions.some((name) => !known.has(name));
    return [
      {
        schemaId: "workout",
        title: titleFrom(content, "운동"),
        body: content,
        properties,
        occurredStart,
        timeBasis,
        timeConfidence,
        confidence: 0.75,
        rationale: "운동 관련 표현을 찾아 운동 기록으로 정리합니다",
        entityMentions: mentions.map((name) => ({ type: "exercise", canonicalName: name })),
        introducesNewEntity,
      },
    ];
  }

  if (includesAny(content, STUDY_WORDS)) {
    const subject = SUBJECT_HINTS.find((word) => content.includes(word));
    return [
      {
        schemaId: "study-session",
        title: titleFrom(content, "학습"),
        body: content,
        properties: subject ? { subject } : {},
        occurredStart,
        timeBasis,
        timeConfidence,
        confidence: 0.7,
        rationale: "학습 관련 표현을 찾아 학습 기록으로 정리합니다",
        entityMentions: [],
      },
    ];
  }

  return [noteProposal(content, timeBasis, occurredStart, timeConfidence)];
}
