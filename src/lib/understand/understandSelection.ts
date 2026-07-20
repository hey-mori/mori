/**
 * SUPERSEDED · this module is no longer canonical and has ZERO production
 * imports. `src/lib/language/` owns the language contract now: it separates
 * capture from action, makes Understand and Express explicit user intents
 * instead of branching on detected language, and keeps DOM and Tauri types out
 * of the core so a global adapter can reuse it.
 *
 * It is kept ONLY because its tests still cover parser and detection edge cases
 * the new suite has not absorbed yet. Do not add callers, and do not treat its
 * prompt contract as authoritative.
 *
 * REMOVAL CONDITION: port the still-valuable cases from
 * `understandSelection.test.ts` into `src/lib/language/languageAction.test.ts`
 * (parser tolerance for markdown and malformed labels, detection ratio edges),
 * then delete this directory. The guard it used to provide now lives as
 * `isActionableText` in `src/lib/language/languageCapture.ts`.
 *
 * ── original notes ────────────────────────────────────────────────────────
 * 이해하기 (Understand): the pure core of the first contextual capability.
 *
 * Turns a user-selected span of text into an LLM prompt asking for a natural
 * translation, what the text actually means in its context, and the useful
 * expressions inside it, then parses the prose reply into labeled sections.
 * Pure and engine-agnostic: the caller supplies the LLM (the same prose port
 * Ask Mori uses, `createAskMoriLlmFromSettings`), so 규칙 기반 mode simply has
 * no engine and the surface shows an honest empty state instead of a fake
 * answer.
 *
 * Direction is detected, not configured: Korean-dominant selections ask for a
 * natural English rendering (expression), everything else asks for a Korean
 * explanation (comprehension). Nothing hard-codes the pair beyond the first
 * polished path; `sourceLang` rides the result so a future language can add a
 * branch without reshaping consumers.
 */

export type UnderstandLanguage = "ko" | "en" | "other";

export type UnderstandSectionKey =
  | "translation"
  | "meaning"
  | "expressions"
  | "nuance"
  | "raw";

export type UnderstandSection = {
  key: UnderstandSectionKey;
  /** Korean display label, e.g. "번역". */
  label: string;
  body: string;
};

export type UnderstandResult = {
  sections: UnderstandSection[];
  sourceLang: UnderstandLanguage;
};

export type UnderstandPromptInput = {
  /** The selected text, verbatim. */
  selection: string;
  /** Where the text came from, e.g. "mori · 게이트웨이 라우팅 세션". */
  contextLabel?: string;
};

export type UnderstandPrompt = {
  systemPrompt: string;
  userPrompt: string;
  sourceLang: UnderstandLanguage;
};

/** Selections shorter than this are noise (a double-clicked word is fine, a
 *  stray character is not). */
export const MIN_SELECTION_LENGTH = 2;
/** Cap what we send to the engine; a whole-transcript selection is not a
 *  reading question, and huge prompts only slow the answer down. */
export const MAX_SELECTION_LENGTH = 2_000;

const SECTION_LABELS: ReadonlyArray<{ key: UnderstandSectionKey; label: string }> = [
  { key: "translation", label: "번역" },
  { key: "meaning", label: "의미" },
  { key: "expressions", label: "표현" },
  { key: "nuance", label: "뉘앙스" },
];

/**
 * Dominant language of a selection, by script ratio. Hangul syllables and jamo
 * count as Korean; ASCII letters as English. Coarse on purpose: the answer
 * only picks the prompt direction, and a mixed selection defaults to the
 * comprehension direction (explain in Korean), which is the safe reading.
 */
export function detectLanguage(text: string): UnderstandLanguage {
  let hangul = 0;
  let latin = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0xac00 && code <= 0xd7a3) || (code >= 0x1100 && code <= 0x11ff)) {
      hangul += 1;
    } else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      latin += 1;
    }
  }
  const letters = hangul + latin;
  if (letters === 0) return "other";
  if (hangul / letters >= 0.3) return "ko";
  if (latin / letters >= 0.5) return "en";
  return "other";
}

/** Whether a selection is worth offering 이해하기 for at all. */
export function isUnderstandableSelection(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= MIN_SELECTION_LENGTH && /\S/.test(trimmed);
}

/**
 * Build the prompt pair for the prose LLM port. The reply contract is a small
 * fixed set of Korean section labels so `parseUnderstandResponse` stays a
 * tolerant line parser instead of fragile JSON.
 */
export function buildUnderstandPrompt(input: UnderstandPromptInput): UnderstandPrompt {
  const selection = input.selection.trim().slice(0, MAX_SELECTION_LENGTH);
  const sourceLang = detectLanguage(selection);
  const toEnglish = sourceLang === "ko";

  const directionRules = toEnglish
    ? [
        "선택된 한국어를 자연스러운 영어로 표현하는 것이 목표입니다.",
        "번역: 원어민이 실제로 쓸 법한 자연스러운 영어 문장. 어울리는 대안이 있으면 한 줄에 하나씩 최대 2개까지.",
        "의미: 이 문장이 전달하려는 바와, 직역과 달라지는 지점을 한국어로 짧게.",
        "표현: 이 상황에서 쓸 만한 영어 핵심 표현을 `- 표현: 설명` 형식으로 2~4개.",
      ]
    : [
        "선택된 텍스트를 한국어로 이해시키는 것이 목표입니다.",
        "번역: 자연스러운 한국어 번역.",
        "의미: 이 맥락에서 실제로 뜻하는 바. 기술 용어라면 이 분야에서의 의미를 짧게.",
        "표현: 재사용할 가치가 있는 핵심 표현을 `- 표현: 설명` 형식으로 2~4개.",
      ];

  const systemPrompt = [
    "당신은 Mori의 이해하기 도우미입니다. 사용자가 작업 기록에서 선택한 텍스트를 이해하고 표현하도록 돕습니다.",
    "규칙:",
    ...directionRules.map((rule) => `- ${rule}`),
    "- 뉘앙스: 어조나 뉘앙스가 실제로 중요할 때만 이 섹션을 추가하고, 아니면 생략합니다.",
    "- 답변은 반드시 `번역:` `의미:` `표현:` (`뉘앙스:`) 라벨로 시작하는 섹션들로만 구성합니다.",
    "- 간결하게 씁니다. 인사말, 서론, 마무리 문장을 쓰지 않습니다.",
    "- 모르는 것을 지어내지 않습니다. 문맥이 부족하면 의미 섹션에서 그렇게 말합니다.",
  ].join("\n");

  const contextLine = input.contextLabel?.trim()
    ? `출처: ${input.contextLabel.trim()}\n\n`
    : "";
  const userPrompt = `${contextLine}선택된 텍스트:\n"""\n${selection}\n"""`;

  return { systemPrompt, userPrompt, sourceLang };
}

const SECTION_LINE = /^\s*(?:#{1,4}\s*)?(?:\*\*)?(번역|의미|표현|뉘앙스)(?:\*\*)?\s*[:：]\s*(.*)$/;

/**
 * Parse the prose reply into labeled sections. Tolerant by design: label
 * lines may use markdown headings or bold, and a reply that ignores the
 * contract entirely still renders as one raw 설명 section rather than
 * disappearing.
 */
export function parseUnderstandResponse(
  text: string,
  sourceLang: UnderstandLanguage = "other",
): UnderstandResult {
  const lines = text.split(/\r?\n/);
  const sections: UnderstandSection[] = [];
  let current: UnderstandSection | null = null;

  for (const line of lines) {
    const match = SECTION_LINE.exec(line);
    if (match) {
      const label = match[1];
      const spec = SECTION_LABELS.find((entry) => entry.label === label);
      current = { key: spec?.key ?? "raw", label, body: match[2].trim() };
      sections.push(current);
      continue;
    }
    if (current) {
      current.body = current.body ? `${current.body}\n${line.trimEnd()}` : line.trim();
    } else if (line.trim()) {
      current = { key: "raw", label: "설명", body: line.trim() };
      sections.push(current);
    }
  }

  const cleaned = sections
    .map((section) => ({ ...section, body: section.body.trim() }))
    .filter((section) => section.body.length > 0);

  if (cleaned.length === 0) {
    const fallback = text.trim();
    return {
      sections: fallback ? [{ key: "raw", label: "설명", body: fallback }] : [],
      sourceLang,
    };
  }
  return { sections: cleaned, sourceLang };
}
