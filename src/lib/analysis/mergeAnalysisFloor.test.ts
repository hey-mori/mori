import { describe, expect, it } from "vitest";
import type { Issue, NextAction, Relationship } from "../../domain/types";
import type { AnalysisResult } from "./analysisTypes";
import { mergeAnalysisFloor } from "./mergeAnalysisFloor";

function issue(id: string, title: string): Issue {
  return {
    id,
    projectId: "p",
    sessionId: "s",
    title,
    description: "",
    status: "open",
    priority: "medium",
    sourceEventIds: [],
    relatedDecisionIds: [],
    relatedFileIds: [],
    suggestedNextAction: "",
    createdAt: "2026-06-08T00:00:00Z",
    updatedAt: "2026-06-08T00:00:00Z",
    confidence: 0.6,
    trustLevel: "inferred",
  };
}

function nextAction(id: string, title: string): NextAction {
  return { id, sessionId: "s", title, priority: "medium", relatedIssueIds: [], relatedEventIds: [] };
}

function result(overrides: Partial<AnalysisResult>): AnalysisResult {
  return {
    runId: "run",
    providerName: "ollama-quick-pass-v1",
    providerLabel: "Ollama",
    sessionId: "s",
    projectId: "p",
    generatedAt: "2026-06-08T00:00:00Z",
    durationMs: 10,
    inputEventCount: 0,
    inputSourceCount: 0,
    summary: { sessionSummary: "primary summary", resumePrompt: "", highlights: [] },
    issues: [],
    decisions: [],
    relationships: [],
    nextActions: [],
    rendered: {
      summary: {
        id: "summary-run",
        sessionId: "s",
        sessionSummary: "primary summary",
        resumePrompt: "",
        reportMarkdown: "",
        nextActionIds: [],
        generatedAt: "2026-06-08T00:00:00Z",
      },
    },
    confidence: 0.75,
    notes: [],
    ...overrides,
  };
}

describe("mergeAnalysisFloor", () => {
  it("fills an empty primary with the deterministic floor and keeps the primary summary", () => {
    const primary = result({ providerLabel: "Ollama", summary: { sessionSummary: "LLM said", resumePrompt: "", highlights: [] } });
    const floor = result({
      providerName: "deterministic-heuristic-v1",
      issues: [issue("d-i1", "Floor issue")],
      nextActions: [nextAction("d-n1", "Floor action")],
    });

    const merged = mergeAnalysisFloor(primary, floor);

    expect(merged.issues).toHaveLength(1);
    expect(merged.nextActions).toHaveLength(1);
    expect(merged.summary.sessionSummary).toBe("LLM said");
    expect(merged.providerLabel).toBe("Ollama");
    expect(merged.rendered.summary.nextActionIds).toEqual(["d-n1"]);
    expect(merged.notes.some((n) => n.includes("보강"))).toBe(true);
  });

  it("does not duplicate items the primary already has by title", () => {
    const primary = result({ issues: [issue("llm-i1", "Same Issue")] });
    const floor = result({
      providerName: "deterministic-heuristic-v1",
      issues: [issue("d-i1", "same issue "), issue("d-i2", "New issue")],
    });

    const merged = mergeAnalysisFloor(primary, floor);

    expect(merged.issues).toHaveLength(2);
    expect(merged.issues[0]?.id).toBe("llm-i1");
    expect(merged.issues.some((i) => i.title === "New issue")).toBe(true);
  });

  it("dedupes relationships by endpoints and type", () => {
    const rel = (id: string, from: string, to: string): Relationship => ({
      id,
      fromId: from,
      toId: to,
      fromType: "event",
      toType: "event",
      type: "caused",
      confidence: 0.5,
      reason: "",
    });
    const primary = result({ relationships: [rel("r1", "a", "b")] });
    const floor = result({
      providerName: "deterministic-heuristic-v1",
      relationships: [rel("r2", "a", "b"), rel("r3", "b", "c")],
    });

    const merged = mergeAnalysisFloor(primary, floor);

    expect(merged.relationships).toHaveLength(2);
  });

  it("adds no note when the floor contributes nothing new", () => {
    const primary = result({ issues: [issue("llm-i1", "Only issue")] });
    const floor = result({ providerName: "deterministic-heuristic-v1", issues: [issue("d-i1", "only issue")] });

    const merged = mergeAnalysisFloor(primary, floor);

    expect(merged.issues).toHaveLength(1);
    expect(merged.notes).toHaveLength(0);
  });
});
