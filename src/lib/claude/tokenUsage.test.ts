import { describe, expect, it } from "vitest";
import { EMPTY_CLAUDE_TOKEN_USAGE, type ClaudeTokenUsage } from "./types";
import {
  sumTokenUsage,
  tokenUsageForMessage,
  tokenUsageMapFromAggregate,
  type TokenUsageByMessageId,
} from "./tokenUsage";

describe("tokenUsageForMessage", () => {
  const usageById: TokenUsageByMessageId = {
    "msg-a": { input: 30, output: 15, total: 45, model: "claude-opus-4-7" },
    "msg-b": { input: 100, output: 50, total: 150 },
  };

  it("maps per-message usage onto the matching message id", () => {
    expect(tokenUsageForMessage(usageById, "msg-a")).toEqual({
      input: 30,
      output: 15,
      total: 45,
      model: "claude-opus-4-7",
    });
    expect(tokenUsageForMessage(usageById, "msg-b")).toEqual({
      input: 100,
      output: 50,
      total: 150,
    });
  });

  it("yields no field when the message has no usage", () => {
    expect(tokenUsageForMessage(usageById, "msg-missing")).toBeUndefined();
    expect(tokenUsageForMessage(usageById, undefined)).toBeUndefined();
    expect(tokenUsageForMessage(undefined, "msg-a")).toBeUndefined();
    expect(tokenUsageForMessage({}, "msg-a")).toBeUndefined();
  });

  it("treats an all-zero entry as absent rather than a misleading zero", () => {
    const zero: TokenUsageByMessageId = {
      "msg-z": { input: 0, output: 0, total: 0 },
    };
    expect(tokenUsageForMessage(zero, "msg-z")).toBeUndefined();
  });
});

describe("sumTokenUsage", () => {
  it("adds totals across present usages", () => {
    const total = sumTokenUsage([
      { input: 30, output: 15, total: 45 },
      { input: 100, output: 50, total: 150, model: "claude-opus-4-7" },
    ]);
    expect(total).toEqual({
      input: 130,
      output: 65,
      total: 195,
      model: "claude-opus-4-7",
    });
  });

  it("skips absent usages and still adds the rest", () => {
    const total = sumTokenUsage([
      undefined,
      { input: 10, output: 5, total: 15 },
      undefined,
    ]);
    expect(total).toEqual({ input: 10, output: 5, total: 15 });
  });

  it("returns no field when nothing contributed", () => {
    expect(sumTokenUsage([])).toBeUndefined();
    expect(sumTokenUsage([undefined, undefined])).toBeUndefined();
  });
});

describe("tokenUsageMapFromAggregate", () => {
  const aggregate: ClaudeTokenUsage = {
    inputTokens: 300,
    outputTokens: 120,
    cacheCreationTokens: 10,
    cacheReadTokens: 200,
    totalTokens: 420,
    assistantTurns: 3,
    model: "claude-opus-4-7",
  };

  it("attributes the session aggregate to the last assistant message", () => {
    const map = tokenUsageMapFromAggregate(aggregate, "msg-last");
    expect(map).toEqual({
      "msg-last": {
        input: 300,
        output: 120,
        total: 420,
        model: "claude-opus-4-7",
      },
    });
  });

  it("omits the model when the aggregate has none", () => {
    const map = tokenUsageMapFromAggregate(
      { ...aggregate, model: "" },
      "msg-last",
    );
    expect(map).toEqual({
      "msg-last": { input: 300, output: 120, total: 420 },
    });
  });

  it("returns an empty map when usage is absent", () => {
    expect(tokenUsageMapFromAggregate(undefined, "msg-last")).toEqual({});
    expect(tokenUsageMapFromAggregate(EMPTY_CLAUDE_TOKEN_USAGE, "msg-last")).toEqual({});
    expect(tokenUsageMapFromAggregate(aggregate, undefined)).toEqual({});
  });
});
