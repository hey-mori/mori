import { create } from "zustand";
import { mockSession } from "../domain/mock-data";
import { buildDemoSessionContent } from "../lib/demo/demoSessionContent";
import { isDemoSessionId } from "../lib/demo/demoSessionFixtures";
import type {
  IssueStatus,
  MockSession,
  NextAction,
  RecordingMode,
  RelationshipType,
  TimelineEvent,
} from "../domain/types";
import type {
  AnalysisProvider,
  AnalysisResult,
  AnalysisRunHistory,
  AnalysisRunStatus,
  QuickPassAnalysisSettings,
} from "../lib/analysis";
import {
  DEFAULT_QUICK_PASS_SETTINGS,
  buildProviderConfigFromSettings,
  createDeterministicQuickPassProvider,
  getCurrentRun,
  resolveQuickPassProvider,
  resolveTaskModel,
  sanitizeQuickPassSettings,
} from "../lib/analysis";
import { buildLlmRequestAbstraction, type DisclosureLevel } from "../lib/disclosure";
import {
  buildPrimaryImportCandidateFromAgentWorkSession,
  getAgentWorkSession,
  listAllAgentWorkSessions,
} from "../lib/agents/workSessions";
import {
  agentSessionToStoredDraft,
  autoImportedProjectId,
  autoImportedSessionId,
  isAutoImportedSessionId,
} from "../lib/agents/autoImportSessions";
import {
  loadAutoImportMeta,
  removeAutoImportMeta,
  upsertAutoImportMetas,
} from "../lib/agents/autoImportMetaStore";
import {
  decideFollowReaction,
  followReducer,
  initialFollowState,
  type FollowReaction,
  type FollowState,
} from "../lib/live-follow";
import { buildFollowNotification } from "../lib/notifications/followNotifications";
import type { CompanionNotification } from "../lib/notifications/notification";

/** Stored per-event local-LLM request abstraction (or its deterministic fallback). */
export type RequestAbstractionEntry = {
  summary: string;
  abstract: string;
  source: "llm" | "deterministic";
  note?: string;
};
import type { NormalizedImportCandidate } from "../lib/import";
import { cleanImportedTitle, firstMeaningfulTitle } from "../lib/import/sanitizeTitle";
import { createSessionDraft } from "../lib/session/createSessionDraft";
import {
  applySessionRename,
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
  DraftRepository,
  StoredPendingReview,
  StoredSessionDraft,
  StoredSessionImport,
  StoredSessionSummary,
} from "../lib/storage/storageTypes";
import {
  buildAcceptedCandidate,
  createImportReviewDraft,
  editReviewEvent,
  isReviewApplyable,
  setAllItemsStatus,
  setReviewItemStatus,
  type ImportReviewDraft,
  type ReviewDraftMeta,
  type ReviewEventEdits,
  type ReviewItemKind,
  type ReviewItemStatus,
  type ReviewOrigin,
} from "../lib/review";
import type {
  ConnectorImportHistorySavedSession,
  ConnectorSourceImportSummary,
} from "../lib/connectors";
import { isTauriRuntime } from "../lib/desktop";
import { syncLlmAllowedEndpoints } from "../lib/desktop/llmEndpointRegistry";
import { prewarmLanguageModel, resetPrewarmState } from "../lib/language/prewarm";
import { getSessionImportRepository } from "../lib/storage/sessionImportRepository";
import { persistMemoryBodyFromAnalysis } from "./sessionMemoryPersistence";

export type SessionMode = "demo" | "draft";

export type SessionSource = "demo" | "browser-draft" | "desktop-sqlite";

export type SessionViewModel = MockSession & {
  isDemo: boolean;
};

/**
 * Outcome of applying the active session's pending import review. On success it
 * carries the applied event count and the first applied event id so the caller
 * can select it in the inspector.
 */
export type ApplyPendingReviewResult =
  | { ok: true; appliedCount: number; firstEventId: string | null }
  | { ok: false; reason: string };

export type SessionState = {
  initialized: boolean;
  draft: StoredSessionDraft | null;
  /**
   * Which bundled demo session is currently open, when no real `draft` is
   * active. `null` means the canonical bundled demo (`mockSession`).
   * Set when a demo summary row is opened (`loadBrowserSession` falls back to
   * the demo content builder for `demo-` ids); ignored whenever a real draft
   * is present, since a draft always wins in `selectSessionView`. This is how
   * clicking a specific demo session shows *that* session instead of always
   * the same "Mori 앱 기획" stand-in.
   */
  demoSessionId: string | null;
  /**
   * Bookkeeping for a session created via `importAsNewSession` whose Import
   * Review is still open. Lets a cancelled review discard the empty session
   * and restore the previously-active one. Cleared once the review is
   * applied (`commitPendingNewSession`) or abandoned.
   */
  pendingNewSession: { sessionId: string; previousSessionId: string | null } | null;
  imports: StoredSessionImport[];
  /**
   * The active session's parsed-but-not-yet-applied import review, loaded from
   * persistence whenever a session is opened so it survives navigation and
   * reload and stays reachable in the 자료 tab. A separate stream from
   * `imports`: never fed to the session view / timeline / analysis / memory, so
   * unreviewed events cannot leak in before 반영. `null` when the session has
   * no pending review. On apply it converts to a `StoredSessionImport`.
   */
  pendingReview: StoredPendingReview | null;
  /**
   * Set when the user just applied a pending review, so the 자료 tab can show a
   * "N건 반영됨" completion banner without keeping the review card open.
   * Cleared by `clearLastApplied` (banner dismiss) and on every session switch.
   */
  lastApplied: { sourceId: string; appliedCount: number; appliedAt: string } | null;
  analysis: AnalysisResult | null;
  analysisStatus: AnalysisRunStatus;
  analysisError: string | null;
  analysisProviderLabel: string | null;
  analysisFallbackUsed: boolean;
  analysisSettings: QuickPassAnalysisSettings;
  /**
   * Per-event local-LLM request abstractions, keyed by event id. Filled
   * on demand by `generateRequestAbstraction`; the disclosure projection
   * prefers a stored LLM abstract over the deterministic floor. Event ids
   * are session-unique, so entries do not collide across sessions.
   */
  requestAbstractions: Record<string, RequestAbstractionEntry>;
  /**
   * Per-event disclosure level overrides, keyed by event id. The Event
   * Inspector sets these so one request can be shown differently from the
   * `requestDisclosureLevel` global default; surfaces resolve the effective
   * level via `resolveDisclosureLevel(override, default)`.
   */
  requestDisclosureOverrides: Record<string, DisclosureLevel>;
  /**
   * Live Follow state for the active session. The reducer brain lives in
   * `lib/live-follow`; this holds its state. The foreground polling shell
   * (desktop) drives it by importing new connector events, calling
   * `applyFollowPoll`, and acting on the returned reaction. Following is
   * explicit, session-scoped, and foreground only, never a daemon.
   */
  follow: FollowState;
  /**
   * Live Follow feed notifications captured at poll time (pending events
   * are consumed on reaction, so the notice is recorded here when it
   * fires). The notifications hook surfaces these in the cross-session
   * feed. Ephemeral, in-memory, aged out by the feed's recency sort.
   */
  followNotifications: CompanionNotification[];
  /**
   * Completion notices from the 라이브 세션 dashboard: one per request that
   * finished while the app was open. Same ephemeral, in-memory, recency-aged
   * shape as `followNotifications`, kept separate because the live dashboard is
   * a multi-session producer independent of the single-session Follow reducer.
   */
  liveNotifications: CompanionNotification[];
  /**
   * Aggregate "N sessions newly auto-imported" notices from the background
   * auto-import pass. Same ephemeral in-memory shape as the other push
   * producers; one entry per sync batch.
   */
  importSyncNotifications: CompanionNotification[];
  source: SessionSource;
  /**
   * Bumped whenever a data reset wipes stored sessions
   * (`clearAllDataAndViewDemo`). Surfaces purely as a re-read signal: the
   * sidebar session list and other localStorage-derived views read it as an
   * effect dependency so they refresh even when the active session id does
   * not change (e.g. wiping background sessions while already in demo).
   */
  dataResetNonce: number;
  /**
   * Bumped whenever the background auto-import pass upserts session drafts, so
   * the 세션 workspace's 과거 list re-reads and shows the newly-registered rows
   * without a navigation. Distinct from `dataResetNonce` (which means "data was
   * wiped") so the two signals never conflate.
   */
  sessionListNonce: number;
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
  addImport: (
    candidate: NormalizedImportCandidate,
    options?: { importSummary?: ConnectorSourceImportSummary },
  ) => StoredSessionImport | null;
  /**
   * Apply several normalized candidates to the active session in one pass —
   * the apply path for a reviewed Work Bundle. Each candidate becomes its own
   * `StoredSessionImport` (its own SourceRef + events), so per-source
   * provenance survives into the Evidence Hub and Timeline rather than being
   * flattened into a single merged source. Returns the stored records in
   * input order; an empty input or missing draft yields an empty array
   * without touching storage.
   */
  addImportBatch: (
    candidates: NormalizedImportCandidate[],
  ) => StoredSessionImport[];
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
    recordingMode?: RecordingMode;
  }) => { sessionId: string; candidate: NormalizedImportCandidate };
  /**
   * Import a conversation as a brand-new session AND materialize it
   * immediately, with no Import Review gate. The deterministic parse is
   * applied at once (the events are the user's own conversation, not an AI
   * proposal), the session is committed as real work, and a completion banner
   * is primed. Evidence appears the moment you open the session and analysis is
   * then always runnable; the trust gate lives at durable memory, not at
   * evidence display. See docs/design/import-into-evidence-tab.md.
   */
  importAndOpenAsNewSession: (params: {
    candidate: NormalizedImportCandidate;
    title: string;
    startedAt: string;
    endedAt: string;
    projectLabel?: string;
    recordingMode?: RecordingMode;
  }) => { sessionId: string; firstEventId: string | null };
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
  /**
   * Persist a parsed import review for the active session and hold it in
   * memory. Replaces any existing pending review for the session. Returns the
   * stored record, or `null` when no session is active.
   */
  savePendingReview: (draft: ImportReviewDraft, meta?: ReviewDraftMeta) => StoredPendingReview | null;
  /**
   * Build a pending review from a normalized import candidate and persist it
   * for the active session. The import entry points call this instead of an
   * ephemeral in-memory review, so the parsed import lands persistently in the
   * 자료 tab. Returns the stored record, or `null` when no session is active.
   */
  beginPendingReview: (
    candidate: NormalizedImportCandidate,
    origin: ReviewOrigin,
    meta?: ReviewDraftMeta,
  ) => StoredPendingReview | null;
  /** Drop the active session's pending review from memory and storage. */
  clearPendingReview: () => void;
  /** Flip one pending-review item's status (accept / discard) and persist. */
  setPendingReviewItemStatus: (
    kind: ReviewItemKind,
    itemId: string,
    status: ReviewItemStatus,
  ) => void;
  /** Flip every pending-review item to one status (accept-all / discard-all). */
  setAllPendingReviewStatus: (status: ReviewItemStatus) => void;
  /** Apply an inline edit to one pending-review event and persist. */
  editPendingReviewEvent: (itemId: string, edits: ReviewEventEdits) => void;
  /**
   * Apply the active session's pending review: accepted events become a
   * `StoredSessionImport`, the pending review is cleared, and `lastApplied` is
   * set. A pending import-created session becomes real (its cleanup bookkeeping
   * is dropped). Returns a failure result when nothing is applyable.
   */
  applyPendingReview: () => ApplyPendingReviewResult;
  /**
   * Discard the active session's pending review without applying. If this was a
   * freshly-created import session that never received an applied import, the
   * empty session is discarded and the prior one restored.
   */
  cancelPendingReview: () => void;
  /** Dismiss the "N건 반영됨" completion banner. */
  clearLastApplied: () => void;
  resetToDemo: () => void;
  /**
   * Leave the bundled demo and create a real, empty local draft. This is the
   * right target for "actual work" when there is nothing to import yet: the
   * UI should become an empty work session, not keep showing demo data.
   */
  beginEmptySession: (input?: {
    title?: string;
    projectName?: string;
    now?: string;
  }) => StoredSessionDraft;
  /**
   * Wipe all locally-persisted work data and return to a blank real session.
   * Unlike `resetToDemo` — which only drops the active draft and
   * leaves other saved sessions, accepted memories, and package drafts in
   * place — this clears every session and its analyses / memory bodies,
   * accepted Project Memory, the audit log, and saved packages. Quick Pass
   * and repository settings are preserved. In desktop mode it also wipes the
   * SQLite database (sessions the user registered there). Irreversible.
   */
  clearAllDataAndViewDemo: () => Promise<void>;
  runQuickPass: (
    provider?: AnalysisProvider,
    runSettings?: QuickPassAnalysisSettings,
  ) => Promise<AnalysisResult | null>;
  clearAnalysis: () => void;
  /**
   * Apply a background analysis result to the active session — the review
   * gate for the "자동 분석" feature. Writes the result to the session's
   * analysis store (same path as a manual analysis run) and marks the analysis
   * as succeeded. Does nothing when no session is active.
   */
  applyBackgroundAnalysis: (result: AnalysisResult, providerName?: string) => void;
  /**
   * Read the active session's append-only analysis run history (every
   * analysis run plus the adopted-run pointer). Returns `null` when no
   * session is active or the session has no analysis. A read, not a
   * subscription — callers re-read when `analysis` changes.
   */
  loadAnalysisRunHistory: () => AnalysisRunHistory | null;
  /**
   * Adopt a stored run as the active session's current understanding.
   * Rewrites the analysis mirror + memory body to the adopted run and
   * updates store state. Returns `false` when there is no session, no
   * history, or the run id is unknown.
   */
  selectAnalysisRun: (runId: string) => boolean;
  /**
   * Generate a local-LLM request abstraction for one event and store it
   * by event id (the disclosure projection prefers it over the
   * deterministic floor). Uses the persisted Ollama settings; falls back
   * to the deterministic abstraction on any failure. Returns `true` only
   * when the local model produced the abstract.
   */
  generateRequestAbstraction: (eventId: string, rawText: string) => Promise<boolean>;
  /** Set a per-event disclosure level override (Event Inspector control). */
  setRequestDisclosureOverride: (eventId: string, level: DisclosureLevel) => void;
  /** Begin following the given session, seeding the already-known event ids. */
  startFollow: (sessionId: string, knownEventIds?: string[]) => void;
  /**
   * Apply one foreground poll: the caller has read + imported any new
   * connector events and passes the session's current event ids. Returns
   * the reaction (whether to re-analyze / notify); pending events are
   * consumed when a reaction fires.
   */
  applyFollowPoll: (incomingEventIds: string[], at: string) => FollowReaction;
  pauseFollow: () => void;
  resumeFollow: () => void;
  stopFollow: () => void;
  setFollowError: (message: string, at?: string) => void;
  /**
   * Push one 라이브 세션 completion notice into the cross-session feed. Deduped
   * by id (the request id), so a re-render never doubles a completion, and
   * capped so a long-lived dashboard stays bounded.
   */
  pushLiveNotification: (notification: CompanionNotification) => void;
  /**
   * Push one aggregate auto-import notice ("세션 N건 새로 수집") into the feed.
   * Deduped by id (the sync batch time), capped like the other push producers.
   */
  pushImportSyncNotification: (notification: CompanionNotification) => void;
  /**
   * Register discovered agent sessions in the background: upsert a
   * metadata-only draft per session (so it appears in 과거) and bump the list
   * nonce. Does not open or analyse anything — the review gate still governs
   * the deeper analyze→apply step. Returns the ids that were actually written
   * (a quota-failed write is omitted so the caller can retry it and does not
   * report a false success).
   */
  registerDiscoveredSessions: (drafts: StoredSessionDraft[]) => string[];
  /**
   * Remove auto-import metadata placeholders whose id is not in `keepIds` and
   * that were never opened (no imports), bounding the auto-registered draft set
   * to the recent discovery window. Returns the removed ids.
   */
  pruneAutoImportedSessions: (keepIds: ReadonlySet<string>) => string[];
  updateAnalysisSettings: (patch: Partial<QuickPassAnalysisSettings>) => QuickPassAnalysisSettings;
  /**
   * Load only the engine settings, for a window that renders no app shell and
   * therefore never runs the full `hydrate`. Also registers the endpoint with
   * the native bridge allowlist.
   */
  loadAnalysisSettings: () => QuickPassAnalysisSettings;
  loadDesktopSession: (sessionId: string) => Promise<boolean>;
  /**
   * Open an auto-registered (discovered) session by loading its real transcript
   * on demand: fetch the agent detail, import it as a full session, and retire
   * the lightweight placeholder. Returns false when the reopen descriptor is
   * missing or the fetch fails (the caller can fall back to the metadata draft).
   */
  openDiscoveredSession: (sessionId: string) => Promise<boolean>;
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

const demoView: SessionViewModel = { ...mockSession, isDemo: true };

let lazyRepository: DraftRepository | null = null;
let lazyProvider: AnalysisProvider | null = null;
let lazyPersistenceService: SessionPersistenceService | null = null;

function getRepository(): DraftRepository {
  if (!lazyRepository) {
    lazyRepository = createBrowserDraftRepository();
  }
  return lazyRepository;
}

function getDefaultProvider(): AnalysisProvider {
  if (!lazyProvider) {
    lazyProvider = createDeterministicQuickPassProvider();
  }
  return lazyProvider;
}

function getPersistenceService(): SessionPersistenceService {
  if (!lazyPersistenceService) lazyPersistenceService = getSessionPersistenceService();
  return lazyPersistenceService;
}

export function setSessionRepositoryForTesting(repository: DraftRepository | null): void {
  lazyRepository = repository;
}

export function setDefaultQuickPassProviderForTesting(provider: AnalysisProvider | null): void {
  lazyProvider = provider;
}

export function setSessionPersistenceServiceForSessionStore(service: SessionPersistenceService | null): void {
  lazyPersistenceService = service;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  initialized: false,
  draft: null,
  demoSessionId: null,
  pendingNewSession: null,
  imports: [],
  pendingReview: null,
  lastApplied: null,
  analysis: null,
  analysisStatus: "idle",
  analysisError: null,
  analysisProviderLabel: null,
  analysisFallbackUsed: false,
  analysisSettings: { ...DEFAULT_QUICK_PASS_SETTINGS },
  requestAbstractions: {},
  requestDisclosureOverrides: {},
  follow: initialFollowState(),
  followNotifications: [],
  liveNotifications: [],
  importSyncNotifications: [],
  source: "demo",
  dataResetNonce: 0,
  sessionListNonce: 0,
  dataSource: createStaticMockDataSource(demoView),
  subscribeToDataSource: (onUpdate) => get().dataSource.subscribe(onUpdate),
  hydrate: async () => {
    const repository = getRepository();
    const service = getPersistenceService();
    const analysisSettings = repository.loadQuickPassSettings();
    // Register the configured engine origins with the native LLM bridge's
    // allowlist; llm_http_request rejects every other origin.
    // Load the local model now, while the user is still reading the app, rather
    // than when they press the language chord. Warming at overlay-open could
    // never help: one chord press both opens the overlay and asks the question,
    // so the warm raced the request it existed to remove (issue #41). A cold
    // load measured ~8-10s of the ~19s the user actually waited.
    //
    // Chained, not fired alongside: the native bridge rejects any origin that
    // is not yet on the allowlist, so a warm sent before the sync resolves is
    // refused and then swallowed by the deliberately silent catch.
    // `await` rather than `.then`: the sync is typed as returning a promise but
    // is stubbed as a plain function in tests, and calling `.then` on the
    // result threw before either call could happen.
    void (async () => {
      await syncLlmAllowedEndpoints(analysisSettings);
      await prewarmLanguageModel(analysisSettings);
    })();
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
        demoSessionId: null,
        imports: localImports,
        pendingReview: localDraft ? repository.loadPendingReview(localDraft.session.id) : null,
        lastApplied: null,
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
      demoSessionId: null,
      imports,
      pendingReview: draft ? repository.loadPendingReview(draft.session.id) : null,
      lastApplied: null,
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
      demoSessionId: null,
      imports,
      pendingReview: repository.loadPendingReview(draft.session.id),
      lastApplied: null,
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
  addImport: (candidate, options) => {
    const repository = getRepository();
    const draft = get().draft;
    if (!draft) return null;

    const stored = repository.addSessionImport(draft.session.id, candidate, options);
    set({ imports: repository.listSessionImports(draft.session.id) });
    return stored;
  },
  addImportBatch: (candidates) => {
    const repository = getRepository();
    const draft = get().draft;
    if (!draft || candidates.length === 0) return [];

    const stored = candidates.map((candidate) =>
      repository.addSessionImport(draft.session.id, candidate),
    );
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
      // Drop agent boilerplate (e.g. Claude's "continued from a previous
      // conversation" notice) and fall back to the first real turn, then the
      // project, so the session never reads as the compaction message.
      sessionTitle:
        cleanImportedTitle(params.title) ||
        firstMeaningfulTitle(params.candidate.events.map((event) => event.title)) ||
        projectName ||
        "제목 없는 Claude 대화",
      projectName,
      selectedSources: [],
      recordingMode: params.recordingMode ?? previous?.session.recordingMode ?? "summary",
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
      demoSessionId: null,
      imports: repository.listSessionImports(stored.session.id),
      pendingReview: null,
      lastApplied: null,
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
  importAndOpenAsNewSession: (params) => {
    const { sessionId, candidate } = get().importAsNewSession(params);
    // Materialize the parse straight away — no pending review. The events are
    // a faithful, deterministic projection of the user's own conversation, so
    // they are evidence, not a proposal to gate.
    const stored = get().addImport(candidate);
    // The session now holds applied work, so it is real — clear the
    // empty-session cleanup bookkeeping (mirrors what apply did via review).
    get().commitPendingNewSession();
    if (stored) {
      set({
        lastApplied: {
          sourceId: stored.id,
          appliedCount: candidate.events.length,
          appliedAt: new Date().toISOString(),
        },
      });
    }
    return { sessionId, firstEventId: stored?.events[0]?.id ?? null };
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
          demoSessionId: null,
          imports: restoredImports,
          pendingReview: repository.loadPendingReview(restored.session.id),
          lastApplied: null,
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
      demoSessionId: null,
      imports: [],
      pendingReview: null,
      lastApplied: null,
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
  savePendingReview: (draft, meta) => {
    const session = get().draft;
    if (!session) return null;
    const repository = getRepository();
    const stored = repository.savePendingReview(session.session.id, draft, meta);
    set({ pendingReview: stored });
    return stored;
  },
  beginPendingReview: (candidate, origin, meta) => {
    const session = get().draft;
    if (!session) return null;
    const draft = createImportReviewDraft(candidate, origin);
    const stored = getRepository().savePendingReview(session.session.id, draft, meta);
    // Starting a fresh review clears any prior completion banner.
    set({ pendingReview: stored, lastApplied: null });
    return stored;
  },
  clearPendingReview: () => {
    const session = get().draft;
    if (session) getRepository().clearPendingReview(session.session.id);
    set({ pendingReview: null });
  },
  setPendingReviewItemStatus: (kind, itemId, status) => {
    const { draft: session, pendingReview } = get();
    if (!session || !pendingReview) return;
    const nextDraft = setReviewItemStatus(pendingReview.draft, kind, itemId, status);
    const stored = getRepository().savePendingReview(
      session.session.id,
      nextDraft,
      pendingReview.meta,
    );
    set({ pendingReview: stored });
  },
  setAllPendingReviewStatus: (status) => {
    const { draft: session, pendingReview } = get();
    if (!session || !pendingReview) return;
    const nextDraft = setAllItemsStatus(pendingReview.draft, status);
    const stored = getRepository().savePendingReview(
      session.session.id,
      nextDraft,
      pendingReview.meta,
    );
    set({ pendingReview: stored });
  },
  editPendingReviewEvent: (itemId, edits) => {
    const { draft: session, pendingReview } = get();
    if (!session || !pendingReview) return;
    const nextDraft = editReviewEvent(pendingReview.draft, itemId, edits);
    const stored = getRepository().savePendingReview(
      session.session.id,
      nextDraft,
      pendingReview.meta,
    );
    set({ pendingReview: stored });
  },
  applyPendingReview: () => {
    const { draft: session, pendingReview } = get();
    if (!session || !pendingReview) {
      return { ok: false, reason: "반영할 검토가 없습니다." };
    }
    const reviewDraft = pendingReview.draft;
    if (!isReviewApplyable(reviewDraft)) {
      return { ok: false, reason: "최소 1개 이상의 이벤트를 수락해야 반영할 수 있습니다." };
    }
    const candidate = buildAcceptedCandidate(reviewDraft);
    if (!candidate) {
      return { ok: false, reason: "수락된 이벤트로 자료를 만들 수 없습니다." };
    }
    const repository = getRepository();
    const summary = pendingReview.meta?.sourceImportSummary;
    const stored = repository.addSessionImport(
      session.session.id,
      candidate,
      summary ? { importSummary: summary } : undefined,
    );
    repository.clearPendingReview(session.session.id);
    set({
      imports: repository.listSessionImports(session.session.id),
      pendingReview: null,
      lastApplied: {
        sourceId: stored.id,
        appliedCount: candidate.events.length,
        appliedAt: new Date().toISOString(),
      },
    });
    // Applied work means a pending import-created session is now real — drop
    // the empty-session cleanup bookkeeping so it is never discarded.
    if (get().pendingNewSession) set({ pendingNewSession: null });
    return {
      ok: true,
      appliedCount: candidate.events.length,
      firstEventId: stored.events[0]?.id ?? null,
    };
  },
  cancelPendingReview: () => {
    const session = get().draft;
    if (session) getRepository().clearPendingReview(session.session.id);
    set({ pendingReview: null });
    // If this review was for a freshly-created import session and nothing was
    // applied, discard the empty session and restore the prior one.
    get().abandonPendingNewSessionIfEmpty();
  },
  clearLastApplied: () => set({ lastApplied: null }),
  resetToDemo: () => {
    const repository = getRepository();
    repository.clearCurrentSessionDraft();
    set({
      draft: null,
      demoSessionId: null,
      imports: [],
      pendingReview: null,
      lastApplied: null,
      analysis: null,
      analysisStatus: "idle",
      analysisError: null,
      analysisProviderLabel: null,
      analysisFallbackUsed: false,
      source: "demo",
      pendingNewSession: null,
    });
  },
  beginEmptySession: (input) => {
    const repository = getRepository();
    const now = input?.now ?? new Date().toISOString();
    const draft = createSessionDraft({
      sessionTitle: input?.title ?? "새 Mori 작업",
      projectName: input?.projectName ?? "내 작업",
      selectedSources: [],
      recordingMode: "summary",
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
      storageLocation: "browser:localStorage",
      now,
      startedAt: now,
      endedAt: now,
      status: "recording",
    });
    const stored = repository.saveCurrentSessionDraft(draft);
    set({
      draft: stored,
      demoSessionId: null,
      imports: [],
      pendingReview: null,
      lastApplied: null,
      analysis: null,
      analysisStatus: "idle",
      analysisError: null,
      analysisProviderLabel: null,
      analysisFallbackUsed: false,
      initialized: true,
      source: "browser-draft",
      pendingNewSession: null,
    });
    return stored;
  },
  clearAllDataAndViewDemo: async () => {
    const repository = getRepository();
    repository.clearAllLocalData();
    const service = getPersistenceService();
    if (service.isDesktop()) {
      // Desktop sessions live in SQLite, not localStorage — wipe them too.
      // A failure here is non-fatal: localStorage is already cleared and the
      // new empty local session still opens; the SQLite list refresh will reveal any rows
      // that survived so the state stays honest rather than silently wrong.
      try {
        await service.clearAllDesktopData();
      } catch {
        // Intentionally swallowed — see above. The SQLite store's own refresh
        // surfaces the real post-clear state.
      }
    }
    const now = new Date().toISOString();
    const emptyDraft = createSessionDraft({
      sessionTitle: "새 Mori 작업",
      projectName: "내 작업",
      selectedSources: [],
      recordingMode: "summary",
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
      storageLocation: "browser:localStorage",
      now,
      startedAt: now,
      endedAt: now,
      status: "recording",
    });
    const stored = repository.saveCurrentSessionDraft(emptyDraft);
    set({
      draft: stored,
      imports: [],
      pendingReview: null,
      lastApplied: null,
      analysis: null,
      analysisStatus: "idle",
      analysisError: null,
      analysisProviderLabel: null,
      analysisFallbackUsed: false,
      source: "browser-draft",
      pendingNewSession: null,
      demoSessionId: null,
      dataResetNonce: get().dataResetNonce + 1,
    });
  },
  runQuickPass: async (provider, runSettings) => {
    const repository = getRepository();
    const state = get();
    const draft = state.draft;
    if (!draft) {
      set({
        analysisStatus: "failed",
        analysisError: "세션을 시작하고 소스를 가져온 뒤 분석을 실행하세요.",
        analysisFallbackUsed: false,
      });
      return null;
    }
    const imports = state.imports;
    if (!imports.length) {
      set({
        analysisStatus: "failed",
        analysisError: "분석하려면 먼저 노트, URL, AI 대화 같은 소스를 가져오세요.",
        analysisFallbackUsed: false,
      });
      return null;
    }

    const settings = state.analysisSettings;
    const primary = provider ?? resolveProviderFromSettings(runSettings ?? settings);
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
      const primaryMessage = primaryError instanceof Error ? primaryError.message : "분석 실패";

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
  applyBackgroundAnalysis: (result, providerName) => {
    const draft = get().draft;
    if (!draft) return;
    const repository = getRepository();
    repository.saveSessionAnalysis(draft.session.id, result);
    persistMemoryBodyFromAnalysis(repository, draft.session.id, result);
    set({
      analysis: result,
      analysisStatus: "succeeded",
      analysisError: null,
      analysisProviderLabel: providerName ?? "백그라운드 분석",
      analysisFallbackUsed: false,
    });
  },
  loadAnalysisRunHistory: () => {
    const draft = get().draft;
    if (!draft) return null;
    return getRepository().loadSessionAnalysisHistory(draft.session.id)?.history ?? null;
  },
  selectAnalysisRun: (runId) => {
    const draft = get().draft;
    if (!draft) return false;
    const repository = getRepository();
    const stored = repository.selectSessionAnalysisRun(draft.session.id, runId);
    // An unknown run id is a no-op at the storage layer (the pointer is
    // unchanged); report it as a failed adoption so the UI does not
    // signal success for a run that does not exist.
    if (!stored || stored.history.currentRunId !== runId) return false;
    const adopted = getCurrentRun(stored.history);
    if (!adopted) return false;
    // The adopted run becomes the live understanding: rewrite the memory
    // body so Project Memory aggregates the adopted run, and reflect it
    // in store state for Review / Timeline / Reports.
    persistMemoryBodyFromAnalysis(repository, draft.session.id, adopted);
    set({
      analysis: adopted,
      analysisStatus: "succeeded",
      analysisError: null,
      analysisProviderLabel: adopted.providerLabel,
    });
    return true;
  },
  generateRequestAbstraction: async (eventId, rawText) => {
    const { analysisSettings } = get();
    const result = await buildLlmRequestAbstraction(rawText, {
      endpoint: analysisSettings.ollamaEndpoint,
      model: resolveTaskModel(analysisSettings, "requestAbstraction"),
      timeoutMs: analysisSettings.ollamaTimeoutMs,
    });
    set((state) => ({
      requestAbstractions: {
        ...state.requestAbstractions,
        [eventId]: {
          summary: result.summary,
          abstract: result.abstract,
          source: result.source,
          note: result.note,
        },
      },
    }));
    return result.source === "llm";
  },
  setRequestDisclosureOverride: (eventId, level) => {
    set((state) => ({
      requestDisclosureOverrides: { ...state.requestDisclosureOverrides, [eventId]: level },
    }));
  },
  startFollow: (sessionId, knownEventIds) => {
    set({
      follow: followReducer(get().follow, {
        type: "start",
        sessionId,
        knownEventIds,
        at: new Date().toISOString(),
      }),
    });
  },
  applyFollowPoll: (incomingEventIds, at) => {
    const state = get();
    const polled = followReducer(state.follow, { type: "poll", incomingEventIds, at });
    const reaction = decideFollowReaction(polled);
    // Consume pending only when a reaction fires, so a sub-threshold poll
    // keeps accumulating until enough new events arrive.
    const next = reaction.shouldReanalyze
      ? followReducer(polled, { type: "consumePending" })
      : polled;
    // Capture the feed notice now: pending is cleared on reaction, so it
    // cannot be derived from follow state later.
    const notification =
      reaction.shouldNotify && polled.sessionId
        ? buildFollowNotification({
            shouldNotify: true,
            newCount: reaction.newCount,
            sessionId: polled.sessionId,
            sessionTitle: state.draft?.session.title,
            projectLabel: state.draft?.project.name,
            at,
          })
        : null;
    set({
      follow: next,
      followNotifications: notification
        ? [...state.followNotifications, notification]
        : state.followNotifications,
    });
    return reaction;
  },
  pushLiveNotification: (notification) =>
    set((state) => {
      if (state.liveNotifications.some((existing) => existing.id === notification.id)) {
        return state;
      }
      const next = [...state.liveNotifications, notification];
      return { liveNotifications: next.length > 50 ? next.slice(-50) : next };
    }),
  pushImportSyncNotification: (notification) =>
    set((state) => {
      if (state.importSyncNotifications.some((existing) => existing.id === notification.id)) {
        return state;
      }
      const next = [...state.importSyncNotifications, notification];
      return { importSyncNotifications: next.length > 50 ? next.slice(-50) : next };
    }),
  registerDiscoveredSessions: (drafts) => {
    if (drafts.length === 0) return [];
    const repository = getRepository();
    const written: string[] = [];
    for (const draft of drafts) {
      try {
        repository.putStoredSessionDraft(draft);
        written.push(draft.session.id);
      } catch {
        // A quota / write failure must not abort the batch or be reported as a
        // success — leave it out of `written` so the caller can retry it.
      }
    }
    if (written.length > 0) {
      set((state) => ({ sessionListNonce: state.sessionListNonce + 1 }));
    }
    return written;
  },
  pruneAutoImportedSessions: (keepIds) => {
    const repository = getRepository();
    const removed: string[] = [];
    for (const summary of repository.listStoredSessions()) {
      if (!isAutoImportedSessionId(summary.sessionId)) continue;
      if (keepIds.has(summary.sessionId)) continue;
      // Never prune a materialized (opened) auto session — it holds real
      // imported work. Only stale metadata placeholders are removed.
      if (repository.listSessionImports(summary.sessionId).length > 0) continue;
      try {
        repository.clearStoredSession(summary.sessionId);
        removeAutoImportMeta(summary.sessionId);
        removed.push(summary.sessionId);
      } catch {
        // Skip a stubborn key; the next pass retries.
      }
    }
    if (removed.length > 0) {
      set((state) => ({ sessionListNonce: state.sessionListNonce + 1 }));
    }
    return removed;
  },
  openDiscoveredSession: async (sessionId) => {
    let meta = loadAutoImportMeta(sessionId);
    if (!meta) {
      // Self-heal: the reopen descriptor can be missing (a session registered by
      // an older build, or whose meta was pruned). Re-discover from the live
      // agent listing, match by the stable id, and repair the descriptor so the
      // next open is fast.
      try {
        const discovered = await listAllAgentWorkSessions();
        meta = discovered.find((m) => autoImportedSessionId(m) === sessionId) ?? null;
        if (meta) upsertAutoImportMetas([meta]);
      } catch {
        // Discovery unavailable (browser) — nothing to heal with.
      }
    }
    if (!meta) return false;
    // Open the placeholder as the active session first, then apply the real
    // transcript ONTO THE SAME id. Materializing in place (rather than minting a
    // new session id) means a later auto-import poll just refreshes this one row
    // instead of resurrecting a duplicate placeholder for the same conversation.
    if (!get().loadBrowserSession(sessionId)) {
      // A re-discovered session may have no stored draft yet — create one.
      getRepository().putStoredSessionDraft(agentSessionToStoredDraft(meta));
      if (!get().loadBrowserSession(sessionId)) return false;
    }
    try {
      const detail = await getAgentWorkSession(meta);
      const candidate = buildPrimaryImportCandidateFromAgentWorkSession(detail, {
        projectId: autoImportedProjectId(meta),
        sessionId,
        capturedAt: new Date().toISOString(),
      });
      get().addImport(candidate);
      return true;
    } catch {
      // The metadata draft is already open as an honest fallback.
      return false;
    }
  },
  pauseFollow: () => set({ follow: followReducer(get().follow, { type: "pause" }) }),
  resumeFollow: () => set({ follow: followReducer(get().follow, { type: "resume" }) }),
  stopFollow: () => set({ follow: followReducer(get().follow, { type: "stop" }) }),
  setFollowError: (message, at) =>
    set({ follow: followReducer(get().follow, { type: "error", message, at }) }),
  updateAnalysisSettings: (patch) => {
    const repository = getRepository();
    const previous = get().analysisSettings;
    const next = sanitizeQuickPassSettings({ ...previous, ...patch });
    repository.saveQuickPassSettings(next);
    set({ analysisSettings: next });
    // Changing the model invalidates the warm one and warms the new one, so the
    // first request after a model switch is not the one that pays for it.
    const modelChanged =
      next.ollamaModel !== previous.ollamaModel || next.provider !== previous.provider;
    if (modelChanged) resetPrewarmState();
    void (async () => {
      await syncLlmAllowedEndpoints(next);
      if (modelChanged) await prewarmLanguageModel(next);
    })();
    return next;
  },
  loadAnalysisSettings: () => {
    // Just the engine slice of `hydrate`. The language overlay is a second
    // window that renders no app shell and therefore never calls `hydrate`; it
    // was consequently running on DEFAULT_QUICK_PASS_SETTINGS and reporting
    // "no engine" while the main window had Ollama configured and working.
    const settings = getRepository().loadQuickPassSettings();
    // Registering the origin matters as much as reading the settings: the
    // native bridge rejects any endpoint that is not on the allowlist, and the
    // allowlist is only populated by whichever window hydrated.
    // A last-resort warm for the overlay window, which has its own JS context
    // and therefore its own warm marker. Too late to help the request that is
    // about to run (#41), but it means the one after it is warm. Chained for
    // the same allowlist reason as `hydrate`.
    void (async () => {
      await syncLlmAllowedEndpoints(settings);
      await prewarmLanguageModel(settings);
    })();
    set({ analysisSettings: settings });
    return settings;
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
    const nextAnalysis: AnalysisResult = {
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

    const nextAnalysis: AnalysisResult = {
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

    const nextAnalysis: AnalysisResult = {
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
    // Already showing this demo session — nothing further to load.
    if (!get().draft && get().demoSessionId === sessionId) return true;
    const repository = getRepository();
    const draft = repository.setCurrentSession(sessionId);
    if (!draft) {
      // No stored draft for this id. Bundled demo sessions carry no persisted
      // body, so open their generated read-only content instead — this is what
      // lets a demo row show *that* session rather than the canonical stand-in.
      if (isDemoSessionId(sessionId) && buildDemoSessionContent(sessionId)) {
        set({
          draft: null,
          demoSessionId: sessionId,
          imports: [],
          pendingReview: null,
          lastApplied: null,
          analysis: null,
          analysisStatus: "idle",
          analysisError: null,
          analysisProviderLabel: null,
          analysisFallbackUsed: false,
          initialized: true,
          source: "demo",
          pendingNewSession: null,
        });
        return true;
      }
      return false;
    }

    const imports = repository.listSessionImports(sessionId);
    const analysisRecord = repository.loadSessionAnalysis(sessionId);

    set({
      draft,
      demoSessionId: null,
      imports,
      pendingReview: repository.loadPendingReview(sessionId),
      lastApplied: null,
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
      demoSessionId: null,
      imports: refreshedImports,
      pendingReview: repository.loadPendingReview(storedDraft.session.id),
      lastApplied: null,
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
 * Apply a pure session-metadata transform (rename) to
 * a stored session draft by id and persist it. Centralises the
 * lifecycle write so the store action stays a one-liner:
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
  get: () => SessionState,
  set: (partial: Partial<SessionState>) => void,
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

function resolveProviderFromSettings(settings: QuickPassAnalysisSettings): AnalysisProvider {
  // Deterministic stays memoised; the LLM providers share the one
  // settings → config mapping with the capability check and any future caller.
  if (settings.provider === "deterministic") return getDefaultProvider();
  return resolveQuickPassProvider(buildProviderConfigFromSettings(settings));
}

type ViewCache = {
  draft: StoredSessionDraft | null;
  imports: StoredSessionImport[];
  analysis: AnalysisResult | null;
  view: SessionViewModel;
};

let viewCache: ViewCache | null = null;
// Demo views are built once per id and cached so the selector returns a stable
// reference (zustand re-runs selectors every render; a fresh object each call
// would loop). Keyed by the open demo session id.
let demoViewCache: { id: string; view: SessionViewModel } | null = null;

export function selectSessionView(state: SessionState): SessionViewModel {
  if (!state.draft) {
    const id = state.demoSessionId;
    if (!id) return demoView;
    if (demoViewCache && demoViewCache.id === id) return demoViewCache.view;
    const content = buildDemoSessionContent(id);
    const view: SessionViewModel = content ? { ...content, isDemo: true } : demoView;
    demoViewCache = { id, view };
    return view;
  }
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

export function selectSessionMode(state: SessionState): SessionMode {
  return state.draft ? "draft" : "demo";
}

export function selectSessionSource(state: SessionState): SessionSource {
  return state.source;
}

export function selectHasRealAnalysis(state: SessionState): boolean {
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

export function loadStoredSessionSummariesWithMetrics(): StoredSessionSummary[] {
  const repository = getRepository();
  return repository.listStoredSessionsWithMetrics?.() ?? repository.listStoredSessions();
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

function mergeAnalysisIntoView(view: SessionViewModel, analysis: AnalysisResult): SessionViewModel {
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
