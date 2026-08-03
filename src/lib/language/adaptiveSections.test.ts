import { describe, expect, it } from "vitest";
import {
  availableDetails,
  buildLanguagePrompt,
  languageDetailLabel,
  parseLanguageResponse,
  sectionPlan,
} from "./languageAction";
import { isSyntheticSection, SECTION_SPECS, specForLabel } from "./languageSections";
import type { LanguageCaptureRequest } from "./languageCapture";

function capture(
  text: string,
  action: LanguageCaptureRequest["action"] = "understand",
): LanguageCaptureRequest {
  return {
    origin: "os-selection",
    content: { contentType: "text", text },
    context: { acquiredBy: "ui-automation" },
    action,
    retentionIntent: "ephemeral",
  };
}

describe("the first answer is short, whatever was selected", () => {
  // The plan used to request up to eight sections at once, which measured 13.4s
  // for one sentence while the translation inside it took ~400ms to generate.
  it("asks for exactly two sections by default", () => {
    for (const text of [
      "throttle",
      "work your way through",
      "Could you check the existing structure before changing it?",
      "First this. Then that. And then the other thing.",
    ]) {
      const prompt = buildLanguagePrompt(capture(text));
      expect(sectionPlan("understand", prompt.selectionKind), text).toHaveLength(2);
    }
  });

  it("leads a word with its meaning and form", () => {
    const prompt = buildLanguagePrompt(capture("throttle"));
    expect(prompt.selectionKind).toBe("word");
    expect(prompt.systemPrompt).toContain("뜻");
    expect(prompt.systemPrompt).toContain("품사");
    // The expensive extras are now behind buttons.
    expect(prompt.systemPrompt).not.toContain("연어:");
    expect(prompt.systemPrompt).not.toContain("예문:");
  });

  it("leads a sentence with its translation and intent", () => {
    const prompt = buildLanguagePrompt(
      capture("Could you check the existing structure before changing it?"),
    );
    expect(prompt.selectionKind).toBe("sentence");
    expect(prompt.systemPrompt).toContain("번역");
    expect(prompt.systemPrompt).toContain("의도");
    // Structure and grammar are opt-in, not paid for on every lookup.
    expect(prompt.systemPrompt).not.toContain("구조:");
    expect(prompt.systemPrompt).not.toContain("문법:");
  });

  it("never asks for pronunciation up front", () => {
    // It is only useful for a word, and only when the user asks.
    const prompt = buildLanguagePrompt(capture("throttle"));
    expect(prompt.systemPrompt).not.toContain("발음");
  });

  it("does not let the shape change the user's action", () => {
    // A single Korean word the user asked to EXPRESS stays express, and gets the
    // express plan rather than a word-lookup plan.
    const prompt = buildLanguagePrompt(capture("고맙습니다", "express"));
    expect(prompt.action).toBe("express");
    expect(prompt.systemPrompt).toContain("대안");
    expect(prompt.systemPrompt).not.toContain("품사");
  });

  it("uses one express plan regardless of how much was typed", () => {
    const short = buildLanguagePrompt(capture("고마워", "express"));
    const long = buildLanguagePrompt(
      capture("이번 주까지는 어렵고 다음 주 화요일에 다시 얘기하면 좋겠다고 정중히 전하고 싶어.", "express"),
    );
    expect(sectionPlan("express", short.selectionKind)).toEqual(
      sectionPlan("express", long.selectionKind),
    );
  });

  it("tells the engine to omit a section instead of padding it", () => {
    const prompt = buildLanguagePrompt(capture("throttle"));
    expect(prompt.systemPrompt).toContain("생략");
    expect(prompt.systemPrompt).toContain("억지로 채우지");
  });
});

describe("follow-ups are focused and reuse what is already known", () => {
  const sentence = capture("Could you check the existing structure before changing it?");

  it("asks only for the detail that was pressed", () => {
    const prompt = buildLanguagePrompt(sentence, undefined, { detail: "structure" });
    expect(prompt.systemPrompt).toContain("구조");
    expect(prompt.systemPrompt).not.toContain("번역:");
    expect(prompt.systemPrompt).not.toContain("의도:");
  });

  it("tells the engine not to repeat what the user can already see", () => {
    const prompt = buildLanguagePrompt(sentence, undefined, { detail: "grammar" });
    expect(prompt.systemPrompt).toContain("다시 쓰지 않습니다");
  });

  it("grounds on the translation already on screen instead of re-deriving it", () => {
    // Re-sending the whole analysis prompt would pay for the first answer twice.
    const prompt = buildLanguagePrompt(sentence, undefined, {
      detail: "structure",
      knownTranslation: "기존 구조를 먼저 확인해 주시겠어요?",
    });
    expect(prompt.userPrompt).toContain("이미 사용자에게 보여준 번역");
    expect(prompt.userPrompt).toContain("기존 구조를 먼저 확인해 주시겠어요?");
  });

  it("omits the known-translation block when there is none", () => {
    const prompt = buildLanguagePrompt(sentence, undefined, { detail: "structure" });
    expect(prompt.userPrompt).not.toContain("이미 사용자에게 보여준 번역");
  });

  it("pairs grammar with the reusable pattern, and expressions with alternatives", () => {
    expect(sectionPlan("understand", "sentence", "grammar").map((s) => s.key)).toEqual([
      "grammar",
      "pattern",
    ]);
    expect(sectionPlan("understand", "sentence", "expressions").map((s) => s.key)).toEqual([
      "expressions",
      "alternatives",
    ]);
  });

  it("offers no clause structure for a single word", () => {
    // A button that can only answer "해당 없음" wastes a call and teaches the
    // user to distrust the buttons.
    expect(availableDetails("word")).not.toContain("structure");
    expect(availableDetails("sentence")).toContain("structure");
  });

  it("offers no pronunciation for a paragraph", () => {
    expect(availableDetails("paragraph")).not.toContain("pronunciation");
    expect(availableDetails("word")).toContain("pronunciation");
  });

  it("labels every offered detail in Korean", () => {
    for (const kind of ["word", "phrase", "sentence", "paragraph"] as const) {
      for (const detail of availableDetails(kind)) {
        expect(languageDetailLabel(detail)).toMatch(/^[가-힣]+$/);
      }
    }
  });

  it("keeps a follow-up smaller than the old all-at-once plan", () => {
    const followUp = sectionPlan("understand", "sentence", "grammar").length;
    const base = sectionPlan("understand", "sentence").length;
    // Two calls of two sections still beat one call of eight, and only when the
    // user asked for the second.
    expect(base + followUp).toBeLessThan(8);
  });
});

describe("invented content is separated from the captured text", () => {
  it("marks example and alternative sections as engine-authored", () => {
    expect(isSyntheticSection("examples")).toBe(true);
    expect(isSyntheticSection("alternatives")).toBe(true);
    expect(isSyntheticSection("collocations")).toBe(true);
    // These describe the capture rather than inventing beside it.
    expect(isSyntheticSection("translation")).toBe(false);
    expect(isSyntheticSection("meaning")).toBe(false);
    expect(isSyntheticSection("intent")).toBe(false);
  });

  it("never marks an unrecognised section as an invented example", () => {
    expect(isSyntheticSection("raw")).toBe(false);
  });

  it("tells the engine the same rule the UI enforces", () => {
    const prompt = buildLanguagePrompt(capture("throttle"));
    expect(prompt.systemPrompt).toContain("원문에 있던 문장인 것처럼 쓰지 않습니다");
  });

  it("carries the flag through parsing onto the section", () => {
    const parsed = parseLanguageResponse(
      ["뜻: 흐름을 제한하다", "예문: We throttle requests. (요청을 제한합니다.)"].join("\n"),
      "understand",
      "en",
      "word",
    );
    expect(parsed.sections.find((s) => s.key === "meaning")?.synthetic).toBe(false);
    expect(parsed.sections.find((s) => s.key === "examples")?.synthetic).toBe(true);
  });
});

describe("the parser stays tolerant as the catalogue grows", () => {
  it("recognises every label the catalogue defines", () => {
    for (const spec of SECTION_SPECS) {
      const parsed = parseLanguageResponse(`${spec.label}: 내용`, "understand");
      expect(parsed.sections[0]?.key, `${spec.label} did not parse`).toBe(spec.key);
    }
  });

  it("accepts an alias and reports the canonical label", () => {
    // A provider answering "의미:" where the contract asked for "뜻:" is being
    // helpful; dropping that into `raw` would lose a real answer.
    const parsed = parseLanguageResponse("의미: 흐름을 제한하다", "understand");
    expect(parsed.sections[0].key).toBe("meaning");
    expect(parsed.sections[0].label).toBe("뜻");
  });

  it("matches the longer label first when one prefixes another", () => {
    const parsed = parseLanguageResponse("직역과 차이: 직역하면 어색합니다.", "understand");
    expect(parsed.sections[0].key).toBe("literal");
    expect(specForLabel("직역과 차이")?.key).toBe("literal");
  });

  it("still tolerates markdown headings and bold labels", () => {
    expect(parseLanguageResponse("### 번역: 요청 흐름", "understand").sections[0].key).toBe(
      "translation",
    );
    expect(parseLanguageResponse("**의도:** 정중한 요청", "understand").sections[0].key).toBe(
      "intent",
    );
  });

  it("keeps a contract-ignoring reply visible as one raw section", () => {
    const parsed = parseLanguageResponse("그냥 자유롭게 쓴 답변", "understand");
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].key).toBe("raw");
    expect(parsed.sections[0].synthetic).toBe(false);
  });

  it("drops a heading the engine emitted with nothing under it", () => {
    const parsed = parseLanguageResponse(["뜻: 흐름을 제한하다", "발음:", ""].join("\n"), "understand");
    expect(parsed.sections.map((s) => s.key)).toEqual(["meaning"]);
  });

  it("reports the shape it was parsed for", () => {
    const parsed = parseLanguageResponse("뜻: x", "understand", "en", "word");
    expect(parsed.selectionKind).toBe("word");
  });
});
