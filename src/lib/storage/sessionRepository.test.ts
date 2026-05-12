import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
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
});
