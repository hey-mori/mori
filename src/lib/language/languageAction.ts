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
 * The answer SHAPE is adaptive, the user's ACTION is not. A word gets a part of
 * speech, a pronunciation and collocations; a paragraph gets its argument and
 * the few expressions worth keeping. Both are still `understand`, and nothing
 * here can promote a selection into `express` on the engine's behalf: only the
 * caller names the action, and `classifySelection` only picks which sections are
 * requested.
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
import {
  allSectionLabels,
  isSyntheticSection,
  specForKey,
  specForLabel,
  type LanguageSectionKey,
  type LanguageSectionSpec,
} from "./languageSections";
import { classifySelection, selectionKindLabel, type SelectionKind } from "./selectionKind";

export type { LanguageSectionKey } from "./languageSections";
export type { SelectionKind } from "./selectionKind";

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

export type LanguageSection = {
  key: LanguageSectionKey;
  /** Display label as the engine emitted it, e.g. "번역". */
  label: string;
  body: string;
  /** True when the engine invented this content (an example, a suggested
   *  alternative) rather than describing the captured text. The panel marks
   *  these so a made-up example is never read as something from the source. */
  synthetic: boolean;
};

export type LanguageActionResult = {
  action: "understand" | "express";
  sections: LanguageSection[];
  /** Dominant language detected in the captured text. */
  detectedLanguage: LanguageCode;
  /** Shape the answer was requested for. */
  selectionKind: SelectionKind;
};

export type LanguagePrompt = {
  systemPrompt: string;
  userPrompt: string;
  action: "understand" | "express";
  detectedLanguage: LanguageCode;
  selectionKind: SelectionKind;
};

/**
 * A follow-up request for one detail the user pressed a button for.
 *
 * `knownTranslation` is what makes this cheap: the answer already on screen is
 * given to the engine as ground rather than re-derived, so pressing 구조 costs
 * one focused generation instead of a second full analysis.
 */
export type LanguageFollowUp = {
  detail: LanguageDetail;
  knownTranslation?: string;
};

/**
 * What the FIRST answer contains, per selection shape.
 *
 * Two sections, deliberately. The previous plan asked for up to eight at once
 * and measured 13.4s to generate for one sentence, while the translation inside
 * it needed about 400ms. Output length is the dominant cost once a model is
 * warm, and nobody reads eight sections for every word they look up.
 *
 * Everything else moved to {@link DETAIL_PLANS}, requested by a button. This is
 * the difference between a tool that answers and a tool that lectures.
 */
const DEFAULT_PLAN: Readonly<Record<SelectionKind, readonly LanguageSectionKey[]>> = {
  // A word has no translation worth separating from its meaning.
  word: ["meaning", "partOfSpeech"],
  phrase: ["translation", "meaning"],
  sentence: ["translation", "intent"],
  paragraph: ["translation", "meaning"],
};

/** A follow-up the user asked for explicitly. */
export type LanguageDetail = "structure" | "grammar" | "expressions" | "pronunciation";

/**
 * Sections each follow-up asks for.
 *
 * Richer than the old inline versions precisely because they are now opt-in: a
 * user who pressed 구조 wants the clause breakdown, and paying for it is the
 * point of having pressed the button.
 */
const DETAIL_PLANS: Readonly<Record<LanguageDetail, readonly LanguageSectionKey[]>> = {
  structure: ["structure"],
  grammar: ["grammar", "pattern"],
  expressions: ["expressions", "alternatives"],
  pronunciation: ["pronunciation"],
};

/** Korean label for a follow-up button. */
export function languageDetailLabel(detail: LanguageDetail): string {
  switch (detail) {
    case "structure":
      return "구조";
    case "grammar":
      return "문법";
    case "expressions":
      return "표현";
    default:
      return "발음";
  }
}

/**
 * Which follow-ups are worth offering for a shape.
 *
 * Pronunciation is meaningless for a paragraph, and a single word has no clause
 * structure. Offering a button that can only answer "해당 없음" wastes a call
 * and teaches the user to distrust the buttons.
 */
export function availableDetails(kind: SelectionKind): LanguageDetail[] {
  switch (kind) {
    case "word":
      return ["pronunciation", "expressions", "grammar"];
    case "phrase":
      return ["expressions", "grammar", "pronunciation"];
    case "sentence":
      return ["structure", "grammar", "expressions"];
    default:
      return ["structure", "grammar", "expressions"];
  }
}

/** Expressing is producing, so the plan does not vary with what was selected:
 *  the user's input is an intent, not a text to be dissected. */
const EXPRESS_PLAN: readonly LanguageSectionKey[] = [
  "expressions",
  "alternatives",
  "difference",
  "nuance",
];

/** The ordered specs for one action and shape, or for one follow-up. */
export function sectionPlan(
  action: "understand" | "express",
  kind: SelectionKind,
  detail?: LanguageDetail,
): LanguageSectionSpec[] {
  const keys = detail
    ? DETAIL_PLANS[detail]
    : action === "express"
      ? EXPRESS_PLAN
      : DEFAULT_PLAN[kind];
  return keys
    .map((key) => specForKey(key))
    .filter((spec): spec is LanguageSectionSpec => spec !== undefined);
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
 * set of labels so parsing stays a tolerant line scan rather than fragile JSON,
 * and a reply that ignores the contract still renders as one raw section.
 */
export function buildLanguagePrompt(
  request: LanguageCaptureRequest,
  profile: LanguageProfile = DEFAULT_LANGUAGE_PROFILE,
  followUp?: LanguageFollowUp,
): LanguagePrompt {
  const text = captureText(request);
  const detectedLanguage = detectDominantLanguage(text);
  const action = request.action === "express" ? "express" : "understand";
  // Express is always about producing one utterance, so its plan does not vary;
  // classification still runs so the metadata reports what was actually read.
  const selectionKind = classifySelection(text);

  const plan = sectionPlan(action, selectionKind, followUp?.detail);
  const sectionRules = plan.map(
    (spec) =>
      `- ${spec.label}: ${spec.guidance}${spec.optional ? " (없으면 이 섹션 자체를 생략)" : ""}`,
  );

  const intro = followUp
    ? [
        `당신은 Mori의 이해하기 도우미입니다. 사용자가 "${languageDetailLabel(followUp.detail)}"만 따로 요청했습니다.`,
        `${profile.explanationLanguage}로 설명합니다.`,
        "요청한 항목만 답합니다. 번역이나 이미 아는 내용을 다시 쓰지 않습니다.",
      ]
    : action === "express"
      ? [
          "당신은 Mori의 표현하기 도우미입니다. 사용자가 하려는 말을 상황에 맞는 표현으로 바꿔 줍니다.",
          `사용자의 생각을 ${profile.targetLanguage} 표현으로 바꾸는 것이 목표입니다.`,
          `설명은 ${profile.explanationLanguage}로 씁니다.`,
        ]
      : [
          "당신은 Mori의 이해하기 도우미입니다. 사용자가 만난 텍스트를 문맥에 맞게 이해하도록 돕습니다.",
          `선택된 텍스트를 ${profile.explanationLanguage}로 이해시키는 것이 목표입니다.`,
          `사용자가 선택한 것은 ${selectionKindLabel(selectionKind)} 단위입니다. 그에 맞는 깊이로만 설명합니다.`,
        ];

  const labels = plan.map((spec) => `\`${spec.label}:\``).join(" ");

  const systemPrompt = [
    ...intro,
    "",
    "다음 섹션만, 이 순서로 씁니다:",
    ...sectionRules,
    "",
    "규칙:",
    `- 답변은 ${labels} 라벨로 시작하는 섹션들로만 구성합니다.`,
    "- 해당 없는 섹션은 억지로 채우지 말고 통째로 생략합니다. 빈 섹션이나 '없음'이라고 쓰지 않습니다.",
    "- 간결하게 씁니다. 인사말, 서론, 마무리 문장을 쓰지 않습니다.",
    "- 모르는 것을 지어내지 않습니다. 문맥이 부족하면 그렇게 말합니다.",
    // The engine is told the provenance rule too, not just the UI: an example
    // presented as a quotation from the source is the failure mode that matters.
    "- 예문과 대안은 새로 만든 예시입니다. 원문에 있던 문장인 것처럼 쓰지 않습니다.",
  ].join("\n");

  // Only context that was actually acquired reaches the prompt, so the engine is
  // never handed invented provenance.
  const source = describeCaptureSource(request.context);
  const contextLine = source ? `출처: ${source}\n\n` : "";
  const bodyLabel = action === "express" ? "사용자가 하려는 말" : "선택된 텍스트";
  // A follow-up carries the translation the user is already looking at, so the
  // engine grounds on it instead of re-deriving it. Re-sending the whole
  // analysis prompt would pay for the first answer twice.
  const knownLine = followUp?.knownTranslation?.trim()
    ? `\n\n이미 사용자에게 보여준 번역:\n"""\n${followUp.knownTranslation.trim()}\n"""`
    : "";
  const userPrompt = `${contextLine}${bodyLabel}:\n"""\n${text}\n"""${knownLine}`;

  return { systemPrompt, userPrompt, action, detectedLanguage, selectionKind };
}

/** Escape a label for use inside the section-line pattern. */
function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A line that opens a section. Built from the catalogue rather than hardcoded so
 * a section added to the table is parseable without touching this file, which is
 * how the fixed four-label version used to lose new sections silently.
 */
function sectionLinePattern(): RegExp {
  const labels = allSectionLabels().map(escapeForRegex).join("|");
  return new RegExp(`^\\s*(?:#{1,4}\\s*)?(?:\\*\\*)?(${labels})(?:\\*\\*)?\\s*[:：]\\s*(.*)$`);
}

const SECTION_LINE = sectionLinePattern();

/**
 * Parse a prose reply into labeled sections. Tolerant by design: labels may use
 * markdown headings or bold, an aliased label still resolves, and a reply that
 * ignores the contract entirely still renders as one raw section rather than
 * disappearing.
 */
export function parseLanguageResponse(
  text: string,
  action: "understand" | "express",
  detectedLanguage: LanguageCode = "unknown",
  selectionKind: SelectionKind = "sentence",
): LanguageActionResult {
  const sections: LanguageSection[] = [];
  let current: LanguageSection | null = null;

  for (const line of text.split(/\r?\n/)) {
    const match = SECTION_LINE.exec(line);
    if (match) {
      const label = match[1];
      const spec = specForLabel(label);
      current = {
        key: spec?.key ?? "raw",
        // The canonical label wins when the engine used an alias, so the panel
        // is consistent no matter which wording came back.
        label: spec?.label ?? label,
        body: match[2].trim(),
        synthetic: spec ? isSyntheticSection(spec.key) : false,
      };
      sections.push(current);
      continue;
    }
    if (current) {
      current.body = current.body ? `${current.body}\n${line.trimEnd()}` : line.trim();
    } else if (line.trim()) {
      current = { key: "raw", label: "설명", body: line.trim(), synthetic: false };
      sections.push(current);
    }
  }

  const cleaned = sections
    .map((section) => ({ ...section, body: section.body.trim() }))
    // An engine that emitted a heading with nothing under it said nothing, and
    // an empty section reads as a missing answer rather than an omitted one.
    .filter((section) => section.body.length > 0);

  if (cleaned.length === 0) {
    const fallback = text.trim();
    return {
      action,
      sections: fallback
        ? [{ key: "raw", label: "설명", body: fallback, synthetic: false }]
        : [],
      detectedLanguage,
      selectionKind,
    };
  }
  return { action, sections: cleaned, detectedLanguage, selectionKind };
}
