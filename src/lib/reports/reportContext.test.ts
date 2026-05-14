import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import { deriveReportContext, getReportSelectionDefaults } from "./reportContext";

describe("deriveReportContext", () => {
  it("returns the demo data basis when isDemoSession is true", () => {
    const ctx = deriveReportContext({ view: moriMockSession, analysis: null, isDemoSession: true });
    expect(ctx.dataBasis).toBe("demo");
    expect(ctx.dataBasisLabel).toBe("Demo data");
    expect(ctx.dataBasisTone).toBe("purple");
  });

  it("returns imports-only when sources exist but no analysis", () => {
    const ctx = deriveReportContext({ view: moriMockSession, analysis: null, isDemoSession: false });
    expect(ctx.dataBasis).toBe("imports-only");
    expect(ctx.dataBasisTone).toBe("blue");
  });

  it("returns imports-plus-analysis with provider label when analysis is present", () => {
    const analysis: import("../analysis").MoriAnalysisResult = {
      runId: "run-1",
      providerName: "ollama-quick-pass-v1",
      providerLabel: "Ollama (llama3.1:8b)",
      sessionId: moriMockSession.session.id,
      projectId: moriMockSession.session.projectId,
      generatedAt: "2026-05-14T10:00:00Z",
      durationMs: 1200,
      inputEventCount: 0,
      inputSourceCount: 0,
      summary: {
        sessionSummary: "summary",
        resumePrompt: "resume",
        highlights: [],
      },
      issues: [],
      decisions: [],
      relationships: [],
      nextActions: [],
      rendered: {
        summary: {
          id: "summary-1",
          sessionId: moriMockSession.session.id,
          sessionSummary: "summary",
          resumePrompt: "resume",
          reportMarkdown: "",
          nextActionIds: [],
          generatedAt: "2026-05-14T10:00:00Z",
        },
      },
      confidence: 0.9,
      notes: [],
    };
    const ctx = deriveReportContext({
      view: moriMockSession,
      analysis,
      isDemoSession: false,
    });
    expect(ctx.dataBasis).toBe("imports-plus-analysis");
    expect(ctx.analysisProviderLabel).toContain("Ollama");
    expect(ctx.dataBasisLabel).toMatch(/Ollama/);
  });
});

describe("getReportSelectionDefaults", () => {
  it("returns the configured defaults for the chosen report type", () => {
    const state = getReportSelectionDefaults("clientSafe");
    expect(state.type).toBe("clientSafe");
    expect(state.defaultPrivacy.clientSafe).toBe(true);
    expect(state.defaultSections.has("decisions")).toBe(true);
  });

  it("falls back to the first report type for an unknown id", () => {
    // @ts-expect-error — exercise the safe fallback
    const state = getReportSelectionDefaults("unknown-id");
    expect(state.type).toBe("personalRetrospective");
  });
});
