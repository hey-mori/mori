import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
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
  });
});
