import { describe, expect, it } from "vitest";

import {
  buildUnderstandPrompt,
  detectLanguage,
  isUnderstandableSelection,
  parseUnderstandResponse,
  MAX_SELECTION_LENGTH,
} from "./understandSelection";

describe("detectLanguage", () => {
  it("detects English, Korean, and mixed selections", () => {
    expect(detectLanguage("We should normalize the event schema")).toBe("en");
    expect(detectLanguage("이벤트 스키마를 먼저 정규화해야 한다")).toBe("ko");
    // Korean-dominant mixed text reads as Korean (safe expression direction).
    expect(detectLanguage("스키마를 normalize 하자")).toBe("ko");
    expect(detectLanguage("123 !!! ...")).toBe("other");
  });
});

describe("isUnderstandableSelection", () => {
  it("rejects empty or single-character noise", () => {
    expect(isUnderstandableSelection("  ")).toBe(false);
    expect(isUnderstandableSelection("a")).toBe(false);
    expect(isUnderstandableSelection("stop_reason")).toBe(true);
  });
});

describe("buildUnderstandPrompt", () => {
  it("asks for Korean comprehension of an English selection", () => {
    const prompt = buildUnderstandPrompt({
      selection: "We should normalize the event schema before adding another source.",
      contextLabel: "mori · 게이트웨이 세션",
    });
    expect(prompt.sourceLang).toBe("en");
    expect(prompt.systemPrompt).toContain("한국어로 이해");
    expect(prompt.systemPrompt).toContain("번역:");
    expect(prompt.userPrompt).toContain("출처: mori · 게이트웨이 세션");
    expect(prompt.userPrompt).toContain("normalize the event schema");
  });

  it("asks for natural English when the selection is Korean", () => {
    const prompt = buildUnderstandPrompt({
      selection: "이 작업은 다음 세션으로 이어가야 합니다.",
    });
    expect(prompt.sourceLang).toBe("ko");
    expect(prompt.systemPrompt).toContain("자연스러운 영어");
    expect(prompt.userPrompt).not.toContain("출처:");
  });

  it("caps oversized selections", () => {
    const prompt = buildUnderstandPrompt({ selection: "a".repeat(MAX_SELECTION_LENGTH + 500) });
    expect(prompt.userPrompt.length).toBeLessThan(MAX_SELECTION_LENGTH + 200);
  });
});

describe("parseUnderstandResponse", () => {
  it("splits a well-formed reply into labeled sections", () => {
    const result = parseUnderstandResponse(
      [
        "번역: 다른 소스를 추가하기 전에 이벤트 스키마부터 정규화해야 합니다.",
        "의미: 구조 정리가 선행 조건이라는 기술적 결정입니다.",
        "표현:",
        "- normalize: 형식을 일정하게 맞추다",
        "- ingestion source: 데이터 수집원",
      ].join("\n"),
      "en",
    );
    expect(result.sourceLang).toBe("en");
    expect(result.sections.map((section) => section.key)).toEqual([
      "translation",
      "meaning",
      "expressions",
    ]);
    expect(result.sections[2].body).toContain("normalize: 형식을");
  });

  it("tolerates markdown headings and bold labels", () => {
    const result = parseUnderstandResponse("## 번역: 안녕하세요\n**의미**: 인사말입니다");
    expect(result.sections.map((section) => section.key)).toEqual(["translation", "meaning"]);
  });

  it("falls back to one raw section when the contract is ignored", () => {
    const result = parseUnderstandResponse("This sentence just means hello in Korean.");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].key).toBe("raw");
    expect(result.sections[0].label).toBe("설명");
  });

  it("returns no sections for an empty reply", () => {
    expect(parseUnderstandResponse("   ").sections).toHaveLength(0);
  });
});
