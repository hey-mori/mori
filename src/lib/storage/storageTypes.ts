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
};

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key"> & {
  readonly length: number;
};
