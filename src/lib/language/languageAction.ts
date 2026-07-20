/**
 * Language actions · WHAT the user wants done with a captured piece of language.
 *
 * Split from capture on purpose: this module never learns how the text was
 * obtained (DOM selection, UI Automation, clipboard fallback, OCR), and the
 * capture module never builds a prompt. Any adapter can drive any action.
 *
 * The old core conflated two intents in one "이해하기" prompt, branching on
 * `sourceLang === "ko"` to silently switch between explaining and translating.
 * That made the user's intent unstateable: someone reading a hard English
 * sentence and someone drafting an English request want different things, and a
 * Korean sentence the user wants EXPLAINED was unreachable. They are now two
 * actions the caller names.
 *
 * The language pair is a runtime profile, not a domain fact. `ko`→`en` is the
 * first default, never an enum: `LanguageCode` is a string so adding a language
 * adds a profile, not a branch.
 */
import {
  captureText,
  describeCaptureSource,
  type LanguageCaptureRequest,
} from "./languageCapture";

/** A language tag. Coarse today ("ko" · "en" · "unknown"), open by design. */
export type LanguageCode = string;

/**
 * Which language Mori explains IN, and which language the user is producing.
 * Defaults describe the first user, not the domain.
 */
export type LanguageProfile = {
  /** The language explanations are written in. */
  explanationLanguage: LanguageCode;
  /** The language the user is learning / producing. */
  targetLanguage: LanguageCode;
};

export const DEFAULT_LANGUAGE_PROFILE: LanguageProfile = {
  explanationLanguage: "ko",
  targetLanguage: "en",
};

export type LanguageSectionKey =
  | "translation"
  | "meaning"
  | "expressions"
  | "alternatives"
  | "difference"
  | "nuance"
  | "raw";

export type LanguageSection = {
  key: LanguageSectionKey;
  /** Display label as the engine emitted it, e.g. "번역". */
  label: string;
  body: string;
};

export type LanguageActionResult = {
  action: "understand" | "express";
  sections: LanguageSection[];
  /** Dominant language detected in the captured text. */
  detectedLanguage: LanguageCode;
};

export type LanguagePrompt = {
  systemPrompt: string;
  userPrompt: string;
  action: "understand" | "express";
  detectedLanguage: LanguageCode;
};

/** Labels each action asks the engine to emit, in display order. */
const UNDERSTAND_LABELS: ReadonlyArray<{ key: LanguageSectionKey; label: string }> = [
  { key: "translation", label: "번역" },
  { key: "meaning", label: "의미" },
  { key: "expressions", label: "표현" },
  { key: "nuance", label: "뉘앙스" },
];

const EXPRESS_LABELS: ReadonlyArray<{ key: LanguageSectionKey; label: string }> = [
  { key: "expressions", label: "표현" },
  { key: "alternatives", label: "대안" },
  { key: "difference", label: "차이" },
  { key: "nuance", label: "뉘앙스" },
];

function labelsFor(action: "understand" | "express") {
  return action === "express" ? EXPRESS_LABELS : UNDERSTAND_LABELS;
}

/**
 * Dominant language of a text, by script ratio. Coarse on purpose: it only
 * informs the prompt, and an ambiguous text is safest treated as unknown so the
 * action (not the guess) decides the direction.
 */
export function detectDominantLanguage(text: string): LanguageCode {
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
  if (letters === 0) return "unknown";
  if (hangul / letters >= 0.3) return "ko";
  if (latin / letters >= 0.5) return "en";
  return "unknown";
}

/**
 * Build the prompt pair for the prose LLM port. The reply contract is a small
 * fixed set of labels so parsing stays a tolerant line scan rather than fragile
 * JSON, and a reply that ignores the contract still renders as one raw section.
 */
export function buildLanguagePrompt(
  request: LanguageCaptureRequest,
  profile: LanguageProfile = DEFAULT_LANGUAGE_PROFILE,
): LanguagePrompt {
  const text = captureText(request);
  const detectedLanguage = detectDominantLanguage(text);
  const action = request.action === "express" ? "express" : "understand";

  const rules =
    action === "express"
      ? [
          `사용자의 생각을 ${profile.targetLanguage} 표현으로 바꾸는 것이 목표입니다.`,
          `표현: 원어민이 실제로 쓸 법한 가장 자연스러운 ${profile.targetLanguage} 문장 하나.`,
          "대안: 상황이 달라질 때 쓸 표현을 `- 표현: 어떤 상황에 맞는지` 형식으로 2~3개. 부드러운 요청, 명확한 업무 지시, 강한 제약처럼 서로 다른 강도를 담습니다.",
          `차이: 각 표현이 어떻게 다르게 읽히는지 ${profile.explanationLanguage}로 짧게.`,
        ]
      : [
          `선택된 텍스트를 ${profile.explanationLanguage}로 이해시키는 것이 목표입니다.`,
          `번역: 자연스러운 ${profile.explanationLanguage} 번역.`,
          "의미: 이 맥락에서 실제로 뜻하는 바. 기술 용어라면 이 분야에서의 의미를 짧게.",
          "표현: 재사용할 가치가 있는 핵심 표현을 `- 표현: 설명` 형식으로 2~4개.",
        ];

  const labels = labelsFor(action)
    .map((entry) => `\`${entry.label}:\``)
    .join(" ");

  const systemPrompt = [
    action === "express"
      ? "당신은 Mori의 표현하기 도우미입니다. 사용자가 하려는 말을 상황에 맞는 표현으로 바꿔 줍니다."
      : "당신은 Mori의 이해하기 도우미입니다. 사용자가 만난 텍스트를 문맥에 맞게 이해하도록 돕습니다.",
    "규칙:",
    ...rules.map((rule) => `- ${rule}`),
    "- 뉘앙스: 어조가 실제로 중요할 때만 추가하고, 아니면 생략합니다.",
    `- 답변은 반드시 ${labels} 라벨로 시작하는 섹션들로만 구성합니다.`,
    "- 간결하게 씁니다. 인사말, 서론, 마무리 문장을 쓰지 않습니다.",
    "- 모르는 것을 지어내지 않습니다. 문맥이 부족하면 그렇게 말합니다.",
  ].join("\n");

  // Only context that was actually acquired reaches the prompt, so the engine is
  // never handed invented provenance.
  const source = describeCaptureSource(request.context);
  const contextLine = source ? `출처: ${source}\n\n` : "";
  const bodyLabel = action === "express" ? "사용자가 하려는 말" : "선택된 텍스트";
  const userPrompt = `${contextLine}${bodyLabel}:\n"""\n${text}\n"""`;

  return { systemPrompt, userPrompt, action, detectedLanguage };
}

const SECTION_LINE =
  /^\s*(?:#{1,4}\s*)?(?:\*\*)?(번역|의미|표현|대안|차이|뉘앙스)(?:\*\*)?\s*[:：]\s*(.*)$/;

const KEY_BY_LABEL: ReadonlyMap<string, LanguageSectionKey> = new Map([
  ["번역", "translation"],
  ["의미", "meaning"],
  ["표현", "expressions"],
  ["대안", "alternatives"],
  ["차이", "difference"],
  ["뉘앙스", "nuance"],
]);

/**
 * Parse a prose reply into labeled sections. Tolerant by design: labels may use
 * markdown headings or bold, and a reply that ignores the contract entirely
 * still renders as one raw section rather than disappearing.
 */
export function parseLanguageResponse(
  text: string,
  action: "understand" | "express",
  detectedLanguage: LanguageCode = "unknown",
): LanguageActionResult {
  const sections: LanguageSection[] = [];
  let current: LanguageSection | null = null;

  for (const line of text.split(/\r?\n/)) {
    const match = SECTION_LINE.exec(line);
    if (match) {
      const label = match[1];
      current = { key: KEY_BY_LABEL.get(label) ?? "raw", label, body: match[2].trim() };
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
      action,
      sections: fallback ? [{ key: "raw", label: "설명", body: fallback }] : [],
      detectedLanguage,
    };
  }
  return { action, sections: cleaned, detectedLanguage };
}
