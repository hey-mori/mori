/**
 * The section catalogue · WHICH parts an answer may contain.
 *
 * One table, three consumers: the prompt builder asks for these labels, the
 * parser recognises them, and the surface renders them. Splitting it out is what
 * keeps a new section from having to be added in three places and silently
 * missed in the parser, which is how a section quietly stops rendering.
 *
 * Two properties carry product meaning rather than presentation:
 *
 *  - `synthetic` marks a section the engine INVENTED (an example sentence, a
 *    suggested alternative) as opposed to one that describes the captured text
 *    (its translation, its meaning). The panel labels these, because a learner
 *    reading a made-up example as if it came from the source is the single
 *    easiest way for this feature to teach something false.
 *  - `optional` marks a section the engine is told to omit when it has nothing
 *    real to say. Forcing every heading to be filled is what produces confident
 *    padding, so the contract permits silence.
 */

export type LanguageSectionKey =
  // Shared
  | "translation"
  | "meaning"
  | "expressions"
  | "nuance"
  | "examples"
  | "pattern"
  | "grammar"
  // Word-scale
  | "partOfSpeech"
  | "pronunciation"
  | "context"
  | "collocations"
  | "confusables"
  // Phrase and sentence scale
  | "literal"
  | "intent"
  | "structure"
  // Express
  | "alternatives"
  | "difference"
  // Anything the engine emitted that the contract did not name
  | "raw";

export type LanguageSectionSpec = {
  key: LanguageSectionKey;
  /** The Korean label the engine must emit and the panel displays. */
  label: string;
  /** What the engine is told to put here. */
  guidance: string;
  /** Content the engine invents rather than reads out of the capture. */
  synthetic?: boolean;
  /** The engine may omit this when it has nothing genuine to say. */
  optional?: boolean;
};

/**
 * Every section the contract knows about, keyed by its Korean label.
 *
 * Labels are unique across the catalogue because the parser matches on them.
 * Adding a duplicate label would make one of the two unreachable, so
 * `assertUniqueLabels` below is called at module load in dev builds.
 */
export const SECTION_SPECS: ReadonlyArray<LanguageSectionSpec> = [
  {
    key: "translation",
    label: "번역",
    guidance: "자연스러운 번역. 직역이 아니라 실제로 그렇게 말하는 문장.",
  },
  {
    key: "meaning",
    label: "뜻",
    guidance:
      "이 문맥에서의 핵심 뜻 하나. 사전의 모든 뜻이 아니라 여기서 쓰인 뜻만.",
  },
  {
    key: "partOfSpeech",
    label: "품사",
    guidance: "품사와 이 문장에서 실제로 쓰인 형태(시제·수·활용)를 한 줄로.",
  },
  {
    key: "pronunciation",
    label: "발음",
    guidance:
      "IPA 표기. 확실하지 않으면 이 줄을 생략합니다. 한글 음차는 쓰지 않습니다.",
    optional: true,
  },
  {
    key: "context",
    label: "문맥",
    guidance: "여러 뜻 중 왜 이 뜻으로 읽히는지, 문맥의 근거를 짧게.",
  },
  {
    key: "collocations",
    label: "연어",
    guidance:
      "이 단어가 실제로 자주 함께 쓰이는 조합을 `- 조합: 쓰임` 형식으로 2~3개.",
    synthetic: true,
  },
  {
    key: "examples",
    label: "예문",
    guidance: "짧고 자연스러운 예문 1~2개. 각 예문 뒤에 괄호로 번역.",
    synthetic: true,
  },
  {
    key: "confusables",
    label: "구별",
    guidance:
      "혼동하기 쉬운 유사 표현과 차이를 `- 표현: 어떻게 다른지` 형식으로 1~2개. 헷갈릴 만한 게 없으면 생략합니다.",
    synthetic: true,
    optional: true,
  },
  {
    key: "literal",
    label: "직역과 차이",
    guidance:
      "직역하면 어떻게 되는지, 그리고 실제 쓰임이 어떻게 다른지. 차이가 없으면 생략합니다.",
    optional: true,
  },
  {
    key: "pattern",
    label: "문형",
    guidance:
      "다른 상황에 그대로 재사용할 수 있는 골격을 대괄호 자리표시자로. 예: `[동사] one's way through [명사]`.",
    synthetic: true,
  },
  {
    key: "expressions",
    label: "표현",
    guidance:
      "재사용할 가치가 있는 핵심 표현을 `- 표현: 설명` 형식으로 2~4개.",
  },
  {
    key: "intent",
    label: "의도",
    guidance: "이 문장으로 상대가 실제로 하려는 것. 정보 전달인지 요청인지 거절인지.",
  },
  {
    key: "structure",
    label: "구조",
    guidance:
      "절과 덩어리 단위로 끊어서 각 덩어리가 무슨 역할인지. 단어별 품사 나열은 하지 않습니다.",
  },
  {
    key: "grammar",
    label: "문법",
    guidance:
      "의미를 좌우하는 문법 하나만. 문법을 몰라도 뜻이 통하면 생략합니다.",
    optional: true,
  },
  {
    key: "alternatives",
    label: "대안",
    guidance:
      "상황이 달라질 때 쓸 표현을 `- 표현: 어떤 상황에 맞는지` 형식으로 2~3개. 부드러운 요청, 명확한 지시, 강한 제약처럼 강도를 다르게.",
    synthetic: true,
  },
  {
    key: "difference",
    label: "차이",
    guidance: "각 대안이 상대에게 어떻게 다르게 읽히는지 짧게.",
  },
  {
    key: "nuance",
    label: "뉘앙스",
    guidance:
      "어조·강도·공손함이 실제로 중요할 때만. 중립적인 문장이면 생략합니다.",
    optional: true,
  },
];

/**
 * Labels an engine plausibly emits instead of the canonical one.
 *
 * Tolerance, not vocabulary: a provider that answers "의미:" where the contract
 * asked for "뜻:" is being helpful, and dropping that section into `raw` would
 * lose a real answer. Aliases never appear in a prompt.
 */
const LABEL_ALIASES: ReadonlyMap<string, LanguageSectionKey> = new Map([
  ["의미", "meaning"],
  ["핵심", "meaning"],
  ["직역", "literal"],
  ["예시", "examples"],
  ["패턴", "pattern"],
  ["유사 표현", "confusables"],
  ["함께 쓰는 표현", "collocations"],
]);

const SPEC_BY_KEY = new Map(SECTION_SPECS.map((spec) => [spec.key, spec]));
const SPEC_BY_LABEL = new Map(SECTION_SPECS.map((spec) => [spec.label, spec]));

/** Guard against two sections claiming one label, which would hide one of them
 *  from the parser. Cheap enough to run unconditionally. */
if (SPEC_BY_LABEL.size !== SECTION_SPECS.length) {
  throw new Error("language section labels must be unique");
}

export function specForKey(key: LanguageSectionKey): LanguageSectionSpec | undefined {
  return SPEC_BY_KEY.get(key);
}

/** Resolve a label the engine emitted, canonical or aliased. */
export function specForLabel(label: string): LanguageSectionSpec | undefined {
  const direct = SPEC_BY_LABEL.get(label);
  if (direct) return direct;
  const aliased = LABEL_ALIASES.get(label);
  return aliased ? SPEC_BY_KEY.get(aliased) : undefined;
}

/** Whether a section's body is content the engine invented. Unknown labels are
 *  treated as NOT synthetic, so a raw fallback is never mislabelled as an example. */
export function isSyntheticSection(key: LanguageSectionKey): boolean {
  return SPEC_BY_KEY.get(key)?.synthetic ?? false;
}

/** Every label the parser should recognise, canonical and aliased, longest
 *  first so "직역과 차이" is matched before a shorter label that prefixes it. */
export function allSectionLabels(): string[] {
  return [...SECTION_SPECS.map((spec) => spec.label), ...LABEL_ALIASES.keys()].sort(
    (a, b) => b.length - a.length,
  );
}
