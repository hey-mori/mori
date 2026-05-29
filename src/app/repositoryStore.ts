import { create } from "zustand";
import {
  addRepositoryConfig,
  DEFAULT_REPOSITORY_SETTINGS,
  removeRepositoryConfig,
  setRepositoryVerification,
  setSelectedRepository,
  updateRepositoryConfig,
  type AddRepositoryInput,
  type RepositoryConfig,
  type RepositorySettings,
  type RepositoryVerificationMetadata,
} from "../lib/repositories";
import { createBrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import type { DraftRepository } from "../lib/storage/storageTypes";
import { verifyRepositoryPath } from "../lib/desktop";

export type RefreshMetadataOutcome =
  | { ok: true; verification: RepositoryVerificationMetadata }
  | { ok: false; error: string };

export type RepositoryState = {
  initialized: boolean;
  settings: RepositorySettings;
  verifyingId: string | null;
  hydrate: () => void;
  addRepository: (input: AddRepositoryInput) => RepositoryConfig | null;
  removeRepository: (repositoryId: string) => void;
  renameRepository: (repositoryId: string, label: string) => void;
  selectRepository: (repositoryId: string | null) => void;
  markRepositoryUsed: (repositoryId: string, now?: string) => void;
  verifyRepository: (repositoryId: string) => Promise<RepositoryVerificationMetadata | null>;
  refreshRepositoryMetadataAfterCapture: (repositoryId: string) => Promise<RefreshMetadataOutcome>;
  clearRepositoryVerification: (repositoryId: string) => void;
};

let lazyRepository: DraftRepository | null = null;

function getRepository(): DraftRepository {
  if (!lazyRepository) {
    lazyRepository = createBrowserDraftRepository();
  }
  return lazyRepository;
}

export function setRepositoryStorageForTesting(repository: DraftRepository | null): void {
  lazyRepository = repository;
}

export const useRepositoryStore = create<RepositoryState>((set, get) => ({
  initialized: false,
  settings: { ...DEFAULT_REPOSITORY_SETTINGS },
  verifyingId: null,
  hydrate: () => {
    const store = getRepository();
    const settings = store.loadRepositorySettings();
    set({ initialized: true, settings });
  },
  addRepository: (input) => {
    const store = getRepository();
    try {
      const { repository, settings } = addRepositoryConfig(get().settings, input);
      const persisted = store.saveRepositorySettings(settings);
      set({ settings: persisted });
      return repository;
    } catch {
      return null;
    }
  },
  removeRepository: (repositoryId) => {
    const store = getRepository();
    const next = removeRepositoryConfig(get().settings, repositoryId);
    const persisted = store.saveRepositorySettings(next);
    set({ settings: persisted });
  },
  renameRepository: (repositoryId, label) => {
    const store = getRepository();
    const next = updateRepositoryConfig(get().settings, repositoryId, { label });
    const persisted = store.saveRepositorySettings(next);
    set({ settings: persisted });
  },
  selectRepository: (repositoryId) => {
    const store = getRepository();
    const next = setSelectedRepository(get().settings, repositoryId);
    const persisted = store.saveRepositorySettings(next);
    set({ settings: persisted });
  },
  markRepositoryUsed: (repositoryId, now) => {
    const store = getRepository();
    const next = updateRepositoryConfig(get().settings, repositoryId, {
      lastUsedAt: now ?? new Date().toISOString(),
    });
    const persisted = store.saveRepositorySettings(next);
    set({ settings: persisted });
  },
  verifyRepository: async (repositoryId) => {
    const store = getRepository();
    const repo = get().settings.repositories.find((entry) => entry.id === repositoryId);
    if (!repo) return null;

    set({ verifyingId: repositoryId });
    try {
      const result = await verifyRepositoryPath({ repoPath: repo.path });
      const verification: RepositoryVerificationMetadata = {
        status: "verified",
        verifiedAt: result.verifiedAt,
        gitRoot: result.gitRoot,
        currentBranch: result.currentBranch ?? undefined,
        headCommit: result.headCommit,
        shortHeadCommit: result.shortHeadCommit,
        isDirty: result.isDirty,
      };
      const next = setRepositoryVerification(get().settings, repositoryId, verification);
      const persisted = store.saveRepositorySettings(next);
      set({ settings: persisted });
      return verification;
    } catch (error) {
      const verification: RepositoryVerificationMetadata = {
        status: "failed",
        verifiedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
      const next = setRepositoryVerification(get().settings, repositoryId, verification);
      const persisted = store.saveRepositorySettings(next);
      set({ settings: persisted });
      return verification;
    } finally {
      if (get().verifyingId === repositoryId) {
        set({ verifyingId: null });
      }
    }
  },
  refreshRepositoryMetadataAfterCapture: async (repositoryId) => {
    const store = getRepository();
    const repo = get().settings.repositories.find((entry) => entry.id === repositoryId);
    if (!repo) {
      return { ok: false, error: `Repository ${repositoryId} not found.` };
    }

    set({ verifyingId: repositoryId });
    try {
      const result = await verifyRepositoryPath({ repoPath: repo.path });
      const verification: RepositoryVerificationMetadata = {
        status: "verified",
        verifiedAt: result.verifiedAt,
        gitRoot: result.gitRoot,
        currentBranch: result.currentBranch ?? undefined,
        headCommit: result.headCommit,
        shortHeadCommit: result.shortHeadCommit,
        isDirty: result.isDirty,
      };
      const next = setRepositoryVerification(get().settings, repositoryId, verification);
      const persisted = store.saveRepositorySettings(next);
      set({ settings: persisted });
      return { ok: true, verification };
    } catch (error) {
      // A successful capture should never erase a previously verified result
      // just because the post-capture refresh failed. We only flip the stored
      // status to "failed" when there is no prior verified metadata to
      // preserve; otherwise we keep the existing record so the user can
      // re-verify explicitly later.
      const message = error instanceof Error ? error.message : String(error);
      const previous = repo.verification;
      if (!previous || previous.status !== "verified") {
        const failed: RepositoryVerificationMetadata = {
          status: "failed",
          verifiedAt: new Date().toISOString(),
          error: message,
        };
        const next = setRepositoryVerification(get().settings, repositoryId, failed);
        const persisted = store.saveRepositorySettings(next);
        set({ settings: persisted });
      }
      return { ok: false, error: message };
    } finally {
      if (get().verifyingId === repositoryId) {
        set({ verifyingId: null });
      }
    }
  },
  clearRepositoryVerification: (repositoryId) => {
    const store = getRepository();
    const next = setRepositoryVerification(get().settings, repositoryId, null);
    const persisted = store.saveRepositorySettings(next);
    set({ settings: persisted });
  },
}));

export function selectActiveRepository(state: RepositoryState): RepositoryConfig | null {
  const { settings } = state;
  if (!settings.selectedRepositoryId) return null;
  return settings.repositories.find((entry) => entry.id === settings.selectedRepositoryId) ?? null;
}
