import type { Project, Session, SourceRef, TimelineEvent } from "../../domain/types";
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

export type MoriDraftRepository = {
  saveCurrentSessionDraft: (draft: Omit<StoredSessionDraft, "savedAt" | "adapter">) => StoredSessionDraft;
  loadCurrentSessionDraft: () => StoredSessionDraft | null;
  clearCurrentSessionDraft: () => void;
  listStoredSessions: () => StoredSessionSummary[];
  saveMoriPackageDraft: (pkg: MoriPackageV0) => StoredMoriPackageDraft;
  loadMoriPackageDraft: (packageId: string) => StoredMoriPackageDraft | null;
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
