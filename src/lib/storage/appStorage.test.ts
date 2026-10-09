import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppStorage, setAppStorageProvider } from "./appStorage";
import { createBrowserDraftRepository } from "./localStorageAdapter";
import { MemoryKeyValueStorage } from "./memoryStorage";
import type { KeyValueStorage } from "./storageTypes";

afterEach(() => {
  setAppStorageProvider(null);
  vi.unstubAllGlobals();
});

describe("the app storage", () => {
  it("lets a repository made before the read source was decided read what was decided", () => {
    const before = new MemoryKeyValueStorage();
    const restored = new MemoryKeyValueStorage();
    restored.setItem(
      "mori.sessionDraft.s1",
      JSON.stringify({ project: { id: "p", name: "P" }, session: { id: "s1", projectId: "p", title: "kept", startedAt: "", status: "complete" }, savedAt: "2026-01-01T00:00:00Z", adapter: "browser-local-storage" }),
    );
    let current: KeyValueStorage = before;
    // What durableReads registers: one storage that forwards each call.
    const forwarding: KeyValueStorage = {
      get length() {
        return current.length;
      },
      key: (i) => current.key(i),
      getItem: (k) => current.getItem(k),
      setItem: (k, v) => current.setItem(k, v),
      removeItem: (k) => current.removeItem(k),
    };
    setAppStorageProvider(() => forwarding);

    // The shell's first render builds the repository before hydrate decides.
    const repository = createBrowserDraftRepository();
    expect(repository.listStoredSessions()).toEqual([]);

    // The read flip engages afterwards.
    current = restored;
    expect(repository.listStoredSessions().map((s) => s.sessionId)).toEqual(["s1"]);
  });

  it("is the window's storage when no provider is registered", () => {
    const local = new MemoryKeyValueStorage();
    vi.stubGlobal("window", { localStorage: local });
    expect(getAppStorage()).toBe(local);
  });
});
