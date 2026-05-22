import type {
  Decision,
  Issue,
  NextAction,
  Project,
  Session,
  SourceRef,
  TimelineEvent,
} from "../../domain/types";
import type { MoriAnalysisResult, QuickPassAnalysisSettings } from "../analysis";
import type { ConnectorSourceImportSummary } from "../connectors";
import type { NormalizedImportCandidate } from "../import";
import type { MoriPackageV0 } from "../mori-package";
import type { RepositorySettings } from "../repositories";

export type StoredSessionDraft = {
  project: Project;
  session: Session;
  savedAt: string;
  adapter: "browser-local-storage";
};

export type StoredMoriPackageDraft = {
  packageId: string;
  package: MoriPackageV0;
  savedAt: string;
  adapter: "browser-local-storage";
};

export type StoredSessionSummary = {
  sessionId: string;
  projectId: string;
  title: string;
  projectName: string;
  savedAt: string;
  status: Session["status"];
  /**
   * Session window start (ISO). Surfaced so the sidebar session switcher can
   * show a relative time without loading the full draft. Optional — callers
   * fall back to `savedAt` for older records / fixtures that omit it.
   */
  startedAt?: string;
  /**
   * Optional grouping label (e.g. Claude project path) — drives the
   * sidebar switcher's group headers. Undefined for manual sessions.
   */
  sourceLabel?: string;
  /**
   * ISO timestamp the session was archived, when set. Lets the Workspace
   * sessions browser hide archived sessions from its default list (and
   * surface them under an archive filter) without loading the full draft.
   * Undefined for active / never-archived sessions.
   */
  archivedAt?: string;
};

export type StoredSessionImport = {
  id: string;
  sessionId: string;
  source: SourceRef;
  events: TimelineEvent[];
  savedAt: string;
  adapter: "browser-local-storage";
  /**
   * Source-level connector re-import summary captured at the moment the
   * import was applied. OPTIONAL — old records persisted before this
   * milestone do not carry the field and continue to load normally. The
   * payload is small and derived (no raw JSONL, no full event payload
   * beyond what `StoredSessionImport.events` already holds).
   */
  importSummary?: ConnectorSourceImportSummary;
};

/**
 * Lightweight per-session record used by cross-session connector duplicate
 * detection. Only the identity-bearing fields are loaded — we never
 * resurface full TimelineEvent payloads here, so reading the history is
 * cheap even with many saved sessions.
 */
export type ConnectorEventIdentitySnapshot = {
  sessionId: string;
  title?: string;
  savedAt?: string;
  /** Identities (`connectorId::session::id`) the saved session has imported. */
  connectorEventIds: string[];
};

export type StoredSessionAnalysis = {
  sessionId: string;
  result: MoriAnalysisResult;
  savedAt: string;
  adapter: "browser-local-storage";
};

/**
 * Durable browser snapshot of a session's *memory body* — the parts of
 * the session view that Project Memory aggregates across saved
 * sessions: issues, decisions, next-actions, plus a tiny summary
 * snapshot. The shape is intentionally compact:
 *
 *   - Events and sources are NOT duplicated here; they already live in
 *     `StoredSessionImport[]` for the session and would double the
 *     storage cost for no aggregation benefit.
 *   - Raw connector JSONL is NOT stored here — only the normalized
 *     domain types Quick Pass / Review surfaces produced.
 *   - Optional summary snapshot lets the follow-up prompt builder
 *     keep working after a session is closed, without forcing callers
 *     to also load `StoredSessionAnalysis`.
 *
 * `schemaVersion` is a forward-compat hook. The loader rejects unknown
 * majors so a future schema bump doesn't silently corrupt aggregation.
 */
export type StoredSessionMemoryBody = {
  sessionId: string;
  savedAt: string;
  adapter: "browser-local-storage";
  /** Bumped when the on-disk shape changes incompatibly. Loader rejects unknown majors. */
  schemaVersion: 1;
  issues: Issue[];
  decisions: Decision[];
  nextActions: NextAction[];
  /** Tiny session-summary slice (optional — old records have it undefined). */
  summarySnapshot?: {
    sessionSummary: string;
    resumePrompt: string;
    generatedAt: string;
  };
};

export type MoriDraftRepository = {
  saveCurrentSessionDraft: (draft: Omit<StoredSessionDraft, "savedAt" | "adapter">) => StoredSessionDraft;
  loadCurrentSessionDraft: () => StoredSessionDraft | null;
  clearCurrentSessionDraft: () => void;
  /**
   * Promote an already-stored session draft (by id) to the current
   * session. Unlike `saveCurrentSessionDraft`, this does not restamp
   * `savedAt` — opening a saved session is not a save. Returns `null`
   * when no draft is stored for the id.
   */
  setCurrentSession: (sessionId: string) => StoredSessionDraft | null;
  /**
   * Read a stored session draft by id WITHOUT changing which session is
   * current. Lets a background session be inspected / edited (rename,
   * archive) without activating it. Returns `null` when no draft is stored
   * for the id.
   */
  loadStoredSessionDraft: (sessionId: string) => StoredSessionDraft | null;
  /**
   * Persist a metadata-only edit (rename / archive / unarchive) to an
   * already-stored session draft, identified by id. Unlike
   * `saveCurrentSessionDraft`, this does NOT restamp `savedAt` — a rename or
   * archive is not a content save — and it does NOT change which session is
   * current. The per-session record is rewritten, and the current-session
   * mirror is updated only when the edited session is already the current
   * one. Returns the stored draft, or `null` when no draft is stored for the
   * id. The `session.id` must match `sessionId`.
   */
  saveStoredSessionMetadata: (
    sessionId: string,
    draft: StoredSessionDraft,
  ) => StoredSessionDraft | null;
  listStoredSessions: () => StoredSessionSummary[];
  saveMoriPackageDraft: (pkg: MoriPackageV0) => StoredMoriPackageDraft;
  loadMoriPackageDraft: (packageId: string) => StoredMoriPackageDraft | null;
  /**
   * List every `.mori v0` package draft currently persisted in this
   * adapter. Used by Project Memory to show the cross-session saved-
   * reports rollup. Returns an empty array when the adapter has no
   * packages or when the underlying storage cannot enumerate keys.
   */
  listMoriPackageDrafts: () => StoredMoriPackageDraft[];
  clearStoredSession: (sessionId: string) => void;
  addSessionImport: (
    sessionId: string,
    candidate: NormalizedImportCandidate,
    options?: { importSummary?: ConnectorSourceImportSummary },
  ) => StoredSessionImport;
  listSessionImports: (sessionId: string) => StoredSessionImport[];
  /**
   * Upsert pre-built `StoredSessionImport` records faithfully (by id),
   * preserving their `savedAt` and `importSummary`. Unlike
   * `addSessionImport`, which derives a fresh record from a candidate,
   * this is the round-trip write used by the runtime-aware
   * `SessionImportRepository` to mirror desktop SQLite rows.
   */
  putSessionImports: (
    sessionId: string,
    imports: StoredSessionImport[],
  ) => StoredSessionImport[];
  removeSessionImport: (sessionId: string, importId: string) => void;
  clearSessionImports: (sessionId: string) => void;
  saveSessionAnalysis: (sessionId: string, result: MoriAnalysisResult) => StoredSessionAnalysis;
  loadSessionAnalysis: (sessionId: string) => StoredSessionAnalysis | null;
  clearSessionAnalysis: (sessionId: string) => void;
  /**
   * Persist a session's durable memory body (issues / decisions /
   * next-actions / optional summary snapshot). Designed to be called
   * from sessionStore at every point where these fields can change:
   *   - after Quick Pass analysis succeeds,
   *   - on hydrate if a saved analysis exists but no body is on disk
   *     (forward migration for pre-milestone records),
   *   - on demand from any future Review-edit surface.
   *
   * The shape is compact — no events, no sources, no raw connector
   * JSONL. Reading old records (without `schemaVersion === 1`)
   * returns `null` so callers cannot accidentally consume an unknown
   * shape.
   */
  saveSessionMemoryBody: (
    sessionId: string,
    body: Omit<StoredSessionMemoryBody, "sessionId" | "savedAt" | "adapter" | "schemaVersion">,
  ) => StoredSessionMemoryBody;
  loadSessionMemoryBody: (sessionId: string) => StoredSessionMemoryBody | null;
  clearSessionMemoryBody: (sessionId: string) => void;
  saveQuickPassSettings: (settings: QuickPassAnalysisSettings) => QuickPassAnalysisSettings;
  loadQuickPassSettings: () => QuickPassAnalysisSettings;
  saveRepositorySettings: (settings: RepositorySettings) => RepositorySettings;
  loadRepositorySettings: () => RepositorySettings;
  /**
   * Walk every locally-persisted session draft and return the set of
   * connector identities each one has already imported. Sessions without
   * any connector-imported events return an empty `connectorEventIds`
   * array — callers can filter them out when surfacing "Saved-session
   * history" counts. Pass `excludeSessionId` to skip the active session
   * so cross-session detection doesn't double-count its own imports.
   */
  listConnectorEventIdentitySnapshots: (options?: {
    excludeSessionId?: string | null;
  }) => ConnectorEventIdentitySnapshot[];

  // ─── Accepted Memory Persistence ──────────────────────────────────
  /**
   * Persist a single accepted Project Memory record. Returns the
   * stored shape (with timestamps the adapter assigned). Replaces an
   * existing record with the same id.
   */
  saveAcceptedProjectMemory: (memory: StoredAcceptedProjectMemory) => StoredAcceptedProjectMemory;
  /**
   * Bulk-save during an apply pass. Returns the stored records in
   * input order. Caller decides id generation; the adapter does not
   * dedupe across calls.
   */
  saveAcceptedProjectMemories: (memories: StoredAcceptedProjectMemory[]) => StoredAcceptedProjectMemory[];
  /** Read every accepted memory for a project, most-recent first. */
  listAcceptedProjectMemories: (projectId: string) => StoredAcceptedProjectMemory[];
  /** Lookup by id; returns `null` when missing or schema-mismatched. */
  getAcceptedProjectMemory: (memoryId: string) => StoredAcceptedProjectMemory | null;
  /**
   * Append a review action to the project-scoped audit log. The log
   * is append-only — there is no delete. Callers may record a
   * `retire` action instead of physically removing rows.
   */
  appendMemoryReviewAction: (action: StoredMemoryReviewAction) => StoredMemoryReviewAction;
  /** Read every review action for a project, most-recent first. */
  listMemoryReviewActions: (projectId: string) => StoredMemoryReviewAction[];
};

/**
 * Durable status of an accepted Project Memory record — the explicit
 * lifecycle of an accepted memory.
 *
 * `accepted` and `edited` carry guidance weight; `watching` and
 * `deferred` are durable but advisory (Resume Prompt and Reports
 * filter them out unless the user opts in).
 *
 * `stale` and `contradicted` are review outcomes: accepting a
 * `staleMemory` proposal transitions the referenced memory to
 * `stale`; accepting a `contradiction` proposal transitions every
 * conflicting decision to `contradicted`. Both are excluded from
 * current guidance in Resume Prompt / Reports but stay visible in
 * Project Memory as honest non-current memory — they are not deleted.
 *
 * `superseded` and `retired` are reserved on the union — they appear
 * when a future review action transitions a record without deleting
 * it.
 */
export type StoredAcceptedProjectMemoryStatus =
  | "accepted"
  | "edited"
  | "watching"
  | "deferred"
  | "stale"
  | "contradicted"
  | "superseded"
  | "retired";

export type StoredAcceptedProjectMemorySensitivity =
  | "normal"
  | "sensitive"
  | "clientSafeExcluded";

export type StoredAcceptedProjectMemoryReportEligibility =
  | "personal"
  | "team"
  | "clientSafe"
  | "excluded";

/**
 * Storage adapter a durable memory / audit record came from. Browser
 * localStorage is the default; desktop SQLite records carry
 * `desktop-sqlite` so a consumer can tell the two apart after a load.
 */
export type StoredMemoryAdapter = "browser-local-storage" | "desktop-sqlite";

/**
 * Mirror of `MemoryEvidenceRef` from
 * `src/lib/project-memory/consolidationProposals.ts`. Inlined here
 * so this type module has no upward dependency on the project-memory
 * module — the storage layer must stay stable across refactors.
 */
export type StoredMemoryEvidenceRef =
  | { kind: "session"; sessionId: string; sessionTitle?: string }
  | { kind: "event"; sessionId: string; eventId: string }
  | { kind: "source"; sessionId: string; sourceId: string };

/**
 * Confidence label carried on every accepted record. We persist the
 * qualitative label plus the numeric score the helper produced; the
 * rationale string is optional today (Resume Prompt's qualitative
 * labels arrive later).
 */
export type StoredAcceptedProjectMemoryConfidence = {
  label: "high" | "medium" | "low";
  score?: number;
  rationale?: string;
};

/**
 * Durable accepted Project Memory record. Designed for browser
 * localStorage today (keyed at
 * `mori.consolidatedMemory.<projectId>.<memoryId>`); the same shape
 * will land in desktop SQLite when the SQLite Accepted Memory
 * Storage capability ships.
 *
 * What this record never carries: raw connector JSONL, full
 * transcript text, file paths beyond what the underlying `SourceRef`
 * already retained, secret-shaped strings.
 */
export type StoredAcceptedProjectMemory = {
  id: string;
  projectId: string;
  kind:
    | "promotedDecision"
    | "recurringIssue"
    | "keyEvidence"
    | "unresolvedRisk"
    | "contradiction"
    | "staleMemory"
    | "nextSessionRecommendation";
  title: string;
  summary: string;
  status: StoredAcceptedProjectMemoryStatus;
  importance: "high" | "medium" | "low";
  confidence: StoredAcceptedProjectMemoryConfidence;
  evidenceRefs: StoredMemoryEvidenceRef[];
  sourceSessionIds: string[];
  /** Proposal id(s) that produced this record. */
  originProposalIds: string[];
  relatedIssueIds: string[];
  relatedDecisionIds: string[];
  /** Action the user accepted (`promote`, `keepWatching`, etc.). */
  proposedAction:
    | "promote"
    | "merge"
    | "markStale"
    | "keepWatching"
    | "resolve"
    | "scheduleNextSession";
  /** Free-text reviewer note from the review surface. */
  reviewNote?: string;
  sensitivity: StoredAcceptedProjectMemorySensitivity;
  /** Whether Resume Prompt may include this record as guidance. */
  resumeEligible: boolean;
  reportEligibility: StoredAcceptedProjectMemoryReportEligibility;
  createdAt: string;
  updatedAt: string;
  /** When the user clicked Apply. */
  acceptedAt: string;
  /** Single-user product today. Reserved for future actor handling. */
  acceptedBy: "local-user";
  /** Pointer to a newer record when this one was superseded. */
  supersededBy?: string;
  /** Audit log ids that touched this memory (apply / edit / retire / …). */
  reviewActionIds: string[];
  schemaVersion: 1;
  /** Storage adapter the record came from. */
  adapter: StoredMemoryAdapter;
};

/**
 * Append-only audit row recorded against the Consolidation Review
 * Surface and any later edit action. The current milestone writes
 * one row per accept / edit / discard / watch / defer / apply
 * during a single Apply pass; future capabilities (Memory Audit
 * Trail UI, supersession, retirement) extend the same shape.
 */
export type StoredMemoryReviewAction = {
  id: string;
  projectId: string;
  actionType:
    | "accept"
    | "edit"
    | "discard"
    | "watch"
    | "defer"
    | "apply"
    | "reset"
    | "revert";
  /** Single-user product today. */
  actor: "local-user";
  timestamp: string;
  /** Proposal that produced the action, when applicable. */
  sourceProposalId?: string;
  /** Accepted-memory ids affected by the action. */
  targetMemoryIds: string[];
  /** Compact before/after snapshot. Free-form structure today. */
  before?: unknown;
  after?: unknown;
  note?: string;
  /** Does this action support one-click undo (reserved for future). */
  reversible: boolean;
  schemaVersion: 1;
  adapter: StoredMemoryAdapter;
};

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key"> & {
  readonly length: number;
};
