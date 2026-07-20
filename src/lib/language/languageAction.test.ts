import { describe, expect, it } from "vitest";
import {
  captureText,
  describeCaptureSource,
  directInputCapture,
  hasActionableText,
  MAX_CAPTURE_LENGTH,
  type LanguageCaptureRequest,
} from "./languageCapture";
import {
  buildLanguagePrompt,
  detectDominantLanguage,
  parseLanguageResponse,
  type LanguageProfile,
} from "./languageAction";

function capture(
  text: string,
  action: LanguageCaptureRequest["action"] = "understand",
  context: Partial<LanguageCaptureRequest["context"]> = {},
): LanguageCaptureRequest {
  return {
    origin: "os-selection",
    content: { contentType: "text", text },
    context: { acquiredBy: "ui-automation", ...context },
    action,
    retentionIntent: "ephemeral",
  };
}

describe("language capture contract", () => {
  it("treats a capture with no text as not actionable", () => {
    const imageOnly: LanguageCaptureRequest = {
      origin: "screen-region",
      content: { contentType: "image", imageRef: "region-1" },
      context: { acquiredBy: "screen-capture" },
      action: "understand",
      retentionIntent: "ephemeral",
    };
    expect(hasActionableText(imageOnly)).toBe(false);
    expect(hasActionableText(capture("hi"))).toBe(true);
    expect(hasActionableText(capture(" "))).toBe(false);
  });

  it("clamps captured text to the engine limit", () => {
    const long = "a".repeat(MAX_CAPTURE_LENGTH + 500);
    expect(captureText(capture(long))).toHaveLength(MAX_CAPTURE_LENGTH);
  });

  it("never invents provenance · returns undefined when nothing was acquired", () => {
    expect(describeCaptureSource({ acquiredBy: "manual-input" })).toBeUndefined();
    expect(
      describeCaptureSource({ acquiredBy: "ui-automation", appName: "Code", windowTitle: "app.ts" }),
    ).toBe("Code · app.ts");
  });

  it("marks direct input as ephemeral and manually acquired", () => {
    const request = directInputCapture("기존 구조를 먼저 확인해줘", "express");
    expect(request.origin).toBe("direct-input");
    expect(request.retentionIntent).toBe("ephemeral");
    expect(request.context.acquiredBy).toBe("manual-input");
  });
});

describe("understand / express are distinct intents", () => {
  it("explains Korean text when the action is understand, instead of translating it", () => {
    // The old core branched on `sourceLang === "ko"` and forced an English
    // rendering, so Korean the user wanted EXPLAINED was unreachable.
    const prompt = buildLanguagePrompt(capture("기존 구조를 먼저 확인하고 수정해줘", "understand"));
    expect(prompt.action).toBe("understand");
    expect(prompt.systemPrompt).toContain("이해하기");
    expect(prompt.systemPrompt).not.toContain("표현하기");
    expect(prompt.userPrompt).toContain("선택된 텍스트");
  });

  it("produces target-language expressions when the action is express", () => {
    const prompt = buildLanguagePrompt(capture("기존 구조를 먼저 확인하고 수정해줘", "express"));
    expect(prompt.action).toBe("express");
    expect(prompt.systemPrompt).toContain("표현하기");
    expect(prompt.systemPrompt).toContain("대안");
    expect(prompt.userPrompt).toContain("사용자가 하려는 말");
  });

  it("runs understand on English without switching direction", () => {
    const prompt = buildLanguagePrompt(
      capture("I'll trace the request flow before modifying the handler.", "understand"),
    );
    expect(prompt.detectedLanguage).toBe("en");
    expect(prompt.action).toBe("understand");
  });
});

describe("the language pair is a profile, not a domain fact", () => {
  it("uses the configured explanation and target languages", () => {
    const profile: LanguageProfile = { explanationLanguage: "ja", targetLanguage: "fr" };
    const prompt = buildLanguagePrompt(capture("고맙습니다", "express"), profile);
    expect(prompt.systemPrompt).toContain("fr");
    expect(prompt.systemPrompt).toContain("ja");
  });
});

describe("detectDominantLanguage", () => {
  it("reads script ratio and admits when it does not know", () => {
    expect(detectDominantLanguage("오늘 회의")).toBe("ko");
    expect(detectDominantLanguage("trace the request flow")).toBe("en");
    expect(detectDominantLanguage("12345 !!!")).toBe("unknown");
  });
});

describe("parseLanguageResponse", () => {
  it("parses express sections including 대안 and 차이", () => {
    const result = parseLanguageResponse(
      ["표현: Please check the existing structure first.", "대안:", "- Could you…: 부드러운 요청", "차이: 두 번째가 더 정중합니다."].join("\n"),
      "express",
    );
    expect(result.action).toBe("express");
    expect(result.sections.map((s) => s.key)).toEqual(["expressions", "alternatives", "difference"]);
  });

  it("tolerates markdown labels", () => {
    const result = parseLanguageResponse("**번역:** 요청 흐름을 추적하겠습니다.", "understand");
    expect(result.sections[0].key).toBe("translation");
  });

  it("falls back to one raw section when the reply ignores the contract", () => {
    const result = parseLanguageResponse("그냥 자유롭게 쓴 답변", "understand");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].key).toBe("raw");
  });

  it("returns no sections for an empty reply rather than inventing one", () => {
    expect(parseLanguageResponse("   ", "understand").sections).toEqual([]);
  });
});
