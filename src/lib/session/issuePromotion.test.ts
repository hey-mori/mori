import { describe, expect, it } from "vitest";
import type { MoriAnalysisResult } from "../analysis";
import { moriMockSession } from "../../domain/mock-data";
import {
  buildNextActionFromIssue,
  findNextActionForIssue,
  promoteIssueToNextAction,
} from "./issuePromotion";

function analysis(): MoriAnalysisResult {
  return {
    runId: "run-promote",
    providerName: "deterministic-heuristic-v1",
    providerLabel: "Deterministic",
    sessionId: moriMockSession.session.id,
    projectId: moriMockSession.project.id,
    generatedAt: "2026-05-18T11:00:00.000Z",
    durationMs: 1,
    inputEventCount: 0,
    inputSourceCount: 0,
    summary: { sessionSummary: "summary", resumePrompt: "prompt", highlights: [] },
    issues: [{ ...moriMockSession.issues[0]!, id: "iss-1" }],
    decisions: [],
    relationships: [],
    nextActions: [],
    rendered: {
      summary: {
        id: "summary-run-promote",
        sessionId: moriMockSession.session.id,
        sessionSummary: "summary",
        resumePrompt: "prompt",
        reportMarkdown: "",
        nextActionIds: [],
        generatedAt: "2026-05-18T11:00:00.000Z",
      },
    },
    confidence: 0.5,
    notes: [],
  };
}

describe("buildNextActionFromIssue", () => {
  it("creates a linked next action from the issue suggestion", () => {
    const issue = { ...moriMockSession.issues[0]!, id: "iss-1" };
    const action = buildNextActionFromIssue(issue);

    expect(action.id).toBe("nact-user-iss-1");
    expect(action.title).toBe(issue.suggestedNextAction);
    expect(action.priority).toBe(issue.priority);
    expect(action.relatedIssueIds).toEqual(["iss-1"]);
    expect(action.relatedEventIds).toEqual(issue.sourceEventIds);
  });

  it("falls back to the issue title when no suggestion exists", () => {
    const issue = { ...moriMockSession.issues[0]!, id: "iss-1", suggestedNextAction: "" };
    expect(buildNextActionFromIssue(issue).title).toBe(`Resolve: ${issue.title}`);
  });
});

describe("promoteIssueToNextAction", () => {
  it("adds a next action for the matching issue", () => {
    const original = analysis();
    const result = promoteIssueToNextAction(original, "iss-1");

    expect(result.changed).toBe(true);
    expect(result.analysis).not.toBe(original);
    expect(result.nextAction?.relatedIssueIds).toEqual(["iss-1"]);
    expect(result.analysis.nextActions).toHaveLength(1);
    expect(result.analysis.issues).toBe(original.issues);
    expect(result.analysis.decisions).toBe(original.decisions);
  });

  it("returns unchanged analysis for an unknown issue id", () => {
    const original = analysis();
    const result = promoteIssueToNextAction(original, "missing");

    expect(result.changed).toBe(false);
    expect(result.analysis).toBe(original);
    expect(result.nextAction).toBeNull();
  });

  it("returns the existing linked next action instead of duplicating", () => {
    const original = analysis();
    const first = promoteIssueToNextAction(original, "iss-1");
    const second = promoteIssueToNextAction(first.analysis, "iss-1");

    expect(second.changed).toBe(false);
    expect(second.analysis).toBe(first.analysis);
    expect(second.nextAction).toEqual(first.nextAction);
    expect(second.analysis.nextActions).toHaveLength(1);
  });

  it("finds an existing next action by related issue id", () => {
    const first = promoteIssueToNextAction(analysis(), "iss-1");
    expect(findNextActionForIssue(first.analysis.nextActions, "iss-1")?.id).toBe(
      "nact-user-iss-1",
    );
  });
});
