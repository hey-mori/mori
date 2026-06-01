import { describe, expect, it } from "vitest";
import type { Decision, Issue, NextAction, Relationship } from "../../domain/types";
import type { AnalysisResult } from "./analysisTypes";
import {
  appendAnalysisRun,
  createAnalysisRunHistory,
  describeAnalysisRunReason,
  diffAnalysisRuns,
  getAnalysisRun,
  getCurrentRun,
  listAnalysisRunsNewestFirst,
  selectAnalysisRun,
} from "./analysisRunHistory";

function makeIssue(overrides: Partial<Issue> & { title: string }): Issue {
  return {
    id: `issue-${overrides.title}`,
    projectId: "proj-1",
    sessionId: "sess-1",
    title: overrides.title,
    description: overrides.description ?? "",
    status: overrides.status ?? "open",
    priority: overrides.priority ?? "medium",
    sourceEventIds: overrides.sourceEventIds ?? [],
    relatedDecisionIds: overrides.relatedDecisionIds ?? [],
    relatedFileIds: overrides.relatedFileIds ?? [],
    suggestedNextAction: overrides.suggestedNextAction ?? "",
    assignee: overrides.assignee,
    dueDate: overrides.dueDate,
    createdAt: overrides.createdAt ?? "2026-06-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-01T00:00:00.000Z",
    confidence: overrides.confidence ?? 0.6,
    trustLevel: overrides.trustLevel ?? "inferred",
  };
}

function makeDecision(overrides: Partial<Decision> & { title: string }): Decision {
  return {
    id: `decision-${overrides.title}`,
    projectId: "proj-1",
    sessionId: "sess-1",
    title: overrides.title,
    decision: overrides.decision ?? overrides.title,
    rationale: overrides.rationale ?? "",
    rejectedOptions: overrides.rejectedOptions ?? [],
    impact: overrides.impact ?? [],
    sourceEventIds: overrides.sourceEventIds ?? [],
    relatedIssueIds: overrides.relatedIssueIds ?? [],
    relatedSourceIds: overrides.relatedSourceIds ?? [],
    createdAt: overrides.createdAt ?? "2026-06-01T00:00:00.000Z",
    importance: overrides.importance ?? "medium",
    trustLevel: overrides.trustLevel ?? "inferred",
    confirmed: overrides.confirmed ?? false,
  };
}

function makeNextAction(overrides: Partial<NextAction> & { title: string }): NextAction {
  return {
    id: `nact-${overrides.title}`,
    sessionId: "sess-1",
    title: overrides.title,
    priority: overrides.priority ?? "medium",
    relatedIssueIds: overrides.relatedIssueIds ?? [],
    relatedEventIds: overrides.relatedEventIds ?? [],
  };
}

function makeRelationship(overrides: Partial<Relationship> & { id: string }): Relationship {
  return {
    id: overrides.id,
    fromId: overrides.fromId ?? "issue-a",
    fromType: overrides.fromType ?? "issue",
    toId: overrides.toId ?? "decision-a",
    toType: overrides.toType ?? "decision",
    type: overrides.type ?? "caused",
    confidence: overrides.confidence ?? 0.5,
    reason: overrides.reason ?? "",
  };
}

function makeResult(overrides: Partial<AnalysisResult> & { runId: string }): AnalysisResult {
  const generatedAt = overrides.generatedAt ?? "2026-06-01T00:00:00.000Z";
  return {
    runId: overrides.runId,
    providerName: overrides.providerName ?? "deterministic-heuristic-v1",
    providerLabel: overrides.providerLabel ?? "Deterministic",
    sessionId: overrides.sessionId ?? "sess-1",
    projectId: overrides.projectId ?? "proj-1",
    generatedAt,
    durationMs: overrides.durationMs ?? 12,
    inputEventCount: overrides.inputEventCount ?? 0,
    inputSourceCount: overrides.inputSourceCount ?? 0,
    summary: overrides.summary ?? { sessionSummary: "", resumePrompt: "", highlights: [] },
    issues: overrides.issues ?? [],
    decisions: overrides.decisions ?? [],
    relationships: overrides.relationships ?? [],
    nextActions: overrides.nextActions ?? [],
    rendered: overrides.rendered ?? {
      summary: {
        id: `summary-${overrides.runId}`,
        sessionId: overrides.sessionId ?? "sess-1",
        sessionSummary: "",
        resumePrompt: "",
        reportMarkdown: "",
        nextActionIds: [],
        generatedAt,
      },
    },
    confidence: overrides.confidence ?? 0.75,
    notes: overrides.notes ?? [],
  };
}

describe("analysisRunHistory", () => {
  it("creates a history adopting the first run", () => {
    const history = createAnalysisRunHistory(makeResult({ runId: "run-1" }));
    expect(history.sessionId).toBe("sess-1");
    expect(history.runs).toHaveLength(1);
    expect(history.currentRunId).toBe("run-1");
    expect(getCurrentRun(history)?.runId).toBe("run-1");
  });

  it("appends a run and adopts it without losing the prior run", () => {
    let history = createAnalysisRunHistory(makeResult({ runId: "run-1" }));
    history = appendAnalysisRun(history, makeResult({ runId: "run-2", providerLabel: "Ollama" }));
    expect(history.runs.map((run) => run.runId)).toEqual(["run-1", "run-2"]);
    expect(history.currentRunId).toBe("run-2");
    expect(getAnalysisRun(history, "run-1")?.runId).toBe("run-1");
  });

  it("replaces a re-materialized run in place rather than duplicating it", () => {
    let history = createAnalysisRunHistory(makeResult({ runId: "run-1", durationMs: 10 }));
    history = appendAnalysisRun(history, makeResult({ runId: "run-2" }));
    history = appendAnalysisRun(history, makeResult({ runId: "run-1", durationMs: 99 }));
    expect(history.runs.map((run) => run.runId)).toEqual(["run-1", "run-2"]);
    expect(getAnalysisRun(history, "run-1")?.durationMs).toBe(99);
    expect(history.currentRunId).toBe("run-1");
  });

  it("selects an existing run and ignores an unknown id", () => {
    let history = createAnalysisRunHistory(makeResult({ runId: "run-1" }));
    history = appendAnalysisRun(history, makeResult({ runId: "run-2" }));
    history = selectAnalysisRun(history, "run-1");
    expect(history.currentRunId).toBe("run-1");
    const unchanged = selectAnalysisRun(history, "run-missing");
    expect(unchanged.currentRunId).toBe("run-1");
  });

  it("returns null from getCurrentRun when the pointer is dangling", () => {
    const history = { sessionId: "sess-1", runs: [], currentRunId: "run-x" };
    expect(getCurrentRun(history)).toBeNull();
  });

  it("lists runs newest first", () => {
    let history = createAnalysisRunHistory(makeResult({ runId: "run-1" }));
    history = appendAnalysisRun(history, makeResult({ runId: "run-2" }));
    expect(listAnalysisRunsNewestFirst(history).map((run) => run.runId)).toEqual([
      "run-2",
      "run-1",
    ]);
  });

  it("describes the inspectable reason for a run", () => {
    const result = makeResult({
      runId: "run-1",
      providerName: "ollama-quick-pass-v1",
      providerLabel: "Ollama Quick Pass (llama3.1:8b)",
      durationMs: 4200,
      confidence: 0.8,
      inputEventCount: 12,
      inputSourceCount: 3,
      issues: [makeIssue({ title: "A" }), makeIssue({ title: "B" })],
      decisions: [makeDecision({ title: "D" })],
      notes: ["Generated by Ollama against http://localhost:11434"],
    });
    const reason = describeAnalysisRunReason(result);
    expect(reason.providerLabel).toContain("llama3.1:8b");
    expect(reason.durationMs).toBe(4200);
    expect(reason.elementCounts).toEqual({
      issues: 2,
      decisions: 1,
      relationships: 0,
      nextActions: 0,
    });
    expect(reason.notes).toEqual(["Generated by Ollama against http://localhost:11434"]);
  });

  it("diffs added, removed, changed, and carried elements by content key", () => {
    const previous = makeResult({
      runId: "run-1",
      issues: [
        makeIssue({ title: "Login fails", status: "open" }),
        makeIssue({ title: "Slow query" }),
      ],
      decisions: [makeDecision({ title: "Use SQLite", rationale: "local-first" })],
      nextActions: [makeNextAction({ title: "Write tests", priority: "low" })],
    });
    const next = makeResult({
      runId: "run-2",
      issues: [
        // carried unchanged (title key matches, same salient fields)
        makeIssue({ title: "Login fails", status: "open" }),
        // added
        makeIssue({ title: "Flaky CI" }),
      ],
      decisions: [
        // changed (same title, different rationale)
        makeDecision({ title: "Use SQLite", rationale: "performance" }),
      ],
      nextActions: [
        // changed (same title, different priority)
        makeNextAction({ title: "Write tests", priority: "high" }),
      ],
    });

    const diff = diffAnalysisRuns(previous, next);
    expect(diff.fromRunId).toBe("run-1");
    expect(diff.toRunId).toBe("run-2");
    expect(diff.issues).toEqual({ added: 1, removed: 1, changed: 0, carried: 1 });
    expect(diff.decisions).toEqual({ added: 0, removed: 0, changed: 1, carried: 0 });
    expect(diff.nextActions).toEqual({ added: 0, removed: 0, changed: 1, carried: 0 });
  });

  it("matches relationships coarsely and never reports them as changed", () => {
    const previous = makeResult({
      runId: "run-1",
      relationships: [makeRelationship({ id: "rel-1", type: "caused" })],
    });
    const next = makeResult({
      runId: "run-2",
      relationships: [
        makeRelationship({ id: "rel-2", type: "caused" }),
        makeRelationship({ id: "rel-3", type: "ledTo", fromType: "issue", toType: "issue" }),
      ],
    });
    const diff = diffAnalysisRuns(previous, next);
    expect(diff.relationships.changed).toBe(0);
    expect(diff.relationships.carried).toBe(1);
    expect(diff.relationships.added).toBe(1);
    expect(diff.relationships.removed).toBe(0);
  });
});
