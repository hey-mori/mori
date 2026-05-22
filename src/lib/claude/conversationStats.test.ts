import { describe, expect, it } from "vitest";
import {
  classifyMessage,
  computeConversationStats,
  formatTokenCount,
} from "./conversationStats";
import type { ClaudeMessage } from "./types";

function makeMessage(partial: Partial<ClaudeMessage> & { id: string }): ClaudeMessage {
  return {
    role: "human",
    content: "",
    createdAt: "",
    ...partial,
  };
}

describe("classifyMessage", () => {
  it("prefers the rust-supplied subkind when present", () => {
    expect(
      classifyMessage(
        makeMessage({ id: "1", role: "human", subkind: "tool_result", content: "anything" }),
      ),
    ).toBe("tool_result");
    expect(
      classifyMessage(
        makeMessage({ id: "2", role: "assistant", subkind: "tool_use", content: "🔧 Bash" }),
      ),
    ).toBe("tool_use");
  });

  it("falls back to the content glyph for older payloads", () => {
    expect(
      classifyMessage(makeMessage({ id: "3", role: "human", content: "↳ 도구 결과: ok" })),
    ).toBe("tool_result");
    expect(
      classifyMessage(makeMessage({ id: "4", role: "human", content: "↳ 도구 오류: boom" })),
    ).toBe("tool_result");
    expect(
      classifyMessage(makeMessage({ id: "5", role: "assistant", content: "🔧 Read: file" })),
    ).toBe("tool_use");
    expect(
      classifyMessage(makeMessage({ id: "6", role: "human", content: "Real question." })),
    ).toBe("");
    expect(
      classifyMessage(makeMessage({ id: "7", role: "assistant", content: "Plain reply." })),
    ).toBe("");
  });
});

describe("computeConversationStats", () => {
  it("returns zeroes for an empty conversation", () => {
    const stats = computeConversationStats([]);
    expect(stats).toEqual({
      totalMessages: 0,
      humanMessages: 0,
      assistantMessages: 0,
      toolUses: 0,
      toolResults: 0,
      durationLabel: null,
    });
  });

  it("separates real user input from tool-result envelopes", () => {
    const stats = computeConversationStats([
      makeMessage({ id: "1", role: "human", content: "Hello" }),
      makeMessage({ id: "2", role: "assistant", content: "Hi there." }),
      makeMessage({ id: "3", role: "assistant", content: "🔧 Bash: ls", subkind: "tool_use" }),
      makeMessage({ id: "4", role: "human", content: "↳ 도구 결과: file.rs", subkind: "tool_result" }),
      makeMessage({ id: "5", role: "human", content: "Follow up." }),
    ]);

    expect(stats.totalMessages).toBe(5);
    expect(stats.humanMessages).toBe(2);
    expect(stats.assistantMessages).toBe(1);
    expect(stats.toolUses).toBe(1);
    expect(stats.toolResults).toBe(1);
  });

  it("formats the wall-clock span in Korean", () => {
    const stats = computeConversationStats([
      makeMessage({ id: "1", role: "human", content: "start", createdAt: "2026-01-01T00:00:00Z" }),
      makeMessage({
        id: "2",
        role: "assistant",
        content: "reply",
        createdAt: "2026-01-01T02:45:00Z",
      }),
    ]);

    expect(stats.durationLabel).toBe("2시간 45분");
  });

  it("returns null when no message carries a parsable timestamp", () => {
    const stats = computeConversationStats([
      makeMessage({ id: "1", role: "human", content: "no time" }),
      makeMessage({ id: "2", role: "assistant", content: "still no time" }),
    ]);
    expect(stats.durationLabel).toBeNull();
  });

  it("uses '1분 미만' for sub-minute spans", () => {
    const stats = computeConversationStats([
      makeMessage({ id: "1", role: "human", content: "a", createdAt: "2026-01-01T00:00:00Z" }),
      makeMessage({
        id: "2",
        role: "assistant",
        content: "b",
        createdAt: "2026-01-01T00:00:30Z",
      }),
    ]);
    expect(stats.durationLabel).toBe("1분 미만");
  });

  it("formats day-scale spans", () => {
    const stats = computeConversationStats([
      makeMessage({ id: "1", role: "human", content: "a", createdAt: "2026-01-01T00:00:00Z" }),
      makeMessage({
        id: "2",
        role: "assistant",
        content: "b",
        createdAt: "2026-01-04T05:00:00Z",
      }),
    ]);
    expect(stats.durationLabel).toBe("3일 5시간");
  });
});

describe("formatTokenCount", () => {
  it("returns the raw number under 1000", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(42)).toBe("42");
    expect(formatTokenCount(999)).toBe("999");
  });

  it("compacts thousands with one decimal", () => {
    expect(formatTokenCount(1200)).toBe("1.2K");
    expect(formatTokenCount(15_000)).toBe("15K");
    expect(formatTokenCount(150_000)).toBe("150K");
  });

  it("compacts millions", () => {
    expect(formatTokenCount(1_500_000)).toBe("1.5M");
    expect(formatTokenCount(12_000_000)).toBe("12M");
  });

  it("treats non-positive / invalid input as zero", () => {
    expect(formatTokenCount(-5)).toBe("0");
    expect(formatTokenCount(Number.NaN)).toBe("0");
  });
});
