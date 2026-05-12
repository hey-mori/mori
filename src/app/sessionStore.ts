import { create } from "zustand";
import { moriMockSession } from "../domain/mock-data";
import type { MoriMockSession } from "../domain/types";
import type {
  MoriAnalysisProvider,
  MoriAnalysisResult,
  MoriAnalysisStatus,
} from "../lib/analysis";
import { createDeterministicQuickPassProvider } from "../lib/analysis";
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
  analysis: MoriAnalysisResult | null;
  analysisStatus: MoriAnalysisStatus;
  analysisError: string | null;
  analysisProviderLabel: string | null;
  hydrate: () => void;
  setDraft: (draft: StoredSessionDraft) => void;
  addImport: (candidate: NormalizedImportCandidate) => StoredSessionImport | null;
  removeImport: (importId: string) => void;
  resetToDemo: () => void;
  runQuickPass: (provider?: MoriAnalysisProvider) => Promise<MoriAnalysisResult | null>;
  clearAnalysis: () => void;
};

const demoView: SessionViewModel = { ...moriMockSession, isDemo: true };

let lazyRepository: MoriDraftRepository | null = null;
let lazyProvider: MoriAnalysisProvider | null = null;

function getRepository(): MoriDraftRepository {
  if (!lazyRepository) {
    lazyRepository = createBrowserDraftRepository();
  }
  return lazyRepository;
}

function getDefaultProvider(): MoriAnalysisProvider {
  if (!lazyProvider) {
    lazyProvider = createDeterministicQuickPassProvider();
  }
  return lazyProvider;
}

export function setSessionRepositoryForTesting(repository: MoriDraftRepository | null): void {
  lazyRepository = repository;
}

export function setDefaultQuickPassProviderForTesting(provider: MoriAnalysisProvider | null): void {
  lazyProvider = provider;
}

export const useMoriSessionStore = create<MoriSessionState>((set, get) => ({
  initialized: false,
  draft: null,
  imports: [],
  analysis: null,
  analysisStatus: "idle",
  analysisError: null,
  analysisProviderLabel: null,
  hydrate: () => {
    const repository = getRepository();
    const draft = repository.loadCurrentSessionDraft();
    const imports = draft ? repository.listSessionImports(draft.session.id) : [];
    const analysisRecord = draft ? repository.loadSessionAnalysis(draft.session.id) : null;
    set({
      initialized: true,
      draft,
      imports,
      analysis: analysisRecord?.result ?? null,
      analysisStatus: analysisRecord ? "succeeded" : "idle",
      analysisError: null,
      analysisProviderLabel: analysisRecord?.result.providerLabel ?? null,
    });
  },
  setDraft: (draft) => {
    const repository = getRepository();
    const imports = repository.listSessionImports(draft.session.id);
    const analysisRecord = repository.loadSessionAnalysis(draft.session.id);
    set({
      draft,
      imports,
      analysis: analysisRecord?.result ?? null,
      analysisStatus: analysisRecord ? "succeeded" : "idle",
      analysisError: null,
      analysisProviderLabel: analysisRecord?.result.providerLabel ?? null,
      initialized: true,
    });
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
    set({
      draft: null,
      imports: [],
      analysis: null,
      analysisStatus: "idle",
      analysisError: null,
      analysisProviderLabel: null,
    });
  },
  runQuickPass: async (provider) => {
    const repository = getRepository();
    const state = get();
    const draft = state.draft;
    if (!draft) {
      set({ analysisStatus: "failed", analysisError: "Start a session and import data before running Quick Pass." });
      return null;
    }
    const imports = state.imports;
    if (!imports.length) {
      set({ analysisStatus: "failed", analysisError: "Import a note, URL, or AI conversation before running Quick Pass." });
      return null;
    }

    const chosen = provider ?? getDefaultProvider();
    set({ analysisStatus: "running", analysisError: null, analysisProviderLabel: chosen.label });
    try {
      const events = imports.flatMap((entry) => entry.events);
      const sources = imports.map((entry) => entry.source);
      const result = await chosen.analyze({
        project: draft.project,
        session: draft.session,
        sources,
        events,
      });
      repository.saveSessionAnalysis(draft.session.id, result);
      set({
        analysis: result,
        analysisStatus: "succeeded",
        analysisError: null,
        analysisProviderLabel: chosen.label,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Quick Pass failed";
      set({ analysisStatus: "failed", analysisError: message, analysisProviderLabel: chosen.label });
      return null;
    }
  },
  clearAnalysis: () => {
    const repository = getRepository();
    const draft = get().draft;
    if (draft) repository.clearSessionAnalysis(draft.session.id);
    set({
      analysis: null,
      analysisStatus: "idle",
      analysisError: null,
      analysisProviderLabel: null,
    });
  },
}));

type ViewCache = {
  draft: StoredSessionDraft | null;
  imports: StoredSessionImport[];
  analysis: MoriAnalysisResult | null;
  view: SessionViewModel;
};

let viewCache: ViewCache | null = null;

export function selectSessionView(state: MoriSessionState): SessionViewModel {
  if (!state.draft) return demoView;
  if (
    viewCache &&
    viewCache.draft === state.draft &&
    viewCache.imports === state.imports &&
    viewCache.analysis === state.analysis
  ) {
    return viewCache.view;
  }

  const base = composeSessionView({ draft: state.draft, imports: state.imports });
  const view = state.analysis ? mergeAnalysisIntoView(base, state.analysis) : base;
  viewCache = { draft: state.draft, imports: state.imports, analysis: state.analysis, view };
  return view;
}

export function selectSessionMode(state: MoriSessionState): SessionMode {
  return state.draft ? "draft" : "demo";
}

export function selectHasRealAnalysis(state: MoriSessionState): boolean {
  return Boolean(state.draft && state.analysis);
}

function mergeAnalysisIntoView(view: SessionViewModel, analysis: MoriAnalysisResult): SessionViewModel {
  return {
    ...view,
    issues: analysis.issues,
    decisions: analysis.decisions,
    relationships: [...view.relationships, ...analysis.relationships],
    nextActions: analysis.nextActions,
    summary: {
      ...view.summary,
      sessionSummary: analysis.summary.sessionSummary,
      resumePrompt: analysis.summary.resumePrompt,
      generatedAt: analysis.generatedAt,
      nextActionIds: analysis.nextActions.map((action) => action.id),
    },
  };
}
