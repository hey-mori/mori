import { create } from "zustand";
import { moriMockSession } from "../domain/mock-data";
import type {
  IssueStatus,
  MoriMockSession,
  NextAction,
  RelationshipType,
  TimelineEvent,
} from "../domain/types";
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
import { createSessionDraft } from "../lib/session/createSessionDraft";
import {
  applySessionArchive,
  applySessionRename,
  applySessionUnarchive,
} from "../lib/session/sessionManagement";
import { rebindCandidateToSession } from "../lib/claude/claudeImport";
import { composeSessionView } from "../lib/session/composeSessionView";
import { withNextActionCompletion } from "../lib/session/nextActionCompletion";
import {
  applyDecisionEdit,
  applyIssueEdit,
  applyNextActionEdit,
  type DecisionEditFields,
  type IssueEditFields,
  type NextActionEditFields,
} from "../lib/session/reviewItemEdit";
import { promoteIssueToNextAction } from "../lib/session/issuePromotion";
import { createIssueFromEvent as buildIssueFromEvent } from "../lib/timeline/eventToIssue";
import { applyEventEdits, type TimelineEventEdits } from "../lib/timeline/eventEdits";
import { splitEventAtMidpoint } from "../lib/timeline/eventSplit";
import {
  findMergeTarget,
  mergeEventWithNext,
  remapEventIdInAnalysis,
} from "../lib/timeline/eventMerge";
import {
  addEventRelationship as buildEventRelationship,
  removeRelationshipFromAnalysis,
} from "../lib/relationships/relationshipWrites";
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
  StoredSessionSummary,
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
  /**
   * Bookkeeping for a session created via `importAsNewSession` whose Import
   * Review is still open. Lets a cancelled review discard the empty session
   * and restore the previously-active one. Cleared once the review is
   * applied (`commitPendingNewSession`) or abandoned.
   */
  pendingNewSession: { sessionId: string; previousSessionId: string | null } | null;
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
  /**
   * Create a brand-new Mori session from an external import and switch to
   * it — the "1 Claude conversation = 1 Mori session" entry point. The
   * candidate is re-bound to the new session id and the session is
   * persisted (browser localStorage today; desktop SQLite saves on apply
   * via the normal path). The import itself is NOT committed here — it
   * flows through Import Review like every other import, so the new
   * session starts empty until the user applies. `previousSessionId` (the
   * session that was active before) is tracked so a cancelled review can
   * discard the empty session and restore the prior one.
   */
  importAsNewSession: (params: {
    candidate: NormalizedImportCandidate;
    title: string;
    startedAt: string;
    endedAt: string;
    projectLabel?: string;
  }) => { sessionId: string; candidate: NormalizedImportCandidate };
  /**
   * Mark the pending new session (created by `importAsNewSession`) as
   * committed — called when an Import Review for it is applied. Clears the
   * cleanup bookkeeping so a later cancel won't delete a session that now
   * holds applied work.
   */
  commitPendingNewSession: () => void;
  /**
   * Discard the pending new session if it never received an applied import
   * — called when an Import Review for a freshly-created session is
   * cancelled. Deletes the empty session and switches back to the session
   * that was active before. A no-op when there is no pending new session or
   * when it already holds imports. Returns `true` when a session was
   * discarded.
   */
  abandonPendingNewSessionIfEmpty: () => boolean;
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
   * Rename a stored session (by id). Updates the persisted draft title in
   * localStorage; when the renamed session is the active draft, the in-memory
   * draft is updated too so the title change is reflected immediately across
   * the shell. Returns `false` in demo mode, for an unknown id, or when the
   * title is blank / unchanged. A safe, non-destructive Workspace edit.
   */
  renameSession: (sessionId: string, title: string) => boolean;
  /**
   * Archive a stored session (by id) — a non-destructive "tidy away". Stamps
   * an `archivedAt` timestamp on the persisted draft so the Workspace hides it
   * from the default list (it stays reachable via the archive filter and is
   * never deleted). When the archived session is the active draft, the
   * in-memory draft is updated too. Idempotent. Returns `false` in demo mode,
   * for an unknown id, or when the session is already archived.
   */
  archiveSession: (sessionId: string) => boolean;
  /**
   * Restore an archived session (by id) to the default Workspace list by
   * clearing its `archivedAt`. The inverse of `archiveSession`. Returns
   * `false` in demo mode, for an unknown id, or when the session was not
   * archived.
   */
  unarchiveSession: (sessionId: string) => boolean;
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
  editIssue: (issueId: string, fields: IssueEditFields) => boolean;
  /**
   * Promote a Timeline event into a Review issue — a Timeline-inspector
   * write. Idempotent: a second call for the same event is a no-op.
   * Returns `false` in demo mode or without an analysis to write into.
   */
  createIssueFromEvent: (event: TimelineEvent) => boolean;
  /**
   * Correct a Timeline event's title / summary — a Timeline-inspector
   * write. Rewrites the owning import and stamps `userModified`. Returns
   * `false` in demo mode or on a blank / unchanged edit.
   */
  updateSessionEvent: (eventId: string, edits: TimelineEventEdits) => boolean;
  /**
   * Split a Timeline event at its temporal midpoint into two — a
   * Timeline-inspector write. The original keeps its id (and references);
   * a fresh second-half event is inserted after it. Returns `false` in
   * demo mode or when the event has no genuine end to cut.
   */
  splitSessionEvent: (eventId: string) => boolean;
  /**
   * Merge a Timeline event with its next chronological neighbour — a
   * Timeline-inspector write. The selected event survives and absorbs the
   * next; the analysis is remapped so no reference dangles. Returns
   * `false` in demo mode or when the event is already last.
   */
  mergeSessionEvent: (eventId: string) => boolean;
  /**
   * Assert a user event-to-event relationship — a Flow Focus write.
   * Idempotent and self-link-safe. Returns `false` in demo mode, without
   * an analysis, or when the exact relationship already exists.
   */
  addEventRelationship: (fromId: string, toId: string, type: RelationshipType) => boolean;
  /**
   * Remove an AI-inferred (or user) relationship — a Flow Focus write.
   * Returns `false` in demo mode, without analysis, or for an unknown id.
   */
  removeRelationship: (relationshipId: string) => boolean;
  /**
   * Promote an issue into a linked Next Action. If the issue already has
   * a linked Next Action, returns that existing action without writing.
   * Returns `null` in demo mode, without analysis, or for an unknown id.
   */
  promoteIssueToNextAction: (issueId: string) => NextAction | null;
  /**
   * Confirm or reject a decision — a Review-surface write. Persists into
   * the session analysis and the durable memory body. Returns `false`
   * in demo mode, when there is no analysis, or when the id is unknown.
   */
  setDecisionConfirmed: (decisionId: string, confirmed: boolean) => boolean;
  editDecision: (decisionId: string, fields: DecisionEditFields) => boolean;
  /**
   * Edit a Next Action's title — a Review-surface write. Persists into the
   * session analysis and the durable memory body. Returns `false` in demo
   * mode, when there is no analysis, or when the id is unknown or unchanged.
   */
  editNextAction: (nextActionId: string, fields: NextActionEditFields) => boolean;
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
  pendingNewSession: null,
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
      pendingNewSession: null,
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
  importAsNewSession: (params) => {
    const repository = getRepository();
    const previous = get().draft;
    const now = new Date().toISOString();

    // Reuse the active local project so multi-project stays out of scope.
    // First-run (demo, no draft) falls back to the conversation's project
    // label or a neutral name; createSessionDraft mints a project id.
    const projectName =
      previous?.project.name ?? params.projectLabel ?? "Claude 가져오기";

    const built = createSessionDraft({
      sessionTitle: params.title.trim() || "제목 없는 Claude 대화",
      projectName,
      selectedSources: [],
      recordingMode: previous?.session.recordingMode ?? "summary",
      llmProvider: previous?.session.llmProvider ?? "ollama",
      llmModel: previous?.session.llmModel ?? "llama3.1:8b",
      storageLocation: previous?.session.storageLocation ?? "browser:localStorage",
      now,
      startedAt: params.startedAt,
      endedAt: params.endedAt,
      sourceLabel: params.projectLabel,
      // A finished Claude conversation is not a live recording.
      status: "complete",
    });

    // Keep the new session inside the existing project when one is active so
    // the imported events stay associated with the same project memory.
    const session = previous
      ? { ...built.session, projectId: previous.project.id }
      : built.session;
    const project = previous?.project ?? built.project;

    const stored = repository.saveCurrentSessionDraft({ project, session });

    const reboundCandidate = rebindCandidateToSession(params.candidate, {
      sessionId: stored.session.id,
      projectId: stored.project.id,
    });

    set({
      draft: stored,
      imports: repository.listSessionImports(stored.session.id),
      analysis: null,
      analysisStatus: "idle",
      analysisError: null,
      analysisProviderLabel: null,
      analysisFallbackUsed: false,
      initialized: true,
      source: "browser-draft",
      pendingNewSession: {
        sessionId: stored.session.id,
        previousSessionId: previous?.session.id ?? null,
      },
    });

    return { sessionId: stored.session.id, candidate: reboundCandidate };
  },
  commitPendingNewSession: () => {
    if (!get().pendingNewSession) return;
    set({ pendingNewSession: null });
  },
  abandonPendingNewSessionIfEmpty: () => {
    const pending = get().pendingNewSession;
    if (!pending) return false;

    const repository = getRepository();
    // Only discard a session that never received an applied import. If the
    // user applied something the session is real work — leave it.
    const imports = repository.listSessionImports(pending.sessionId);
    if (imports.length > 0) {
      set({ pendingNewSession: null });
      return false;
    }

    repository.clearStoredSession(pending.sessionId);

    // Restore the previously-active session when there was one; otherwise
    // fall back to demo so the shell never points at a deleted session.
    if (pending.previousSessionId) {
      const restored = repository.setCurrentSession(pending.previousSessionId);
      if (restored) {
        const restoredImports = repository.listSessionImports(restored.session.id);
        const restoredAnalysis = repository.loadSessionAnalysis(restored.session.id);
        set({
          draft: restored,
          imports: restoredImports,
          analysis: restoredAnalysis?.result ?? null,
          analysisStatus: restoredAnalysis ? "succeeded" : "idle",
          analysisError: null,
          analysisProviderLabel: restoredAnalysis?.result.providerLabel ?? null,
          analysisFallbackUsed: false,
          source: "browser-draft",
          pendingNewSession: null,
        });
        return true;
      }
    }

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
      pendingNewSession: null,
    });
    return true;
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
      pendingNewSession: null,
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
  promoteIssueToNextAction: (issueId) => {
    const { draft, analysis } = get();
    if (!draft || !analysis) return null;

    const result = promoteIssueToNextAction(analysis, issueId);
    if (!result.nextAction) return null;
    if (!result.changed) return result.nextAction;

    const repository = getRepository();
    repository.saveSessionAnalysis(draft.session.id, result.analysis);
    persistMemoryBodyFromAnalysis(repository, draft.session.id, result.analysis);
    set({ analysis: result.analysis });
    return result.nextAction;
  },
  editIssue: (issueId, fields) => {
    const { draft, analysis } = get();
    if (!draft || !analysis) return false;
    if (!analysis.issues.some((issue) => issue.id === issueId)) return false;

    const nextAnalysis = applyIssueEdit(
      analysis,
      issueId,
      fields,
      new Date().toISOString(),
    );
    if (nextAnalysis === analysis) return false;

    const repository = getRepository();
    repository.saveSessionAnalysis(draft.session.id, nextAnalysis);
    persistMemoryBodyFromAnalysis(repository, draft.session.id, nextAnalysis);
    set({ analysis: nextAnalysis });
    return true;
  },
  createIssueFromEvent: (event) => {
    const { draft, analysis } = get();
    if (!draft || !analysis) return false;

    const result = buildIssueFromEvent(analysis, event, new Date().toISOString());
    if (!result.changed) return false;

    const repository = getRepository();
    repository.saveSessionAnalysis(draft.session.id, result.analysis);
    persistMemoryBodyFromAnalysis(repository, draft.session.id, result.analysis);
    set({ analysis: result.analysis });
    return true;
  },
  updateSessionEvent: (eventId, edits) => {
    const { draft, imports } = get();
    if (!draft) return false;
    const next = applyEventEdits(imports, eventId, edits);
    if (next === imports) return false;

    const repository = getRepository();
    repository.putSessionImports(draft.session.id, next);
    set({ imports: repository.listSessionImports(draft.session.id) });
    return true;
  },
  splitSessionEvent: (eventId) => {
    const { draft, imports } = get();
    if (!draft) return false;
    const next = splitEventAtMidpoint(imports, eventId);
    if (next === imports) return false;

    const repository = getRepository();
    repository.putSessionImports(draft.session.id, next);
    set({ imports: repository.listSessionImports(draft.session.id) });
    return true;
  },
  mergeSessionEvent: (eventId) => {
    const { draft, imports, analysis } = get();
    if (!draft) return false;
    const allEvents = imports.flatMap((entry) => entry.events);
    const target = findMergeTarget(allEvents, eventId);
    if (!target) return false;
    const nextImports = mergeEventWithNext(imports, eventId);
    if (nextImports === imports) return false;

    const repository = getRepository();
    repository.putSessionImports(draft.session.id, nextImports);
    // The absorbed event's id must not dangle in the analysis.
    if (analysis) {
      const nextAnalysis = remapEventIdInAnalysis(analysis, target.id, eventId);
      if (nextAnalysis !== analysis) {
        repository.saveSessionAnalysis(draft.session.id, nextAnalysis);
        persistMemoryBodyFromAnalysis(repository, draft.session.id, nextAnalysis);
        set({ analysis: nextAnalysis });
      }
    }
    set({ imports: repository.listSessionImports(draft.session.id) });
    return true;
  },
  addEventRelationship: (fromId, toId, type) => {
    const { draft, analysis } = get();
    if (!draft || !analysis) return false;
    const next = buildEventRelationship(analysis, fromId, toId, type);
    if (next === analysis) return false;

    const repository = getRepository();
    repository.saveSessionAnalysis(draft.session.id, next);
    persistMemoryBodyFromAnalysis(repository, draft.session.id, next);
    set({ analysis: next });
    return true;
  },
  removeRelationship: (relationshipId) => {
    const { draft, analysis } = get();
    if (!draft || !analysis) return false;
    const next = removeRelationshipFromAnalysis(analysis, relationshipId);
    if (next === analysis) return false;

    const repository = getRepository();
    repository.saveSessionAnalysis(draft.session.id, next);
    persistMemoryBodyFromAnalysis(repository, draft.session.id, next);
    set({ analysis: next });
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
  editDecision: (decisionId, fields) => {
    const { draft, analysis } = get();
    if (!draft || !analysis) return false;
    if (!analysis.decisions.some((decision) => decision.id === decisionId)) {
      return false;
    }

    const nextAnalysis = applyDecisionEdit(
      analysis,
      decisionId,
      fields,
      new Date().toISOString(),
    );
    if (nextAnalysis === analysis) return false;

    const repository = getRepository();
    repository.saveSessionAnalysis(draft.session.id, nextAnalysis);
    persistMemoryBodyFromAnalysis(repository, draft.session.id, nextAnalysis);
    set({ analysis: nextAnalysis });
    return true;
  },
  editNextAction: (nextActionId, fields) => {
    const { draft, analysis } = get();
    if (!draft || !analysis) return false;
    if (!analysis.nextActions.some((action) => action.id === nextActionId)) {
      return false;
    }

    const nextAnalysis = applyNextActionEdit(
      analysis,
      nextActionId,
      fields,
      new Date().toISOString(),
    );
    if (nextAnalysis === analysis) return false;

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
      pendingNewSession: null,
    });
    return true;
  },
  renameSession: (sessionId, title) =>
    applyStoredSessionEdit(get, set, sessionId, (session) =>
      applySessionRename(session, title),
    ),
  archiveSession: (sessionId) =>
    applyStoredSessionEdit(get, set, sessionId, (session) =>
      applySessionArchive(session, new Date().toISOString()),
    ),
  unarchiveSession: (sessionId) =>
    applyStoredSessionEdit(get, set, sessionId, (session) =>
      applySessionUnarchive(session),
    ),
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
      pendingNewSession: null,
    });
    return true;
  },
}));

/**
 * Apply a pure session-metadata transform (rename / archive / unarchive) to
 * a stored session draft by id and persist it. Centralises the three
 * lifecycle writes so each store action stays a one-liner:
 *
 *   - When the id is the active draft, transform that; otherwise read the
 *     stored per-session record. An unknown id (or demo with no draft) is a
 *     no-op so a stale Workspace row can never crash the store.
 *   - The transform runs on the draft's session. When it returns the same
 *     reference (blank / unchanged / idempotent), nothing is written and the
 *     action returns `false`.
 *   - Otherwise the draft is persisted via `saveStoredSessionMetadata`, which
 *     rewrites the per-session record without restamping `savedAt` and
 *     leaves the current-session pointer untouched (it only mirrors the edit
 *     when the edited session is already current).
 *   - When the edited session is the active draft, the in-memory `draft` is
 *     updated so the shell reflects the change immediately.
 */
function applyStoredSessionEdit(
  get: () => MoriSessionState,
  set: (partial: Partial<MoriSessionState>) => void,
  sessionId: string,
  transform: (session: StoredSessionDraft["session"]) => StoredSessionDraft["session"],
): boolean {
  const repository = getRepository();
  const active = get().draft;
  const isActive = active?.session.id === sessionId;

  const stored = isActive ? active : repository.loadStoredSessionDraft(sessionId);
  if (!stored) return false;

  const nextSession = transform(stored.session);
  if (nextSession === stored.session) return false;

  const persisted = repository.saveStoredSessionMetadata(sessionId, {
    ...stored,
    session: nextSession,
  });
  if (!persisted) return false;

  if (isActive) set({ draft: persisted });
  return true;
}

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
 * List every locally-persisted session summary, most-recent first. Used by
 * the sidebar session switcher to offer one-click switching between the
 * "1 Claude conversation = 1 session" sessions. Works in both runtimes —
 * desktop hydrate mirrors SQLite sessions into localStorage, so the browser
 * adapter is the single source of truth for the switcher list.
 */
export function loadStoredSessionSummaries(): StoredSessionSummary[] {
  return getRepository().listStoredSessions();
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
