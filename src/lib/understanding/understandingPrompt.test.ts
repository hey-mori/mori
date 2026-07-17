import { describe, expect, it } from "vitest";
import {
  buildUnderstandingPrompt,
  DEFAULT_MAX_BODY_CHARS,
  UNDERSTANDING_SYSTEM_PROMPT,
} from "./understandingPrompt";

const kinds = [
  { id: "workout", label: "운동" },
  { id: "task", label: "할 일" },
];

describe("UNDERSTANDING_SYSTEM_PROMPT", () => {
  it("makes the quote rule and the empty-is-fine rule explicit", () => {
    // The parser drops anything it cannot locate, so teaching the rule up front
    // is cheaper than discarding half the reply.
    expect(UNDERSTANDING_SYSTEM_PROMPT).toContain("quote");
    expect(UNDERSTANDING_SYSTEM_PROMPT).toContain("지어내지");
    expect(UNDERSTANDING_SYSTEM_PROMPT).toContain("빈 목록은 정답");
  });

  it("states the two rules the Kotlin failure was made of", () => {
    // A reading document has no log, and a term means what it means HERE.
    expect(UNDERSTANDING_SYSTEM_PROMPT).toContain("설명글");
    expect(UNDERSTANDING_SYSTEM_PROMPT).toContain("syntax");
    // Agency: the regex could never express this, which is why it invented
    // records for things a friend did.
    expect(UNDERSTANDING_SYSTEM_PROMPT).toContain("다른 사람이 한 일");
  });
});

describe("buildUnderstandingPrompt", () => {
  it("carries the title, the body and only the known schema ids", () => {
    const prompt = buildUnderstandingPrompt({ title: "제목", body: "본문입니다", itemKinds: kinds });
    expect(prompt).toContain("제목: 제목");
    expect(prompt).toContain("본문입니다");
    expect(prompt).toContain("workout(운동)");
    expect(prompt).toContain("task(할 일)");
  });

  it("truncates a long body and says so, rather than silently dropping it", () => {
    const body = "가".repeat(DEFAULT_MAX_BODY_CHARS + 500);
    const prompt = buildUnderstandingPrompt({ title: "긴 글", body, itemKinds: kinds });
    expect(prompt).toContain("앞부분만");
    expect(prompt.length).toBeLessThan(body.length);
  });

  it("passes a structural reading as a hint the body can overrule", () => {
    const prompt = buildUnderstandingPrompt({
      title: "링크",
      body: "https://example.com 참고",
      itemKinds: kinds,
      structuralHint: "clipping",
    });
    expect(prompt).toContain("clipping");
    expect(prompt).toContain("본문을 따르십시오");
  });

  it("says nothing about nature when there is no structural signal", () => {
    const prompt = buildUnderstandingPrompt({ title: "x", body: "y", itemKinds: kinds });
    expect(prompt).not.toContain("문서 구조상");
  });
});
