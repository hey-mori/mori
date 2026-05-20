import { describe, expect, it } from "vitest";
import { buildSessionWrapUp } from "./sessionWrapUp";

const base = {
  sourceCount: 0,
  eventCount: 0,
  issueCount: 0,
  decisionCount: 0,
  nextActionCount: 0,
  importCount: 0,
  hasAnalysis: false,
  analysisRunning: false,
  canRunQuickPass: false,
  acceptedMemoryCount: 0,
  auditActionCount: 0,
  staleMemoryCount: 0,
  contradictedMemoryCount: 0,
  unresolvedItems: [],
  resumePromptReady: false,
};

describe("buildSessionWrapUp", () => {
  it("starts with an evidence action when nothing has been captured", () => {
    const viewModel = buildSessionWrapUp(base);

    expect(viewModel.primaryAction.id).toBe("addEvidence");
    expect(viewModel.steps.map((step) => [step.id, step.status])).toEqual([
      ["capture", "attention"],
      ["review", "attention"],
      ["memory", "attention"],
      ["handoff", "waiting"],
    ]);
  });

  it("prompts Quick Pass after evidence exists but review output is missing", () => {
    const viewModel = buildSessionWrapUp({
      ...base,
      sourceCount: 1,
      eventCount: 4,
      importCount: 1,
      canRunQuickPass: true,
    });

    expect(viewModel.primaryAction).toMatchObject({
      id: "runQuickPass",
      enabled: true,
    });
    expect(viewModel.steps.find((step) => step.id === "review")?.status).toBe("ready");
  });

  it("waits without offering another run while analysis is running", () => {
    const viewModel = buildSessionWrapUp({
      ...base,
      sourceCount: 1,
      eventCount: 2,
      importCount: 1,
      analysisRunning: true,
      canRunQuickPass: false,
    });

    expect(viewModel.primaryAction).toMatchObject({
      id: "waitForAnalysis",
      enabled: false,
    });
    expect(viewModel.steps.find((step) => step.id === "review")?.statusLabel).toBe("Running");
  });

  it("routes reviewed sessions without accepted memory to Project Memory", () => {
    const viewModel = buildSessionWrapUp({
      ...base,
      sourceCount: 2,
      eventCount: 8,
      importCount: 2,
      hasAnalysis: true,
      issueCount: 3,
      decisionCount: 1,
      nextActionCount: 4,
      resumePromptReady: true,
    });

    expect(viewModel.primaryAction.id).toBe("reviewMemory");
    expect(viewModel.steps.find((step) => step.id === "memory")?.status).toBe("ready");
  });

  it("routes durable sessions to the final handoff", () => {
    const viewModel = buildSessionWrapUp({
      ...base,
      sourceCount: 3,
      eventCount: 9,
      hasAnalysis: true,
      issueCount: 1,
      decisionCount: 2,
      nextActionCount: 2,
      acceptedMemoryCount: 5,
      auditActionCount: 7,
      resumePromptReady: true,
    });

    expect(viewModel.primaryAction.id).toBe("reviewHandoff");
    expect(viewModel.steps.find((step) => step.id === "memory")?.detail).toContain("5 accepted memories");
    expect(viewModel.steps.find((step) => step.id === "handoff")?.status).toBe("ready");
  });

  it("routes stale or contradicted accepted memory to lifecycle review before handoff", () => {
    const viewModel = buildSessionWrapUp({
      ...base,
      sourceCount: 3,
      eventCount: 9,
      hasAnalysis: true,
      issueCount: 1,
      decisionCount: 2,
      nextActionCount: 2,
      acceptedMemoryCount: 5,
      auditActionCount: 7,
      staleMemoryCount: 1,
      contradictedMemoryCount: 1,
      resumePromptReady: true,
    });

    expect(viewModel.primaryAction).toMatchObject({
      id: "reviewMemoryHealth",
      enabled: true,
    });
    expect(viewModel.steps.find((step) => step.id === "memory")).toMatchObject({
      status: "attention",
      statusLabel: "Needs review",
    });
    expect(viewModel.steps.find((step) => step.id === "memory")?.detail).toContain(
      "2 accepted memories need lifecycle review",
    );
  });

  it("carries a bounded unresolved-work preview for the continue-later summary", () => {
    const viewModel = buildSessionWrapUp({
      ...base,
      sourceCount: 2,
      eventCount: 4,
      hasAnalysis: true,
      acceptedMemoryCount: 1,
      resumePromptReady: true,
      unresolvedItems: [
        { id: "i-1", kind: "issue", title: "Confirm export path", detail: "Open issue" },
        { id: "d-1", kind: "decision", title: "Choose handoff scope", detail: "Unconfirmed decision" },
        { id: "n-1", kind: "nextAction", title: "Draft client-safe report", detail: "Pending action" },
        { id: "i-2", kind: "issue", title: "Resolve edge case", detail: "Open issue" },
      ],
    });

    expect(viewModel.unresolved.total).toBe(4);
    expect(viewModel.unresolved.preview.map((item) => item.id)).toEqual(["i-1", "d-1", "n-1"]);
    expect(viewModel.unresolved.hiddenCount).toBe(1);
  });

  it("previews attention-level memories with a top-3 cap and hidden count", () => {
    const viewModel = buildSessionWrapUp({
      ...base,
      acceptedMemoryCount: 5,
      staleMemoryCount: 3,
      contradictedMemoryCount: 2,
      attentionMemories: [
        { id: "m-1", title: "Stale memory 1", status: "stale" },
        { id: "m-2", title: "Stale memory 2", status: "stale" },
        { id: "m-3", title: "Contradicted memory 1", status: "contradicted" },
        { id: "m-4", title: "Stale memory 3", status: "stale" },
        { id: "m-5", title: "Contradicted memory 2", status: "contradicted" },
      ],
    });

    expect(viewModel.attentionMemories.total).toBe(5);
    expect(viewModel.attentionMemories.preview.map((item) => item.id)).toEqual([
      "m-1",
      "m-2",
      "m-3",
    ]);
    expect(viewModel.attentionMemories.hiddenCount).toBe(2);
  });

  it("returns an empty attention-memory preview when no records are supplied", () => {
    const viewModel = buildSessionWrapUp(base);
    expect(viewModel.attentionMemories).toEqual({
      total: 0,
      preview: [],
      hiddenCount: 0,
    });
  });
});
