import { describe, expect, it } from "vitest";
import type { MoriPackageExportPlan } from "./moriPackageExportPlan";
import { buildHandoffReadiness } from "./handoffReadiness";

const emptyPlan: MoriPackageExportPlan = {
  full: {
    sessions: 1,
    sources: 0,
    events: 0,
    issues: 0,
    decisions: 0,
    nextActions: 0,
    memories: 0,
    auditRows: 0,
    sensitiveMemories: 0,
  },
  clientSafe: {
    sessions: 1,
    sources: 0,
    events: 0,
    issues: 0,
    decisions: 0,
    nextActions: 0,
    memories: 0,
    auditRows: 0,
    droppedMemories: 0,
    droppedAuditRows: 0,
  },
};

const base = {
  sourceCount: 0,
  eventCount: 0,
  issueCount: 0,
  decisionCount: 0,
  nextActionCount: 0,
  hasAnalysis: false,
  analysisRunning: false,
  canRunQuickPass: false,
  acceptedMemoryCount: 0,
  staleMemoryCount: 0,
  contradictedMemoryCount: 0,
  resumePromptReady: false,
  exportPlan: emptyPlan,
};

describe("buildHandoffReadiness", () => {
  it("starts every output in a waiting state without evidence", () => {
    const model = buildHandoffReadiness(base);

    expect(model.items.map((item) => [item.id, item.status, item.action.id])).toEqual([
      ["resume", "waiting", "addEvidence"],
      ["report", "waiting", "addEvidence"],
      ["package", "waiting", "addEvidence"],
    ]);
  });

  it("asks for Quick Pass when evidence exists but review output does not", () => {
    const model = buildHandoffReadiness({
      ...base,
      sourceCount: 1,
      eventCount: 4,
      canRunQuickPass: true,
      exportPlan: {
        ...emptyPlan,
        full: { ...emptyPlan.full, sources: 1, events: 4 },
        clientSafe: { ...emptyPlan.clientSafe, sources: 1, events: 4 },
      },
    });

    expect(model.items.find((item) => item.id === "resume")).toMatchObject({
      status: "attention",
      action: { id: "runQuickPass", enabled: true },
    });
    expect(model.items.find((item) => item.id === "report")).toMatchObject({
      status: "attention",
      action: { id: "openReportBuilder" },
    });
    expect(model.items.find((item) => item.id === "package")?.status).toBe("ready");
  });

  it("marks resume and report ready after reviewed output exists", () => {
    const model = buildHandoffReadiness({
      ...base,
      sourceCount: 2,
      eventCount: 8,
      issueCount: 1,
      decisionCount: 2,
      nextActionCount: 3,
      hasAnalysis: true,
      acceptedMemoryCount: 2,
      resumePromptReady: true,
      exportPlan: {
        ...emptyPlan,
        full: { ...emptyPlan.full, sources: 2, events: 8, memories: 2, auditRows: 4 },
        clientSafe: { ...emptyPlan.clientSafe, sources: 2, events: 8, memories: 2, auditRows: 4 },
      },
    });

    expect(model.headline).toBe("인계 준비가 완료되었습니다");
    expect(model.items.find((item) => item.id === "resume")).toMatchObject({
      status: "ready",
      action: { id: "copyResume" },
    });
    expect(model.items.find((item) => item.id === "report")?.status).toBe("ready");
  });

  it("flags client-safe package exports when memory or audit rows will be omitted", () => {
    const model = buildHandoffReadiness({
      ...base,
      sourceCount: 2,
      eventCount: 8,
      hasAnalysis: true,
      resumePromptReady: true,
      acceptedMemoryCount: 3,
      exportPlan: {
        ...emptyPlan,
        full: { ...emptyPlan.full, sources: 2, events: 8, memories: 3, auditRows: 5 },
        clientSafe: {
          ...emptyPlan.clientSafe,
          sources: 2,
          events: 8,
          memories: 1,
          auditRows: 1,
          droppedMemories: 2,
          droppedAuditRows: 4,
        },
      },
    });

    const packageItem = model.items.find((item) => item.id === "package");
    expect(packageItem).toMatchObject({
      status: "attention",
      statusLabel: "안전 검토 필요",
      action: { id: "openPackageExport" },
    });
    expect(packageItem?.basis.join(" ")).toContain("2건 · 감사 4건 제외");
  });

  it("routes ready handoff outputs to memory-health review when accepted memory needs attention", () => {
    const model = buildHandoffReadiness({
      ...base,
      sourceCount: 2,
      eventCount: 8,
      issueCount: 1,
      decisionCount: 2,
      nextActionCount: 3,
      hasAnalysis: true,
      acceptedMemoryCount: 3,
      staleMemoryCount: 1,
      contradictedMemoryCount: 1,
      resumePromptReady: true,
      exportPlan: {
        ...emptyPlan,
        full: { ...emptyPlan.full, sources: 2, events: 8, memories: 3, auditRows: 4 },
        clientSafe: { ...emptyPlan.clientSafe, sources: 2, events: 8, memories: 3, auditRows: 4 },
      },
    });

    expect(model.detail).toContain("승인된 메모리 상태를 검토");
    expect(model.items.map((item) => [item.id, item.status, item.action.id])).toEqual([
      ["resume", "attention", "reviewMemoryHealth"],
      ["report", "attention", "reviewMemoryHealth"],
      ["package", "attention", "reviewMemoryHealth"],
    ]);
    expect(model.items.find((item) => item.id === "resume")?.basis.join(" ")).toContain(
      "승인된 메모리 2건에 라이프사이클 검토",
    );
  });
});
