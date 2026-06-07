import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import type { AnalysisResult } from "../analysis";
import { DEFAULT_QUICK_PASS_SETTINGS, createDeterministicQuickPassProvider } from "../analysis";
import { normalizeAiConversationText, normalizeManualNote, normalizeUrlSource } from "../import";
import { createImportReviewDraft } from "../review";
import { createMoriPackageFromSession } from "../mori-package";
import { createSessionDraft } from "../session/createSessionDraft";
import { BrowserDraftRepository } from "./localStorageAdapter";
import { MemoryKeyValueStorage } from "./memoryStorage";

describe("BrowserDraftRepository", () => {
  it("saves and loads the current session draft", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const draft = createSessionDraft({
      sessionTitle: "Mori 앱 기획",
      projectName: "Mori Product",
      selectedSources: [],
      recordingMode: "summary",
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
      storageLocation: "~/Mori/Records",
      now: "2026-05-12T13:00:00+09:00",
    });

    const saved = repository.saveCurrentSessionDraft(draft);
    const loaded = repository.loadCurrentSessionDraft();

    expect(saved.adapter).toBe("browser-local-storage");
    expect(loaded?.session.id).toBe(saved.session.id);
    expect(repository.listStoredSessions()).toHaveLength(1);
  });

  it("saves and loads Mori package drafts", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const pkg = createMoriPackageFromSession(mockSession);

    const saved = repository.saveMoriPackageDraft(pkg);
    const loaded = repository.loadMoriPackageDraft(pkg.manifest.packageId);

    expect(saved.packageId).toBe(pkg.manifest.packageId);
    expect(loaded?.package.events.length).toBe(pkg.events.length);
  });

  it("persists, replaces, and removes per-session imports", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const draft = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Import test session",
        projectName: "Import Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T13:00:00+09:00",
      }),
    );

    const note = normalizeManualNote({
      projectId: draft.project.id,
      sessionId: draft.session.id,
      title: "Kickoff",
      note: "Mori is local-first work memory.",
      capturedAt: "2026-05-12T13:05:00+09:00",
    });
    const url = normalizeUrlSource({
      projectId: draft.project.id,
      sessionId: draft.session.id,
      title: "screenpipe",
      url: "https://github.com/mediar-ai/screenpipe",
      capturedAt: "2026-05-12T13:10:00+09:00",
    });
    const ai = normalizeAiConversationText({
      projectId: draft.project.id,
      sessionId: draft.session.id,
      provider: "Claude",
      text: "User: hi\n\nAssistant: hello",
      capturedAt: "2026-05-12T13:15:00+09:00",
    });

    repository.addSessionImport(draft.session.id, note);
    repository.addSessionImport(draft.session.id, url);
    repository.addSessionImport(draft.session.id, ai);
    expect(repository.listSessionImports(draft.session.id)).toHaveLength(3);

    repository.addSessionImport(draft.session.id, note);
    expect(repository.listSessionImports(draft.session.id)).toHaveLength(3);

    repository.removeSessionImport(draft.session.id, url.source.id);
    const remaining = repository.listSessionImports(draft.session.id);
    expect(remaining).toHaveLength(2);
    expect(remaining.find((entry) => entry.id === url.source.id)).toBeUndefined();

    repository.clearSessionImports(draft.session.id);
    expect(repository.listSessionImports(draft.session.id)).toHaveLength(0);
  });

  it("persists, loads, and clears analysis results per session", async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = new BrowserDraftRepository(storage);
    const draft = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Analysis test session",
        projectName: "Analysis Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T13:00:00+09:00",
      }),
    );

    const note = normalizeManualNote({
      projectId: draft.project.id,
      sessionId: draft.session.id,
      title: "Risk",
      note: "위험: 인증 토큰 회전이 미정. TODO: rotate.",
      capturedAt: "2026-05-12T13:05:00+09:00",
    });
    repository.addSessionImport(draft.session.id, note);

    const provider = createDeterministicQuickPassProvider();
    const events = [note.events[0]];
    const result = await provider.analyze({
      project: draft.project,
      session: draft.session,
      sources: [note.source],
      events,
      now: "2026-05-12T13:30:00+09:00",
    });
    expect(result.issues.length).toBeGreaterThan(0);

    const saved = repository.saveSessionAnalysis(draft.session.id, result);
    expect(saved.adapter).toBe("browser-local-storage");

    const loaded = repository.loadSessionAnalysis(draft.session.id);
    expect(loaded?.result.runId).toBe(result.runId);
    expect(loaded?.result.issues.length).toBe(result.issues.length);

    repository.clearSessionAnalysis(draft.session.id);
    expect(repository.loadSessionAnalysis(draft.session.id)).toBeNull();
  });

  it("ignores corrupt analysis JSON in storage", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem("mori.sessionAnalysis.sess-bad", "{not-valid}");
    const repository = new BrowserDraftRepository(storage);
    expect(repository.loadSessionAnalysis("sess-bad")).toBeNull();
  });

  it("accumulates an append-only run history across re-analysis", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    repository.saveSessionAnalysis("sess-h", makeAnalysisResult("sess-h", "run-1"));
    repository.saveSessionAnalysis(
      "sess-h",
      makeAnalysisResult("sess-h", "run-2", { providerLabel: "Ollama" }),
    );

    const history = repository.loadSessionAnalysisHistory("sess-h");
    expect(history?.history.runs.map((run) => run.runId)).toEqual(["run-1", "run-2"]);
    expect(history?.history.currentRunId).toBe("run-2");
    // The single mirror tracks the latest run for existing readers.
    expect(repository.loadSessionAnalysis("sess-h")?.result.runId).toBe("run-2");
  });

  it("updates a run in place when the same runId is re-saved (an edit)", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    repository.saveSessionAnalysis("sess-h", makeAnalysisResult("sess-h", "run-1"));
    // An in-place review edit reuses the runId and bumps duration only.
    repository.saveSessionAnalysis(
      "sess-h",
      makeAnalysisResult("sess-h", "run-1", { durationMs: 999 }),
    );

    const history = repository.loadSessionAnalysisHistory("sess-h");
    expect(history?.history.runs).toHaveLength(1);
    expect(history?.history.runs[0]?.durationMs).toBe(999);
  });

  it("forward-migrates a legacy single analysis record into a one-run history", () => {
    const storage = new MemoryKeyValueStorage();
    const legacy = {
      sessionId: "sess-legacy",
      result: makeAnalysisResult("sess-legacy", "run-old"),
      savedAt: "2026-05-01T00:00:00.000Z",
      adapter: "browser-local-storage",
    };
    // Only the legacy single-result key exists (no history key).
    storage.setItem("mori.sessionAnalysis.sess-legacy", JSON.stringify(legacy));
    const repository = new BrowserDraftRepository(storage);

    const history = repository.loadSessionAnalysisHistory("sess-legacy");
    expect(history?.history.runs.map((run) => run.runId)).toEqual(["run-old"]);
    expect(history?.history.currentRunId).toBe("run-old");
    expect(repository.loadSessionAnalysisHistory("sess-missing")).toBeNull();
  });

  it("adopts a selected run and mirrors it; an unknown id is a no-op", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    repository.saveSessionAnalysis("sess-h", makeAnalysisResult("sess-h", "run-1"));
    repository.saveSessionAnalysis("sess-h", makeAnalysisResult("sess-h", "run-2"));

    const adopted = repository.selectSessionAnalysisRun("sess-h", "run-1");
    expect(adopted?.history.currentRunId).toBe("run-1");
    expect(repository.loadSessionAnalysis("sess-h")?.result.runId).toBe("run-1");

    const unchanged = repository.selectSessionAnalysisRun("sess-h", "run-missing");
    expect(unchanged?.history.currentRunId).toBe("run-1");
    expect(repository.selectSessionAnalysisRun("sess-none", "run-1")).toBeNull();
  });

  it("clears the run history alongside the single analysis record", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    repository.saveSessionAnalysis("sess-h", makeAnalysisResult("sess-h", "run-1"));
    repository.clearSessionAnalysis("sess-h");
    expect(repository.loadSessionAnalysis("sess-h")).toBeNull();
    expect(repository.loadSessionAnalysisHistory("sess-h")).toBeNull();
  });

  it("persists, loads, and clears session memory bodies", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const stored = repository.saveSessionMemoryBody("sess-mem", {
      issues: [
        {
          id: "i1",
          sessionId: "sess-mem",
          projectId: "p1",
          title: "Open risk",
          description: "",
          status: "open",
          priority: "high",
          sourceEventIds: [],
          relatedDecisionIds: [],
          relatedFileIds: [],
          suggestedNextAction: "",
          trustLevel: "observed",
          confidence: 0.8,
          createdAt: "2026-05-15T10:00:00Z",
          updatedAt: "2026-05-15T10:00:00Z",
        },
      ],
      decisions: [
        {
          id: "d1",
          sessionId: "sess-mem",
          projectId: "p1",
          title: "Use SQLite",
          decision: "Adopt rusqlite.",
          rationale: "",
          rejectedOptions: [],
          impact: [],
          importance: "high",
          confirmed: true,
          createdAt: "2026-05-15T11:00:00Z",
          sourceEventIds: [],
          relatedIssueIds: [],
          relatedSourceIds: [],
          trustLevel: "verified",
        },
      ],
      nextActions: [],
      summarySnapshot: {
        sessionSummary: "ok",
        resumePrompt: "Continue.",
        generatedAt: "2026-05-15T12:00:00Z",
      },
    });
    expect(stored.adapter).toBe("browser-local-storage");
    expect(stored.schemaVersion).toBe(1);

    const loaded = repository.loadSessionMemoryBody("sess-mem");
    expect(loaded?.issues[0].title).toBe("Open risk");
    expect(loaded?.decisions[0].title).toBe("Use SQLite");
    expect(loaded?.summarySnapshot?.resumePrompt).toBe("Continue.");

    repository.clearSessionMemoryBody("sess-mem");
    expect(repository.loadSessionMemoryBody("sess-mem")).toBeNull();
  });

  it("returns null for memory body records with an unknown schema version", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(
      "mori.sessionMemory.sess-future",
      JSON.stringify({
        sessionId: "sess-future",
        savedAt: "2026-06-01T00:00:00Z",
        adapter: "browser-local-storage",
        schemaVersion: 99,
        issues: [],
        decisions: [],
        nextActions: [],
      }),
    );
    const repository = new BrowserDraftRepository(storage);
    expect(repository.loadSessionMemoryBody("sess-future")).toBeNull();
  });

  it("returns null when a memory body record is missing required arrays", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(
      "mori.sessionMemory.sess-broken",
      JSON.stringify({
        sessionId: "sess-broken",
        savedAt: "2026-06-01T00:00:00Z",
        adapter: "browser-local-storage",
        schemaVersion: 1,
        issues: "oops",
      }),
    );
    const repository = new BrowserDraftRepository(storage);
    expect(repository.loadSessionMemoryBody("sess-broken")).toBeNull();
  });

  it("clearStoredSession also removes the memory body", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "T",
        projectName: "P",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-15T13:00:00Z",
      }),
    );
    const sessionId = repository.loadCurrentSessionDraft()!.session.id;
    repository.saveSessionMemoryBody(sessionId, {
      issues: [],
      decisions: [],
      nextActions: [],
    });
    expect(repository.loadSessionMemoryBody(sessionId)).not.toBeNull();
    repository.clearStoredSession(sessionId);
    expect(repository.loadSessionMemoryBody(sessionId)).toBeNull();
  });

  it("persists, loads, and clears a pending import review", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const note = normalizeManualNote({
      projectId: "p-pending",
      sessionId: "sess-pending",
      title: "Pending",
      note: "검토 대기 중 자료.",
      capturedAt: "2026-05-12T13:05:00+09:00",
    });
    const draft = createImportReviewDraft(note, "manual-note");

    const stored = repository.savePendingReview("sess-pending", draft, {
      duplicateSkippedCount: 2,
    });
    expect(stored.adapter).toBe("browser-local-storage");
    expect(stored.schemaVersion).toBe(1);
    expect(stored.id).toBe(draft.id);

    const loaded = repository.loadPendingReview("sess-pending");
    expect(loaded?.draft.id).toBe(draft.id);
    expect(loaded?.draft.events.length).toBe(draft.events.length);
    expect(loaded?.meta?.duplicateSkippedCount).toBe(2);

    repository.clearPendingReview("sess-pending");
    expect(repository.loadPendingReview("sess-pending")).toBeNull();
  });

  it("returns null for a pending review with an unknown schema version", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(
      "mori.sessionPendingReview.sess-future",
      JSON.stringify({
        id: "rev-1",
        sessionId: "sess-future",
        draft: { id: "rev-1", events: [] },
        savedAt: "2026-06-01T00:00:00Z",
        adapter: "browser-local-storage",
        schemaVersion: 99,
      }),
    );
    const repository = new BrowserDraftRepository(storage);
    expect(repository.loadPendingReview("sess-future")).toBeNull();
  });

  it("clearStoredSession also removes a pending review", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "T",
        projectName: "P",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-15T13:00:00Z",
      }),
    );
    const sessionId = repository.loadCurrentSessionDraft()!.session.id;
    const note = normalizeManualNote({
      projectId: "p1",
      sessionId,
      title: "Pending",
      note: "검토 대기.",
      capturedAt: "2026-05-12T13:05:00+09:00",
    });
    repository.savePendingReview(sessionId, createImportReviewDraft(note, "manual-note"));
    expect(repository.loadPendingReview(sessionId)).not.toBeNull();
    repository.clearStoredSession(sessionId);
    expect(repository.loadPendingReview(sessionId)).toBeNull();
  });

  it("clears the active session draft including its imports", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const draft = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Reset target",
        projectName: "Reset Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T13:00:00+09:00",
      }),
    );

    repository.addSessionImport(
      draft.session.id,
      normalizeManualNote({
        projectId: draft.project.id,
        sessionId: draft.session.id,
        title: "Note",
        note: "to be cleared",
        capturedAt: "2026-05-12T13:05:00+09:00",
      }),
    );

    repository.clearCurrentSessionDraft();

    expect(repository.loadCurrentSessionDraft()).toBeNull();
    expect(repository.listSessionImports(draft.session.id)).toHaveLength(0);
    expect(repository.listStoredSessions()).toHaveLength(0);
    expect(repository.loadSessionAnalysis(draft.session.id)).toBeNull();
  });

  it("clearAllLocalData wipes every work record but preserves settings", () => {
    const storage = new MemoryKeyValueStorage();
    const repository = new BrowserDraftRepository(storage);

    const draft = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Wipe me",
        projectName: "Wipe Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T13:00:00+09:00",
      }),
    );
    repository.addSessionImport(
      draft.session.id,
      normalizeManualNote({
        projectId: draft.project.id,
        sessionId: draft.session.id,
        title: "Note",
        note: "to be cleared",
        capturedAt: "2026-05-12T13:05:00+09:00",
      }),
    );
    repository.saveSessionMemoryBody(draft.session.id, {
      issues: [],
      decisions: [],
      nextActions: [],
    });
    repository.saveMoriPackageDraft(createMoriPackageFromSession(mockSession));

    // Configuration the reset must keep.
    repository.saveQuickPassSettings({ ...DEFAULT_QUICK_PASS_SETTINGS, provider: "ollama" });
    repository.saveRepositorySettings({
      repositories: [
        { id: "r-a", label: "A", path: "/repo/a", createdAt: "2026-05-12T13:00:00+09:00" },
      ],
      selectedRepositoryId: "r-a",
    });

    repository.clearAllLocalData();

    expect(repository.loadCurrentSessionDraft()).toBeNull();
    expect(repository.listStoredSessions()).toHaveLength(0);
    expect(repository.listSessionImports(draft.session.id)).toHaveLength(0);
    expect(repository.loadSessionMemoryBody(draft.session.id)).toBeNull();
    expect(repository.listMoriPackageDrafts()).toHaveLength(0);

    // Settings survive the wipe.
    expect(repository.loadQuickPassSettings().provider).toBe("ollama");
    expect(repository.loadRepositorySettings().repositories).toHaveLength(1);
  });

  it("setCurrentSession promotes a stored session without restamping savedAt", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const draftA = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Earlier session",
        projectName: "Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T13:00:00+09:00",
      }),
    );
    repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Later session",
        projectName: "Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T15:00:00+09:00",
      }),
    );

    const promoted = repository.setCurrentSession(draftA.session.id);

    expect(promoted?.session.id).toBe(draftA.session.id);
    expect(promoted?.savedAt).toBe(draftA.savedAt);
    expect(repository.loadCurrentSessionDraft()?.session.id).toBe(draftA.session.id);
  });

  it("setCurrentSession returns null for an unknown session id", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    expect(repository.setCurrentSession("missing-session")).toBeNull();
  });

  it("loadStoredSessionDraft reads a session without changing the current pointer", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const earlier = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Earlier",
        projectName: "Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T13:00:00+09:00",
      }),
    );
    const later = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Later",
        projectName: "Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T15:00:00+09:00",
      }),
    );

    const loaded = repository.loadStoredSessionDraft(earlier.session.id);
    expect(loaded?.session.id).toBe(earlier.session.id);
    // The current pointer is untouched — still on the later session.
    expect(repository.loadCurrentSessionDraft()?.session.id).toBe(later.session.id);
    expect(repository.loadStoredSessionDraft("missing")).toBeNull();
  });

  it("saveStoredSessionMetadata rewrites a background session without restamping savedAt", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const background = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Background",
        projectName: "Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T13:00:00+09:00",
      }),
    );
    const active = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Active",
        projectName: "Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T15:00:00+09:00",
      }),
    );

    const saved = repository.saveStoredSessionMetadata(background.session.id, {
      ...background,
      session: { ...background.session, title: "Renamed background" },
    });

    expect(saved?.session.title).toBe("Renamed background");
    expect(saved?.savedAt).toBe(background.savedAt);
    // Editing a background session must not repoint the current session.
    expect(repository.loadCurrentSessionDraft()?.session.id).toBe(active.session.id);
    const reread = repository.loadStoredSessionDraft(background.session.id);
    expect(reread?.session.title).toBe("Renamed background");
  });

  it("saveStoredSessionMetadata mirrors into the current key when editing the current session", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const current = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Current",
        projectName: "Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T13:00:00+09:00",
      }),
    );

    repository.saveStoredSessionMetadata(current.session.id, {
      ...current,
      session: { ...current.session, title: "Current renamed" },
    });

    expect(repository.loadCurrentSessionDraft()?.session.title).toBe("Current renamed");
    expect(repository.saveStoredSessionMetadata("missing", current)).toBeNull();
  });

  it("persists an optional importSummary on a session import and reads it back", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const draft = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Summary session",
        projectName: "Project",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T13:00:00+09:00",
      }),
    );
    const note = normalizeManualNote({
      projectId: draft.project.id,
      sessionId: draft.session.id,
      title: "Note",
      note: "Hello",
      capturedAt: "2026-05-12T13:05:00+09:00",
    });
    const stored = repository.addSessionImport(draft.session.id, note, {
      importSummary: {
        status: "partialReimport",
        totalValidEvents: 5,
        newEventCount: 2,
        duplicateEventCount: 3,
        currentSessionDuplicateCount: 1,
        savedSessionDuplicateCount: 2,
        inBatchDuplicateCount: 0,
        invalidLineCount: 0,
        matchedSavedSessions: [{ sessionId: "saved-a", title: "Saved A" }],
        connectorIds: ["claudeCodeHook"],
        eventKinds: [],
        timeRange: { earliestOccurredAt: null, latestOccurredAt: null },
        canImportNewEvents: true,
        savedSessionHistoryAvailable: true,
        defaultAction: "importNewEvents",
        userMessage: "Partial re-import · 2 new / 3 already imported",
        detailMessage: "detail",
      },
    });
    expect(stored.importSummary?.status).toBe("partialReimport");

    const reloaded = repository.listSessionImports(draft.session.id);
    expect(reloaded[0]?.importSummary?.status).toBe("partialReimport");
    expect(reloaded[0]?.importSummary?.matchedSavedSessions[0]?.title).toBe("Saved A");
  });

  it("loads old session imports without an importSummary field as undefined", () => {
    const storage = new MemoryKeyValueStorage();
    // Simulate a record persisted before this milestone — no importSummary key.
    storage.setItem(
      "mori.sessionImports.legacy",
      JSON.stringify([
        {
          id: "src-legacy",
          sessionId: "legacy",
          source: {
            id: "src-legacy",
            sessionId: "legacy",
            kind: "manualNote",
            title: "Old note",
            detail: "",
            trustLevel: "verified",
            redactionStatus: "notNeeded",
            rawRetention: "retained",
            capturedAt: "2026-05-01T00:00:00Z",
            relatedEventIds: [],
          },
          events: [],
          savedAt: "2026-05-01T00:00:00Z",
          adapter: "browser-local-storage",
        },
      ]),
    );
    const repository = new BrowserDraftRepository(storage);
    const reloaded = repository.listSessionImports("legacy");
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.importSummary).toBeUndefined();
  });

  it("lists connector event identity snapshots across saved sessions", () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const draftA = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Session A",
        projectName: "Project A",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-12T13:00:00+09:00",
      }),
    );
    repository.addSessionImport(draftA.session.id, {
      source: {
        id: "src-a",
        sessionId: draftA.session.id,
        kind: "claudeTranscript",
        title: "Saved Claude",
        detail: "",
        trustLevel: "verified",
        redactionStatus: "notNeeded",
        rawRetention: "summaryOnly",
        capturedAt: "2026-05-12T13:00:00Z",
        relatedEventIds: ["evt-a-1"],
      },
      events: [
        {
          id: "evt-a-1",
          sessionId: draftA.session.id,
          projectId: draftA.project.id,
          start: "2026-05-12T13:00:00Z",
          type: "aiConversation",
          title: "Saved Claude",
          summary: "",
          sourceRefs: ["src-a"],
          linkedIssueIds: [],
          linkedDecisionIds: [],
          relationshipIds: [],
          trustLevel: "verified",
          confidence: 0.9,
          createdBy: "import",
          userModified: false,
          connectorEventId: "claudeCodeHook::sess-a::evt-a-1",
        },
      ],
    });

    const draftB = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "Session B",
        projectName: "Project B",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-13T13:00:00+09:00",
      }),
    );
    repository.addSessionImport(draftB.session.id, {
      source: {
        id: "src-b",
        sessionId: draftB.session.id,
        kind: "manualNote",
        title: "Manual note",
        detail: "",
        trustLevel: "verified",
        redactionStatus: "notNeeded",
        rawRetention: "retained",
        capturedAt: "2026-05-13T13:00:00Z",
        relatedEventIds: ["evt-b-1"],
      },
      events: [
        {
          id: "evt-b-1",
          sessionId: draftB.session.id,
          projectId: draftB.project.id,
          start: "2026-05-13T13:00:00Z",
          type: "documentNote",
          title: "Note",
          summary: "",
          sourceRefs: ["src-b"],
          linkedIssueIds: [],
          linkedDecisionIds: [],
          relationshipIds: [],
          trustLevel: "verified",
          confidence: 1,
          createdBy: "import",
          userModified: false,
        },
      ],
    });

    const all = repository.listConnectorEventIdentitySnapshots();
    expect(all).toHaveLength(2);
    const aSnapshot = all.find((entry) => entry.sessionId === draftA.session.id);
    expect(aSnapshot?.connectorEventIds).toEqual(["claudeCodeHook::sess-a::evt-a-1"]);
    const bSnapshot = all.find((entry) => entry.sessionId === draftB.session.id);
    expect(bSnapshot?.connectorEventIds).toEqual([]);

    const filtered = repository.listConnectorEventIdentitySnapshots({
      excludeSessionId: draftA.session.id,
    });
    expect(filtered.map((entry) => entry.sessionId)).toEqual([draftB.session.id]);
  });

  it("persists, hydrates, and sanitizes repository settings", () => {
    const storage = new MemoryKeyValueStorage();
    const repository = new BrowserDraftRepository(storage);
    expect(repository.loadRepositorySettings().repositories).toHaveLength(0);

    const saved = repository.saveRepositorySettings({
      repositories: [
        { id: "r-a", label: "A", path: "/repo/a", createdAt: "2026-05-12T13:00:00+09:00" },
        // duplicate path should collapse
        { id: "r-b", label: "B", path: "/repo/a", createdAt: "2026-05-12T13:00:00+09:00" },
        // missing path should be dropped
        { id: "r-c", label: "C", path: "", createdAt: "2026-05-12T13:00:00+09:00" },
      ],
      selectedRepositoryId: "r-missing",
    });
    expect(saved.repositories).toHaveLength(1);
    expect(saved.selectedRepositoryId).toBe("r-a");

    const reloaded = repository.loadRepositorySettings();
    expect(reloaded.repositories[0].path).toBe("/repo/a");
    expect(reloaded.selectedRepositoryId).toBe("r-a");

    storage.setItem("mori.repositorySettings", "{not valid json");
    expect(repository.loadRepositorySettings().repositories).toHaveLength(0);
  });
});

function makeAnalysisResult(
  sessionId: string,
  runId: string,
  overrides: Partial<AnalysisResult> = {},
): AnalysisResult {
  const generatedAt = overrides.generatedAt ?? "2026-05-12T13:30:00.000Z";
  return {
    runId,
    providerName: overrides.providerName ?? "deterministic-heuristic-v1",
    providerLabel: overrides.providerLabel ?? "Deterministic",
    sessionId,
    projectId: overrides.projectId ?? "proj-1",
    generatedAt,
    durationMs: overrides.durationMs ?? 10,
    inputEventCount: overrides.inputEventCount ?? 0,
    inputSourceCount: overrides.inputSourceCount ?? 0,
    summary: overrides.summary ?? { sessionSummary: "", resumePrompt: "", highlights: [] },
    issues: overrides.issues ?? [],
    decisions: overrides.decisions ?? [],
    relationships: overrides.relationships ?? [],
    nextActions: overrides.nextActions ?? [],
    rendered: overrides.rendered ?? {
      summary: {
        id: `summary-${runId}`,
        sessionId,
        sessionSummary: "",
        resumePrompt: "",
        reportMarkdown: "",
        nextActionIds: [],
        generatedAt,
      },
    },
    confidence: overrides.confidence ?? 0.75,
    notes: overrides.notes ?? [],
  };
}
