import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRepositoryStorageForTesting, useMoriRepositoryStore } from "./repositoryStore";
import { BrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import { MemoryKeyValueStorage } from "../lib/storage/memoryStorage";
import { DEFAULT_REPOSITORY_SETTINGS } from "../lib/repositories";

function freshStorage() {
  const storage = new MemoryKeyValueStorage();
  const repository = new BrowserDraftRepository(storage);
  setRepositoryStorageForTesting(repository);
  return repository;
}

function resetStore() {
  useMoriRepositoryStore.setState({
    initialized: false,
    settings: { ...DEFAULT_REPOSITORY_SETTINGS },
    verifyingId: null,
  });
}

describe("useMoriRepositoryStore.refreshRepositoryMetadataAfterCapture", () => {
  beforeEach(() => {
    freshStorage();
    resetStore();
    vi.doMock("../lib/desktop", async () => {
      const actual = await vi.importActual<typeof import("../lib/desktop")>("../lib/desktop");
      return actual;
    });
  });

  afterEach(() => {
    setRepositoryStorageForTesting(null);
    resetStore();
    vi.restoreAllMocks();
  });

  it("returns an explicit failure when the saved repo id is unknown", async () => {
    const outcome = await useMoriRepositoryStore.getState().refreshRepositoryMetadataAfterCapture("missing-id");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain("missing-id");
    }
  });
});

describe("useMoriRepositoryStore explicit-flow behavior", () => {
  beforeEach(() => {
    freshStorage();
    resetStore();
  });

  afterEach(() => {
    setRepositoryStorageForTesting(null);
    resetStore();
  });

  it("markRepositoryUsed records lastUsedAt without touching verification metadata", () => {
    const added = useMoriRepositoryStore.getState().addRepository({
      path: "C:/dev/mori",
      now: "2026-05-12T13:00:00+09:00",
    });
    expect(added).not.toBeNull();
    if (!added) return;

    useMoriRepositoryStore.getState().markRepositoryUsed(added.id, "2026-05-12T14:00:00+09:00");
    const repo = useMoriRepositoryStore
      .getState()
      .settings.repositories.find((entry) => entry.id === added.id);
    expect(repo?.lastUsedAt).toBe("2026-05-12T14:00:00+09:00");
    expect(repo?.verification).toBeUndefined();
  });

  it("preserves prior verified metadata when post-capture refresh fails", async () => {
    const added = useMoriRepositoryStore.getState().addRepository({
      path: "C:/dev/mori",
      now: "2026-05-12T13:00:00+09:00",
    });
    if (!added) return;

    const priorVerification = {
      status: "verified" as const,
      verifiedAt: "2026-05-12T13:30:00+09:00",
      gitRoot: "C:/dev/mori",
      currentBranch: "main",
      headCommit: "deadbeefcafebabe",
      shortHeadCommit: "deadbee",
      isDirty: false,
    };
    useMoriRepositoryStore.setState((state) => ({
      settings: {
        ...state.settings,
        repositories: state.settings.repositories.map((entry) =>
          entry.id !== added.id ? entry : { ...entry, verification: priorVerification },
        ),
      },
    }));

    // The bridge throws the standard "requires the Tauri app" error in the test runtime.
    const outcome = await useMoriRepositoryStore.getState().refreshRepositoryMetadataAfterCapture(added.id);
    expect(outcome.ok).toBe(false);

    const repo = useMoriRepositoryStore
      .getState()
      .settings.repositories.find((entry) => entry.id === added.id);
    // Refresh failed, but the previously verified record must survive intact.
    expect(repo?.verification).toEqual(priorVerification);
  });

  it("records a failed verification when there was no prior verified record", async () => {
    const added = useMoriRepositoryStore.getState().addRepository({
      path: "C:/dev/mori",
      now: "2026-05-12T13:00:00+09:00",
    });
    if (!added) return;
    expect(added.verification).toBeUndefined();

    const outcome = await useMoriRepositoryStore.getState().refreshRepositoryMetadataAfterCapture(added.id);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    const repo = useMoriRepositoryStore
      .getState()
      .settings.repositories.find((entry) => entry.id === added.id);
    expect(repo?.verification?.status).toBe("failed");
    expect(repo?.verification?.error).toContain("requires the Tauri app");
  });

  it("clearRepositoryVerification removes only the verification block", () => {
    const added = useMoriRepositoryStore.getState().addRepository({
      path: "C:/dev/mori",
      now: "2026-05-12T13:00:00+09:00",
    });
    if (!added) return;

    // Inject a verified record directly so we don't need the desktop bridge.
    useMoriRepositoryStore.setState((state) => ({
      settings: {
        ...state.settings,
        repositories: state.settings.repositories.map((entry) =>
          entry.id !== added.id
            ? entry
            : {
                ...entry,
                verification: {
                  status: "verified",
                  verifiedAt: new Date().toISOString(),
                  gitRoot: "C:/dev/mori",
                  currentBranch: "main",
                  headCommit: "deadbeefcafebabe",
                  shortHeadCommit: "deadbee",
                  isDirty: false,
                },
              },
        ),
      },
    }));

    useMoriRepositoryStore.getState().clearRepositoryVerification(added.id);
    const repo = useMoriRepositoryStore
      .getState()
      .settings.repositories.find((entry) => entry.id === added.id);
    expect(repo?.verification).toBeUndefined();
    expect(repo?.path).toBe("C:/dev/mori");
  });
});
