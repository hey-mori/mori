import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  selectHasRealAnalysis,
  setSessionPersistenceServiceForSessionStore,
  setSessionRepositoryForTesting,
  useMoriSessionStore,
} from "./sessionStore";
import { createSessionDraft } from "../lib/session/createSessionDraft";
import { normalizeManualNote } from "../lib/import";
import { BrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import { MemoryKeyValueStorage } from "../lib/storage/memoryStorage";
import type { MoriAnalysisProvider, MoriAnalysisResult } from "../lib/analysis";
import { DEFAULT_QUICK_PASS_SETTINGS } from "../lib/analysis";
import { moriMockSession } from "../domain/mock-data";
import { SessionPersistenceService } from "../lib/storage/sessionPersistenceService";
import { createSqlitePersistenceSnapshot } from "../lib/sqlite";

const fixedNow = "2026-05-12T13:00:00+09:00";

function buildProvider(name: MoriAnalysisProvider["name"], opts: { fail?: boolean; label?: string } = {}): MoriAnalysisProvider {
  return {
    name,
    label: opts.label ?? name,
    requiresNetwork: name === "ollama-quick-pass-v1",
    async analyze(input): Promise<MoriAnalysisResult> {
      if (opts.fail) throw new Error("provider boom");
      const runId = `run-${name}-${input.session.id}`;
      return {
        runId,
        providerName: name,
        providerLabel: opts.label ?? name,
        sessionId: input.session.id,
        projectId: input.project.id,
        generatedAt: fixedNow,
        durationMs: 1,
        inputEventCount: input.events.length,
        inputSourceCount: input.sources.length,
        summary: { sessionSummary: `from ${name}`, resumePrompt: "prompt", highlights: [] },
        issues: [],
        decisions: [],
        relationships: [],
        nextActions: [],
        rendered: {
          summary: {
            id: `summary-${runId}`,
            sessionId: input.session.id,
            sessionSummary: `from ${name}`,
            resumePrompt: "prompt",
            reportMarkdown: "",
            nextActionIds: [],
            generatedAt: fixedNow,
          },
        },
        confidence: 0.5,
        notes: [],
      };
    },
  };
}

function resetStore() {
  useMoriSessionStore.setState({
    initialized: false,
    draft: null,
    imports: [],
    analysis: null,
    analysisStatus: "idle",
    analysisError: null,
    analysisProviderLabel: null,
    analysisFallbackUsed: false,
    analysisSettings: { ...DEFAULT_QUICK_PASS_SETTINGS },
    source: "demo",
  });
}

describe("useMoriSessionStore Quick Pass provider flow", () => {
  beforeEach(() => {
    const storage = new MemoryKeyValueStorage();
    const repository = new BrowserDraftRepository(storage);
    setSessionRepositoryForTesting(repository);
    setSessionPersistenceServiceForSessionStore(
      new SessionPersistenceService({ runtime: "browser", repository }),
    );
    resetStore();
  });

  afterEach(() => {
    setSessionRepositoryForTesting(null);
    setSessionPersistenceServiceForSessionStore(null);
    resetStore();
  });

  function seedDraftWithImport() {
    const draft = useMoriSessionStore.getState();
    const builtDraft = createSessionDraft({
      sessionTitle: "Quick Pass test",
      projectName: "QP Project",
      selectedSources: [],
      recordingMode: "summary",
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
      storageLocation: "~/Mori/Records",
      now: fixedNow,
    });
    const stored = {
      ...builtDraft,
      savedAt: fixedNow,
      adapter: "browser-local-storage" as const,
    };
    draft.setDraft(stored);

    const note = normalizeManualNote({
      projectId: stored.project.id,
      sessionId: stored.session.id,
      title: "Risk",
      note: "위험: token rotation 미정. TODO: rotate.",
      capturedAt: fixedNow,
    });
    useMoriSessionStore.getState().addImport(note);
  }

  it("persists provider settings through the repository boundary", async () => {
    const next = useMoriSessionStore.getState().updateAnalysisSettings({
      provider: "ollama",
      ollamaEndpoint: "http://localhost:9999",
      fallbackToDeterministic: false,
    });
    expect(next.provider).toBe("ollama");

    resetStore();
    await useMoriSessionStore.getState().hydrate();
    const hydrated = useMoriSessionStore.getState().analysisSettings;
    expect(hydrated.provider).toBe("ollama");
    expect(hydrated.ollamaEndpoint).toBe("http://localhost:9999");
    expect(hydrated.fallbackToDeterministic).toBe(false);
  });

  it("falls back to deterministic when Ollama fails and fallback is enabled", async () => {
    seedDraftWithImport();
    useMoriSessionStore.getState().updateAnalysisSettings({ provider: "ollama" });

    const failingOllama = buildProvider("ollama-quick-pass-v1", { fail: true, label: "Ollama fail" });
    useMoriSessionStore.setState({ analysisSettings: { ...useMoriSessionStore.getState().analysisSettings, fallbackToDeterministic: true } });

    // The store reads provider config from settings, not direct injection. To test
    // fallback we monkey-patch resolveProviderFromSettings via passing primary explicitly.
    const result = await useMoriSessionStore.getState().runQuickPass(failingOllama);

    expect(result).not.toBeNull();
    const state = useMoriSessionStore.getState();
    expect(state.analysisStatus).toBe("succeeded");
    expect(state.analysisFallbackUsed).toBe(true);
    expect(state.analysis?.providerName).toBe("deterministic-heuristic-v1");
    expect(state.analysis?.notes.some((note) => note.includes("Fell back"))).toBe(true);
  });

  it("surfaces the error and does not pretend success when fallback is disabled", async () => {
    seedDraftWithImport();
    useMoriSessionStore.getState().updateAnalysisSettings({ provider: "ollama", fallbackToDeterministic: false });

    const failingOllama = buildProvider("ollama-quick-pass-v1", { fail: true, label: "Ollama fail" });
    const result = await useMoriSessionStore.getState().runQuickPass(failingOllama);

    expect(result).toBeNull();
    const state = useMoriSessionStore.getState();
    expect(state.analysisStatus).toBe("failed");
    expect(state.analysisFallbackUsed).toBe(false);
    expect(state.analysisError).toContain("provider boom");
    expect(selectHasRealAnalysis(state)).toBe(false);
  });

  it("succeeds without fallback when the chosen provider works", async () => {
    seedDraftWithImport();
    useMoriSessionStore.getState().updateAnalysisSettings({ provider: "ollama" });

    const workingOllama = buildProvider("ollama-quick-pass-v1", { label: "Ollama ok" });
    const result = await useMoriSessionStore.getState().runQuickPass(workingOllama);

    expect(result).not.toBeNull();
    const state = useMoriSessionStore.getState();
    expect(state.analysisStatus).toBe("succeeded");
    expect(state.analysisFallbackUsed).toBe(false);
    expect(state.analysis?.providerName).toBe("ollama-quick-pass-v1");
    expect(state.analysisProviderLabel).toBe("Ollama ok");
  });
});

describe("useMoriSessionStore desktop persistence", () => {
  beforeEach(() => {
    const storage = new MemoryKeyValueStorage();
    const repository = new BrowserDraftRepository(storage);
    setSessionRepositoryForTesting(repository);
    const service = new SessionPersistenceService({
      runtime: "desktop",
      repository,
      commands: {
        getSqliteMigrationStatus: async () => ({
          path: "/tmp/mori.sqlite",
          initialized: true,
          appliedMigrations: ["001"],
          pendingMigrations: [],
          migrationTableName: "_mori_migrations",
          strategy: "rusqlite-custom-runner",
          tables: [],
          migrationRecords: [],
        }),
        initializeSqliteDatabase: async () => ({
          path: "/tmp/mori.sqlite",
          initialized: true,
          appliedMigrations: ["001"],
          pendingMigrations: [],
          migrationTableName: "_mori_migrations",
          strategy: "rusqlite-custom-runner",
          tables: [],
          migrationRecords: [],
        }),
        persistSessionSnapshot: async ({ snapshot }) => ({
          sessionId: snapshot.sessions[0]?.id ?? "",
          projectId: snapshot.projects[0]?.id ?? "",
          eventsPersisted: snapshot.events.length,
          sourcesPersisted: snapshot.sources.length,
          issuesPersisted: snapshot.issues.length,
          decisionsPersisted: snapshot.decisions.length,
        }),
        loadSqliteSessionSnapshot: async () => createSqlitePersistenceSnapshot(moriMockSession),
        listSqliteSessions: async () => ({ sessions: [] }),
      },
    });
    setSessionPersistenceServiceForSessionStore(service);
    resetStore();
  });

  afterEach(() => {
    setSessionRepositoryForTesting(null);
    setSessionPersistenceServiceForSessionStore(null);
    resetStore();
  });

  it("loads a saved SQLite session into the active session view", async () => {
    const loaded = await useMoriSessionStore.getState().loadDesktopSession(moriMockSession.session.id);
    expect(loaded).toBe(true);

    const state = useMoriSessionStore.getState();
    expect(state.draft?.session.id).toBe(moriMockSession.session.id);
    expect(state.imports.length).toBe(moriMockSession.sources.length);
    expect(state.source).toBe("desktop-sqlite");
  });

  it("marks the active session as desktop SQLite after an explicit persist", () => {
    useMoriSessionStore.setState({
      draft: {
        project: moriMockSession.project,
        session: moriMockSession.session,
        savedAt: fixedNow,
        adapter: "browser-local-storage",
      },
      source: "browser-draft",
    });
    useMoriSessionStore.getState().markPersistedToDesktop();
    expect(useMoriSessionStore.getState().source).toBe("desktop-sqlite");
  });

  it("returns false from loadDesktopSession when running in browser mode", async () => {
    const browserService = new SessionPersistenceService({
      runtime: "browser",
      repository: new BrowserDraftRepository(new MemoryKeyValueStorage()),
    });
    setSessionPersistenceServiceForSessionStore(browserService);
    const loaded = await useMoriSessionStore.getState().loadDesktopSession("sess-anything");
    expect(loaded).toBe(false);
    expect(useMoriSessionStore.getState().source).toBe("demo");
  });
});

describe("useMoriSessionStore loadBrowserSession", () => {
  let repository: BrowserDraftRepository;

  beforeEach(() => {
    repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    setSessionRepositoryForTesting(repository);
    setSessionPersistenceServiceForSessionStore(
      new SessionPersistenceService({ runtime: "browser", repository }),
    );
    resetStore();
  });

  afterEach(() => {
    setSessionRepositoryForTesting(null);
    setSessionPersistenceServiceForSessionStore(null);
    resetStore();
  });

  function seedSession(title: string, now: string) {
    return repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: title,
        projectName: "Browser Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now,
      }),
    );
  }

  it("opens a previously saved browser session as the active session", () => {
    const earlier = seedSession("Earlier session", "2026-05-12T13:00:00+09:00");
    repository.addSessionImport(
      earlier.session.id,
      normalizeManualNote({
        projectId: earlier.project.id,
        sessionId: earlier.session.id,
        title: "Note",
        note: "earlier work",
        capturedAt: "2026-05-12T13:05:00+09:00",
      }),
    );
    seedSession("Later session", "2026-05-12T15:00:00+09:00");

    const opened = useMoriSessionStore.getState().loadBrowserSession(earlier.session.id);

    expect(opened).toBe(true);
    const state = useMoriSessionStore.getState();
    expect(state.draft?.session.id).toBe(earlier.session.id);
    expect(state.source).toBe("browser-draft");
    expect(state.imports).toHaveLength(1);
    expect(repository.loadCurrentSessionDraft()?.session.id).toBe(earlier.session.id);
  });

  it("returns false for an unknown session id and leaves the store untouched", () => {
    const opened = useMoriSessionStore.getState().loadBrowserSession("missing-session");
    expect(opened).toBe(false);
    expect(useMoriSessionStore.getState().source).toBe("demo");
    expect(useMoriSessionStore.getState().draft).toBeNull();
  });
});

describe("useMoriSessionStore setNextActionCompletion", () => {
  let repository: BrowserDraftRepository;

  beforeEach(() => {
    repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    setSessionRepositoryForTesting(repository);
    setSessionPersistenceServiceForSessionStore(
      new SessionPersistenceService({ runtime: "browser", repository }),
    );
    resetStore();
  });

  afterEach(() => {
    setSessionRepositoryForTesting(null);
    setSessionPersistenceServiceForSessionStore(null);
    resetStore();
  });

  function seedAnalysisWithNextAction() {
    const built = createSessionDraft({
      sessionTitle: "Next action session",
      projectName: "NA Project",
      selectedSources: [],
      recordingMode: "summary",
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
      storageLocation: "~/Mori/Records",
      now: fixedNow,
    });
    const stored = { ...built, savedAt: fixedNow, adapter: "browser-local-storage" as const };
    useMoriSessionStore.getState().setDraft(stored);

    const analysis: MoriAnalysisResult = {
      runId: "run-na",
      providerName: "deterministic-heuristic-v1",
      providerLabel: "Deterministic",
      sessionId: stored.session.id,
      projectId: stored.project.id,
      generatedAt: fixedNow,
      durationMs: 1,
      inputEventCount: 0,
      inputSourceCount: 0,
      summary: { sessionSummary: "s", resumePrompt: "p", highlights: [] },
      issues: [],
      decisions: [],
      relationships: [],
      nextActions: [
        {
          id: "na-1",
          sessionId: stored.session.id,
          title: "Wire the API",
          priority: "high",
          relatedIssueIds: [],
          relatedEventIds: [],
        },
      ],
      rendered: {
        summary: {
          id: "summary-run-na",
          sessionId: stored.session.id,
          sessionSummary: "s",
          resumePrompt: "p",
          reportMarkdown: "",
          nextActionIds: ["na-1"],
          generatedAt: fixedNow,
        },
      },
      confidence: 0.5,
      notes: [],
    };
    useMoriSessionStore.setState({ analysis, analysisStatus: "succeeded" });
    return stored;
  }

  it("marks a next action complete and persists it to the analysis store", () => {
    const stored = seedAnalysisWithNextAction();
    const ok = useMoriSessionStore.getState().setNextActionCompletion("na-1", true);

    expect(ok).toBe(true);
    const action = useMoriSessionStore.getState().analysis!.nextActions[0]!;
    expect(action.done).toBe(true);
    expect(action.completedAt).toBeTruthy();
    expect(
      repository.loadSessionAnalysis(stored.session.id)?.result.nextActions[0]?.done,
    ).toBe(true);
  });

  it("reopens a completed next action and clears completedAt", () => {
    seedAnalysisWithNextAction();
    useMoriSessionStore.getState().setNextActionCompletion("na-1", true);
    useMoriSessionStore.getState().setNextActionCompletion("na-1", false);

    const action = useMoriSessionStore.getState().analysis!.nextActions[0]!;
    expect(action.done).toBe(false);
    expect(action.completedAt).toBeUndefined();
  });

  it("returns false with no draft or analysis", () => {
    expect(useMoriSessionStore.getState().setNextActionCompletion("na-1", true)).toBe(false);
  });

  it("returns false for an unknown next action id", () => {
    seedAnalysisWithNextAction();
    expect(
      useMoriSessionStore.getState().setNextActionCompletion("missing", true),
    ).toBe(false);
  });
});

describe("useMoriSessionStore setIssueStatus", () => {
  let repository: BrowserDraftRepository;

  beforeEach(() => {
    repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    setSessionRepositoryForTesting(repository);
    setSessionPersistenceServiceForSessionStore(
      new SessionPersistenceService({ runtime: "browser", repository }),
    );
    resetStore();
  });

  afterEach(() => {
    setSessionRepositoryForTesting(null);
    setSessionPersistenceServiceForSessionStore(null);
    resetStore();
  });

  function seedAnalysisWithIssue() {
    const built = createSessionDraft({
      sessionTitle: "Issue status session",
      projectName: "IS Project",
      selectedSources: [],
      recordingMode: "summary",
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
      storageLocation: "~/Mori/Records",
      now: fixedNow,
    });
    const stored = { ...built, savedAt: fixedNow, adapter: "browser-local-storage" as const };
    useMoriSessionStore.getState().setDraft(stored);

    const analysis: MoriAnalysisResult = {
      runId: "run-is",
      providerName: "deterministic-heuristic-v1",
      providerLabel: "Deterministic",
      sessionId: stored.session.id,
      projectId: stored.project.id,
      generatedAt: fixedNow,
      durationMs: 1,
      inputEventCount: 0,
      inputSourceCount: 0,
      summary: { sessionSummary: "s", resumePrompt: "p", highlights: [] },
      issues: [
        {
          ...moriMockSession.issues[0]!,
          id: "iss-1",
          sessionId: stored.session.id,
          status: "open",
        },
      ],
      decisions: [],
      relationships: [],
      nextActions: [],
      rendered: {
        summary: {
          id: "summary-run-is",
          sessionId: stored.session.id,
          sessionSummary: "s",
          resumePrompt: "p",
          reportMarkdown: "",
          nextActionIds: [],
          generatedAt: fixedNow,
        },
      },
      confidence: 0.5,
      notes: [],
    };
    useMoriSessionStore.setState({ analysis, analysisStatus: "succeeded" });
    return stored;
  }

  it("changes an issue status and persists it to the analysis store", () => {
    const stored = seedAnalysisWithIssue();
    const ok = useMoriSessionStore.getState().setIssueStatus("iss-1", "resolved");

    expect(ok).toBe(true);
    expect(useMoriSessionStore.getState().analysis!.issues[0]!.status).toBe("resolved");
    expect(
      repository.loadSessionAnalysis(stored.session.id)?.result.issues[0]?.status,
    ).toBe("resolved");
  });

  it("returns false with no draft or analysis", () => {
    expect(useMoriSessionStore.getState().setIssueStatus("iss-1", "resolved")).toBe(false);
  });

  it("returns false for an unknown issue id", () => {
    seedAnalysisWithIssue();
    expect(useMoriSessionStore.getState().setIssueStatus("missing", "resolved")).toBe(
      false,
    );
  });
});

describe("useMoriSessionStore endSession", () => {
  let repository: BrowserDraftRepository;

  beforeEach(() => {
    repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    setSessionRepositoryForTesting(repository);
    setSessionPersistenceServiceForSessionStore(
      new SessionPersistenceService({ runtime: "browser", repository }),
    );
    resetStore();
  });

  afterEach(() => {
    setSessionRepositoryForTesting(null);
    setSessionPersistenceServiceForSessionStore(null);
    resetStore();
  });

  function seedRecordingDraft() {
    const built = createSessionDraft({
      sessionTitle: "End session test",
      projectName: "ES Project",
      selectedSources: [],
      recordingMode: "summary",
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
      storageLocation: "browser:localStorage",
      now: fixedNow,
    });
    useMoriSessionStore.getState().setDraft({
      ...built,
      savedAt: fixedNow,
      adapter: "browser-local-storage" as const,
    });
  }

  it("marks a recording session complete with a real end timestamp", () => {
    seedRecordingDraft();
    expect(useMoriSessionStore.getState().draft?.session.status).toBe("recording");

    useMoriSessionStore.getState().endSession();

    const session = useMoriSessionStore.getState().draft?.session;
    expect(session?.status).toBe("complete");
    expect(session?.endedAt).toBeTruthy();
    expect(new Date(session!.endedAt).getTime()).toBeGreaterThan(
      new Date(fixedNow).getTime(),
    );
  });

  it("persists the completed session to the repository", () => {
    seedRecordingDraft();
    useMoriSessionStore.getState().endSession();

    expect(repository.loadCurrentSessionDraft()?.session.status).toBe("complete");
  });

  it("is a no-op in demo mode with no draft", () => {
    expect(useMoriSessionStore.getState().draft).toBeNull();
    useMoriSessionStore.getState().endSession();
    expect(useMoriSessionStore.getState().draft).toBeNull();
  });

  it("is idempotent — a second call leaves the end timestamp unchanged", () => {
    seedRecordingDraft();
    useMoriSessionStore.getState().endSession();
    const firstEnd = useMoriSessionStore.getState().draft?.session.endedAt;

    useMoriSessionStore.getState().endSession();

    expect(useMoriSessionStore.getState().draft?.session.endedAt).toBe(firstEnd);
  });
});
