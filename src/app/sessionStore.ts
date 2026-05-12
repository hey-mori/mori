import { create } from "zustand";
import { moriMockSession } from "../domain/mock-data";
import type { MoriMockSession } from "../domain/types";
import type { NormalizedImportCandidate } from "../lib/import";
import { composeSessionView } from "../lib/session/composeSessionView";
import { createBrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import type { MoriDraftRepository, StoredSessionDraft, StoredSessionImport } from "../lib/storage/storageTypes";

export type SessionMode = "demo" | "draft";

export type SessionViewModel = MoriMockSession & {
  isDemo: boolean;
};

export type MoriSessionState = {
  initialized: boolean;
  draft: StoredSessionDraft | null;
  imports: StoredSessionImport[];
  hydrate: () => void;
  setDraft: (draft: StoredSessionDraft) => void;
  addImport: (candidate: NormalizedImportCandidate) => StoredSessionImport | null;
  removeImport: (importId: string) => void;
  resetToDemo: () => void;
};

const demoView: SessionViewModel = { ...moriMockSession, isDemo: true };

let lazyRepository: MoriDraftRepository | null = null;

function getRepository(): MoriDraftRepository {
  if (!lazyRepository) {
    lazyRepository = createBrowserDraftRepository();
  }
  return lazyRepository;
}

export function setSessionRepositoryForTesting(repository: MoriDraftRepository | null): void {
  lazyRepository = repository;
}

export const useMoriSessionStore = create<MoriSessionState>((set, get) => ({
  initialized: false,
  draft: null,
  imports: [],
  hydrate: () => {
    const repository = getRepository();
    const draft = repository.loadCurrentSessionDraft();
    const imports = draft ? repository.listSessionImports(draft.session.id) : [];
    set({ initialized: true, draft, imports });
  },
  setDraft: (draft) => {
    const repository = getRepository();
    const imports = repository.listSessionImports(draft.session.id);
    set({ draft, imports, initialized: true });
  },
  addImport: (candidate) => {
    const repository = getRepository();
    const draft = get().draft;
    if (!draft) return null;

    const stored = repository.addSessionImport(draft.session.id, candidate);
    set({ imports: repository.listSessionImports(draft.session.id) });
    return stored;
  },
  removeImport: (importId) => {
    const repository = getRepository();
    const draft = get().draft;
    if (!draft) return;
    repository.removeSessionImport(draft.session.id, importId);
    set({ imports: repository.listSessionImports(draft.session.id) });
  },
  resetToDemo: () => {
    const repository = getRepository();
    repository.clearCurrentSessionDraft();
    set({ draft: null, imports: [] });
  },
}));

export function selectSessionView(state: MoriSessionState): SessionViewModel {
  if (!state.draft) return demoView;
  return composeSessionView({ draft: state.draft, imports: state.imports });
}

export function selectSessionMode(state: MoriSessionState): SessionMode {
  return state.draft ? "draft" : "demo";
}
