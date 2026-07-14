import { describe, expect, it } from "vitest";
import { parseConversation } from "./conversationParser";

describe("parseConversation", () => {
  it("splits a 사용자/AI dialog into turns and pairs", () => {
    const parsed = parseConversation(
      [
        "사용자: MORI의 메모리는 어떻게 설계해야 할까?",
        "AI: 우선 Activity와 Memory를 분리해야 합니다.",
        "사용자: 그러면 Evidence는 필요한가?",
        "AI: Evidence는 출처 관계에 가깝습니다.",
      ].join("\n"),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.turns).toHaveLength(4);
    expect(parsed?.pairs).toEqual([
      { question: "MORI의 메모리는 어떻게 설계해야 할까?", answer: "우선 Activity와 Memory를 분리해야 합니다." },
      { question: "그러면 Evidence는 필요한가?", answer: "Evidence는 출처 관계에 가깝습니다." },
    ]);
  });

  it("captures the assistant name from a named marker", () => {
    const parsed = parseConversation("나: 안녕?\nChatGPT: 안녕하세요!");
    expect(parsed?.assistant).toBe("ChatGPT");
  });

  it("joins multi-line turn bodies until the next marker", () => {
    const parsed = parseConversation(
      ["User: 질문입니다", "Assistant: 첫 줄", "이어지는 답변 둘째 줄", "셋째 줄"].join("\n"),
    );
    expect(parsed?.turns[1].text).toBe("첫 줄\n이어지는 답변 둘째 줄\n셋째 줄");
  });

  it("supports English Q/A markers", () => {
    const parsed = parseConversation("Q: what is mori?\nA: a memory app");
    expect(parsed?.turns).toHaveLength(2);
    expect(parsed?.pairs[0]).toEqual({ question: "what is mori?", answer: "a memory app" });
  });

  it("returns null for ordinary prose with no dialog markers", () => {
    expect(parseConversation("오늘 운동 러닝 10분 했다")).toBeNull();
  });

  it("returns null when only one role is present", () => {
    expect(parseConversation("사용자: 질문만 있고 답이 없음")).toBeNull();
  });

  it("does not mistake a lone colon line for a marker", () => {
    // "참고:" is not a role marker, so this stays prose (null).
    expect(parseConversation("참고: 이건 그냥 메모\n다음 줄")).toBeNull();
  });
});
