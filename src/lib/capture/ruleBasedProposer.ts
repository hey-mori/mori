/**
 * Rule-based proposer · the deterministic pilot for the Understand / Propose
 * stages (architecture doc §4). No LLM: it recognises the pilot schemas
 * (운동 · 학습 · 활동 · 인사이트 · 할 일 · 자료 · 질의응답 · 노트) from a
 * capture and always falls back to a note so nothing the user typed is ever
 * dropped.
 *
 * One input may yield several records (record-workspace spec): the content is
 * segmented at sentence boundaries, and inside a sentence at a "~고 "
 * connective, but a connective split is accepted only when every part
 * classifies to a non-note schema or carries its own date anchor. That guard
 * keeps "러닝 10분, 팔굽혀펴기 5개 3세트" one workout while
 * "어제 화면을 검토했고 오늘 러닝 1시간 했어" becomes two records. Robust
 * splitting stays an LLM-proposer capability; this is the honest floor.
 *
 * This mirrors Quick Pass's deterministic provider. An LLM proposer will
 * register alongside it later and return the same `RecordProposal[]`;
 * consumers never branch on which ran.
 */
import type { RecordProposal } from "./captureTypes";
import type { CaptureInput } from "./captureTypes";
import { parseConversation } from "./conversationParser";
import { inferOccurredTime, type InferredTime } from "./dateInference";

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

/** Work-verb stems that read as "a thing I did" (업무 활동). */
const ACTIVITY_WORDS = [
  "검토",
  "구현",
  "작업",
  "개발",
  "회의",
  "미팅",
  "배포",
  "수정",
  "설계",
  "분석",
  "리뷰",
  "작성",
  "발표",
  "정리했",
];

/** Thought / realisation markers (인사이트). Checked before task markers so
 *  "~해야 한다는 생각이 들었다" reads as the thought, not the todo. */
const INSIGHT_MARKERS = [
  "생각이 들었",
  "생각도 들었",
  "생각이 든다",
  "다는 생각",
  "깨달았",
  "깨달음",
  "인사이트",
];

/** Forward-looking intent markers (할 일). */
const TASK_MARKERS = [
  "해야 해",
  "해야 함",
  "해야 한다",
  "해야겠",
  "해야지",
  "할 일",
  "할일",
  "다음에는",
];

const DURATION_MIN_RE = /(\d+)\s*분/;
const DURATION_HOUR_RE = /(\d+)\s*시간(?:\s*(\d+)\s*분)?/;
const SETS_RE = /(\d+)\s*세트/;
const URL_RE = /https?:\/\/[^\s]+/i;
/** Sentence boundaries: terminal punctuation or a newline. */
const SENTENCE_RE = /(?<=[.!?…])\s+|\n+/;
/** Intra-sentence connective "~고 " after a hangul syllable. */
const CONNECTIVE_RE = /(?<=[가-힣])고\s+/g;

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/** First line, trimmed and clipped, as a record title. */
function titleFrom(content: string, fallback: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const clipped = firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
  return clipped.length > 0 ? clipped : fallback;
}

/** Parses "1시간 30분" / "45분" into minutes; hours win when both forms
 *  appear because the hour match already consumes its trailing minutes. */
function parseDurationMinutes(content: string): number | undefined {
  const hours = content.match(DURATION_HOUR_RE);
  if (hours) return Number(hours[1]) * 60 + (hours[2] ? Number(hours[2]) : 0);
  const minutes = content.match(DURATION_MIN_RE);
  return minutes ? Number(minutes[1]) : undefined;
}

function noteProposal(
  content: string,
  timeBasis: RecordProposal["timeBasis"],
  occurredStart?: string,
  timeConfidence?: number,
  dateEvidence?: string,
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
    dateEvidence,
    entityMentions: [],
  };
}

function parseExercises(content: string): { mentions: string[]; durationMinutes?: number } {
  const mentions: string[] = [];
  for (const word of EXERCISE_WORDS) {
    if (content.includes(word) && word !== "운동") mentions.push(word);
  }
  return { mentions, durationMinutes: parseDurationMinutes(content) };
}

/** The segment-level classification vocabulary. Order encodes priority. */
type SegmentKind = "workout" | "study" | "insight" | "task" | "activity" | "note";

function classifySegment(segment: string): SegmentKind {
  if (includesAny(segment, EXERCISE_WORDS) || SETS_RE.test(segment)) return "workout";
  if (includesAny(segment, STUDY_WORDS)) return "study";
  if (includesAny(segment, INSIGHT_MARKERS)) return "insight";
  if (includesAny(segment, TASK_MARKERS)) return "task";
  if (includesAny(segment, ACTIVITY_WORDS)) return "activity";
  return "note";
}

type Segment = {
  text: string;
  kind: SegmentKind;
  inferred: InferredTime | null;
};

function toSegment(text: string, now: Date): Segment {
  return { text, kind: classifySegment(text), inferred: inferOccurredTime(text, now) };
}

/** Splits one sentence at "~고 " connectives, accepting the split only when
 *  every part stands on its own: long enough, and either typed (non-note) or
 *  carrying its own date anchor, with the parts not all reading the same. */
function splitSentence(sentence: string, now: Date): Segment[] {
  const whole = toSegment(sentence, now);
  const parts = sentence.split(CONNECTIVE_RE).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return [whole];
  const segments = parts.map((part) => toSegment(part, now));
  const everyPartStands = segments.every(
    (segment) => segment.text.length >= 4 && (segment.kind !== "note" || segment.inferred !== null),
  );
  const kinds = new Set(segments.map((segment) => segment.kind));
  const anchors = new Set(segments.map((segment) => segment.inferred?.occurredStart ?? ""));
  const meaningfullyDistinct = kinds.size > 1 || (anchors.size > 1 && !anchors.has(""));
  return everyPartStands && meaningfullyDistinct ? segments : [whole];
}

/** Sentence segmentation + guarded connective splits + note merging. Adjacent
 *  segments of the same kind with no distinct date anchors merge back, so
 *  "러닝 45분. 팔굽혀펴기 3세트." stays one workout. */
function segmentContent(content: string, now: Date): Segment[] {
  const sentences = content
    .split(SENTENCE_RE)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const split = sentences.flatMap((sentence) => splitSentence(sentence, now));

  const merged: Segment[] = [];
  for (const segment of split) {
    const previous = merged[merged.length - 1];
    const bothUnanchored = previous && !previous.inferred && !segment.inferred;
    if (previous && previous.kind === segment.kind && bothUnanchored) {
      const text = `${previous.text} ${segment.text}`;
      merged[merged.length - 1] = { ...previous, text };
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

/** Builds the typed proposal for one classified segment. */
function proposalForSegment(segment: Segment, known: Set<string>): RecordProposal {
  const { text, kind, inferred } = segment;
  const occurredStart = inferred?.occurredStart;
  const timeBasis: RecordProposal["timeBasis"] = inferred ? "ai-inferred" : "unknown";
  const timeConfidence = inferred?.confidence;
  const dateEvidence = inferred?.evidence;
  const common = { occurredStart, timeBasis, timeConfidence, dateEvidence } as const;

  switch (kind) {
    case "workout": {
      const { mentions, durationMinutes } = parseExercises(text);
      const properties: RecordProposal["properties"] = {
        exercises: { raw: text, items: mentions.map((name) => ({ name })) },
      };
      if (durationMinutes !== undefined) properties.durationMinutes = durationMinutes;
      return {
        schemaId: "workout",
        title: titleFrom(text, "운동"),
        body: text,
        properties,
        ...common,
        confidence: 0.75,
        rationale: "운동 관련 표현을 찾아 운동 기록으로 정리합니다",
        entityMentions: mentions.map((name) => ({ type: "exercise", canonicalName: name })),
        introducesNewEntity: mentions.some((name) => !known.has(name)),
      };
    }
    case "study": {
      const subject = SUBJECT_HINTS.find((word) => text.includes(word));
      return {
        schemaId: "study-session",
        title: titleFrom(text, "학습"),
        body: text,
        properties: subject ? { subject } : {},
        ...common,
        confidence: 0.7,
        rationale: "학습 관련 표현을 찾아 학습 기록으로 정리합니다",
        entityMentions: [],
      };
    }
    case "insight":
      return {
        schemaId: "insight",
        title: titleFrom(text, "인사이트"),
        body: text,
        properties: {},
        ...common,
        confidence: 0.6,
        rationale: "생각·깨달음 표현을 찾아 인사이트로 정리합니다",
        entityMentions: [],
      };
    case "task":
      return {
        schemaId: "task",
        title: titleFrom(text, "할 일"),
        body: text,
        properties: { done: false },
        // A todo's inferred date would be its due date, not an activity date;
        // the deterministic pilot leaves both unset rather than guessing.
        occurredStart: undefined,
        timeBasis: "unknown",
        timeConfidence: undefined,
        dateEvidence: undefined,
        confidence: 0.6,
        rationale: "해야 할 일 표현을 찾아 할 일로 정리합니다",
        entityMentions: [],
      };
    case "activity": {
      const durationMinutes = parseDurationMinutes(text);
      return {
        schemaId: "activity",
        title: titleFrom(text, "활동"),
        body: text,
        properties: durationMinutes !== undefined ? { durationMinutes } : {},
        ...common,
        confidence: 0.65,
        rationale: "한 일로 읽혀 활동으로 정리합니다",
        entityMentions: [],
      };
    }
    case "note":
      return noteProposal(text, timeBasis, occurredStart, timeConfidence, dateEvidence);
  }
}

/**
 * Proposes records for a capture. Q&A dialogs and URLs are whole-input
 * matches; everything else segments (sentences + guarded connective splits)
 * and each segment proposes its typed record, with notes as the faithful
 * fallback. An all-note segmentation collapses back to one note of the whole
 * input so unstructured prose is never fragmented.
 */
export function proposeRecords(input: CaptureInput, options: ProposerOptions = {}): RecordProposal[] {
  const known = options.knownEntityNames ?? new Set<string>();
  const content = input.content.trim();
  if (content.length === 0) return [];

  const now = (options.now ?? (() => new Date()))();
  const wholeInferred = input.occurredHint ? null : inferOccurredTime(content, now);
  const wholeOccurred = input.occurredHint ?? wholeInferred?.occurredStart;
  const wholeBasis: RecordProposal["timeBasis"] = input.occurredHint
    ? "user-provided"
    : wholeInferred
      ? "ai-inferred"
      : "unknown";
  const wholeConfidence = wholeInferred?.confidence;
  const wholeEvidence = wholeInferred?.evidence;

  // A pasted AI dialog becomes a 질의응답 record. Checked before workout /
  // study so a conversation that mentions exercise still reads as Q&A. Only
  // fires on clear turn markers, so ordinary prose is never misread.
  const conversation =
    input.kind === "pasted-conversation" || input.kind === "text" ? parseConversation(content) : null;
  if (conversation) {
    const firstQuestion = conversation.pairs[0]?.question ?? conversation.turns[0]?.text ?? "";
    return [
      {
        schemaId: "qa",
        title: titleFrom(firstQuestion, "질의응답"),
        body: content,
        properties: {
          turns: conversation.turns,
          ...(conversation.assistant ? { assistant: conversation.assistant } : {}),
        },
        occurredStart: wholeOccurred,
        timeBasis: wholeBasis,
        timeConfidence: wholeConfidence,
        dateEvidence: wholeEvidence,
        confidence: 0.85,
        rationale: "질문·답변 대화를 감지해 질의응답으로 정리합니다",
        entityMentions: [],
      },
    ];
  }

  if (input.kind === "url" || URL_RE.test(content)) {
    const url = input.url ?? content.match(URL_RE)?.[0] ?? content;
    return [
      {
        schemaId: "source-document",
        title: titleFrom(input.url ? content : url, "자료"),
        body: content,
        properties: { url },
        occurredStart: wholeOccurred,
        timeBasis: wholeBasis,
        timeConfidence: wholeConfidence,
        dateEvidence: wholeEvidence,
        // The URL itself is certain; the page body is not fetched yet, so this
        // is a faithful pointer, not an interpretation of contents.
        confidence: 0.9,
        rationale: "URL을 자료로 기록합니다",
        entityMentions: [],
      },
    ];
  }

  const segments = segmentContent(content, now);
  if (segments.every((segment) => segment.kind === "note")) {
    // Unstructured prose stays whole: one faithful note, never fragments.
    return [noteProposal(content, wholeBasis, wholeOccurred, wholeConfidence, wholeEvidence)];
  }

  return segments.map((segment) => {
    const proposal = proposalForSegment(segment, known);
    // An explicit hint from the capture wins over any per-segment inference.
    if (input.occurredHint && proposal.schemaId !== "task") {
      return {
        ...proposal,
        occurredStart: input.occurredHint,
        timeBasis: "user-provided" as const,
        timeConfidence: undefined,
        dateEvidence: undefined,
      };
    }
    return proposal;
  });
}
