import { describe, expect, it } from "vitest";
import { deriveSessionLifecycle, formatSessionDuration, getSessionStorageScope } from "./sessionLifecycle";
import type { MoriSessionState, SessionViewModel } from "./sessionStore";
import type { Session } from "../domain/types";
import { DEFAULT_QUICK_PASS_SETTINGS } from "../lib/analysis";
import { createStaticMockDataSource } from "../lib/session/timelineDataSource";

function buildState(overrides: Partial<MoriSessionState> = {}): MoriSessionState {
  return {
    initialized: true,
    draft: null,
    pendingNewSession: null,
    imports: [],
    analysis: null,
    analysisStatus: "idle",
    analysisError: null,
    analysisProviderLabel: null,
    analysisFallbackUsed: false,
    analysisSettings: DEFAULT_QUICK_PASS_SETTINGS,
    source: "demo",
    dataSource: createStaticMockDataSource<SessionViewModel>({} as SessionViewModel),
    subscribeToDataSource: () => () => undefined,
    hydrate: async () => undefined,
    setDraft: () => undefined,
    addImport: () => null,
    importAsNewSession: () => ({ sessionId: "", candidate: { source: {} as never, events: [] } }),
    commitPendingNewSession: () => undefined,
    abandonPendingNewSessionIfEmpty: () => false,
    removeImport: () => undefined,
    resetToDemo: () => undefined,
    runQuickPass: async () => null,
    clearAnalysis: () => undefined,
    updateAnalysisSettings: () => DEFAULT_QUICK_PASS_SETTINGS,
    loadDesktopSession: async () => false,
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
    markPersistedToDesktop: () => undefined,
    ...overrides,
  };
}

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    projectId: "project-1",
    title: "Test session",
    startedAt: "2026-05-14T09:00:00Z",
    endedAt: "",
    recordingMode: "summary",
    llmProvider: "ollama",
    llmModel: "llama3.1:8b",
    storageLocation: "~/Mori/Records",
    selectedSourceIds: [],
    status: "recording",
    ...overrides,
  };
}

describe("deriveSessionLifecycle", () => {
  it("returns the demo lifecycle when no draft exists", () => {
    const state = buildState();
    const snap = deriveSessionLifecycle(state);
    expect(snap.isDemo).toBe(true);
    expect(snap.storageScope).toBe("demo");
    expect(snap.storageScopeLabel).toBe("Demo");
    expect(snap.isLive).toBe(false);
  });

  it("marks active draft sessions as live + browser-draft", () => {
    const state = buildState({
      draft: {
        adapter: "browser-local-storage",
        savedAt: "2026-05-14T09:00:00Z",
        session: buildSession({ status: "recording" }),
        project: {
          id: "p1",
          name: "Test",
          description: "",
          createdAt: "",
          updatedAt: "",
        },
      },
      source: "browser-draft",
    });
    const snap = deriveSessionLifecycle(state, {
      now: new Date("2026-05-14T09:05:00Z").getTime(),
    });
    expect(snap.isLive).toBe(true);
    expect(snap.storageScope).toBe("browser-draft");
    expect(snap.storageScopeLabel).toBe("Browser Draft");
  });

  it("switches to desktop-sqlite when the store reports it", () => {
    const state = buildState({
      draft: {
        adapter: "browser-local-storage",
        savedAt: "2026-05-14T09:00:00Z",
        session: buildSession({ status: "recording" }),
        project: { id: "p1", name: "Test", description: "", createdAt: "", updatedAt: "" },
      },
      source: "desktop-sqlite",
    });
    const snap = deriveSessionLifecycle(state, {
      now: new Date("2026-05-14T09:05:00Z").getTime(),
    });
    expect(getSessionStorageScope(snap)).toBe("desktop-sqlite");
  });

  it("flips to ended scope once the timing snapshot says the session ended", () => {
    const state = buildState({
      draft: {
        savedAt: "2026-05-14T09:00:00Z",
        session: buildSession({
          status: "complete",
          startedAt: "2026-05-14T09:00:00Z",
          endedAt: "2026-05-14T09:45:00Z",
        }),
        project: { id: "p1", name: "Test", description: "", createdAt: "", updatedAt: "" },
        adapter: "browser-local-storage",
      },
      source: "browser-draft",
    });
    const snap = deriveSessionLifecycle(state, {
      now: new Date("2026-05-14T10:00:00Z").getTime(),
    });
    expect(snap.storageScope).toBe("ended");
    expect(snap.timing.state).toBe("ended");
  });

  it("re-exports duration label", () => {
    const state = buildState();
    const snap = deriveSessionLifecycle(state);
    expect(formatSessionDuration(snap)).toBe(snap.timing.durationLabel);
  });
});
