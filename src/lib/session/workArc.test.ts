import { describe, expect, it } from "vitest";
import { buildWorkArc } from "./workArc";

describe("buildWorkArc", () => {
  it("splits a multi-chunk summary on its ' / ' separators", () => {
    const summary =
      "RAG와 LLM Wiki 구조를 이해함 / 환경변수 설정을 간소화함 / 관리 페이지를 구축함 / 중복 작업을 폐기하기로 결정함";
    expect(buildWorkArc(summary)).toEqual([
      "RAG와 LLM Wiki 구조를 이해함",
      "환경변수 설정을 간소화함",
      "관리 페이지를 구축함",
      "중복 작업을 폐기하기로 결정함",
    ]);
  });

  it("falls back to sentence boundaries when there is no separator", () => {
    const summary = "스키마를 먼저 확정했다. 그다음 임베딩 provider를 구현했다. 마지막으로 검증을 돌렸다.";
    expect(buildWorkArc(summary)).toEqual([
      "스키마를 먼저 확정했다",
      "그다음 임베딩 provider를 구현했다",
      "마지막으로 검증을 돌렸다",
    ]);
  });

  it("returns [] for a single-step summary so the caller shows the paragraph", () => {
    expect(buildWorkArc("간단한 한 문장 요약입니다")).toEqual([]);
    expect(buildWorkArc("")).toEqual([]);
    expect(buildWorkArc(null)).toEqual([]);
  });

  it("caps the number of steps", () => {
    const summary = Array.from({ length: 10 }, (_, i) => `단계 ${i}`).join(" / ");
    expect(buildWorkArc(summary, 4)).toHaveLength(4);
  });

  it("strips leading separators / bullets from each step", () => {
    expect(buildWorkArc("· 첫 단계 / - 둘째 단계")).toEqual(["첫 단계", "둘째 단계"]);
  });
});
