import { describe, expect, it } from "vitest";
import { buildLanguagePrompt, parseLanguageResponse, sectionPlan } from "./languageAction";
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

describe("the answer shape adapts to what was selected", () => {
  it("asks a word for its form, sound and company", () => {
    const prompt = buildLanguagePrompt(capture("throttle"));
    expect(prompt.selectionKind).toBe("word");
    expect(prompt.systemPrompt).toContain("품사");
    expect(prompt.systemPrompt).toContain("발음");
    expect(prompt.systemPrompt).toContain("연어");
    // A single word does not need a clause-by-clause breakdown.
    expect(prompt.systemPrompt).not.toContain("구조:");
  });

  it("asks a sentence for its intent and skeleton, not its pronunciation", () => {
    const prompt = buildLanguagePrompt(
      capture("Could you check the existing structure before changing it?"),
    );
    expect(prompt.selectionKind).toBe("sentence");
    expect(prompt.systemPrompt).toContain("의도");
    expect(prompt.systemPrompt).toContain("구조");
    expect(prompt.systemPrompt).not.toContain("발음");
  });

  it("asks a phrase for the reusable skeleton behind it", () => {
    const prompt = buildLanguagePrompt(capture("work your way through"));
    expect(prompt.selectionKind).toBe("phrase");
    expect(prompt.systemPrompt).toContain("문형");
    expect(prompt.systemPrompt).toContain("직역과 차이");
  });

  it("keeps a paragraph answer short rather than turning it into a textbook", () => {
    const paragraph =
      "The handler validates the token. Then it resolves the workspace. Only after that does it touch storage.";
    const prompt = buildLanguagePrompt(capture(paragraph));
    expect(prompt.selectionKind).toBe("paragraph");
    expect(sectionPlan("understand", "paragraph").length).toBeLessThan(
      sectionPlan("understand", "word").length,
    );
    expect(prompt.systemPrompt).not.toContain("구조:");
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
