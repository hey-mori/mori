/**
 * The prompt Mori reads a note with.
 *
 * One call returns the whole reading: nature, summary, terms, insights, and
 * (only for a log) items. Nature comes back WITH the reading rather than being
 * asked first, so the user is never made to classify anything (v7 §6), and the
 * nature's only power is deciding which regions have content, never hiding one.
 *
 * Everything the model asserts must quote the document, because the parser drops
 * anything it cannot locate. The prompt says so plainly: it is cheaper to teach
 * the model the rule than to discard half its output.
 */
import type { DocumentNature } from "./understandingTypes";

export const UNDERSTANDING_SYSTEM_PROMPT = [
  "당신은 사용자가 쓴 노트를 읽고 이해하는 도구입니다. 반드시 JSON만 출력합니다.",
  "",
  "규칙:",
  "1. 모든 항목은 문서에 실제로 있는 문장을 quote 로 인용해야 합니다. 인용을 찾을 수 없는 항목은 버려집니다. 문서에 없는 내용을 지어내지 마십시오.",
  "2. 확실하지 않으면 그 항목을 비워 두십시오. 빈 목록은 정답일 수 있습니다.",
  "3. terms 는 이 문서가 정의 없이 사용하는 낯선 용어만 고르고, 뜻은 반드시 이 문서의 맥락으로 풀이합니다. 예: 프로그래밍 문서의 '문법'은 영어 문법이 아니라 syntax 입니다.",
  "4. items 는 글쓴이가 실제로 한 일이 적힌 문서(일지·회의록)에서만 만듭니다. 설명글·학습 자료·스크랩에는 items 가 없습니다. 빈 배열이 정답입니다.",
  "5. items 는 글쓴이 본인이 한 일만입니다. 다른 사람이 한 일, 하지 않은 일, 할 예정인 일은 제외합니다.",
  "6. 한국어로 답합니다.",
].join("\n");

/** What each nature makes worth asking for. The model still returns every field;
 *  this only tells it where to spend its attention. */
const NATURE_FOCUS: Record<DocumentNature, string> = {
  journal: "하루의 기록입니다. 글쓴이가 실제로 한 일을 items 로 남기고, 요약은 짧게.",
  meeting: "회의 기록입니다. 결정과 맡은 일을 items 로 남깁니다.",
  retro: "회고입니다. 배운 점과 다음에 바꿀 점을 insights 로 남깁니다. items 는 대개 비어 있습니다.",
  study: "학습 자료입니다. 용어 풀이와 핵심 내용이 중요합니다. items 는 비어 있습니다.",
  essay: "생각을 풀어쓴 글입니다. 주장과 근거를 insights 로 남깁니다. items 는 비어 있습니다.",
  clipping: "외부에서 가져온 자료입니다. 무엇에 대한 자료인지와 용어가 중요합니다. items 는 비어 있습니다.",
};

export type UnderstandingPromptArgs = {
  title: string;
  body: string;
  /** Schema ids the model may use for items, with their Korean labels. */
  itemKinds: { id: string; label: string }[];
  /** Hard structural readings that beat any guess: URL-dominant is a clipping,
   *  an attendee roster is a meeting. Passed as a hint, not an order. */
  structuralHint?: DocumentNature;
  /** Keeps a long document inside the model's context window. */
  maxBodyChars?: number;
};

export const DEFAULT_MAX_BODY_CHARS = 6_000;

export function buildUnderstandingPrompt(args: UnderstandingPromptArgs): string {
  const limit = args.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS;
  const truncated = args.body.length > limit;
  const body = truncated ? args.body.slice(0, limit) : args.body;

  const kinds = args.itemKinds.map((kind) => `${kind.id}(${kind.label})`).join(", ");

  return [
    "다음 노트를 읽고 아래 JSON 형식으로만 답하십시오.",
    "",
    "{",
    '  "nature": "journal|meeting|retro|study|essay|clipping",',
    '  "natureConfidence": 0.0~1.0,',
    '  "summary": "이 문서가 무엇인지 2~4문장",',
    '  "terms": [{"term": "문서에 나온 낯선 용어", "gloss": "이 문서 맥락에서의 뜻"}],',
    '  "insights": [{"text": "가져갈 만한 한 가지", "quote": "근거가 되는 문서의 문장 그대로"}],',
    '  "items": [{"schemaId": "…", "title": "…", "quote": "근거가 되는 문서의 문장 그대로"}]',
    "}",
    "",
    `items 의 schemaId 는 다음 중에서만 고릅니다: ${kinds}`,
    args.structuralHint
      ? `참고: 문서 구조상 ${args.structuralHint} 로 보입니다. 본문이 다르게 말하면 본문을 따르십시오.`
      : "",
    args.structuralHint ? `${NATURE_FOCUS[args.structuralHint]}` : "",
    "",
    `제목: ${args.title || "(없음)"}`,
    "본문:",
    body,
    truncated ? "\n(본문이 길어 앞부분만 실었습니다.)" : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Exported for the prompt tests and for a future nature-specific second pass. */
export function natureFocus(nature: DocumentNature): string {
  return NATURE_FOCUS[nature];
}
