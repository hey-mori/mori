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
import { sha256Hex, type PassageLocatorV1 } from "../lib/capture/passageCapture";
import {
  isUsableArchive,
  keptArchiveRead,
  keptArchiveIdentity,
  keptArchiveSourceId,
  type KeptArchiveRead,
} from "../lib/session/sessionArchiveRead";
import { redactText } from "../lib/connectors/redaction";
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
  getAgentWorkSession,
  listAllAgentWorkSessions,
} from "../lib/trace/sources/ai/workSessions";
import { buildPrimaryImportCandidateFromAgentWorkSession } from "../lib/import/agentWorkSessionImport";
import { planSourceReopen } from "../lib/import/autoSourceReopen";
import {
  archiveFailure,
  historicalSourceAfterFailure,
  historicalSourceAfterRead,
  isSourceGone,
  type HistoricalSource,
} from "../lib/session/historicalSource";
import { eventIdsCitedOutsideAdoptedRun } from "../lib/import/reopenCitations";
import { AcceptedMemoryRepository } from "../lib/project-memory/acceptedMemoryRepository";
import {
  claudeCodeSourcePresence,
  getClaudeCodeSessionWindow,
  searchClaudeCodeSession,
} from "../lib/claude/claudeTauri";
import type { ClaudeCodeSearchHit, ClaudeCodeSessionWindow } from "../lib/claude/types";
import {
  applySearchBatch,
  canSearchMore,
  containsPhrase,
  normalizeQuery,
  searchPageDone,
  SEARCH_PAGE_HITS,
  startedSearch,
  type SessionSearchState,
} from "../lib/session/sessionSearch";
import {
  appendForwardWindow,
  appendNewerWindow,
  classifyWindowError,
  earlierCursor,
  isLoadedWindow,
  isTooLargeError,
  MAX_EMPTY_WINDOW_SKIPS,
  jumpedWindowState,
  newerCursor,
  prependEarlierWindow,
  windowStateFrom,
  type LoadedSessionWindow,
  type SessionWindowError,
  type SessionWindowState,
} from "../lib/session/sessionWindow";
import {
  agentSessionToStoredDraft,
  autoImportedProjectId,
  autoImportedSessionId,
  isAutoImportedSessionId,
} from "../lib/session/autoImportSessions";
import {
  loadAutoImportMeta,
  removeAutoImportMeta,
  upsertAutoImportMetas,
  forgetReopenDescriptors,
} from "../lib/session/autoImportMetaStore";
import { getDesktopDocumentMirror } from "../lib/storage/desktopDocumentMirror";
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
import { BrowserDraftRepository, createBrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import {
  getSessionPersistenceService,
  type SessionPersistenceService,
} from "../lib/storage/sessionPersistenceService";
import type {
  ConnectorEventIdentitySnapshot,
  DraftRepository,
  StoredAcceptedProjectMemory,
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
import { prepareDurableReads } from "./durableReads";

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
  applyPendingReview: () => ApplyPendingReviewResult | Promise<ApplyPendingReviewResult>;
  /**
   * Internal: apply a Lens transfer review. Called by applyPendingReview
   * when the origin is "lens-transfer". Routes through the Rust import
   * path for kernel record persistence and idempotency.
   */
  applyLensTransferReview: (
    candidate: NormalizedImportCandidate,
    reviewDraft: ImportReviewDraft,
  ) => Promise<ApplyPendingReviewResult>;
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
  /** Resolves how many kept transcript copies could not be removed. */
  clearAllDataAndViewDemo: () => Promise<{ archivesLeft: number; snapshotsLeft: number; databaseCleared: boolean }>;
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
   * on demand: fetch the agent detail and import it onto the placeholder's id.
   * A Claude Code transcript too large to import opens as a read-only
   * `sessionWindow` of its recent conversation instead, never imported.
   *
   * - `opened`: the transcript (or its recent window) is showing.
   * - `failed`: the placeholder is open and `sessionWindow` says why the
   *   transcript could not be read; it is never shown as an empty session.
   * - `missing`: no reopen descriptor (the caller may open the stored draft).
   * - `superseded`: another open started meanwhile; this one changed nothing.
   */
  openDiscoveredSession: (sessionId: string) => Promise<OpenDiscoveredOutcome>;
  /**
   * The active session came back without a read this run (restored at
   * startup): check, once, that its transcript still exists (an existence
   * check, nothing is read), and only when it is gone open it the usual way,
   * so its kept archive or the kept-copy notice shows. Resolves whether a
   * reopen ran.
   */
  recheckRestoredSource: (sessionId: string) => Promise<boolean>;
  /**
   * The read-only window of a long transcript the active session shows in
   * place of an import, or why it could not be read. Null for every other
   * session. Transient: never persisted, never analysed.
   */
  sessionWindow: SessionWindowState | null;
  /**
   * What the last discovery pass found on disk: every listed session id, and
   * the agents whose listing returned anything (a failed listing returns
   * nothing, so only those agents' absences mean "not on this machine").
   * Null until a pass completes. Transient: never persisted.
   */
  discoveredSessions: { ids: ReadonlySet<string>; agents: ReadonlySet<string> } | null;
  setDiscoveredSessions: (value: { ids: ReadonlySet<string>; agents: ReadonlySet<string> }) => void;
  /**
   * Sessions an open attempt this run found nothing to show for (no import,
   * no kept copy, no transcript). Set and cleared by the shared resolver, so
   * a record shown in their place can say so truthfully; a session that was
   * never tried is not in it. Transient: never persisted.
   */
  unopenableSessionIds: ReadonlySet<string>;
  noteSessionOpenable: (sessionId: string, openable: boolean) => void;
  /**
   * The session whose transcript, read on its last open, no longer continues
   * what Mori imported (replaced or rewritten at the same path): the import
   * is kept as stored and the view must not imply the file backs it.
   */
  divergedSourceSessionId: string | null;
  /** Prepend the window before the held part of `sessionWindow`. */
  loadEarlierSessionWindow: () => Promise<void>;
  /** Read back the newer window the view let go of last. */
  loadNewerSessionWindow: () => Promise<void>;
  /** Replace the view with the transcript's current end (an explicit jump). */
  loadLatestSessionWindow: () => Promise<void>;
  /**
   * A search inside the open long transcript (`sessionWindow`): its query,
   * what it found and how much it searched. Transient, never persisted, and
   * dropped when another session opens.
   */
  sessionSearch: SessionSearchState | null;
  /** Start searching the open transcript for a phrase, from its end back. */
  /** Whole words unless `wholeWords` is false ("부분 일치"). */
  searchSessionWindow: (query: string, wholeWords?: boolean) => Promise<void>;
  /** Continue the search into earlier history. */
  searchMoreSessionWindow: () => Promise<void>;
  /** Stop a running search; what it found stays. */
  cancelSessionSearch: () => void;
  /** Close the search and drop its results. */
  closeSessionSearch: () => void;
  /** Open the view at a search result: the window that ends at its record. */
  openSessionSearchHit: (hit: ClaudeCodeSearchHit) => Promise<void>;
  /**
   * Open a session directly at a result another surface found (the project
   * search): read and check the matched record's window first, then make the
   * session active with that window. Nothing is imported or written beyond
   * what an ordinary open writes. `stillWanted` is asked before the session
   * changes, so a click the user has moved on from changes nothing.
   */
  openSessionAtSourceHit: (args: {
    sessionId: string;
    sourcePath: string;
    sourceId: string;
    hit: ClaudeCodeSearchHit;
    query: string;
    wholeWords: boolean;
    stillWanted: () => boolean;
    /** Set when `sourcePath` is Mori's kept copy (보관한 원본), not the original. */
    archive?: LoadedSessionWindow["archive"];
  }) => Promise<SourceHitOutcome>;
  /**
   * Open a session at its latest reply: the newest window of its source, with
   * the last reply from the agent focused (what a waiting request waits on).
   * Nothing is imported; the session becomes active the way an ordinary open
   * does, and `stillWanted` is asked before it changes.
   */
  openSessionAtLatestReply: (args: {
    sessionId: string;
    sourcePath: string;
    stillWanted: () => boolean;
  }) => Promise<SourceHitOutcome>;
  /**
   * Open a session at a passage a record was saved from: read back to the
   * stored record through the cursor check, then require that record's text
   * at the stored range to hash to the saved excerpt. "missing" when the
   * session or its transcript is gone, "changed" when the transcript no
   * longer holds that text there. Nothing is imported or written.
   */
  openSessionAtPassage: (args: { locator: PassageLocatorV1; stillWanted: () => boolean }) => Promise<SourceHitOutcome>;
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
    // Dual-write (R2) plus the read flip (R6). Reads come through the storage
    // `prepareDurableReads` resolved, which is SQLite-backed only when SQLite
    // provably holds everything localStorage does; otherwise it is null and
    // this is exactly the repository it always was.
    // The app storage (see `lib/storage/appStorage`), resolved per call rather
    // than captured now: the first reader can arrive before the read source is
    // decided, and a captured `null` would pin this repository to localStorage.
    // Already mirrored on desktop (see createBrowserDraftRepository).
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

export type OpenDiscoveredOutcome = "opened" | "failed" | "missing" | "superseded";

/**
 * The window Session Detail shows in place of its tabs: only for the active
 * session, and only while it has no import (a whole transcript always wins).
 */
export function selectActiveSessionWindow(state: SessionState): SessionWindowState | null {
  const window = state.sessionWindow;
  if (!window || window.sessionId !== state.draft?.session.id) return null;
  // A search result opened this view at its passage: show it even for a
  // session with a whole import, until the focus is let go of (최신 대화로,
  // closing the search), when the session's own tabs return.
  // A kept archive is the fuller copy of a session whose original is gone:
  // it shows even where an earlier import exists.
  if (state.imports.length > 0 && !(isLoadedWindow(window) && (window.focus || window.archive))) return null;
  return window;
}

/**
 * The session is showing what Mori kept from an earlier read, because its
 * source file is gone (the agent deleted or moved the transcript). The kept
 * copy is real evidence, so it stays on screen; this says what it is: a copy
 * whose conversation runs to `lastEventAt`, possibly missing anything since.
 *
 * Two causes count: the source is missing, or it was read and no longer
 * continues the import (replaced or rewritten at the same path), so the
 * import is kept as stored. A file too large for this agent's reader, an
 * unavailable bridge or a local write that failed are neither.
 *
 * The copy is dated by its newest event, not by when the import was first
 * stored: a reopen that appends new turns keeps the import's original
 * `savedAt`.
 */
export function selectRetainedSourceNotice(
  state: SessionState,
): { kind: "missing" | "replaced"; lastEventAt: string } | null {
  const window = state.sessionWindow;
  const sessionId = state.draft?.session.id;
  let kind: "missing" | "replaced";
  if (window && window.status === "error" && window.sessionId === sessionId && window.error.kind === "missing") {
    kind = "missing";
  } else if (!window && sessionId && state.divergedSourceSessionId === sessionId) {
    kind = "replaced";
  } else {
    return null;
  }
  let lastEventAt: string | null = null;
  for (const entry of state.imports) {
    for (const event of entry.events) {
      const at = event.end ?? event.start;
      if (at && (lastEventAt === null || Date.parse(at) > Date.parse(lastEventAt))) lastEventAt = at;
    }
  }
  return lastEventAt ? { kind, lastEventAt } : null;
}

/** The notice's parts as primitives, so a component subscribing to them sees a
 *  stable value between renders (an object selector would loop). */
export const selectRetainedSourceLastEventAt = (state: SessionState): string | null =>
  selectRetainedSourceNotice(state)?.lastEventAt ?? null;
export const selectRetainedSourceKind = (state: SessionState): "missing" | "replaced" | null =>
  selectRetainedSourceNotice(state)?.kind ?? null;

/** Why opening a session at a search result did not happen. */
export type SourceHitOutcome = "opened" | "changed" | "missing" | "failed" | "superseded";

/** Bumped by every discovered-session open; a read that finishes after a newer
 *  open began must not touch the store (it would land on the wrong session). */
let discoveredOpenSequence = 0;
/** Sessions whose source was checked or read this run (see recheckRestoredSource). */
const sourceCheckedThisRun = new Set<string>();

export const useSessionStore = create<SessionState>((set, get) => ({
  initialized: false,
  draft: null,
  sessionWindow: null,
  discoveredSessions: null,
  setDiscoveredSessions: (value) => set({ discoveredSessions: value }),
  unopenableSessionIds: new Set<string>(),
  noteSessionOpenable: (sessionId, openable) => {
    const current = get().unopenableSessionIds;
    if (current.has(sessionId) === !openable) return;
    const next = new Set(current);
    if (openable) next.delete(sessionId);
    else next.add(sessionId);
    set({ unopenableSessionIds: next });
  },
  divergedSourceSessionId: null,
  sessionSearch: null,
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
    // Before anything is read: hydration is what pulls the sessions into
    // memory, so a source decided after it would change nothing this launch.
    await prepareDurableReads();
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

    // Desktop runtime: a legacy SQLite session snapshot (written only by older
    // builds; nothing writes one now) may fill in a session whose imports are
    // not stored here. It never replaces stored imports: replacing clears them
    // and re-adds only the snapshot's, which is older than anything this build
    // stored, so later turns, reopen refreshes and their ids would be lost.
    let hydratedFromSqlite = false;
    let draft: StoredSessionDraft | null = localDraft;
    let imports: StoredSessionImport[] = localImports;
    let analysisRecord = localAnalysisRecord;

    if (localDraft && localImports.length === 0) {
      try {
        const loaded = await service.loadSessionFromDesktop(localDraft.session.id);
        const sqliteDraft: StoredSessionDraft = {
          ...loaded.draft,
          savedAt: localDraft.savedAt,
        };
        repository.saveCurrentSessionDraft(sqliteDraft);
        mirrorDesktopImports(repository, sqliteDraft.session.id, loaded.imports);
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

    // Lens transfers go through the Rust import path (kernel records +
    // idempotency table), not the session import path.
    if (reviewDraft.origin === "lens-transfer") {
      return get().applyLensTransferReview(candidate, reviewDraft);
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
  applyLensTransferReview: async (candidate, _reviewDraft) => {
    // Extract file name from the source URI (set by normalizeLensTransfer).
    const fileName = candidate.source.uri;
    if (!fileName) {
      return { ok: false, reason: "Lens transfer file name is missing." };
    }
    try {
      const { importLensTransfer } = await import("../lib/connectors/lensConnector");
      await importLensTransfer(fileName);
    } catch (e) {
      return { ok: false, reason: `Lens import failed: ${e}` };
    }

    const repository = getRepository();
    const session = get().draft;
    if (session) {
      repository.clearPendingReview(session.session.id);
    }
    set({
      pendingReview: null,
      lastApplied: {
        sourceId: candidate.source.id,
        appliedCount: candidate.events.length,
        appliedAt: new Date().toISOString(),
      },
    });
    if (get().pendingNewSession) set({ pendingNewSession: null });
    return {
      ok: true,
      appliedCount: candidate.events.length,
      firstEventId: candidate.events[0]?.id ?? null,
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
    let archivesLeft = 0;
    let snapshotsLeft = 0;
    let databaseCleared = true;
    // Mirror writes still queued would land after the SQLite wipe and bring
    // rows back: settle them first.
    await getDesktopDocumentMirror()?.drain();
    const repository = getRepository();
    repository.clearAllLocalData();
    // The repository reads through the startup cache once the read flip
    // engaged, so keys other modules wrote straight to localStorage since are
    // not in it: clear localStorage itself too.
    if (typeof window !== "undefined") new BrowserDraftRepository(window.localStorage).clearAllLocalData();
    forgetReopenDescriptors();
    const service = getPersistenceService();
    if (service.isDesktop()) {
      // Desktop sessions live in SQLite, not localStorage — wipe them too.
      // A failure here is non-fatal: localStorage is already cleared and the
      // new empty local session still opens; the SQLite list refresh will reveal any rows
      // that survived so the state stays honest rather than silently wrong.
      try {
        const result = await service.clearAllDesktopData();
        archivesLeft = result?.archivesLeft ?? 0;
        snapshotsLeft = result?.snapshotsLeft ?? 0;
      } catch {
        // Nothing on disk was removed: the native side stops before archives
        // and snapshots when the database cannot be cleared. Said, not hidden.
        databaseCleared = false;
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
    return { archivesLeft, snapshotsLeft, databaseCleared };
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
  recheckRestoredSource: async (sessionId) => {
    if (sourceCheckedThisRun.has(sessionId)) return false;
    const state = get();
    // Not the session on screen, or already read this run (its own window).
    if (state.draft?.session.id !== sessionId || state.sessionWindow?.sessionId === sessionId) return false;
    const meta = loadAutoImportMeta(sessionId);
    if (!meta || meta.importKind !== "claude-code" || !meta.sourceFilePath) return false;
    sourceCheckedThisRun.add(sessionId);
    let presence: string | undefined;
    try {
      [presence] = await claudeCodeSourcePresence([meta.sourceFilePath]);
    } catch {
      return false;
    }
    // Present or unknown: what is on screen stays. Only a file the system
    // says is not there is "gone".
    if (presence !== "missing") return false;
    const now = get();
    if (now.draft?.session.id !== sessionId || now.sessionWindow?.sessionId === sessionId) return false;
    await get().openDiscoveredSession(sessionId);
    return true;
  },
  openDiscoveredSession: async (sessionId) => {
    sourceCheckedThisRun.add(sessionId);
    const token = ++discoveredOpenSequence;
    // Still the open the user asked for last, on the session it opened?
    const current = () => token === discoveredOpenSequence && get().draft?.session.id === sessionId;
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
    if (token !== discoveredOpenSequence) return "superseded";
    if (!meta) return "missing";
    // Open the placeholder as the active session first, then apply the real
    // transcript ONTO THE SAME id. Materializing in place (rather than minting a
    // new session id) means a later auto-import poll just refreshes this one row
    // instead of resurrecting a duplicate placeholder for the same conversation.
    if (!get().loadBrowserSession(sessionId)) {
      // A re-discovered session may have no stored draft yet — create one.
      getRepository().putStoredSessionDraft(agentSessionToStoredDraft(meta));
      if (!get().loadBrowserSession(sessionId)) return "missing";
    }
    // A search and a jump belong to one open of one session.
    searchSequence += 1;
    jumpSequence += 1;
    set({ sessionWindow: { sessionId, status: "loading" }, sessionSearch: null });
    const sourcePath = meta.sourceFilePath;
    const openWindow = async (
      path: string = sourcePath,
      archive?: LoadedSessionWindow["archive"],
    ): Promise<OpenDiscoveredOutcome> => {
      try {
        let state: LoadedSessionWindow = windowStateFrom(
          sessionId,
          await getClaudeCodeSessionWindow(path),
          token,
        );
        // A tail of metadata records shows nothing; read back a little further.
        for (let skip = 0; state.events.length === 0 && state.status === "partial" && skip < MAX_EMPTY_WINDOW_SKIPS; skip += 1) {
          state = prependEarlierWindow(
            state,
            await getClaudeCodeSessionWindow(path, earlierCursor(state)),
          );
        }
        if (!current()) return "superseded";
        // Read from the original: the shared rule decides whether that file
        // is still this session's history or the kept copy stands in for it.
        if (!archive) {
          const choice = await historicalSourceAfterRead(sessionId, state);
          if (!current()) return "superseded";
          if (choice.kind === "archive") return openWindow(choice.path, choice.archive);
          if (choice.kind === "failed") {
            set({ sessionWindow: { sessionId, status: "error", error: choice.error } });
            return "failed";
          }
        }
        set({ sessionWindow: archive ? { ...state, archive } : state });
        return "opened";
      } catch (error) {
        if (!current()) return "superseded";
        if (!archive) {
          const choice = await historicalSourceAfterFailure(sessionId, error);
          if (!current()) return "superseded";
          if (choice.kind === "archive") return openWindow(choice.path, choice.archive);
          set({ sessionWindow: { sessionId, status: "error", error: choice.error } });
          return "failed";
        }
        set({ sessionWindow: { sessionId, status: "error", error: classifyWindowError(error) } });
        return "failed";
      }
    };
    try {
      const detail = await getAgentWorkSession(meta);
      // A late reply for a session the user already left must not be imported
      // into whichever session is active now.
      if (!current()) return "superseded";
      // A session the user kept a copy of: the file at its path must still be
      // that conversation (same head fingerprint, not cut short below the
      // copy) before it is imported under this session; otherwise the copy is
      // shown and nothing is imported.
      const keptCopy = meta.importKind === "claude-code" ? await keptArchiveIdentity(sessionId) : null;
      if (!current()) return "superseded";
      if (keptCopy) {
        const head = await getClaudeCodeSessionWindow(sourcePath).catch(() => null);
        if (!current()) return "superseded";
        if (head) {
          const choice = await historicalSourceAfterRead(sessionId, head, keptCopy);
          if (!current()) return "superseded";
          if (choice.kind === "archive") return openWindow(choice.path, choice.archive);
          if (choice.kind === "failed") {
            set({ sessionWindow: { sessionId, status: "error", error: choice.error } });
            return "failed";
          }
        }
      }
      const candidate = buildPrimaryImportCandidateFromAgentWorkSession(detail, {
        projectId: autoImportedProjectId(meta),
        sessionId,
        capturedAt: new Date().toISOString(),
      });
      const repository = getRepository();
      // Events cited where a rename cannot follow (accepted project memory,
      // analysis runs not adopted): a reopen never renames them. Accepted
      // memory is read from its own store (SQLite on desktop); when that
      // read fails the citations are unknown and nothing is renamed.
      const cited = meta.sessionId ? await citedEventIds(repository, sessionId) : new Set<string>();
      if (!current()) return "superseded";
      // Reopening reads the transcript again: store it once (#167). The plan
      // and the write run with no await between them, after the open is
      // known to be current, so two opens cannot both decide to add.
      const plan = meta.sessionId
        ? planSourceReopen(repository.listSessionImports(sessionId), candidate, (eventId) =>
            cited === null ? true : cited.has(eventId),
          )
        : ({ kind: "add" } as const);
      // A transcript that no longer continues the import keeps the import as
      // stored; say so rather than let the readable file vouch for it. (A file
      // that is another conversation altogether was caught above by its head
      // fingerprint when a copy is kept; this is the same conversation read
      // differently, so the stored import, possibly newer than any copy,
      // stays on screen.)
      set({ divergedSourceSessionId: plan.kind === "keep" && plan.reason === "diverged" ? sessionId : null });
      if (plan.kind === "add") {
        get().addImport(candidate);
      } else if (plan.kind === "update") {
        // An answered prompt took a new event id; the analysis (and the memory
        // body projected from it) follows. These writes are not atomic, so if
        // a later one fails the earlier ones are put back and the open reports
        // the failure: never an import whose ids the analysis does not know.
        const previousAnalysis = get().analysis;
        let analysis = previousAnalysis;
        for (const { from, to } of plan.renamed) {
          if (analysis) analysis = remapEventIdInAnalysis(analysis, from, to);
        }
        repository.putSessionImports(sessionId, [plan.next]);
        if (analysis && previousAnalysis && analysis !== previousAnalysis) {
          try {
            repository.saveSessionAnalysis(sessionId, analysis);
            persistMemoryBodyFromAnalysis(repository, sessionId, analysis);
          } catch (error) {
            repository.putSessionImports(sessionId, [plan.previous]);
            try {
              repository.saveSessionAnalysis(sessionId, previousAnalysis);
              persistMemoryBodyFromAnalysis(repository, sessionId, previousAnalysis);
            } catch {
              // Already failing on storage; the import itself is restored.
            }
            set({ imports: repository.listSessionImports(sessionId) });
            throw error;
          }
          set({ analysis });
        }
        set({ imports: repository.listSessionImports(sessionId) });
      }
      set({ sessionWindow: null });
      return "opened";
    } catch (error) {
      if (!current()) return "superseded";
      // Too large to import whole: show its recent conversation instead. A
      // partial window is never imported as if it were the session.
      if (meta.importKind === "claude-code" && isTooLargeError(error)) {
        return openWindow();
      }
      // The original is gone: a copy the user kept is read in its place, and
      // the view says so.
      if (meta.importKind === "claude-code" && isSourceGone(error)) {
        const kept = await keptArchiveRead(sessionId);
        if (!current()) return "superseded";
        if (kept && !isUsableArchive(kept)) {
          set({ sessionWindow: { sessionId, status: "error", error: archiveFailure(kept) } });
          return "failed";
        }
        if (kept) return openWindow(kept.path, kept.archive);
      }
      set({ sessionWindow: { sessionId, status: "error", error: classifyWindowError(error) } });
      return "failed";
    }
  },
  loadEarlierSessionWindow: () => pageSessionWindow("earlier"),
  searchSessionWindow: (query, wholeWords = true) => startSessionSearch(query, wholeWords),
  searchMoreSessionWindow: () => continueSessionSearch(),
  cancelSessionSearch: () => {
    searchSequence += 1;
    const search = get().sessionSearch;
    if (search?.status === "searching") set({ sessionSearch: { ...search, status: "cancelled" } });
  },
  closeSessionSearch: () => {
    searchSequence += 1;
    jumpSequence += 1;
    const window = get().sessionWindow;
    set({
      sessionSearch: null,
      ...(isLoadedWindow(window) && window.focus ? { sessionWindow: { ...window, focus: null } } : {}),
    });
  },
  openSessionSearchHit: (hit) => openSearchHit(hit),
  openSessionAtLatestReply: async ({ sessionId, sourcePath, stillWanted }) => {
    const token = ++discoveredOpenSequence;
    searchSequence += 1;
    jumpSequence += 1;
    const current = () => token === discoveredOpenSequence && stillWanted();
    const outcomeOf = (kind: SessionWindowError["kind"]) =>
      kind === "missing" ? ("missing" as const) : kind === "changed" ? ("changed" as const) : ("failed" as const);
    // The same rule as opening the session: a replaced or cut-short original
    // is not this session; a gone one is read from the kept copy, whose latest
    // reply is the latest the copy holds (the view says it is the copy).
    let latest: ClaudeCodeSessionWindow | null = null;
    let archive: LoadedSessionWindow["archive"];
    let choice: HistoricalSource;
    try {
      latest = await getClaudeCodeSessionWindow(sourcePath);
      if (!current()) return "superseded";
      choice = await historicalSourceAfterRead(sessionId, latest);
    } catch (error) {
      if (!current()) return "superseded";
      choice = await historicalSourceAfterFailure(sessionId, error);
    }
    if (!current()) return "superseded";
    if (choice.kind === "failed") return outcomeOf(choice.error.kind);
    if (choice.kind === "archive") {
      // The copy's own read: its failure is not the original's.
      try {
        latest = await getClaudeCodeSessionWindow(choice.path);
        archive = choice.archive;
      } catch {
        return current() ? "failed" : "superseded";
      }
    }
    if (!latest) return "failed";
    if (!current()) return "superseded";
    const events = latest.events;
    const reply = [...events].reverse().find((event) => event.role === "assistant" && !event.subkind) ?? events[events.length - 1];
    if (!reply) return "failed";
    if (!get().loadBrowserSession(sessionId)) {
      const meta = loadAutoImportMeta(sessionId);
      if (meta) getRepository().putStoredSessionDraft(agentSessionToStoredDraft(meta));
      if (!get().loadBrowserSession(sessionId)) return "missing";
    }
    const focusSeq = ++jumpSequence;
    set({
      sessionWindow: {
        ...withArchive(windowStateFrom(sessionId, latest, token), archive),
        focus: { messageId: reply.id, query: "", wholeWords: true, seq: focusSeq },
      },
      sessionSearch: null,
    });
    return "opened";
  },
  openSessionAtSourceHit: async ({ sessionId, sourcePath, sourceId, hit, query, wholeWords, stillWanted, archive }) => {
    // An open of its own: it supersedes any other open in flight, and any
    // in-session search or jump of the session shown before.
    const token = ++discoveredOpenSequence;
    searchSequence += 1;
    jumpSequence += 1;
    const current = () => token === discoveredOpenSequence && stillWanted();
    let hitWindow: ClaudeCodeSessionWindow;
    try {
      hitWindow = await getClaudeCodeSessionWindow(sourcePath, { beforeOffset: hit.recordEnd, sourceId, endAnchor: hit.recordAnchor });
    } catch (error) {
      if (!current()) return "superseded";
      const kind = classifyWindowError(error).kind;
      return kind === "missing" ? "missing" : kind === "changed" ? "changed" : "failed";
    }
    if (!current()) return "superseded";
    // The window ends at the matched record: its last event is that record.
    const shown = hitWindow.events[hitWindow.events.length - 1];
    if (!shown || shown.id !== hit.messageId || !containsPhrase(shown.content, query, wholeWords)) return "changed";
    return showWindowAtRecord({ sessionId, sourcePath, hitWindow, token, current, focus: { messageId: hit.messageId, query, wholeWords }, archive });
  },
  openSessionAtPassage: async ({ locator, stillWanted }) => {
    const token = ++discoveredOpenSequence;
    searchSequence += 1;
    jumpSequence += 1;
    const current = () => token === discoveredOpenSequence && stillWanted();
    // The session is named, never a path: its descriptor says where it lives
    // now. When the original is gone, a copy the user kept is read instead,
    // with the same checks: it shares the original's fingerprint and offsets.
    const readAt = (path: string) =>
      getClaudeCodeSessionWindow(path, { beforeOffset: locator.end, sourceId: locator.sourceId, endAnchor: locator.anchor });
    let sourcePath = loadAutoImportMeta(locator.sessionId)?.sourceFilePath ?? null;
    let archive: LoadedSessionWindow["archive"] | undefined;
    let hitWindow: ClaudeCodeSessionWindow | null = null;
    let failure: SessionWindowError | null = sourcePath ? null : { kind: "missing", message: "no descriptor" };
    let gone = !sourcePath;
    if (sourcePath) {
      try {
        hitWindow = await readAt(sourcePath);
      } catch (error) {
        failure = classifyWindowError(error);
        gone = isSourceGone(error);
      }
    }
    if (!current()) return "superseded";
    // The file at the path is now another conversation: the passage was saved
    // from the original, so a copy kept of that same original (same head
    // fingerprint as the passage records) still holds it.
    let replaced = false;
    if (!hitWindow && !gone && failure?.kind === "changed") {
      const keptId = await keptArchiveSourceId(locator.sessionId);
      if (!current()) return "superseded";
      replaced = keptId !== null && keptId === locator.sourceId;
    }
    if (!hitWindow && (gone || replaced)) {
      const kept = await keptArchiveRead(locator.sessionId);
      if (!current()) return "superseded";
      // A copy kept before this passage was written cannot hold it: the
      // original is gone and the copy ends earlier, which is "missing".
      if (kept && kept.archive.bytes < locator.end) return "missing";
      // A copy that is gone or no longer the file kept cannot vouch for it.
      if (kept && !isUsableArchive(kept)) return "missing";
      if (kept) {
        try {
          hitWindow = await readAt(kept.path);
          sourcePath = kept.path;
          archive = replaced ? { ...kept.archive, replacedOriginal: true } : kept.archive;
          failure = null;
        } catch (error) {
          failure = classifyWindowError(error);
        }
      }
    }
    if (!current()) return "superseded";
    if (!hitWindow || !sourcePath) {
      const kind = failure?.kind;
      // "missing" only for a source that is gone: an unreadable original
      // (locked, permissions) still exists and must not be reported gone.
      if (kind === "missing") return gone || archive ? "missing" : "failed";
      return kind === "changed" ? "changed" : "failed";
    }
    if (!current()) return "superseded";
    // The anchor covers only a record's head (its parentUuid in real
    // transcripts): the same record id and the saved text decide.
    const shown = hitWindow.events[hitWindow.events.length - 1];
    if (!shown || shown.record?.start !== locator.start || shown.id !== locator.messageId) return "changed";
    const excerpt = shown.content.slice(locator.from, locator.to);
    // A redacted save kept only the redacted form's hash: compare after the
    // same redaction.
    const compared = locator.redacted ? redactText(excerpt).redacted : excerpt;
    if ((await sha256Hex(compared)) !== locator.excerptHash) return current() ? "changed" : "superseded";
    if (!current()) return "superseded";
    return showWindowAtRecord({
      sessionId: locator.sessionId,
      sourcePath,
      hitWindow,
      token,
      current,
      focus: { messageId: shown.id, query: excerpt, wholeWords: false, range: { from: locator.from, to: locator.to } },
      archive,
    });
  },
  loadNewerSessionWindow: () => pageSessionWindow("newer"),
  loadLatestSessionWindow: () => pageSessionWindow("latest"),
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
    // "Replaced" is said only by the open that read the transcript.
    if (get().divergedSourceSessionId) set({ divergedSourceSessionId: null });
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
    if (get().divergedSourceSessionId) set({ divergedSourceSessionId: null });
    const repository = getRepository();
    // A legacy snapshot never replaces imports stored here (see hydrate): the
    // stored session opens as it is.
    if (repository.listSessionImports(sessionId).length > 0) return get().loadBrowserSession(sessionId);
    let loaded;
    try {
      loaded = await service.loadSessionFromDesktop(sessionId);
    } catch {
      return false;
    }

    // Opening is not activity: keep the session's own `savedAt` (as the
    // startup restore does) so recency surfaces do not rank a session as just
    // active because it was looked at (#169).
    repository.putStoredSessionDraft({
      ...loaded.draft,
      savedAt: repository.loadStoredSessionDraft(sessionId)?.savedAt ?? loaded.draft.savedAt,
    });
    const storedDraft = repository.setCurrentSession(sessionId) ?? loaded.draft;
    mirrorDesktopImports(repository, storedDraft.session.id, loaded.imports);

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

/** Bumped by every search start, continue, cancel and close, and by every
 *  session open: a step that finishes after that must not touch the store. */
let searchSequence = 0;
/** Bumped by every result opened, and by everything that ends or replaces a
 *  search (a new query, closing it, another session opening): only the last
 *  jump asked for, from the search still showing, may move the view. Stopping
 *  a search only stops its scan; what it found, and opening one of those
 *  results, stays valid. */
let jumpSequence = 0;

/** Does the search belong to the view that is open now (same session, same open)? */
function searchOfView(search: SessionSearchState | null, window: SessionWindowState | null): LoadedSessionWindow | null {
  return search && isLoadedWindow(window) && search.sessionId === window.sessionId && search.openToken === window.openToken
    ? window
    : null;
}

async function startSessionSearch(query: string, wholeWords: boolean): Promise<void> {
  const { getState, setState } = useSessionStore;
  const phrase = normalizeQuery(query);
  const window = getState().sessionWindow;
  if (!phrase || !isLoadedWindow(window)) return;
  const sequence = ++searchSequence;
  // A new query replaces the old results: a result of theirs still opening
  // must not move the view.
  jumpSequence += 1;
  setState({
    sessionSearch: startedSearch({
      sessionId: window.sessionId,
      openToken: window.openToken,
      sourcePath: window.sourcePath,
      query: phrase,
      wholeWords,
    }),
  });
  await runSessionSearch(sequence, SEARCH_PAGE_HITS);
}

async function continueSessionSearch(): Promise<void> {
  const { getState, setState } = useSessionStore;
  const search = getState().sessionSearch;
  if (!search || !canSearchMore(search) || !searchOfView(search, getState().sessionWindow)) return;
  const sequence = ++searchSequence;
  setState({ sessionSearch: { ...search, status: "searching", error: null } });
  await runSessionSearch(sequence, search.hits.length + SEARCH_PAGE_HITS);
}

/**
 * Run bounded search steps until the page has its matches, the start of the
 * transcript is reached, or the search is cancelled or superseded. Each step
 * is one short native request, so stopping takes effect at the next step and
 * a stale step's reply is dropped.
 */
async function runSessionSearch(sequence: number, target: number): Promise<void> {
  const { getState, setState } = useSessionStore;
  for (;;) {
    const search = getState().sessionSearch;
    if (!search || sequence !== searchSequence || search.status !== "searching") return;
    if (!searchOfView(search, getState().sessionWindow)) {
      setState({ sessionSearch: null });
      return;
    }
    if (searchPageDone(search, target)) {
      setState({ sessionSearch: { ...search, status: "idle" } });
      return;
    }
    let batch;
    try {
      batch = await searchClaudeCodeSession(
        search.sourcePath,
        search.query,
        search.cursor && search.sourceId
          ? { beforeOffset: search.cursor.beforeOffset, sourceId: search.sourceId, anchor: search.cursor.anchor }
          : undefined,
        Math.min(SEARCH_PAGE_HITS, target - search.hits.length),
        search.wholeWords,
      );
    } catch (error) {
      const latest = getState().sessionSearch;
      if (sequence !== searchSequence || !latest) return;
      const classified = classifyWindowError(error);
      const status = classified.kind === "changed" ? "changed" : classified.kind === "missing" ? "missing" : "error";
      setState({ sessionSearch: { ...latest, status, error: classified } });
      return;
    }
    const latest = getState().sessionSearch;
    if (sequence !== searchSequence || !latest || latest.status !== "searching") return;
    const next = applySearchBatch(latest, batch);
    if (next === latest) {
      const error = { kind: "changed" as const, message: "SOURCE_CHANGED: the search step does not continue the search." };
      setState({ sessionSearch: { ...latest, status: "changed", error } });
      return;
    }
    setState({ sessionSearch: next });
  }
}

/**
 * Open the view at a search result. The window that ends at the matched
 * record is read with the result's source id and record anchor, so a replaced
 * or rewritten transcript is refused, and the message must still be there and
 * still hold the phrase. The window after it is read forward for context. Only
 * the last result asked for, in the same open of the same session, may move
 * the view.
 */
async function openSearchHit(hit: ClaudeCodeSearchHit): Promise<void> {
  const { getState, setState } = useSessionStore;
  const search = getState().sessionSearch;
  if (!search?.sourceId || !searchOfView(search, getState().sessionWindow)) return;
  const sourceId = search.sourceId;
  const sequence = ++jumpSequence;
  setState({ sessionSearch: { ...search, opening: hit.messageId, openError: null } });
  const current = () => {
    const latest = getState().sessionSearch;
    const window = searchOfView(latest, getState().sessionWindow);
    return sequence === jumpSequence && latest && window ? { search: latest, window } : null;
  };
  const fail = (error: SessionWindowError) => {
    const now = current();
    if (now) setState({ sessionSearch: { ...now.search, opening: null, openError: { messageId: hit.messageId, error } } });
  };
  try {
    const hitWindow = await getClaudeCodeSessionWindow(search.sourcePath, {
      beforeOffset: hit.recordEnd,
      sourceId,
      endAnchor: hit.recordAnchor,
    });
    if (!current()) return;
    // The window ends at the matched record, so its message is the window's
    // last event. That names the record exactly, even when an earlier record
    // carries the same id.
    const shown = hitWindow.events[hitWindow.events.length - 1];
    if (!shown || shown.id !== hit.messageId || !containsPhrase(shown.content, search.query, search.wholeWords)) {
      fail({ kind: "changed", message: "SOURCE_CHANGED: the matched message is no longer at its place." });
      return;
    }
    let newer = null;
    if (!hitWindow.reachedEnd) {
      try {
        newer = await getClaudeCodeSessionWindow(search.sourcePath, {
          afterOffset: hitWindow.endOffset,
          sourceId: hitWindow.sourceId,
          endAnchor: hitWindow.endAnchor,
        });
      } catch {
        // The match is shown; the newer history stays one "다음 대화 보기" away.
        newer = null;
      }
    }
    const now = current();
    if (!now) return;
    setState({
      sessionWindow: jumpedWindowState(now.window, hitWindow, newer, {
        messageId: hit.messageId,
        query: search.query,
        wholeWords: search.wholeWords,
        seq: sequence,
      }),
      sessionSearch: { ...now.search, opening: null, openError: null },
    });
  } catch (error) {
    fail(classifyWindowError(error));
  }
}

/**
 * One page of a session window, in one direction. Only one runs at a time.
 * The reply is applied only to the view it was asked for (same session, same
 * open, same held windows); a reply that does not continue that view means the
 * transcript changed, and says so instead of splicing.
 */
async function pageSessionWindow(direction: "earlier" | "newer" | "latest"): Promise<void> {
  const { getState, setState } = useSessionStore;
  const state = getState().sessionWindow;
  if (!isLoadedWindow(state) || state.paging) return;
  const cursor =
    direction === "earlier"
      ? state.startOffset > 0
        ? earlierCursor(state)
        : null
      : direction === "newer"
        ? newerCursor(state)
        : undefined;
  if (cursor === null) return;
  setState({ sessionWindow: { ...state, paging: direction, pageError: null } });
  const sameView = () => {
    const latest = getState().sessionWindow;
    return isLoadedWindow(latest) &&
      latest.sessionId === state.sessionId &&
      latest.openToken === state.openToken &&
      latest.spans === state.spans
      ? latest
      : null;
  };
  try {
    const window = await getClaudeCodeSessionWindow(state.sourcePath, cursor);
    const latest = sameView();
    if (!latest) return;
    const next =
      direction === "earlier"
        ? prependEarlierWindow(latest, window)
        : direction === "newer"
          ? cursor && "afterOffset" in cursor
            ? appendForwardWindow(latest, window)
            : appendNewerWindow(latest, window)
          : withArchive(windowStateFrom(state.sessionId, window, state.openToken), state.archive);
    if (next === latest) {
      const error = { kind: "changed" as const, message: "SOURCE_CHANGED: the page does not continue the view." };
      setState({ sessionWindow: { ...latest, paging: null, pageError: { direction, error } } });
      return;
    }
    setState({ sessionWindow: next });
  } catch (error) {
    const latest = sameView();
    if (!latest) return;
    setState({
      sessionWindow: { ...latest, paging: null, pageError: { direction, error: classifyWindowError(error) } },
    });
  }
}


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
 * "1 Claude conversation = 1 session" sessions. Works in both runtimes: the
 * repository reads through the app storage, which on desktop serves the
 * session drafts from SQLite once the read flip engaged (so a profile
 * restored from its storage folder lists its sessions) and localStorage
 * otherwise.
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

/**
 * The second half of a checked open: with the window that ends at the wanted
 * record in hand, read what follows it, make the session active the way an
 * ordinary click does, and show the window focused on that record.
 */
async function showWindowAtRecord({
  sessionId,
  sourcePath,
  hitWindow,
  token,
  current,
  focus,
  archive,
}: {
  sessionId: string;
  sourcePath: string;
  hitWindow: ClaudeCodeSessionWindow;
  token: number;
  current: () => boolean;
  focus: { messageId: string; query: string; wholeWords: boolean; range?: { from: number; to: number } };
  /** Set when the window reads Mori's kept copy instead of the original. */
  archive?: LoadedSessionWindow["archive"];
}): Promise<SourceHitOutcome> {
  const get = useSessionStore.getState;
  const set = useSessionStore.setState;
  let newer: ClaudeCodeSessionWindow | null = null;
  if (!hitWindow.reachedEnd) {
    try {
      newer = await getClaudeCodeSessionWindow(sourcePath, {
        afterOffset: hitWindow.endOffset,
        sourceId: hitWindow.sourceId,
        endAnchor: hitWindow.endAnchor,
      });
    } catch {
      newer = null;
    }
  }
  if (!current()) return "superseded";
  // The same open an ordinary click makes: the stored draft becomes the
  // active session (a descriptor-only session gets its draft back, as the
  // resolver's open does). No transcript is read into an import.
  if (!get().loadBrowserSession(sessionId)) {
    const meta = loadAutoImportMeta(sessionId);
    if (meta) getRepository().putStoredSessionDraft(agentSessionToStoredDraft(meta));
    if (!get().loadBrowserSession(sessionId)) return "missing";
  }
  const focusSeq = ++jumpSequence;
  set({
    sessionWindow: withArchive(
      jumpedWindowState(windowStateFrom(sessionId, hitWindow, token), hitWindow, newer, {
        ...focus,
        seq: focusSeq,
      }),
      archive,
    ),
    sessionSearch: null,
  });
  return "opened";
}

/**
 * Mirror the imports read back from SQLite into local storage without
 * restamping them. The SQLite read stamps every import "now"; kept as is, a
 * reopened session's imports looked freshly made to everything that reads
 * `savedAt` (the 가져오기 완료 notice, its 24h window). A load is not a new
 * import: keep the earlier local stamp, else the source's capture time.
 */
function mirrorDesktopImports(
  repository: ReturnType<typeof getRepository>,
  sessionId: string,
  loaded: readonly StoredSessionImport[],
): void {
  const earlier = new Map(repository.listSessionImports(sessionId).map((entry) => [entry.source.id, entry.savedAt]));
  repository.clearSessionImports(sessionId);
  const kept: StoredSessionImport[] = [];
  for (const entry of loaded) {
    const stored = repository.addSessionImport(sessionId, { source: entry.source, events: entry.events });
    const savedAt = earlier.get(entry.source.id) ?? (entry.source.capturedAt || stored.savedAt);
    if (savedAt !== stored.savedAt) kept.push({ ...stored, savedAt });
  }
  if (kept.length > 0) repository.putSessionImports(sessionId, kept);
}

/** Event ids a reopen must leave as they are, or null when accepted project
 *  memory could not be read from its own store (see `reopenCitations.ts`). */
async function citedEventIds(
  repository: ReturnType<typeof getRepository>,
  sessionId: string,
): Promise<Set<string> | null> {
  let accepted: StoredAcceptedProjectMemory[] | null;
  try {
    const result = await new AcceptedMemoryRepository({ repository }).listAllAcceptedProjectMemories();
    // A desktop save that fell back left its memory in app storage: count it too.
    accepted = result.fellBack ? null : [...result.data, ...repository.listAllAcceptedProjectMemories()];
  } catch {
    accepted = null;
  }
  return eventIdsCitedOutsideAdoptedRun(sessionId, accepted, repository.loadSessionAnalysisHistory(sessionId)?.history ?? null);
}

function withArchive<T extends LoadedSessionWindow>(state: T, archive: LoadedSessionWindow["archive"] | undefined): T {
  return archive ? { ...state, archive } : state;
}
