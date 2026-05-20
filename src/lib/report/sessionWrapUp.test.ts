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
});
