import { create } from "zustand";
import { moriMockSession } from "../domain/mock-data";
import type { IssueStatus, MoriMockSession } from "../domain/types";
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
import { withNextActionCompletion } from "../lib/session/nextActionCompletion";
import {
  createStaticMockDataSource,
  type TimelineDataSource,
  type Unsubscribe,
} from "../lib/session/timelineDataSource";
import { createBrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import {
  getSessionPersistenceService,
  type SessionPersistenceService,
} from "../lib/storage/sessionPersistenceService";
import type {
  ConnectorEventIdentitySnapshot,
  MoriDraftRepository,
  StoredSessionDraft,
  StoredSessionImport,
} from "../lib/storage/storageTypes";
import type {
  ConnectorImportHistorySavedSession,
  ConnectorSourceImportSummary,
} from "../lib/connectors";
import { isTauriRuntime } from "../lib/desktop";
import { getSessionImportRepository } from "../lib/storage/sessionImportRepository";

export type SessionMode = "demo" | "draft";

export type SessionSource = "demo" | "browser-draft" | "desktop-sqlite";

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
  source: SessionSource;
  /**
   * Live timeline data-source seam. Static today (there is no backend), so
   * it never emits. A future polling / SSE source is a drop-in replacement
   * at this field — see `lib/session/timelineDataSource.ts`.
   */
  dataSource: TimelineDataSource<SessionViewModel>;
  /**
   * Subscribe to live session-view updates. A no-op while the data source
   * is static; the wired seam for a future live transport.
   */
  subscribeToDataSource: (onUpdate: (view: SessionViewModel) => void) => Unsubscribe;
  hydrate: () => Promise<void>;
  setDraft: (draft: StoredSessionDraft) => void;
  /**
   * Finalise the active draft session: mark it `complete`, stamp a real
   * `endedAt`, and persist. A no-op in demo mode or when the session is
   * already complete.
   */
  endSession: () => void;
  addImport: (
    candidate: NormalizedImportCandidate,
    options?: { importSummary?: ConnectorSourceImportSummary },
  ) => StoredSessionImport | null;
  removeImport: (importId: string) => void;
  resetToDemo: () => void;
  runQuickPass: (provider?: MoriAnalysisProvider) => Promise<MoriAnalysisResult | null>;
  clearAnalysis: () => void;
  updateAnalysisSettings: (patch: Partial<QuickPassAnalysisSettings>) => QuickPassAnalysisSettings;
  loadDesktopSession: (sessionId: string) => Promise<boolean>;
  /**
   * Open an already-saved browser session draft as the active session.
   * Used by the Workspace project hub to continue a previous session.
   * Returns `false` when no draft is stored for the id.
   */
  loadBrowserSession: (sessionId: string) => boolean;
  /**
   * Mark a Next Action complete or pending — a Review-surface write.
   * Persists into the session analysis and the durable memory body so
   * the change survives reload and feeds Project Memory. Returns
   * `false` in demo mode, when there is no analysis, or when the id is
   * unknown.
   */
  setNextActionCompletion: (nextActionId: string, completed: boolean) => boolean;
  /**
   * Change an issue's status — a Review-surface write. Persists into the
   * session analysis and the durable memory body. Returns `false` in
   * demo mode, when there is no analysis, or when the id is unknown.
   */
  setIssueStatus: (issueId: string, status: IssueStatus) => boolean;
  /**
   * Confirm or reject a decision — a Review-surface write. Persists into
   * the session analysis and the durable memory body. Returns `false`
   * in demo mode, when there is no analysis, or when the id is unknown.
   */
  setDecisionConfirmed: (decisionId: string, confirmed: boolean) => boolean;
  markPersistedToDesktop: () => void;
};

const demoView: SessionViewModel = { ...moriMockSession, isDemo: true };

let lazyRepository: MoriDraftRepository | null = null;
let lazyProvider: MoriAnalysisProvider | null = null;
let lazyPersistenceService: SessionPersistenceService | null = null;

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

function getPersistenceService(): SessionPersistenceService {
  if (!lazyPersistenceService) lazyPersistenceService = getSessionPersistenceService();
  return lazyPersistenceService;
}

export function setSessionRepositoryForTesting(repository: MoriDraftRepository | null): void {
  lazyRepository = repository;
}

export function setDefaultQuickPassProviderForTesting(provider: MoriAnalysisProvider | null): void {
  lazyProvider = provider;
}

export function setSessionPersistenceServiceForSessionStore(service: SessionPersistenceService | null): void {
  lazyPersistenceService = service;
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
  source: "demo",
  dataSource: createStaticMockDataSource(demoView),
  subscribeToDataSource: (onUpdate) => get().dataSource.subscribe(onUpdate),
  hydrate: async () => {
    const repository = getRepository();
    const service = getPersistenceService();
    const analysisSettings = repository.loadQuickPassSettings();
    const localDraft = repository.loadCurrentSessionDraft();
    const localImports = localDraft ? repository.listSessionImports(localDraft.session.id) : [];
    const localAnalysisRecord = localDraft ? repository.loadSessionAnalysis(localDraft.session.id) : null;

    if (!service.isDesktop()) {
      // Forward-migration: if this session already has an analysis on
      // disk but no memory body yet, write the body now so Project
      // Memory can aggregate it on the next reload. This is a one-
      // time op per saved session — subsequent hydrates are cheap.
      if (localDraft && localAnalysisRecord && !repository.loadSessionMemoryBody(localDraft.session.id)) {
        persistMemoryBodyFromAnalysis(repository, localDraft.session.id, localAnalysisRecord.result);
      }
      const source: SessionSource = localDraft ? "browser-draft" : "demo";
      set({
        initialized: true,
        draft: localDraft,
        imports: localImports,
        analysis: localAnalysisRecord?.result ?? null,
        analysisStatus: localAnalysisRecord ? "succeeded" : "idle",
        analysisError: null,
        analysisProviderLabel: localAnalysisRecord?.result.providerLabel ?? null,
        analysisFallbackUsed: false,
        analysisSettings,
        source,
      });
      return;
    }

    // Desktop runtime: prefer the SQLite-stored snapshot when one is available
    // for the active draft session id. Falls back to the browser draft when
    // SQLite has nothing for that session, or when SQLite is unreachable.
    let hydratedFromSqlite = false;
    let draft: StoredSessionDraft | null = localDraft;
    let imports: StoredSessionImport[] = localImports;
    let analysisRecord = localAnalysisRecord;

    if (localDraft) {
      try {
        const loaded = await service.loadSessionFromDesktop(localDraft.session.id);
        const sqliteDraft: StoredSessionDraft = {
          ...loaded.draft,
          savedAt: localDraft.savedAt,
        };
        repository.saveCurrentSessionDraft(sqliteDraft);
        repository.clearSessionImports(sqliteDraft.session.id);
        for (const entry of loaded.imports) {
          repository.addSessionImport(sqliteDraft.session.id, {
            source: entry.source,
            events: entry.events,
          });
        }
        draft = sqliteDraft;
        imports = repository.listSessionImports(sqliteDraft.session.id);
        analysisRecord = repository.loadSessionAnalysis(sqliteDraft.session.id);
        hydratedFromSqlite = true;
      } catch {
        // SQLite empty for this session id, or DB not initialized — keep the
        // existing browser draft. Logging the error is intentional only at the
        // service layer; the store stays quiet so first-run does not look like
        // a failure.
      }
    }

    const source: SessionSource = !draft
      ? "demo"
      : hydratedFromSqlite
        ? "desktop-sqlite"
        : "browser-draft";

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
      source,
    });
  },
  setDraft: (draft) => {
    const repository = getRepository();
    const imports = repository.listSessionImports(draft.session.id);
    const analysisRecord = repository.loadSessionAnalysis(draft.session.id);
    // A freshly created draft has not been persisted to SQLite yet, so the
    // source is reported as browser-draft until an explicit save runs.
    set({
      draft,
      imports,
      analysis: analysisRecord?.result ?? null,
      analysisStatus: analysisRecord ? "succeeded" : "idle",
      analysisError: null,
      analysisProviderLabel: analysisRecord?.result.providerLabel ?? null,
      analysisFallbackUsed: false,
      initialized: true,
      source: "browser-draft",
    });
  },
  endSession: () => {
    const draft = get().draft;
    if (!draft || draft.session.status === "complete") return;
    const repository = getRepository();
    const stored = repository.saveCurrentSessionDraft({
      project: draft.project,
      session: {
        ...draft.session,
        status: "complete",
        endedAt: new Date().toISOString(),
      },
    });
    set({ draft: stored });
  },
  addImport: (candidate, options) => {
    const repository = getRepository();
    const draft = get().draft;
    if (!draft) return null;

    const stored = repository.addSessionImport(draft.session.id, candidate, options);
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
      source: "demo",
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
      persistMemoryBodyFromAnalysis(repository, draft.session.id, result);
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
          persistMemoryBodyFromAnalysis(repository, draft.session.id, annotated);
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
  markPersistedToDesktop: () => {
    if (!get().draft) return;
    set({ source: "desktop-sqlite" });
  },
  setNextActionCompletion: (nextActionId, completed) => {
    const { draft, analysis } = get();
    if (!draft || !analysis) return false;
    if (!analysis.nextActions.some((action) => action.id === nextActionId)) {
      return false;
    }

    const now = new Date().toISOString();
    const nextAnalysis: MoriAnalysisResult = {
      ...analysis,
      nextActions: analysis.nextActions.map((action) =>
        action.id === nextActionId
          ? withNextActionCompletion(action, completed, now)
          : action,
      ),
    };

    const repository = getRepository();
    repository.saveSessionAnalysis(draft.session.id, nextAnalysis);
    persistMemoryBodyFromAnalysis(repository, draft.session.id, nextAnalysis);
    set({ analysis: nextAnalysis });
    return true;
  },
  setIssueStatus: (issueId, status) => {
    const { draft, analysis } = get();
    if (!draft || !analysis) return false;
    if (!analysis.issues.some((issue) => issue.id === issueId)) return false;

    const nextAnalysis: MoriAnalysisResult = {
      ...analysis,
      issues: analysis.issues.map((issue) =>
        issue.id === issueId ? { ...issue, status } : issue,
      ),
    };

    const repository = getRepository();
    repository.saveSessionAnalysis(draft.session.id, nextAnalysis);
    persistMemoryBodyFromAnalysis(repository, draft.session.id, nextAnalysis);
    set({ analysis: nextAnalysis });
    return true;
  },
  setDecisionConfirmed: (decisionId, confirmed) => {
    const { draft, analysis } = get();
    if (!draft || !analysis) return false;
    if (!analysis.decisions.some((decision) => decision.id === decisionId)) {
      return false;
    }

    const nextAnalysis: MoriAnalysisResult = {
      ...analysis,
      decisions: analysis.decisions.map((decision) =>
        decision.id === decisionId ? { ...decision, confirmed } : decision,
      ),
    };

    const repository = getRepository();
    repository.saveSessionAnalysis(draft.session.id, nextAnalysis);
    persistMemoryBodyFromAnalysis(repository, draft.session.id, nextAnalysis);
    set({ analysis: nextAnalysis });
    return true;
  },
  loadBrowserSession: (sessionId) => {
    if (get().draft?.session.id === sessionId) return true;
    const repository = getRepository();
    const draft = repository.setCurrentSession(sessionId);
    if (!draft) return false;

    const imports = repository.listSessionImports(sessionId);
    const analysisRecord = repository.loadSessionAnalysis(sessionId);

    set({
      draft,
      imports,
      analysis: analysisRecord?.result ?? null,
      analysisStatus: analysisRecord ? "succeeded" : "idle",
      analysisError: null,
      analysisProviderLabel: analysisRecord?.result.providerLabel ?? null,
      analysisFallbackUsed: false,
      initialized: true,
      source: "browser-draft",
    });
    return true;
  },
  loadDesktopSession: async (sessionId) => {
    const service = getPersistenceService();
    if (!service.isDesktop()) {
      return false;
    }
    const repository = getRepository();
    let loaded;
    try {
      loaded = await service.loadSessionFromDesktop(sessionId);
    } catch {
      return false;
    }

    const storedDraft = repository.saveCurrentSessionDraft({
      project: loaded.draft.project,
      session: loaded.draft.session,
    });
    repository.clearSessionImports(storedDraft.session.id);
    for (const entry of loaded.imports) {
      repository.addSessionImport(storedDraft.session.id, {
        source: entry.source,
        events: entry.events,
      });
    }

    const refreshedImports = repository.listSessionImports(storedDraft.session.id);
    const analysisRecord = repository.loadSessionAnalysis(storedDraft.session.id);

    set({
      draft: storedDraft,
      imports: refreshedImports,
      analysis: analysisRecord?.result ?? null,
      analysisStatus: analysisRecord ? "succeeded" : "idle",
      analysisError: null,
      analysisProviderLabel: analysisRecord?.result.providerLabel ?? null,
      analysisFallbackUsed: false,
      initialized: true,
      source: "desktop-sqlite",
    });
    return true;
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

export function selectSessionSource(state: MoriSessionState): SessionSource {
  return state.source;
}

export function selectHasRealAnalysis(state: MoriSessionState): boolean {
  return Boolean(state.draft && state.analysis);
}

/**
 * Cross-session connector history collected from the local persistence
 * layer. In browser mode this walks every saved session in localStorage
 * and returns its connector identities. In desktop mode it also includes
 * the SQLite session metadata if available. Callers (ImportPanel) feed
 * the result into `buildConnectorJsonlPreviewWithHistory` so duplicate
 * detection survives across sessions.
 */
export function loadConnectorImportHistorySavedSessions(options: {
  excludeSessionId?: string | null;
} = {}): ConnectorImportHistorySavedSession[] {
  const repository = getRepository();
  const snapshots = repository.listConnectorEventIdentitySnapshots(options);
  return snapshots.map((snapshot) => savedSessionFromSnapshot(snapshot));
}

/**
 * Desktop-aware connector import history. In Tauri mode it reads
 * cross-session connector identities from the SQLite `session_imports`
 * table via `SessionImportRepository`, so SQLite-saved sessions
 * contribute to the re-import rollup; in browser mode it resolves the
 * synchronous localStorage result. The connector preview awaits this
 * before building a history-aware preview.
 */
export async function loadConnectorImportHistorySavedSessionsAsync(options: {
  excludeSessionId?: string | null;
} = {}): Promise<ConnectorImportHistorySavedSession[]> {
  if (!isTauriRuntime()) {
    return loadConnectorImportHistorySavedSessions(options);
  }
  const result = await getSessionImportRepository().listConnectorEventIdentitySnapshots(
    options,
  );
  return result.data.map((snapshot) => savedSessionFromSnapshot(snapshot));
}

/**
 * Snapshot the active session view's *memory body* (issues, decisions,
 * next-actions, summary snapshot) to durable storage so saved sessions
 * can contribute to Project Memory aggregation later. The view is
 * derived from analysis when analysis is present; this helper accepts
 * the analysis result directly so callers don't have to re-derive the
 * view first.
 *
 * Intentionally minimal — events / sources are NOT written here.
 * They already live in `StoredSessionImport[]` for the session.
 */
export function persistMemoryBodyFromAnalysis(
  repository: MoriDraftRepository,
  sessionId: string,
  analysis: MoriAnalysisResult,
): void {
  repository.saveSessionMemoryBody(sessionId, {
    issues: analysis.issues,
    decisions: analysis.decisions,
    nextActions: analysis.nextActions,
    summarySnapshot: {
      sessionSummary: analysis.summary.sessionSummary,
      resumePrompt: analysis.summary.resumePrompt,
      generatedAt: analysis.generatedAt,
    },
  });
}

function savedSessionFromSnapshot(
  snapshot: ConnectorEventIdentitySnapshot,
): ConnectorImportHistorySavedSession {
  return {
    sessionId: snapshot.sessionId,
    title: snapshot.title,
    savedAt: snapshot.savedAt,
    // The history input shape expects events keyed on `connectorEventId`.
    // Materialise minimal placeholder events so the helper can read them
    // without us paying the full TimelineEvent reload cost.
    events: snapshot.connectorEventIds.map((connectorEventId) => ({ connectorEventId })),
  };
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
