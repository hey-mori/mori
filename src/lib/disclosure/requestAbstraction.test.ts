import { describe, expect, it } from "vitest";
import {
  buildRequestAbstraction,
  classifyRequestIntent,
} from "./requestAbstraction";

describe("classifyRequestIntent", () => {
  it("prefers the most actionable category over a question", () => {
    // Mixes a question and a fix request; fix wins.
    expect(classifyRequestIntent("왜 안 되지? 이거 고쳐줘")).toBe("fix");
  });

  it("classifies implementation, review, refactor, explain, question, and default", () => {
    expect(classifyRequestIntent("로그인 화면 만들어줘")).toBe("implement");
    expect(classifyRequestIntent("이 PR 좀 검토해줘")).toBe("review");
    expect(classifyRequestIntent("이 코드 좀 리팩터링 하자")).toBe("refactor");
    expect(classifyRequestIntent("이 함수가 뭐하는지 설명해줘")).toBe("explain");
    expect(classifyRequestIntent("어떻게 동작하나요")).toBe("question");
    expect(classifyRequestIntent("토큰 회전")).toBe("task");
  });

  it("treats blank input as a generic task", () => {
    expect(classifyRequestIntent("   ")).toBe("task");
  });
});

describe("buildRequestAbstraction", () => {
  it("produces a content-free abstract and a condensed summary", () => {
    const result = buildRequestAbstraction("인증 토큰 회전 로직을 새로 구현해줘. 만료 시간도 설정하고.");
    expect(result.abstract).toBe("사용자가 구현 작업을 요청함");
    expect(result.summary).toBe("인증 토큰 회전 로직을 새로 구현해줘.");
    // The abstract must not leak the specifics of the request.
    expect(result.abstract).not.toContain("토큰");
  });

  it("returns empty strings for blank input", () => {
    expect(buildRequestAbstraction("   ")).toEqual({ summary: "", abstract: "" });
  });

  it("truncates a long single sentence to the max with an ellipsis", () => {
    const long = `${"가".repeat(200)} 고쳐줘`;
    const result = buildRequestAbstraction(long, { maxSummaryChars: 50 });
    expect(result.summary.endsWith("…")).toBe(true);
    expect(result.summary.length).toBeLessThanOrEqual(51);
    expect(result.abstract).toBe("사용자가 수정·디버깅을 요청함");
  });

  it("collapses whitespace before summarizing", () => {
    const result = buildRequestAbstraction("이\n\n  코드   리뷰  해줘");
    expect(result.summary).toBe("이 코드 리뷰 해줘");
    expect(result.abstract).toBe("사용자가 검토를 요청함");
  });
});
