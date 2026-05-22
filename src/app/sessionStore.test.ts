import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  selectHasRealAnalysis,
  setSessionPersistenceServiceForSessionStore,
  setSessionRepositoryForTesting,
  useMoriSessionStore,
} from "./sessionStore";
import { createSessionDraft } from "../lib/session/createSessionDraft";
import { normalizeManualNote } from "../lib/import";
import { buildImportCandidateFromClaudeCodeSession } from "../lib/claude/claudeImport";
import type { ClaudeCodeSessionDetail } from "../lib/claude/types";
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
    pendingNewSession: null,
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

describe("useMoriSessionStore importAsNewSession", () => {
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
    const { sessionId, candidate: rebound } = useMoriSessionStore.getState().importAsNewSession({
      candidate,
      title: "Wire the Connections page",
      startedAt: "2026-05-20T12:00:00Z",
      endedAt: "2026-05-20T12:30:00Z",
      projectLabel: "C:/dev/mori",
    });

    const state = useMoriSessionStore.getState();
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
    useMoriSessionStore.getState().loadBrowserSession(prior.session.id);

    const { sessionId } = useMoriSessionStore.getState().importAsNewSession({
      candidate: buildCandidate(),
      title: "Wire the Connections page",
      startedAt: "2026-05-20T12:00:00Z",
      endedAt: "2026-05-20T12:30:00Z",
      projectLabel: "C:/dev/mori",
    });
    expect(useMoriSessionStore.getState().draft?.session.id).toBe(sessionId);

    const discarded = useMoriSessionStore.getState().abandonPendingNewSessionIfEmpty();

    expect(discarded).toBe(true);
    const state = useMoriSessionStore.getState();
    expect(state.draft?.session.id).toBe(prior.session.id);
    expect(state.pendingNewSession).toBeNull();
    // The empty session is gone from storage.
    expect(
      repository.listStoredSessions().some((s) => s.sessionId === sessionId),
    ).toBe(false);
  });

  it("keeps the session and clears bookkeeping once an import is applied", () => {
    const { sessionId, candidate: rebound } = useMoriSessionStore.getState().importAsNewSession({
      candidate: buildCandidate(),
      title: "Wire the Connections page",
      startedAt: "2026-05-20T12:00:00Z",
      endedAt: "2026-05-20T12:30:00Z",
      projectLabel: "C:/dev/mori",
    });

    // Simulate Import Review apply committing the accepted candidate.
    useMoriSessionStore.getState().addImport(rebound);
    useMoriSessionStore.getState().commitPendingNewSession();

    expect(useMoriSessionStore.getState().pendingNewSession).toBeNull();

    // A late cancel must NOT delete a session that now holds applied work.
    const discarded = useMoriSessionStore.getState().abandonPendingNewSessionIfEmpty();
    expect(discarded).toBe(false);
    expect(useMoriSessionStore.getState().draft?.session.id).toBe(sessionId);
    expect(
      repository.listStoredSessions().some((s) => s.sessionId === sessionId),
    ).toBe(true);
  });

  it("does not discard a pending session that already received an import", () => {
    const { sessionId, candidate: rebound } = useMoriSessionStore.getState().importAsNewSession({
      candidate: buildCandidate(),
      title: "Conversation",
      startedAt: "2026-05-20T12:00:00Z",
      endedAt: "2026-05-20T12:30:00Z",
    });
    useMoriSessionStore.getState().addImport(rebound);

    // Even without an explicit commit, a session with imports survives cancel.
    const discarded = useMoriSessionStore.getState().abandonPendingNewSessionIfEmpty();
    expect(discarded).toBe(false);
    expect(useMoriSessionStore.getState().draft?.session.id).toBe(sessionId);
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

  it("edits an issue and persists it to analysis and memory body", () => {
    const stored = seedAnalysisWithIssue();
    const before = useMoriSessionStore.getState().analysis!.issues[0]!;
    const ok = useMoriSessionStore.getState().editIssue("iss-1", {
      title: "Corrected issue",
      description: "Corrected issue description",
    });

    expect(ok).toBe(true);
    const issue = useMoriSessionStore.getState().analysis!.issues[0]!;
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
    const action = useMoriSessionStore.getState().promoteIssueToNextAction("iss-1");

    expect(action).not.toBeNull();
    expect(action?.id).toBe("nact-user-iss-1");
    expect(action?.relatedIssueIds).toEqual(["iss-1"]);
    expect(useMoriSessionStore.getState().analysis!.nextActions[0]?.id).toBe(
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
    const first = useMoriSessionStore.getState().promoteIssueToNextAction("iss-1");
    const second = useMoriSessionStore.getState().promoteIssueToNextAction("iss-1");

    expect(second?.id).toBe(first?.id);
    expect(useMoriSessionStore.getState().analysis!.nextActions).toHaveLength(1);
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

  it("returns false when editing an unknown issue id", () => {
    seedAnalysisWithIssue();
    expect(
      useMoriSessionStore.getState().editIssue("missing", { title: "Nope" }),
    ).toBe(false);
  });

  it("returns null when promoting an unknown issue id", () => {
    seedAnalysisWithIssue();
    expect(useMoriSessionStore.getState().promoteIssueToNextAction("missing")).toBeNull();
  });
});

describe("useMoriSessionStore setDecisionConfirmed", () => {
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
    useMoriSessionStore.getState().setDraft(stored);

    const analysis: MoriAnalysisResult = {
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
          ...moriMockSession.decisions[0]!,
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
    useMoriSessionStore.setState({ analysis, analysisStatus: "succeeded" });
    return stored;
  }

  it("confirms a decision and persists it to the analysis store", () => {
    const stored = seedAnalysisWithDecision();
    const ok = useMoriSessionStore.getState().setDecisionConfirmed("dec-1", true);

    expect(ok).toBe(true);
    expect(useMoriSessionStore.getState().analysis!.decisions[0]!.confirmed).toBe(true);
    expect(
      repository.loadSessionAnalysis(stored.session.id)?.result.decisions[0]?.confirmed,
    ).toBe(true);
  });

  it("edits a decision and persists it to analysis and memory body", () => {
    const stored = seedAnalysisWithDecision();
    useMoriSessionStore.getState().setDecisionConfirmed("dec-1", true);
    const before = useMoriSessionStore.getState().analysis!.decisions[0]!;
    const ok = useMoriSessionStore.getState().editDecision("dec-1", {
      title: "Corrected decision",
      decision: "Corrected decision text",
      rationale: "Corrected rationale",
    });

    expect(ok).toBe(true);
    const decision = useMoriSessionStore.getState().analysis!.decisions[0]!;
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
    useMoriSessionStore.getState().setDecisionConfirmed("dec-1", true);
    useMoriSessionStore.getState().setDecisionConfirmed("dec-1", false);
    expect(useMoriSessionStore.getState().analysis!.decisions[0]!.confirmed).toBe(false);
  });

  it("returns false with no draft or analysis", () => {
    expect(useMoriSessionStore.getState().setDecisionConfirmed("dec-1", true)).toBe(false);
  });

  it("returns false for an unknown decision id", () => {
    seedAnalysisWithDecision();
    expect(useMoriSessionStore.getState().setDecisionConfirmed("missing", true)).toBe(
      false,
    );
  });

  it("returns false when editing an unknown decision id", () => {
    seedAnalysisWithDecision();
    expect(
      useMoriSessionStore.getState().editDecision("missing", { title: "Nope" }),
    ).toBe(false);
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
