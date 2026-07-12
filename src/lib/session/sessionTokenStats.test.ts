import { describe, expect, it } from "vitest";
import { buildSessionTokenStats } from "./sessionTokenStats";
import type { TimelineEvent } from "../../domain/types";

function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "evt-1",
    title: "테스트 이벤트",
    lane: "conversation",
    kind: "userMessage",
    start: "2026-07-12T09:00:00.000Z",
    trustLevel: "verified",
    summary: "",
    ...overrides,
  } as TimelineEvent;
}

describe("buildSessionTokenStats", () => {
  it("returns undefined when no event carries usage", () => {
    expect(buildSessionTokenStats([event(), event({ id: "evt-2" })])).toBeUndefined();
  });

  it("returns undefined for zero-token usage instead of showing 0", () => {
    const events = [event({ tokenUsage: { input: 0, output: 0, total: 0 } })];
    expect(buildSessionTokenStats(events)).toBeUndefined();
  });

  it("sums usage across events and formats the labels", () => {
    const events = [
      event({ id: "a", tokenUsage: { input: 9_000, output: 3_000, total: 12_000 } }),
      event({ id: "b" }),
      event({
        id: "c",
        tokenUsage: { input: 100, output: 300, total: 400, model: "claude-opus-4-8" },
      }),
    ];
    const stats = buildSessionTokenStats(events);
    expect(stats).toBeDefined();
    expect(stats!.total).toBe(12_400);
    expect(stats!.totalLabel).toBe("12.4K");
    expect(stats!.model).toBe("claude-opus-4-8");
    expect(stats!.detailLabel).toContain("입력 9.1K");
    expect(stats!.detailLabel).toContain("출력 3.3K");
    expect(stats!.detailLabel).toContain("claude-opus-4-8");
  });

  it("omits the model from the detail when unknown", () => {
    const events = [event({ tokenUsage: { input: 10, output: 20, total: 30 } })];
    const stats = buildSessionTokenStats(events);
    expect(stats!.detailLabel).not.toContain("claude");
  });
});
