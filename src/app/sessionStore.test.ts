import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  selectHasRealAnalysis,
  setSessionPersistenceServiceForSessionStore,
  setSessionRepositoryForTesting,
  useSessionStore,
} from "./sessionStore";
import { createSessionDraft } from "../lib/session/createSessionDraft";
import { normalizeManualNote } from "../lib/import";
import { createImportReviewDraft } from "../lib/review";
import { buildImportCandidateFromClaudeCodeSession } from "../lib/claude/claudeImport";
import type { ClaudeCodeSessionDetail } from "../lib/claude/types";
import { BrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import { MemoryKeyValueStorage } from "../lib/storage/memoryStorage";
import { initialFollowState } from "../lib/live-follow";
import type { AnalysisProvider, AnalysisResult } from "../lib/analysis";
import { DEFAULT_QUICK_PASS_SETTINGS } from "../lib/analysis";
import { mockSession } from "../domain/mock-data";
import { SessionPersistenceService } from "../lib/storage/sessionPersistenceService";
import { createSqlitePersistenceSnapshot } from "../lib/sqlite";

const fixedNow = "2026-05-12T13:00:00+09:00";

function buildProvider(name: AnalysisProvider["name"], opts: { fail?: boolean; label?: string } = {}): AnalysisProvider {
  return {
    name,
    label: opts.label ?? name,
    requiresNetwork: name !== "deterministic-heuristic-v1",
    async analyze(input): Promise<AnalysisResult> {
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
  useSessionStore.setState({
    initialized: false,
    draft: null,
    pendingNewSession: null,
    imports: [],
    pendingReview: null,
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
    source: "demo",
  });
}

describe("useSessionStore Quick Pass provider flow", () => {
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
    const draft = useSessionStore.getState();
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
    useSessionStore.getState().addImport(note);
  }

  it("persists provider settings through the repository boundary", async () => {
    const next = useSessionStore.getState().updateAnalysisSettings({
      provider: "ollama",
      ollamaEndpoint: "http://localhost:9999",
      fallbackToDeterministic: false,
    });
    expect(next.provider).toBe("ollama");

    resetStore();
    await useSessionStore.getState().hydrate();
    const hydrated = useSessionStore.getState().analysisSettings;
    expect(hydrated.provider).toBe("ollama");
    expect(hydrated.ollamaEndpoint).toBe("http://localhost:9999");
    expect(hydrated.fallbackToDeterministic).toBe(false);
  });

  it("falls back to deterministic when Ollama fails and fallback is enabled", async () => {
    seedDraftWithImport();
    useSessionStore.getState().updateAnalysisSettings({ provider: "ollama" });

    const failingOllama = buildProvider("ollama-quick-pass-v1", { fail: true, label: "Ollama fail" });
    useSessionStore.setState({ analysisSettings: { ...useSessionStore.getState().analysisSettings, fallbackToDeterministic: true } });

    // The store reads provider config from settings, not direct injection. To test
    // fallback we monkey-patch resolveProviderFromSettings via passing primary explicitly.
    const result = await useSessionStore.getState().runQuickPass(failingOllama);

    expect(result).not.toBeNull();
    const state = useSessionStore.getState();
    expect(state.analysisStatus).toBe("succeeded");
    expect(state.analysisFallbackUsed).toBe(true);
    expect(state.analysis?.providerName).toBe("deterministic-heuristic-v1");
    expect(state.analysis?.notes.some((note) => note.includes("Fell back"))).toBe(true);
  });

  it("surfaces the error and does not pretend success when fallback is disabled", async () => {
    seedDraftWithImport();
    useSessionStore.getState().updateAnalysisSettings({ provider: "ollama", fallbackToDeterministic: false });

    const failingOllama = buildProvider("ollama-quick-pass-v1", { fail: true, label: "Ollama fail" });
    const result = await useSessionStore.getState().runQuickPass(failingOllama);

    expect(result).toBeNull();
    const state = useSessionStore.getState();
    expect(state.analysisStatus).toBe("failed");
    expect(state.analysisFallbackUsed).toBe(false);
    expect(state.analysisError).toContain("provider boom");
    expect(selectHasRealAnalysis(state)).toBe(false);
  });

  it("succeeds without fallback when the chosen provider works", async () => {
    seedDraftWithImport();
    useSessionStore.getState().updateAnalysisSettings({ provider: "ollama" });

    const workingOllama = buildProvider("ollama-quick-pass-v1", { label: "Ollama ok" });
    const result = await useSessionStore.getState().runQuickPass(workingOllama);

    expect(result).not.toBeNull();
    const state = useSessionStore.getState();
    expect(state.analysisStatus).toBe("succeeded");
    expect(state.analysisFallbackUsed).toBe(false);
    expect(state.analysis?.providerName).toBe("ollama-quick-pass-v1");
    expect(state.analysisProviderLabel).toBe("Ollama ok");
  });

  it("falls back to deterministic when an OpenAI-compatible provider fails and fallback is enabled", async () => {
    seedDraftWithImport();
    useSessionStore.getState().updateAnalysisSettings({
      provider: "openAiCompatible",
      fallbackToDeterministic: true,
    });

    const failingProvider = buildProvider("openai-compatible-quick-pass-v1", {
      fail: true,
      label: "OpenAI-compatible fail",
    });
    const result = await useSessionStore.getState().runQuickPass(failingProvider);

    expect(result).not.toBeNull();
    const state = useSessionStore.getState();
    expect(state.analysisStatus).toBe("succeeded");
    expect(state.analysisFallbackUsed).toBe(true);
    expect(state.analysis?.providerName).toBe("deterministic-heuristic-v1");
  });

  it("uses the per-run engine override for the fallback decision, not the persisted settings", async () => {
    seedDraftWithImport();
    // Persisted engine is deterministic and would never fall back, but the
    // one-off run is an Ollama engine with fallback enabled.
    useSessionStore.getState().updateAnalysisSettings({ provider: "deterministic" });

    const failingOllama = buildProvider("ollama-quick-pass-v1", { fail: true, label: "Ollama once" });
    const overrideSettings = {
      ...DEFAULT_QUICK_PASS_SETTINGS,
      provider: "ollama" as const,
      fallbackToDeterministic: true,
    };
    const result = await useSessionStore.getState().runQuickPass(failingOllama, overrideSettings);

    expect(result).not.toBeNull();
    const state = useSessionStore.getState();
    expect(state.analysisStatus).toBe("succeeded");
    expect(state.analysisFallbackUsed).toBe(true);
    expect(state.analysis?.providerName).toBe("deterministic-heuristic-v1");
  });
});

describe("useSessionStore desktop persistence", () => {
  let desktopClearCalls = 0;
  beforeEach(() => {
    desktopClearCalls = 0;
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
        loadSqliteSessionSnapshot: async () => createSqlitePersistenceSnapshot(mockSession),
        listSqliteSessions: async () => ({ sessions: [] }),
        clearAllSqliteData: async () => {
          desktopClearCalls += 1;
          return {
            sessionsDeleted: 1,
            projectsDeleted: 1,
            sessionImportsDeleted: 0,
            consolidatedMemoriesDeleted: 0,
          };
        },
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
    const loaded = await useSessionStore.getState().loadDesktopSession(mockSession.session.id);
    expect(loaded).toBe(true);

    const state = useSessionStore.getState();
    expect(state.draft?.session.id).toBe(mockSession.session.id);
    expect(state.imports.length).toBe(mockSession.sources.length);
    expect(state.source).toBe("desktop-sqlite");
  });

  it("clearAllDataAndViewDemo wipes SQLite and returns to demo in desktop mode", async () => {
    const before = useSessionStore.getState().dataResetNonce;
    await useSessionStore.getState().clearAllDataAndViewDemo();

    expect(desktopClearCalls).toBe(1);
    const state = useSessionStore.getState();
    expect(state.draft).toBeNull();
    expect(state.source).toBe("demo");
    expect(state.dataResetNonce).toBe(before + 1);
  });

  it("marks the active session as desktop SQLite after an explicit persist", () => {
    useSessionStore.setState({
      draft: {
        project: mockSession.project,
        session: mockSession.session,
        savedAt: fixedNow,
        adapter: "browser-local-storage",
      },
      source: "browser-draft",
    });
    useSessionStore.getState().markPersistedToDesktop();
    expect(useSessionStore.getState().source).toBe("desktop-sqlite");
  });

  it("returns false from loadDesktopSession when running in browser mode", async () => {
    const browserService = new SessionPersistenceService({
      runtime: "browser",
      repository: new BrowserDraftRepository(new MemoryKeyValueStorage()),
    });
    setSessionPersistenceServiceForSessionStore(browserService);
    const loaded = await useSessionStore.getState().loadDesktopSession("sess-anything");
    expect(loaded).toBe(false);
    expect(useSessionStore.getState().source).toBe("demo");
  });
});

describe("useSessionStore loadBrowserSession", () => {
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

    const opened = useSessionStore.getState().loadBrowserSession(earlier.session.id);

    expect(opened).toBe(true);
    const state = useSessionStore.getState();
    expect(state.draft?.session.id).toBe(earlier.session.id);
    expect(state.source).toBe("browser-draft");
    expect(state.imports).toHaveLength(1);
    expect(repository.loadCurrentSessionDraft()?.session.id).toBe(earlier.session.id);
  });

  it("returns false for an unknown session id and leaves the store untouched", () => {
    const opened = useSessionStore.getState().loadBrowserSession("missing-session");
    expect(opened).toBe(false);
    expect(useSessionStore.getState().source).toBe("demo");
    expect(useSessionStore.getState().draft).toBeNull();
  });
});

describe("useSessionStore session lifecycle (rename)", () => {
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

  it("renames the active session and updates the in-memory draft", () => {
    const seeded = seedSession("원래 제목", "2026-05-12T13:00:00+09:00");
    useSessionStore.getState().loadBrowserSession(seeded.session.id);

    const ok = useSessionStore.getState().renameSession(seeded.session.id, "  새 제목  ");
    expect(ok).toBe(true);
    expect(useSessionStore.getState().draft?.session.title).toBe("새 제목");
    expect(repository.loadStoredSessionDraft(seeded.session.id)?.session.title).toBe("새 제목");
  });

  it("renames a background session without activating it", () => {
    const background = seedSession("배경 세션", "2026-05-12T13:00:00+09:00");
    const active = seedSession("활성 세션", "2026-05-12T15:00:00+09:00");
    useSessionStore.getState().loadBrowserSession(active.session.id);

    const ok = useSessionStore.getState().renameSession(background.session.id, "바뀐 배경");
    expect(ok).toBe(true);
    // Active draft is untouched; the current pointer stays on the active one.
    expect(useSessionStore.getState().draft?.session.id).toBe(active.session.id);
    expect(repository.loadStoredSessionDraft(background.session.id)?.session.title).toBe("바뀐 배경");
    expect(repository.loadCurrentSessionDraft()?.session.id).toBe(active.session.id);
  });

  it("returns false for a blank or unchanged rename", () => {
    const seeded = seedSession("그대로", "2026-05-12T13:00:00+09:00");
    useSessionStore.getState().loadBrowserSession(seeded.session.id);
    expect(useSessionStore.getState().renameSession(seeded.session.id, "   ")).toBe(false);
    expect(useSessionStore.getState().renameSession(seeded.session.id, "그대로")).toBe(false);
  });

  it("does not restamp savedAt on a metadata edit", () => {
    const seeded = seedSession("타임스탬프", "2026-05-12T13:00:00+09:00");
    const savedAt = repository.loadStoredSessionDraft(seeded.session.id)?.savedAt;
    useSessionStore.getState().renameSession(seeded.session.id, "다른 제목");
    expect(repository.loadStoredSessionDraft(seeded.session.id)?.savedAt).toBe(savedAt);
  });

  it("returns false for an unknown session id", () => {
    expect(useSessionStore.getState().renameSession("missing", "x")).toBe(false);
  });
});

describe("useSessionStore importAsNewSession", () => {
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

  function claudeDetail(): ClaudeCodeSessionDetail {
    return {
      sessionId: "claude-abc",
      projectPath: "C--dev-mori",
      projectName: "C:/dev/mori",
      filePath: "/x/claude-abc.jsonl",
      startedAt: "2026-05-20T12:00:00Z",
      messageCount: 2,
      title: "Wire the Connections page",
      messages: [
        { id: "m1", role: "human", content: "Wire it up", createdAt: "2026-05-20T12:00:00Z" },
        { id: "m2", role: "assistant", content: "Done.", createdAt: "2026-05-20T12:30:00Z" },
      ],
    };
  }

  function buildCandidate() {
    return buildImportCandidateFromClaudeCodeSession(claudeDetail(), {
      projectId: "placeholder-proj",
      sessionId: "placeholder-sess",
      capturedAt: fixedNow,
    });
  }

  it("creates and switches to a fresh empty session carrying the source label", () => {
    const candidate = buildCandidate();
    const { sessionId, candidate: rebound } = useSessionStore.getState().importAsNewSession({
      candidate,
      title: "Wire the Connections page",
      startedAt: "2026-05-20T12:00:00Z",
      endedAt: "2026-05-20T12:30:00Z",
      projectLabel: "C:/dev/mori",
    });

    const state = useSessionStore.getState();
    expect(state.draft?.session.id).toBe(sessionId);
    expect(state.draft?.session.title).toBe("Wire the Connections page");
    expect(state.draft?.session.sourceLabel).toBe("C:/dev/mori");
    expect(state.draft?.session.startedAt).toBe("2026-05-20T12:00:00Z");
    expect(state.draft?.session.endedAt).toBe("2026-05-20T12:30:00Z");
    expect(state.draft?.session.status).toBe("complete");
    // The new session starts empty — the import is not committed yet.
    expect(state.imports).toHaveLength(0);
    expect(state.pendingNewSession?.sessionId).toBe(sessionId);
    // The returned candidate is re-bound to the real session id.
    expect(rebound.source.sessionId).toBe(sessionId);
    expect(rebound.events.every((event) => event.sessionId === sessionId)).toBe(true);
    // The summary list surfaces the new session with its label.
    const summary = repository.listStoredSessions().find((s) => s.sessionId === sessionId);
    expect(summary?.sourceLabel).toBe("C:/dev/mori");
  });

  it("discards the empty pending session on cancel and restores the previous one", () => {
    // Seed a prior active session.
    const prior = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Prior session",
        projectName: "Mori",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "browser:localStorage",
        now: fixedNow,
      }),
    );
    useSessionStore.getState().loadBrowserSession(prior.session.id);

    const { sessionId } = useSessionStore.getState().importAsNewSession({
      candidate: buildCandidate(),
      title: "Wire the Connections page",
      startedAt: "2026-05-20T12:00:00Z",
      endedAt: "2026-05-20T12:30:00Z",
      projectLabel: "C:/dev/mori",
    });
    expect(useSessionStore.getState().draft?.session.id).toBe(sessionId);

    const discarded = useSessionStore.getState().abandonPendingNewSessionIfEmpty();

    expect(discarded).toBe(true);
    const state = useSessionStore.getState();
    expect(state.draft?.session.id).toBe(prior.session.id);
    expect(state.pendingNewSession).toBeNull();
    // The empty session is gone from storage.
    expect(
      repository.listStoredSessions().some((s) => s.sessionId === sessionId),
    ).toBe(false);
  });

  it("keeps the session and clears bookkeeping once an import is applied", () => {
    const { sessionId, candidate: rebound } = useSessionStore.getState().importAsNewSession({
      candidate: buildCandidate(),
      title: "Wire the Connections page",
      startedAt: "2026-05-20T12:00:00Z",
      endedAt: "2026-05-20T12:30:00Z",
      projectLabel: "C:/dev/mori",
    });

    // Simulate Import Review apply committing the accepted candidate.
    useSessionStore.getState().addImport(rebound);
    useSessionStore.getState().commitPendingNewSession();

    expect(useSessionStore.getState().pendingNewSession).toBeNull();

    // A late cancel must NOT delete a session that now holds applied work.
    const discarded = useSessionStore.getState().abandonPendingNewSessionIfEmpty();
    expect(discarded).toBe(false);
    expect(useSessionStore.getState().draft?.session.id).toBe(sessionId);
    expect(
      repository.listStoredSessions().some((s) => s.sessionId === sessionId),
    ).toBe(true);
  });

  it("does not discard a pending session that already received an import", () => {
    const { sessionId, candidate: rebound } = useSessionStore.getState().importAsNewSession({
      candidate: buildCandidate(),
      title: "Conversation",
      startedAt: "2026-05-20T12:00:00Z",
      endedAt: "2026-05-20T12:30:00Z",
    });
    useSessionStore.getState().addImport(rebound);

    // Even without an explicit commit, a session with imports survives cancel.
    const discarded = useSessionStore.getState().abandonPendingNewSessionIfEmpty();
    expect(discarded).toBe(false);
    expect(useSessionStore.getState().draft?.session.id).toBe(sessionId);
  });
});

describe("useSessionStore setNextActionCompletion", () => {
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
    useSessionStore.getState().setDraft(stored);

    const analysis: AnalysisResult = {
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
    useSessionStore.setState({ analysis, analysisStatus: "succeeded" });
    return stored;
  }

  it("marks a next action complete and persists it to the analysis store", () => {
    const stored = seedAnalysisWithNextAction();
    const ok = useSessionStore.getState().setNextActionCompletion("na-1", true);

    expect(ok).toBe(true);
    const action = useSessionStore.getState().analysis!.nextActions[0]!;
    expect(action.done).toBe(true);
    expect(action.completedAt).toBeTruthy();
    expect(
      repository.loadSessionAnalysis(stored.session.id)?.result.nextActions[0]?.done,
    ).toBe(true);
  });

  it("reopens a completed next action and clears completedAt", () => {
    seedAnalysisWithNextAction();
    useSessionStore.getState().setNextActionCompletion("na-1", true);
    useSessionStore.getState().setNextActionCompletion("na-1", false);

    const action = useSessionStore.getState().analysis!.nextActions[0]!;
    expect(action.done).toBe(false);
    expect(action.completedAt).toBeUndefined();
  });

  it("returns false with no draft or analysis", () => {
    expect(useSessionStore.getState().setNextActionCompletion("na-1", true)).toBe(false);
  });

  it("returns false for an unknown next action id", () => {
    seedAnalysisWithNextAction();
    expect(
      useSessionStore.getState().setNextActionCompletion("missing", true),
    ).toBe(false);
  });
});

describe("useSessionStore setIssueStatus", () => {
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
    useSessionStore.getState().setDraft(stored);

    const analysis: AnalysisResult = {
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
          ...mockSession.issues[0]!,
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
    useSessionStore.setState({ analysis, analysisStatus: "succeeded" });
    return stored;
  }

  it("changes an issue status and persists it to the analysis store", () => {
    const stored = seedAnalysisWithIssue();
    const ok = useSessionStore.getState().setIssueStatus("iss-1", "resolved");

    expect(ok).toBe(true);
    expect(useSessionStore.getState().analysis!.issues[0]!.status).toBe("resolved");
    expect(
      repository.loadSessionAnalysis(stored.session.id)?.result.issues[0]?.status,
    ).toBe("resolved");
  });

  it("edits an issue and persists it to analysis and memory body", () => {
    const stored = seedAnalysisWithIssue();
    const before = useSessionStore.getState().analysis!.issues[0]!;
    const ok = useSessionStore.getState().editIssue("iss-1", {
      title: "Corrected issue",
      description: "Corrected issue description",
    });

    expect(ok).toBe(true);
    const issue = useSessionStore.getState().analysis!.issues[0]!;
    expect(issue.title).toBe("Corrected issue");
    expect(issue.description).toBe("Corrected issue description");
    expect(issue.editedByUser).toBe(true);
    expect(issue.editedAt).toBeTruthy();
    expect(issue.status).toBe("open");
    expect(issue.sourceEventIds).toEqual(before.sourceEventIds);
    expect(issue.relatedDecisionIds).toEqual(before.relatedDecisionIds);

    const storedAnalysis = repository.loadSessionAnalysis(stored.session.id)?.result;
    expect(storedAnalysis?.issues[0]?.title).toBe("Corrected issue");
    expect(repository.loadSessionMemoryBody(stored.session.id)?.issues[0]?.title).toBe(
      "Corrected issue",
    );
  });

  it("promotes an issue to a next action and persists it to analysis and memory body", () => {
    const stored = seedAnalysisWithIssue();
    const action = useSessionStore.getState().promoteIssueToNextAction("iss-1");

    expect(action).not.toBeNull();
    expect(action?.id).toBe("nact-user-iss-1");
    expect(action?.relatedIssueIds).toEqual(["iss-1"]);
    expect(useSessionStore.getState().analysis!.nextActions[0]?.id).toBe(
      "nact-user-iss-1",
    );
    expect(repository.loadSessionAnalysis(stored.session.id)?.result.nextActions[0]?.id).toBe(
      "nact-user-iss-1",
    );
    expect(repository.loadSessionMemoryBody(stored.session.id)?.nextActions[0]?.id).toBe(
      "nact-user-iss-1",
    );
  });

  it("does not duplicate an already-promoted issue next action", () => {
    seedAnalysisWithIssue();
    const first = useSessionStore.getState().promoteIssueToNextAction("iss-1");
    const second = useSessionStore.getState().promoteIssueToNextAction("iss-1");

    expect(second?.id).toBe(first?.id);
    expect(useSessionStore.getState().analysis!.nextActions).toHaveLength(1);
  });

  it("returns false with no draft or analysis", () => {
    expect(useSessionStore.getState().setIssueStatus("iss-1", "resolved")).toBe(false);
  });

  it("returns false for an unknown issue id", () => {
    seedAnalysisWithIssue();
    expect(useSessionStore.getState().setIssueStatus("missing", "resolved")).toBe(
      false,
    );
  });

  it("returns false when editing an unknown issue id", () => {
    seedAnalysisWithIssue();
    expect(
      useSessionStore.getState().editIssue("missing", { title: "Nope" }),
    ).toBe(false);
  });

  it("returns null when promoting an unknown issue id", () => {
    seedAnalysisWithIssue();
    expect(useSessionStore.getState().promoteIssueToNextAction("missing")).toBeNull();
  });
});

describe("useSessionStore setDecisionConfirmed", () => {
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

  function seedAnalysisWithDecision() {
    const built = createSessionDraft({
      sessionTitle: "Decision session",
      projectName: "DC Project",
      selectedSources: [],
      recordingMode: "summary",
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
      storageLocation: "~/Mori/Records",
      now: fixedNow,
    });
    const stored = { ...built, savedAt: fixedNow, adapter: "browser-local-storage" as const };
    useSessionStore.getState().setDraft(stored);

    const analysis: AnalysisResult = {
      runId: "run-dc",
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
      decisions: [
        {
          ...mockSession.decisions[0]!,
          id: "dec-1",
          sessionId: stored.session.id,
          confirmed: false,
        },
      ],
      relationships: [],
      nextActions: [],
      rendered: {
        summary: {
          id: "summary-run-dc",
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
    useSessionStore.setState({ analysis, analysisStatus: "succeeded" });
    return stored;
  }

  it("confirms a decision and persists it to the analysis store", () => {
    const stored = seedAnalysisWithDecision();
    const ok = useSessionStore.getState().setDecisionConfirmed("dec-1", true);

    expect(ok).toBe(true);
    expect(useSessionStore.getState().analysis!.decisions[0]!.confirmed).toBe(true);
    expect(
      repository.loadSessionAnalysis(stored.session.id)?.result.decisions[0]?.confirmed,
    ).toBe(true);
  });

  it("edits a decision and persists it to analysis and memory body", () => {
    const stored = seedAnalysisWithDecision();
    useSessionStore.getState().setDecisionConfirmed("dec-1", true);
    const before = useSessionStore.getState().analysis!.decisions[0]!;
    const ok = useSessionStore.getState().editDecision("dec-1", {
      title: "Corrected decision",
      decision: "Corrected decision text",
      rationale: "Corrected rationale",
    });

    expect(ok).toBe(true);
    const decision = useSessionStore.getState().analysis!.decisions[0]!;
    expect(decision.title).toBe("Corrected decision");
    expect(decision.decision).toBe("Corrected decision text");
    expect(decision.rationale).toBe("Corrected rationale");
    expect(decision.editedByUser).toBe(true);
    expect(decision.editedAt).toBeTruthy();
    expect(decision.confirmed).toBe(true);
    expect(decision.sourceEventIds).toEqual(before.sourceEventIds);
    expect(decision.relatedIssueIds).toEqual(before.relatedIssueIds);

    const storedAnalysis = repository.loadSessionAnalysis(stored.session.id)?.result;
    expect(storedAnalysis?.decisions[0]?.title).toBe("Corrected decision");
    expect(repository.loadSessionMemoryBody(stored.session.id)?.decisions[0]?.title).toBe(
      "Corrected decision",
    );
  });

  it("rejects a previously confirmed decision", () => {
    seedAnalysisWithDecision();
    useSessionStore.getState().setDecisionConfirmed("dec-1", true);
    useSessionStore.getState().setDecisionConfirmed("dec-1", false);
    expect(useSessionStore.getState().analysis!.decisions[0]!.confirmed).toBe(false);
  });

  it("returns false with no draft or analysis", () => {
    expect(useSessionStore.getState().setDecisionConfirmed("dec-1", true)).toBe(false);
  });

  it("returns false for an unknown decision id", () => {
    seedAnalysisWithDecision();
    expect(useSessionStore.getState().setDecisionConfirmed("missing", true)).toBe(
      false,
    );
  });

  it("returns false when editing an unknown decision id", () => {
    seedAnalysisWithDecision();
    expect(
      useSessionStore.getState().editDecision("missing", { title: "Nope" }),
    ).toBe(false);
  });
});

describe("useSessionStore import as new session", () => {
  it("keeps an imported session reachable without a manual end-session step", () => {
    // The recorder model (endSession) was removed: a session is captured, not
    // user-started/ended. Imported sessions are reachable directly.
    expect(typeof useSessionStore.getState().importAsNewSession).toBe("function");
  });
});

describe("useSessionStore analysis run history", () => {
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

  function seedSession() {
    const built = createSessionDraft({
      sessionTitle: "Run history session",
      projectName: "RH Project",
      selectedSources: [],
      recordingMode: "summary",
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
      storageLocation: "~/Mori/Records",
      now: fixedNow,
    });
    const stored = { ...built, savedAt: fixedNow, adapter: "browser-local-storage" as const };
    useSessionStore.getState().setDraft(stored);
    useSessionStore.getState().addImport(
      normalizeManualNote({
        projectId: stored.project.id,
        sessionId: stored.session.id,
        title: "Risk",
        note: "위험: token rotation 미정. TODO: rotate.",
        capturedAt: fixedNow,
      }),
    );
    return stored;
  }

  it("accumulates a run per re-analysis and reads them back newest-adopted", async () => {
    seedSession();
    await useSessionStore.getState().runQuickPass(buildProvider("deterministic-heuristic-v1"));
    await useSessionStore.getState().runQuickPass(buildProvider("ollama-quick-pass-v1"));

    const history = useSessionStore.getState().loadAnalysisRunHistory();
    expect(history?.runs).toHaveLength(2);
    expect(history?.runs.map((run) => run.providerName)).toEqual([
      "deterministic-heuristic-v1",
      "ollama-quick-pass-v1",
    ]);
    // The most recent run is the adopted understanding.
    expect(history?.currentRunId).toBe(useSessionStore.getState().analysis?.runId);
    expect(useSessionStore.getState().analysis?.providerName).toBe("ollama-quick-pass-v1");
  });

  it("adopts a prior run and reflects it in store state and storage", async () => {
    const stored = seedSession();
    await useSessionStore.getState().runQuickPass(buildProvider("deterministic-heuristic-v1"));
    const firstRunId = useSessionStore.getState().analysis!.runId;
    await useSessionStore.getState().runQuickPass(buildProvider("ollama-quick-pass-v1"));

    const ok = useSessionStore.getState().selectAnalysisRun(firstRunId);
    expect(ok).toBe(true);
    expect(useSessionStore.getState().analysis?.runId).toBe(firstRunId);
    expect(useSessionStore.getState().analysisProviderLabel).toBe("deterministic-heuristic-v1");
    // The single analysis mirror tracks the adopted run for other readers.
    expect(repository.loadSessionAnalysis(stored.session.id)?.result.runId).toBe(firstRunId);
    expect(repository.loadSessionAnalysisHistory(stored.session.id)?.history.currentRunId).toBe(
      firstRunId,
    );
  });

  it("returns false adopting an unknown run id and leaves the adopted run intact", async () => {
    seedSession();
    await useSessionStore.getState().runQuickPass(buildProvider("ollama-quick-pass-v1"));
    const currentRunId = useSessionStore.getState().analysis!.runId;

    expect(useSessionStore.getState().selectAnalysisRun("run-missing")).toBe(false);
    expect(useSessionStore.getState().analysis?.runId).toBe(currentRunId);
  });

  it("returns null history and false selection with no active session", () => {
    expect(useSessionStore.getState().loadAnalysisRunHistory()).toBeNull();
    expect(useSessionStore.getState().selectAnalysisRun("run-x")).toBe(false);
  });
});

describe("useSessionStore live follow orchestration", () => {
  beforeEach(() => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
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

  it("starts, polls, and reacts to new events, then consumes pending", () => {
    const store = useSessionStore.getState();
    store.startFollow("sess-live", ["e1"]);
    expect(useSessionStore.getState().follow.status).toBe("following");

    // A poll with no new events does not react.
    const quiet = useSessionStore.getState().applyFollowPoll(["e1"], "2026-06-02T00:01:00Z");
    expect(quiet.shouldReanalyze).toBe(false);

    // A poll with new events reacts and clears pending.
    const reaction = useSessionStore
      .getState()
      .applyFollowPoll(["e1", "e2"], "2026-06-02T00:02:00Z");
    expect(reaction).toEqual({ shouldReanalyze: true, shouldNotify: true, newCount: 1 });
    expect(useSessionStore.getState().follow.pendingEventIds).toEqual([]);
    expect(useSessionStore.getState().follow.knownEventIds).toEqual(["e1", "e2"]);

    // The reacting poll captured a feed notification.
    const notes = useSessionStore.getState().followNotifications;
    expect(notes).toHaveLength(1);
    expect(notes[0].kind).toBe("live_follow_update");
    expect(notes[0].message).toContain("1");
  });

  it("pauses, resumes, and stops following", () => {
    const store = useSessionStore.getState();
    store.startFollow("sess-live");
    store.pauseFollow();
    expect(useSessionStore.getState().follow.status).toBe("paused");
    // A poll while paused is ignored.
    useSessionStore.getState().applyFollowPoll(["e9"], "2026-06-02T00:03:00Z");
    expect(useSessionStore.getState().follow.knownEventIds).toEqual([]);
    useSessionStore.getState().resumeFollow();
    expect(useSessionStore.getState().follow.status).toBe("following");
    useSessionStore.getState().stopFollow();
    expect(useSessionStore.getState().follow.status).toBe("stopped");
  });
});

describe("useSessionStore pending import review", () => {
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

  function buildReviewDraft(sessionId: string, projectId: string) {
    const note = normalizeManualNote({
      projectId,
      sessionId,
      title: "검토 대기",
      note: "위험: 토큰 회전 미정. TODO: rotate.",
      capturedAt: fixedNow,
    });
    return createImportReviewDraft(note, "manual-note");
  }

  it("persists a pending review and restores it on reload", async () => {
    const store = useSessionStore.getState();
    const session = store.beginEmptySession({ title: "A", projectName: "P", now: fixedNow });
    const draft = buildReviewDraft(session.session.id, session.project.id);

    useSessionStore.getState().savePendingReview(draft);
    expect(useSessionStore.getState().pendingReview?.draft.id).toBe(draft.id);

    resetStore();
    await useSessionStore.getState().hydrate();
    expect(useSessionStore.getState().pendingReview?.draft.id).toBe(draft.id);
  });

  it("does not leak one session's pending review into another", () => {
    const store = useSessionStore.getState();
    const a = store.beginEmptySession({ title: "A", projectName: "P", now: fixedNow });
    const draftA = buildReviewDraft(a.session.id, a.project.id);
    useSessionStore.getState().savePendingReview(draftA);

    // Opening a second session must not carry session A's pending review.
    const b = useSessionStore.getState().beginEmptySession({ title: "B", projectName: "P", now: fixedNow });
    expect(b.session.id).not.toBe(a.session.id);
    expect(useSessionStore.getState().pendingReview).toBeNull();

    // Switching back to A restores its pending review.
    useSessionStore.getState().loadBrowserSession(a.session.id);
    expect(useSessionStore.getState().pendingReview?.draft.id).toBe(draftA.id);
  });

  it("persists per-item accept / discard across reload", async () => {
    const store = useSessionStore.getState();
    const session = store.beginEmptySession({ title: "A", projectName: "P", now: fixedNow });
    const draft = buildReviewDraft(session.session.id, session.project.id);
    const eventId = draft.events[0]!.id;

    useSessionStore.getState().savePendingReview(draft);
    useSessionStore.getState().setPendingReviewItemStatus("event", eventId, "discarded");

    resetStore();
    await useSessionStore.getState().hydrate();
    const restored = useSessionStore
      .getState()
      .pendingReview?.draft.events.find((item) => item.id === eventId);
    expect(restored?.status).toBe("discarded");
  });

  it("clearPendingReview removes it from memory and storage", () => {
    const store = useSessionStore.getState();
    const session = store.beginEmptySession({ title: "A", projectName: "P", now: fixedNow });
    useSessionStore.getState().savePendingReview(buildReviewDraft(session.session.id, session.project.id));
    expect(useSessionStore.getState().pendingReview).not.toBeNull();

    useSessionStore.getState().clearPendingReview();
    expect(useSessionStore.getState().pendingReview).toBeNull();

    useSessionStore.getState().loadBrowserSession(session.session.id);
    expect(useSessionStore.getState().pendingReview).toBeNull();
  });
});
