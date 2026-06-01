import { describe, expect, it } from "vitest";
import type { Issue } from "../../domain/types";
import {
  appendAnalysisRun,
  createAnalysisRunHistory,
} from "./analysisRunHistory";
import {
  buildAnalysisRunHistoryViewModel,
  summarizeRunDiff,
} from "./analysisRunHistoryView";
import type { AnalysisResult } from "./analysisTypes";
import type { AnalysisRunDiff } from "./analysisRunHistory";

function makeIssue(title: string, overrides: Partial<Issue> = {}): Issue {
  return {
    id: `issue-${title}`,
    projectId: "proj-1",
    sessionId: "sess-1",
    title,
    description: overrides.description ?? "",
    status: overrides.status ?? "open",
    priority: overrides.priority ?? "medium",
    sourceEventIds: [],
    relatedDecisionIds: [],
    relatedFileIds: [],
    suggestedNextAction: "",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    confidence: 0.6,
    trustLevel: "inferred",
  };
}

function makeResult(runId: string, overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  const generatedAt = overrides.generatedAt ?? "2026-06-01T00:00:00.000Z";
  return {
    runId,
    providerName: overrides.providerName ?? "deterministic-heuristic-v1",
    providerLabel: overrides.providerLabel ?? "Deterministic",
    sessionId: "sess-1",
    projectId: "proj-1",
    generatedAt,
    durationMs: overrides.durationMs ?? 10,
    inputEventCount: overrides.inputEventCount ?? 0,
    inputSourceCount: overrides.inputSourceCount ?? 0,
    summary: { sessionSummary: "", resumePrompt: "", highlights: [] },
    issues: overrides.issues ?? [],
    decisions: overrides.decisions ?? [],
    relationships: overrides.relationships ?? [],
    nextActions: overrides.nextActions ?? [],
    rendered: {
      summary: {
        id: `summary-${runId}`,
        sessionId: "sess-1",
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

function diffWith(overrides: Partial<AnalysisRunDiff>): AnalysisRunDiff {
  const zero = { added: 0, removed: 0, changed: 0, carried: 0 };
  return {
    fromRunId: "a",
    toRunId: "b",
    issues: { ...zero },
    decisions: { ...zero },
    nextActions: { ...zero },
    relationships: { ...zero },
    ...overrides,
  };
}

describe("buildAnalysisRunHistoryViewModel", () => {
  it("orders rows newest first and marks the adopted run", () => {
    let history = createAnalysisRunHistory(makeResult("run-1"));
    history = appendAnalysisRun(history, makeResult("run-2", { providerLabel: "Ollama" }));
    const vm = buildAnalysisRunHistoryViewModel(history);

    expect(vm.runCount).toBe(2);
    expect(vm.hasMultipleRuns).toBe(true);
    expect(vm.rows.map((row) => row.runId)).toEqual(["run-2", "run-1"]);
    expect(vm.rows[0].isCurrent).toBe(true);
    expect(vm.rows[1].isCurrent).toBe(false);
  });

  it("attaches a reason and a change summary, with null for the oldest run", () => {
    let history = createAnalysisRunHistory(
      makeResult("run-1", { issues: [makeIssue("Login fails")] }),
    );
    history = appendAnalysisRun(
      history,
      makeResult("run-2", {
        providerLabel: "Ollama Quick Pass (llama3.1:8b)",
        issues: [makeIssue("Login fails"), makeIssue("Flaky CI")],
      }),
    );
    const vm = buildAnalysisRunHistoryViewModel(history);

    const [newest, oldest] = vm.rows;
    expect(newest.reason.providerLabel).toContain("llama3.1:8b");
    expect(newest.reason.elementCounts.issues).toBe(2);
    expect(newest.diffVsPrevious?.issues.added).toBe(1);
    expect(newest.changeSummary).toBe("이슈 +1");
    // The oldest run has nothing older to compare against.
    expect(oldest.diffVsPrevious).toBeNull();
    expect(oldest.changeSummary).toBeNull();
  });

  it("reports a single-run history as not having multiple runs", () => {
    const vm = buildAnalysisRunHistoryViewModel(createAnalysisRunHistory(makeResult("run-1")));
    expect(vm.hasMultipleRuns).toBe(false);
    expect(vm.rows).toHaveLength(1);
    expect(vm.rows[0].changeSummary).toBeNull();
  });
});

describe("summarizeRunDiff", () => {
  it("renders added, removed, and changed tokens per category in Korean", () => {
    const summary = summarizeRunDiff(
      diffWith({
        issues: { added: 1, removed: 0, changed: 1, carried: 2 },
        decisions: { added: 0, removed: 1, changed: 0, carried: 0 },
      }),
    );
    expect(summary).toBe("이슈 +1 ~1 · 결정 -1");
  });

  it("omits carried-only categories and reads '변화 없음' when nothing changed", () => {
    expect(summarizeRunDiff(diffWith({ issues: { added: 0, removed: 0, changed: 0, carried: 5 } }))).toBe(
      "변화 없음",
    );
  });
});
