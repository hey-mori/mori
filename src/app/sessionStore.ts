import { create } from "zustand";
import { moriMockSession } from "../domain/mock-data";
import type { MoriMockSession } from "../domain/types";
import type {
  MoriAnalysisProvider,
  MoriAnalysisResult,
  MoriAnalysisStatus,
  QuickPassAnalysisSettings,
} from "../lib/analysis";
import {
  DEFAULT_QUICK_PASS_SETTINGS,
  createDeterministicQuickPassProvider,
  createOllamaQuickPassProvider,
  sanitizeQuickPassSettings,
} from "../lib/analysis";
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
  analysisFallbackUsed: boolean;
  analysisSettings: QuickPassAnalysisSettings;
  hydrate: () => void;
  setDraft: (draft: StoredSessionDraft) => void;
  addImport: (candidate: NormalizedImportCandidate) => StoredSessionImport | null;
  removeImport: (importId: string) => void;
  resetToDemo: () => void;
  runQuickPass: (provider?: MoriAnalysisProvider) => Promise<MoriAnalysisResult | null>;
  clearAnalysis: () => void;
  updateAnalysisSettings: (patch: Partial<QuickPassAnalysisSettings>) => QuickPassAnalysisSettings;
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
  analysisFallbackUsed: false,
  analysisSettings: { ...DEFAULT_QUICK_PASS_SETTINGS },
  hydrate: () => {
    const repository = getRepository();
    const draft = repository.loadCurrentSessionDraft();
    const imports = draft ? repository.listSessionImports(draft.session.id) : [];
    const analysisRecord = draft ? repository.loadSessionAnalysis(draft.session.id) : null;
    const analysisSettings = repository.loadQuickPassSettings();
    set({
      initialized: true,
      draft,
      imports,
      analysis: analysisRecord?.result ?? null,
      analysisStatus: analysisRecord ? "succeeded" : "idle",
      analysisError: null,
      analysisProviderLabel: analysisRecord?.result.providerLabel ?? null,
      analysisFallbackUsed: false,
      analysisSettings,
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
      analysisFallbackUsed: false,
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
      analysisFallbackUsed: false,
    });
  },
  runQuickPass: async (provider) => {
    const repository = getRepository();
    const state = get();
    const draft = state.draft;
    if (!draft) {
      set({
        analysisStatus: "failed",
        analysisError: "Start a session and import data before running Quick Pass.",
        analysisFallbackUsed: false,
      });
      return null;
    }
    const imports = state.imports;
    if (!imports.length) {
      set({
        analysisStatus: "failed",
        analysisError: "Import a note, URL, or AI conversation before running Quick Pass.",
        analysisFallbackUsed: false,
      });
      return null;
    }

    const settings = state.analysisSettings;
    const primary = provider ?? resolveProviderFromSettings(settings);
    const events = imports.flatMap((entry) => entry.events);
    const sources = imports.map((entry) => entry.source);
    const analysisInput = {
      project: draft.project,
      session: draft.session,
      sources,
      events,
    };

    set({
      analysisStatus: "running",
      analysisError: null,
      analysisProviderLabel: primary.label,
      analysisFallbackUsed: false,
    });

    try {
      const result = await primary.analyze(analysisInput);
      repository.saveSessionAnalysis(draft.session.id, result);
      set({
        analysis: result,
        analysisStatus: "succeeded",
        analysisError: null,
        analysisProviderLabel: primary.label,
        analysisFallbackUsed: false,
      });
      return result;
    } catch (primaryError) {
      const primaryMessage = primaryError instanceof Error ? primaryError.message : "Quick Pass failed";

      if (
        settings.provider === "ollama" &&
        settings.fallbackToDeterministic &&
        primary.name !== "deterministic-heuristic-v1"
      ) {
        const deterministic = getDefaultProvider();
        try {
          const fallbackResult = await deterministic.analyze(analysisInput);
          const annotated: MoriAnalysisResult = {
            ...fallbackResult,
            notes: [
              `Ollama provider (${primary.label}) failed: ${primaryMessage}. Fell back to ${deterministic.label}.`,
              ...fallbackResult.notes,
            ],
          };
          repository.saveSessionAnalysis(draft.session.id, annotated);
          set({
            analysis: annotated,
            analysisStatus: "succeeded",
            analysisError: null,
            analysisProviderLabel: deterministic.label,
            analysisFallbackUsed: true,
          });
          return annotated;
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Fallback failed";
          set({
            analysisStatus: "failed",
            analysisError: `Primary failed: ${primaryMessage}. Fallback failed: ${fallbackMessage}.`,
            analysisProviderLabel: deterministic.label,
            analysisFallbackUsed: true,
          });
          return null;
        }
      }

      set({
        analysisStatus: "failed",
        analysisError: primaryMessage,
        analysisProviderLabel: primary.label,
        analysisFallbackUsed: false,
      });
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
      analysisFallbackUsed: false,
    });
  },
  updateAnalysisSettings: (patch) => {
    const repository = getRepository();
    const next = sanitizeQuickPassSettings({ ...get().analysisSettings, ...patch });
    repository.saveQuickPassSettings(next);
    set({ analysisSettings: next });
    return next;
  },
}));

function resolveProviderFromSettings(settings: QuickPassAnalysisSettings): MoriAnalysisProvider {
  if (settings.provider === "ollama") {
    return createOllamaQuickPassProvider({
      endpoint: settings.ollamaEndpoint,
      model: settings.ollamaModel,
      timeoutMs: settings.ollamaTimeoutMs,
    });
  }
  return getDefaultProvider();
}

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
