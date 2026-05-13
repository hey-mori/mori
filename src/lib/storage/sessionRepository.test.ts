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
