import { describe, expect, it } from "vitest";
import { eventDisplayLabel } from "./constants";

describe("eventDisplayLabel", () => {
  it("names the specific tool for a tool turn instead of '대화'", () => {
    expect(eventDisplayLabel({ type: "aiConversation", actor: "tool", toolName: "Grep" })).toBe("Grep");
  });

  it("falls back to '도구' for a tool turn with no tool name", () => {
    expect(eventDisplayLabel({ type: "aiConversation", actor: "tool" })).toBe("도구");
  });

  it("keeps '대화' for a real assistant exchange and '요청' for a bare user turn", () => {
    expect(eventDisplayLabel({ type: "aiConversation", actor: "assistant" })).toBe("대화");
    expect(eventDisplayLabel({ type: "aiConversation", actor: "user" })).toBe("요청");
  });

  it("uses the event-type label when the event carries no actor", () => {
    expect(eventDisplayLabel({ type: "aiConversation" })).toBe("대화");
    expect(eventDisplayLabel({ type: "fileCode" })).toBe("파일");
  });
});
