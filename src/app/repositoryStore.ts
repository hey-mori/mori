import { create } from "zustand";
import {
  addRepositoryConfig,
  DEFAULT_REPOSITORY_SETTINGS,
  removeRepositoryConfig,
  setRepositoryVerification,
  setSelectedRepository,
  updateRepositoryConfig,
  type AddRepositoryInput,
  type MoriRepositoryConfig,
  type RepositorySettings,
  type RepositoryVerificationMetadata,
} from "../lib/repositories";
import { createBrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import type { MoriDraftRepository } from "../lib/storage/storageTypes";
import { verifyRepositoryPath } from "../lib/desktop";

export type MoriRepositoryState = {
  initialized: boolean;
  settings: RepositorySettings;
  verifyingId: string | null;
  hydrate: () => void;
  addRepository: (input: AddRepositoryInput) => MoriRepositoryConfig | null;
  removeRepository: (repositoryId: string) => void;
  renameRepository: (repositoryId: string, label: string) => void;
  selectRepository: (repositoryId: string | null) => void;
  markRepositoryUsed: (repositoryId: string, now?: string) => void;
  verifyRepository: (repositoryId: string) => Promise<RepositoryVerificationMetadata | null>;
  clearRepositoryVerification: (repositoryId: string) => void;
};

let lazyRepository: MoriDraftRepository | null = null;

function getRepository(): MoriDraftRepository {
  if (!lazyRepository) {
    lazyRepository = createBrowserDraftRepository();
  }
  return lazyRepository;
}

export function setRepositoryStorageForTesting(repository: MoriDraftRepository | null): void {
  lazyRepository = repository;
}

export const useMoriRepositoryStore = create<MoriRepositoryState>((set, get) => ({
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
  clearRepositoryVerification: (repositoryId) => {
    const store = getRepository();
    const next = setRepositoryVerification(get().settings, repositoryId, null);
    const persisted = store.saveRepositorySettings(next);
    set({ settings: persisted });
  },
}));

export function selectActiveRepository(state: MoriRepositoryState): MoriRepositoryConfig | null {
  const { settings } = state;
  if (!settings.selectedRepositoryId) return null;
  return settings.repositories.find((entry) => entry.id === settings.selectedRepositoryId) ?? null;
}
