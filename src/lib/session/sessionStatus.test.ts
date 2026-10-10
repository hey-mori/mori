import { describe, it, expect } from "vitest";
import { deriveSessionStatus } from "./sessionStatus";
import type { SessionState, SessionViewModel } from "../../app/sessionStore";
import { createStaticMockDataSource } from "./timelineDataSource";
import { DEFAULT_QUICK_PASS_SETTINGS } from "../analysis";
import { initialFollowState } from "../live-follow";

const createMockState = (overrides?: Partial<SessionState>): SessionState => ({
  initialized: true,
  draft: null,
  demoSessionId: null,
  pendingNewSession: null,
  imports: [],
  pendingReview: null,
  lastApplied: null,
  analysis: null,
  analysisStatus: "idle",
  analysisError: null,
  analysisProviderLabel: null,
  analysisFallbackUsed: false,
  analysisSettings: { ...DEFAULT_QUICK_PASS_SETTINGS },
  requestAbstractions: {},
  requestDisclosureOverrides: {},
  follow: initialFollowState(),
  followNotifications: [],
  liveNotifications: [],
  importSyncNotifications: [],
  source: "demo",
  dataResetNonce: 0,
  sessionListNonce: 0,
  dataSource: createStaticMockDataSource<SessionViewModel>({} as SessionViewModel),
  subscribeToDataSource: () => () => undefined,
  hydrate: async () => {},
  setDraft: () => {},
  addImport: () => null,
  addImportBatch: () => [],
  importAsNewSession: () => ({ sessionId: "", candidate: { source: {} as never, events: [] } }),
  importAndOpenAsNewSession: () => ({ sessionId: "", firstEventId: null }),
  commitPendingNewSession: () => {},
  abandonPendingNewSessionIfEmpty: () => false,
  removeImport: () => {},
  savePendingReview: () => null,
  beginPendingReview: () => null,
  clearPendingReview: () => {},
  setPendingReviewItemStatus: () => {},
  setAllPendingReviewStatus: () => {},
  editPendingReviewEvent: () => {},
  applyPendingReview: () => ({ ok: false, reason: "" }),
  applyLensTransferReview: async () => ({ ok: false, reason: "" }),
  cancelPendingReview: () => {},
  clearLastApplied: () => {},
  resetToDemo: () => {},
  beginEmptySession: () => ({} as never),
  clearAllDataAndViewDemo: async () => ({ archivesLeft: 0, snapshotsLeft: 0, databaseCleared: true }),
  runQuickPass: async () => null,
  clearAnalysis: () => {},
  loadAnalysisRunHistory: () => null,
  selectAnalysisRun: () => false,
  generateRequestAbstraction: async () => false,
  setRequestDisclosureOverride: () => {},
  startFollow: () => {},
  applyFollowPoll: () => ({ shouldReanalyze: false, shouldNotify: false, newCount: 0 }),
  pushLiveNotification: () => {},
  pushImportSyncNotification: () => {},
  registerDiscoveredSessions: () => [],
  pruneAutoImportedSessions: () => [],
  pauseFollow: () => {},
  resumeFollow: () => {},
  stopFollow: () => {},
  setFollowError: () => {},
  updateAnalysisSettings: () => ({ ...DEFAULT_QUICK_PASS_SETTINGS }),
  loadAnalysisSettings: () => ({ ...DEFAULT_QUICK_PASS_SETTINGS }),
  loadDesktopSession: async () => false,
  openDiscoveredSession: async () => "missing" as const,
  recheckRestoredSource: async () => false,
  divergedSourceSessionId: null,
  sessionWindow: null,
  discoveredSessions: null,
  setDiscoveredSessions: () => {},
  unopenableSessionIds: new Set<string>(),
  noteSessionOpenable: () => {},
  loadEarlierSessionWindow: async () => {},
  loadNewerSessionWindow: async () => {},
  loadLatestSessionWindow: async () => {},
  sessionSearch: null,
  searchSessionWindow: async () => {},
  searchMoreSessionWindow: async () => {},
  cancelSessionSearch: () => {},
  closeSessionSearch: () => {},
  openSessionSearchHit: async () => {},
  openSessionAtSourceHit: async () => "superseded",
  openSessionAtLatestReply: async () => "superseded",
  openSessionAtPassage: async () => "superseded",
  loadBrowserSession: () => false,
  renameSession: () => false,
  setNextActionCompletion: () => false,
  promoteIssueToNextAction: () => null,
  setIssueStatus: () => false,
  editIssue: () => false,
  createIssueFromEvent: () => false,
  updateSessionEvent: () => false,
  splitSessionEvent: () => false,
  mergeSessionEvent: () => false,
  addEventRelationship: () => false,
  removeRelationship: () => false,
  setDecisionConfirmed: () => false,
  editDecision: () => false,
  editNextAction: () => false,
  markPersistedToDesktop: () => {},
  applyBackgroundAnalysis: () => {},
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
