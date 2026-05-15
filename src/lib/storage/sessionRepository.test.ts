import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import { createDeterministicQuickPassProvider } from "../analysis";
import { normalizeAiConversationText, normalizeManualNote, normalizeUrlSource } from "../import";
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
    const pkg = createMoriPackageFromSession(moriMockSession);

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
