import { describe, it, expect } from "vitest";
import { deriveSessionStatus } from "./sessionStatus";
import type { MoriSessionState } from "../../app/sessionStore";

const createMockState = (overrides?: Partial<MoriSessionState>): MoriSessionState => ({
  initialized: true,
  draft: null,
  imports: [],
  analysis: null,
  analysisStatus: "idle",
  analysisError: null,
  analysisProviderLabel: null,
  analysisFallbackUsed: false,
  analysisSettings: {
    provider: "deterministic",
    fallbackToDeterministic: true,
    ollamaEndpoint: "http://localhost:11434",
    ollamaModel: "llama3.1:8b",
    ollamaTimeoutMs: 30000,
  },
  source: "demo",
  hydrate: async () => {},
  setDraft: () => {},
  endSession: () => {},
  addImport: () => null,
  removeImport: () => {},
  resetToDemo: () => {},
  runQuickPass: async () => null,
  clearAnalysis: () => {},
  updateAnalysisSettings: () => ({ provider: "deterministic", fallbackToDeterministic: true, ollamaEndpoint: "", ollamaModel: "", ollamaTimeoutMs: 30000 }),
  loadDesktopSession: async () => false,
  loadBrowserSession: () => false,
  setNextActionCompletion: () => false,
  setIssueStatus: () => false,
  markPersistedToDesktop: () => {},
  ...overrides,
});

describe("deriveSessionStatus", () => {
  it("derives demo session status correctly", () => {
    const state = createMockState({ source: "demo", draft: null });
    const status = deriveSessionStatus(state);
    
    expect(status.isDemoSession).toBe(true);
    expect(status.isDraftSession).toBe(false);
    expect(status.isDesktopSqliteBacked).toBe(false);
    expect(status.sourceLabel).toBe("Demo");
    expect(status.sourceTone).toBe("purple");
    expect(status.hasAnalysis).toBe(false);
    expect(status.dataBasisLabel).toBe("Demo data");
  });
  
  it("derives browser draft session status", () => {
    const state = createMockState({
      source: "browser-draft",
      draft: { session: { id: "s1" } } as any,
      imports: [{} as any, {} as any],
    });
    const status = deriveSessionStatus(state);
    
    expect(status.isDemoSession).toBe(false);
    expect(status.isDraftSession).toBe(true);
    expect(status.isDesktopSqliteBacked).toBe(false);
    expect(status.sourceLabel).toBe("Browser Draft");
    expect(status.sourceTone).toBe("blue");
    expect(status.importCount).toBe(2);
  });
  
  it("derives desktop SQLite session status", () => {
    const state = createMockState({
      source: "desktop-sqlite",
      draft: { session: { id: "s1" } } as any,
    });
    const status = deriveSessionStatus(state);
    
    expect(status.isDesktopSqliteBacked).toBe(true);
    expect(status.sourceLabel).toBe("Desktop SQLite");
    expect(status.sourceTone).toBe("green");
  });
  
  it("derives analysis status - idle with no analysis", () => {
    const state = createMockState({ analysisStatus: "idle", analysis: null });
    const status = deriveSessionStatus(state);

    expect(status.hasAnalysis).toBe(false);
  });

  it("derives analysis status - succeeded", () => {
    const state = createMockState({
      draft: { session: { id: "s1" } } as any,
      analysis: { issues: [], decisions: [], nextActions: [] } as any,
      analysisStatus: "succeeded",
      analysisProviderLabel: "Deterministic",
    });
    const status = deriveSessionStatus(state);
    
    expect(status.hasAnalysis).toBe(true);
    expect(status.analysisProviderLabel).toBe("Deterministic");
  });
  
  it("derives data basis for reports - demo", () => {
    const state = createMockState({ source: "demo", draft: null });
    const status = deriveSessionStatus(state);
    
    expect(status.dataBasisLabel).toBe("Demo data");
    expect(status.dataBasisTone).toBe("purple");
  });
  
  it("derives data basis for reports - analysis available", () => {
    const state = createMockState({
      draft: { session: { id: "s1" } } as any,
      analysis: { issues: [], decisions: [], nextActions: [] } as any,
      analysisProviderLabel: "Ollama",
    });
    const status = deriveSessionStatus(state);
    
    expect(status.dataBasisLabel).toBe("Ollama analysis");
    expect(status.dataBasisTone).toBe("green");
  });
  
  it("derives data basis for reports - imports only", () => {
    const state = createMockState({
      draft: { session: { id: "s1" } } as any,
      analysis: null,
      imports: [{} as any],
    });
    const status = deriveSessionStatus(state);
    
    expect(status.dataBasisLabel).toBe("Imported data (no analysis)");
    expect(status.dataBasisTone).toBe("blue");
  });
  
  it("includes view counts when provided", () => {
    const state = createMockState();
    const status = deriveSessionStatus(state, {
      sourceCount: 5,
      eventCount: 12,
      issueCount: 3,
      decisionCount: 2,
      nextActionCount: 4,
    });
    
    expect(status.sourceCount).toBe(5);
    expect(status.eventCount).toBe(12);
    expect(status.issueCount).toBe(3);
    expect(status.decisionCount).toBe(2);
    expect(status.nextActionCount).toBe(4);
  });
});
