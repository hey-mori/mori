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
  it("uses the floor's summary and confidence when the LLM found nothing", () => {
    const primary = result({
      providerLabel: "Ollama",
      summary: { sessionSummary: "LLM said nothing useful", resumePrompt: "", highlights: [] },
      confidence: 0.75,
    });
    const floor = result({
      providerName: "deterministic-heuristic-v1",
      summary: { sessionSummary: "규칙 기반: 이슈 1건", resumePrompt: "floor prompt", highlights: [] },
      rendered: {
        summary: {
          id: "summary-floor",
          sessionId: "s",
          sessionSummary: "규칙 기반: 이슈 1건",
          resumePrompt: "floor prompt",
          reportMarkdown: "",
          nextActionIds: [],
          generatedAt: "2026-06-08T00:00:00Z",
        },
      },
      confidence: 0.4,
      issues: [issue("d-i1", "Floor issue")],
      nextActions: [nextAction("d-n1", "Floor action")],
    });

    const merged = mergeAnalysisFloor(primary, floor);

    expect(merged.issues).toHaveLength(1);
    expect(merged.nextActions).toHaveLength(1);
    // The empty LLM run no longer claims its summary / confidence over the floor.
    expect(merged.summary.sessionSummary).toBe("규칙 기반: 이슈 1건");
    expect(merged.rendered.summary.sessionSummary).toBe("규칙 기반: 이슈 1건");
    expect(merged.confidence).toBe(0.4);
    // Provider identity, stored-summary id, and timing stay the primary's.
    expect(merged.providerLabel).toBe("Ollama");
    expect(merged.providerName).toBe("ollama-quick-pass-v1");
    expect(merged.rendered.summary.id).toBe("summary-run");
    expect(merged.rendered.summary.nextActionIds).toEqual(["d-n1"]);
    expect(merged.notes.some((n) => n.includes("보강"))).toBe(true);
  });

  it("keeps the primary summary and confidence when the LLM found its own items", () => {
    const primary = result({
      summary: { sessionSummary: "LLM rich summary", resumePrompt: "", highlights: [] },
      confidence: 0.9,
      issues: [issue("llm-i1", "LLM issue")],
    });
    const floor = result({
      providerName: "deterministic-heuristic-v1",
      summary: { sessionSummary: "Floor summary", resumePrompt: "", highlights: [] },
      confidence: 0.3,
      issues: [issue("d-i1", "Floor extra")],
    });

    const merged = mergeAnalysisFloor(primary, floor);

    expect(merged.summary.sessionSummary).toBe("LLM rich summary");
    expect(merged.confidence).toBe(0.9);
    expect(merged.issues).toHaveLength(2);
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
