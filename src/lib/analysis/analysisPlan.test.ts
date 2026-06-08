import { describe, expect, it } from "vitest";
import { buildAnalysisPlan, describeAnalysisPlan } from "./analysisPlan";
import { DEFAULT_QUICK_PASS_SETTINGS } from "./analysisSettings";
import type { EventActor, TimelineEvent } from "../../domain/types";

function ev(id: string, actor: EventActor): TimelineEvent {
  return {
    id,
    sessionId: "s1",
    projectId: "p1",
    start: "2026-06-04T09:00:00Z",
    type: "aiConversation",
    title: id,
    summary: "",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    actor,
  };
}

describe("buildAnalysisPlan", () => {
  it("counts conversation turns and excluded tool events", () => {
    const events = [ev("c1", "assistant"), ev("c2", "user"), ev("t1", "tool"), ev("t2", "tool")];
    const plan = buildAnalysisPlan({ events, sourceCount: 1, settings: DEFAULT_QUICK_PASS_SETTINGS });
    expect(plan.targetTurns).toBe(2);
    expect(plan.omittedToolEvents).toBe(2);
    expect(plan.engineLabel).toContain("규칙 기반");
    expect(plan.cappedAt).toBeNull();
  });

  it("does not cap Ollama because it uses chunked local passes", () => {
    const events = Array.from({ length: 150 }, (_, i) => ev(`c${i}`, "assistant"));
    const plan = buildAnalysisPlan({
      events,
      sourceCount: 1,
      settings: { ...DEFAULT_QUICK_PASS_SETTINGS, provider: "ollama", ollamaModel: "gemma4:e4b" },
    });
    expect(plan.cappedAt).toBeNull();
    expect(plan.engineLabel).toContain("gemma4:e4b");
  });

  it("still caps single-prompt OpenAI-compatible runs", () => {
    const events = Array.from({ length: 150 }, (_, i) => ev(`c${i}`, "assistant"));
    const plan = buildAnalysisPlan({
      events,
      sourceCount: 1,
      settings: { ...DEFAULT_QUICK_PASS_SETTINGS, provider: "openAiCompatible" },
    });
    expect(plan.cappedAt).toBe(120);
  });

  it("describes the plan as one line", () => {
    const events = [ev("c1", "assistant"), ev("t1", "tool")];
    const line = describeAnalysisPlan(
      buildAnalysisPlan({ events, sourceCount: 1, settings: DEFAULT_QUICK_PASS_SETTINGS }),
    );
    expect(line).toContain("분석 대상");
    expect(line).toContain("도구 1개 제외");
    expect(line).toContain("이슈");
  });
});
