import type { AnalysisResult, QuickPassAnalysisSettings } from "../analysis";
import {
  appendAnalysisRun,
  createAnalysisRunHistory,
  DEFAULT_QUICK_PASS_SETTINGS,
  getCurrentRun,
  sanitizeQuickPassSettings,
  selectAnalysisRun,
} from "../analysis";
import type { ConnectorSourceImportSummary } from "../connectors";
import type { NormalizedImportCandidate } from "../import";
import type { MoriPackageV0 } from "../mori-package";
import type { RepositorySettings } from "../repositories";
import { DEFAULT_REPOSITORY_SETTINGS, sanitizeRepositorySettings } from "../repositories";
import type { ImportReviewDraft, ReviewDraftMeta } from "../review";
import { deriveSessionSummaryMetrics } from "./sessionSummaryMetrics";
import { StorageQuotaError, isQuotaExceededError, notifyQuotaFailure } from "./storageQuota";
import type {
  ConnectorEventIdentitySnapshot,
  KeyValueStorage,
  DraftRepository,
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
  StoredMoriPackageDraft,
  StoredPendingReview,
  StoredSessionAnalysis,
  StoredSessionAnalysisHistory,
  StoredSessionDraft,
  StoredSessionImport,
  StoredSessionMemoryBody,
  StoredSessionSummary,
} from "./storageTypes";

const CURRENT_SESSION_KEY = "mori.currentSessionDraft";
const SESSION_PREFIX = "mori.sessionDraft.";
const PACKAGE_PREFIX = "mori.packageDraft.";
const IMPORTS_PREFIX = "mori.sessionImports.";
// One key per import entry (`mori.sessionImportEntry.<sessionId>.<importId>`),
// mirroring the accepted-memory pattern, so adding an import writes one entry
// instead of re-stringifying the session's whole imports array. The legacy
// array under `IMPORTS_PREFIX + sessionId` is still merged on read and
// migrated to entry keys on the next write.
const IMPORT_ENTRY_PREFIX = "mori.sessionImportEntry.";
const ANALYSIS_PREFIX = "mori.sessionAnalysis.";
const ANALYSIS_HISTORY_PREFIX = "mori.sessionAnalysisHistory.";
const MEMORY_PREFIX = "mori.sessionMemory.";
const PENDING_REVIEW_PREFIX = "mori.sessionPendingReview.";
const ACCEPTED_MEMORY_PREFIX = "mori.consolidatedMemory.";
const REVIEW_ACTION_PREFIX = "mori.consolidatedMemoryAudit.";
const QUICK_PASS_SETTINGS_KEY = "mori.quickPassSettings";
const REPOSITORY_SETTINGS_KEY = "mori.repositorySettings";

const MEMORY_BODY_SCHEMA_VERSION = 1 as const;
const PENDING_REVIEW_SCHEMA_VERSION = 1 as const;
const ANALYSIS_HISTORY_SCHEMA_VERSION = 1 as const;
const ACCEPTED_MEMORY_SCHEMA_VERSION = 1 as const;
const REVIEW_ACTION_SCHEMA_VERSION = 1 as const;

export class BrowserDraftRepository implements DraftRepository {
  constructor(private readonly storage: KeyValueStorage = window.localStorage) {}

  saveCurrentSessionDraft(draft: Omit<StoredSessionDraft, "savedAt" | "adapter">): StoredSessionDraft {
    const stored: StoredSessionDraft = {
      ...draft,
      savedAt: new Date().toISOString(),
      adapter: "browser-local-storage",
    };

    this.write(CURRENT_SESSION_KEY, stored);
    this.write(`${SESSION_PREFIX}${stored.session.id}`, stored);
    return stored;
  }

  loadCurrentSessionDraft(): StoredSessionDraft | null {
    return this.read<StoredSessionDraft>(CURRENT_SESSION_KEY);
  }

  setCurrentSession(sessionId: string): StoredSessionDraft | null {
    const stored = this.read<StoredSessionDraft>(`${SESSION_PREFIX}${sessionId}`);
    if (!stored) return null;
    // Write the stored draft verbatim — opening a saved session must
    // not restamp its `savedAt`, so this is deliberately not a call to
    // `saveCurrentSessionDraft`.
    this.write(CURRENT_SESSION_KEY, stored);
    return stored;
  }

  loadStoredSessionDraft(sessionId: string): StoredSessionDraft | null {
    return this.read<StoredSessionDraft>(`${SESSION_PREFIX}${sessionId}`);
  }

  saveStoredSessionMetadata(
    sessionId: string,
    draft: StoredSessionDraft,
  ): StoredSessionDraft | null {
    const existing = this.read<StoredSessionDraft>(`${SESSION_PREFIX}${sessionId}`);
    if (!existing) return null;
    // Preserve the original `savedAt`/`adapter` — a metadata edit (rename /
    // archive) is not a content save and must not restamp the timestamp.
    const next: StoredSessionDraft = {
      ...draft,
      savedAt: existing.savedAt,
      adapter: existing.adapter,
    };
    this.write(`${SESSION_PREFIX}${sessionId}`, next);
    // Mirror into the current-session key only when this session is current,
    // so editing a background session never repoints the active draft.
    const current = this.loadCurrentSessionDraft();
    if (current?.session.id === sessionId) {
      this.write(CURRENT_SESSION_KEY, next);
    }
    return next;
  }

  putStoredSessionDraft(draft: StoredSessionDraft): StoredSessionDraft {
    // Idempotent background upsert: writes ONLY the per-session record, never
    // the current-session pointer, so registering a discovered session in the
    // background never hijacks the open session. The caller-supplied `savedAt`
    // is preserved (not restamped) so re-registering an unchanged session does
    // not reorder the 과거 list. Dedupe is automatic — the key is the session id.
    this.write(`${SESSION_PREFIX}${draft.session.id}`, draft);
    return draft;
  }

  listStoredSessions(): StoredSessionSummary[] {
    return this.listStoredSessionDrafts(false);
  }

  listStoredSessionsWithMetrics(): StoredSessionSummary[] {
    return this.listStoredSessionDrafts(true);
  }

  private listStoredSessionDrafts(includeMetrics: boolean): StoredSessionSummary[] {
    const sessions: StoredSessionSummary[] = [];

    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(SESSION_PREFIX)) continue;
      const draft = this.read<StoredSessionDraft>(key);
      if (!draft) continue;

      const metrics = includeMetrics
        ? deriveSessionSummaryMetrics(this.listSessionImports(draft.session.id))
        : {};

      sessions.push({
        sessionId: draft.session.id,
        projectId: draft.project.id,
        title: draft.session.title,
        projectName: draft.project.name,
        savedAt: draft.savedAt,
        status: draft.session.status,
        startedAt: draft.session.startedAt ?? draft.savedAt,
        ...(draft.session.sourceLabel ? { sourceLabel: draft.session.sourceLabel } : {}),
        ...(draft.session.sourceRepository
          ? {
              sourceRepository: draft.session.sourceRepository,
              sourceRepositoryBasis: draft.session.sourceRepositoryBasis,
            }
          : {}),
        ...(draft.session.createdBy ? { createdBy: draft.session.createdBy } : {}),
        ...(draft.session.visibility ? { visibility: draft.session.visibility } : {}),
        ...(metrics.eventCount !== undefined ? { eventCount: metrics.eventCount } : {}),
        ...(metrics.tokenTotal !== undefined ? { tokenTotal: metrics.tokenTotal } : {}),
        ...(metrics.tokenInput !== undefined ? { tokenInput: metrics.tokenInput } : {}),
        ...(metrics.tokenOutput !== undefined ? { tokenOutput: metrics.tokenOutput } : {}),
      });
    }

    return sessions.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  }

  saveMoriPackageDraft(pkg: MoriPackageV0): StoredMoriPackageDraft {
    const stored: StoredMoriPackageDraft = {
      packageId: pkg.manifest.packageId,
      package: pkg,
      savedAt: new Date().toISOString(),
      adapter: "browser-local-storage",
    };

    this.write(`${PACKAGE_PREFIX}${pkg.manifest.packageId}`, stored);
    return stored;
  }

  loadMoriPackageDraft(packageId: string): StoredMoriPackageDraft | null {
    return this.read<StoredMoriPackageDraft>(`${PACKAGE_PREFIX}${packageId}`);
  }

  listMoriPackageDrafts(): StoredMoriPackageDraft[] {
    const packages: StoredMoriPackageDraft[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(PACKAGE_PREFIX)) continue;
      const entry = this.read<StoredMoriPackageDraft>(key);
      if (entry) packages.push(entry);
    }
    return packages.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  }

  clearStoredSession(sessionId: string): void {
    this.storage.removeItem(`${SESSION_PREFIX}${sessionId}`);
    this.clearSessionImports(sessionId);
    this.storage.removeItem(`${ANALYSIS_PREFIX}${sessionId}`);
    this.storage.removeItem(`${ANALYSIS_HISTORY_PREFIX}${sessionId}`);
    this.storage.removeItem(`${MEMORY_PREFIX}${sessionId}`);
    this.storage.removeItem(`${PENDING_REVIEW_PREFIX}${sessionId}`);
    const current = this.loadCurrentSessionDraft();
    if (current?.session.id === sessionId) {
      this.storage.removeItem(CURRENT_SESSION_KEY);
    }
  }

  clearCurrentSessionDraft(): void {
    this.storage.removeItem(CURRENT_SESSION_KEY);
  }

  clearAllLocalData(): void {
    // Configuration is setup, not captured work — dropping a user's Ollama
    // endpoint or registered repository paths on a data reset would be
    // surprising, so those keys are preserved.
    const preserved = new Set<string>([QUICK_PASS_SETTINGS_KEY, REPOSITORY_SETTINGS_KEY]);
    // Collect first, then remove — mutating storage while iterating by index
    // shifts later keys and would skip entries.
    const removable: string[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith("mori.")) continue;
      if (preserved.has(key)) continue;
      removable.push(key);
    }
    for (const key of removable) {
      this.storage.removeItem(key);
    }
  }

  addSessionImport(
    sessionId: string,
    candidate: NormalizedImportCandidate,
    options: { importSummary?: ConnectorSourceImportSummary } = {},
  ): StoredSessionImport {
    const savedAt = new Date().toISOString();
    const stored: StoredSessionImport = {
      id: candidate.source.id,
      sessionId,
      source: { ...candidate.source, sessionId },
      events: candidate.events.map((event) => ({ ...event, sessionId })),
      savedAt,
      adapter: "browser-local-storage",
      // Optional: only set when the caller actually computed a summary.
      // Old records without it continue to read as `undefined`, so any
      // reader that branches on `importSummary` keeps its existing
      // backwards-compatible behaviour.
      ...(options.importSummary ? { importSummary: options.importSummary } : {}),
    };

    // One write per add: the entry key is the dedupe (same import id
    // overwrites in place), so adding the Nth import no longer re-stringifies
    // the previous N-1.
    this.migrateLegacySessionImports(sessionId);
    this.write(this.importEntryKey(sessionId, stored.id), stored);
    return stored;
  }

  listSessionImports(sessionId: string): StoredSessionImport[] {
    // Merge the per-entry keys with any legacy array still on disk. Reading
    // stays non-mutating (migration happens on the next write); an entry key
    // wins over a legacy row with the same id because it is always newer.
    const byId = new Map<string, StoredSessionImport>();
    const legacy = this.read<StoredSessionImport[]>(`${IMPORTS_PREFIX}${sessionId}`);
    if (Array.isArray(legacy)) {
      for (const entry of legacy) {
        if (entry && typeof entry.id === "string") byId.set(entry.id, entry);
      }
    }
    const prefix = `${IMPORT_ENTRY_PREFIX}${sessionId}.`;
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const entry = this.read<StoredSessionImport>(key);
      if (!entry || entry.sessionId !== sessionId) continue;
      byId.set(entry.id, entry);
    }
    return [...byId.values()].sort(
      (a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime(),
    );
  }

  putSessionImports(
    sessionId: string,
    imports: StoredSessionImport[],
  ): StoredSessionImport[] {
    this.migrateLegacySessionImports(sessionId);
    for (const entry of imports) {
      const stored: StoredSessionImport = {
        ...entry,
        sessionId,
        adapter: "browser-local-storage",
      };
      this.write(this.importEntryKey(sessionId, stored.id), stored);
    }
    return this.listSessionImports(sessionId);
  }

  removeSessionImport(sessionId: string, importId: string): void {
    this.migrateLegacySessionImports(sessionId);
    this.storage.removeItem(this.importEntryKey(sessionId, importId));
  }

  clearSessionImports(sessionId: string): void {
    this.storage.removeItem(`${IMPORTS_PREFIX}${sessionId}`);
    const prefix = `${IMPORT_ENTRY_PREFIX}${sessionId}.`;
    // Collect first, then remove: mutating while iterating by index skips keys.
    const removable: string[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (key?.startsWith(prefix)) removable.push(key);
    }
    for (const key of removable) {
      this.storage.removeItem(key);
    }
  }

  private importEntryKey(sessionId: string, importId: string): string {
    return `${IMPORT_ENTRY_PREFIX}${sessionId}.${importId}`;
  }

  /**
   * One-time move of a session's legacy imports array onto per-entry keys.
   * Runs at the top of every write path; a no-op once the legacy key is gone.
   * An existing entry key is not overwritten (it is always newer than the
   * legacy row). If a write fails mid-way (quota), the legacy key is kept so
   * the merged read still sees every entry: no data loss, retried next write.
   */
  private migrateLegacySessionImports(sessionId: string): void {
    const legacyKey = `${IMPORTS_PREFIX}${sessionId}`;
    const legacy = this.read<StoredSessionImport[]>(legacyKey);
    if (!Array.isArray(legacy)) return;
    for (const entry of legacy) {
      if (!entry || typeof entry.id !== "string") continue;
      const key = this.importEntryKey(sessionId, entry.id);
      if (this.storage.getItem(key) !== null) continue;
      this.write(key, entry);
    }
    this.storage.removeItem(legacyKey);
  }

  saveSessionAnalysis(sessionId: string, result: AnalysisResult): StoredSessionAnalysis {
    const savedAt = new Date().toISOString();
    const stored: StoredSessionAnalysis = {
      sessionId,
      result,
      savedAt,
      adapter: "browser-local-storage",
    };
    this.write(`${ANALYSIS_PREFIX}${sessionId}`, stored);
    // Maintain the append-only run history alongside the single mirror.
    // A re-analysis (new runId) appends; an in-place review edit (same
    // runId) updates that run, so routine edits do not inflate history.
    const existing = this.readAnalysisHistory(sessionId);
    const history = existing
      ? appendAnalysisRun(existing.history, result)
      : createAnalysisRunHistory(result);
    this.writeAnalysisHistory(sessionId, history, savedAt);
    return stored;
  }

  loadSessionAnalysis(sessionId: string): StoredSessionAnalysis | null {
    return this.read<StoredSessionAnalysis>(`${ANALYSIS_PREFIX}${sessionId}`);
  }

  clearSessionAnalysis(sessionId: string): void {
    this.storage.removeItem(`${ANALYSIS_PREFIX}${sessionId}`);
    this.storage.removeItem(`${ANALYSIS_HISTORY_PREFIX}${sessionId}`);
  }

  loadSessionAnalysisHistory(sessionId: string): StoredSessionAnalysisHistory | null {
    const existing = this.readAnalysisHistory(sessionId);
    if (existing) return existing;
    // Forward migration: synthesise a one-run history from the legacy
    // single analysis record so sessions analysed before this milestone
    // still expose a run history. Not written back here — the next
    // saveSessionAnalysis persists it.
    const legacy = this.loadSessionAnalysis(sessionId);
    if (!legacy) return null;
    return {
      sessionId,
      savedAt: legacy.savedAt,
      adapter: "browser-local-storage",
      schemaVersion: ANALYSIS_HISTORY_SCHEMA_VERSION,
      history: createAnalysisRunHistory(legacy.result),
    };
  }

  selectSessionAnalysisRun(
    sessionId: string,
    runId: string,
  ): StoredSessionAnalysisHistory | null {
    const current = this.loadSessionAnalysisHistory(sessionId);
    if (!current) return null;
    const history = selectAnalysisRun(current.history, runId);
    const savedAt = new Date().toISOString();
    const next = this.writeAnalysisHistory(sessionId, history, savedAt);
    // Keep the single analysis mirror in sync with the adopted run so
    // existing readers reflect the selection.
    const adopted = getCurrentRun(history);
    if (adopted) {
      this.write(`${ANALYSIS_PREFIX}${sessionId}`, {
        sessionId,
        result: adopted,
        savedAt,
        adapter: "browser-local-storage",
      } satisfies StoredSessionAnalysis);
    }
    return next;
  }

  private readAnalysisHistory(sessionId: string): StoredSessionAnalysisHistory | null {
    const raw = this.read<StoredSessionAnalysisHistory>(`${ANALYSIS_HISTORY_PREFIX}${sessionId}`);
    if (!raw) return null;
    // Defensive: refuse an unknown schema version or a malformed shape so
    // a hand-edited value cannot strand the run pointer.
    if (raw.schemaVersion !== ANALYSIS_HISTORY_SCHEMA_VERSION) return null;
    if (!raw.history || !Array.isArray(raw.history.runs)) return null;
    return raw;
  }

  private writeAnalysisHistory(
    sessionId: string,
    history: StoredSessionAnalysisHistory["history"],
    savedAt: string,
  ): StoredSessionAnalysisHistory {
    const record: StoredSessionAnalysisHistory = {
      sessionId,
      savedAt,
      adapter: "browser-local-storage",
      schemaVersion: ANALYSIS_HISTORY_SCHEMA_VERSION,
      history,
    };
    this.write(`${ANALYSIS_HISTORY_PREFIX}${sessionId}`, record);
    return record;
  }

  saveSessionMemoryBody(
    sessionId: string,
    body: Omit<StoredSessionMemoryBody, "sessionId" | "savedAt" | "adapter" | "schemaVersion">,
  ): StoredSessionMemoryBody {
    const stored: StoredSessionMemoryBody = {
      sessionId,
      savedAt: new Date().toISOString(),
      adapter: "browser-local-storage",
      schemaVersion: MEMORY_BODY_SCHEMA_VERSION,
      issues: body.issues,
      decisions: body.decisions,
      nextActions: body.nextActions,
      ...(body.summarySnapshot ? { summarySnapshot: body.summarySnapshot } : {}),
    };
    this.write(`${MEMORY_PREFIX}${sessionId}`, stored);
    return stored;
  }

  loadSessionMemoryBody(sessionId: string): StoredSessionMemoryBody | null {
    const raw = this.read<StoredSessionMemoryBody>(`${MEMORY_PREFIX}${sessionId}`);
    if (!raw) return null;
    // Defensive: refuse to surface an unknown schema version. Callers
    // see `null` and fall back to metadata/analysis paths instead of
    // consuming a record they cannot interpret.
    if (raw.schemaVersion !== MEMORY_BODY_SCHEMA_VERSION) return null;
    // Validate the minimal shape so a hand-edited storage value cannot
    // crash the loader.
    if (
      !Array.isArray(raw.issues) ||
      !Array.isArray(raw.decisions) ||
      !Array.isArray(raw.nextActions)
    ) {
      return null;
    }
    return raw;
  }

  clearSessionMemoryBody(sessionId: string): void {
    this.storage.removeItem(`${MEMORY_PREFIX}${sessionId}`);
  }

  // ─── Pending Import Review Persistence ───────────────────────────────

  savePendingReview(
    sessionId: string,
    draft: ImportReviewDraft,
    meta?: ReviewDraftMeta,
  ): StoredPendingReview {
    const stored: StoredPendingReview = {
      id: draft.id,
      sessionId,
      draft,
      savedAt: new Date().toISOString(),
      adapter: "browser-local-storage",
      schemaVersion: PENDING_REVIEW_SCHEMA_VERSION,
      ...(meta ? { meta } : {}),
    };
    this.write(`${PENDING_REVIEW_PREFIX}${sessionId}`, stored);
    return stored;
  }

  loadPendingReview(sessionId: string): StoredPendingReview | null {
    const raw = this.read<StoredPendingReview>(`${PENDING_REVIEW_PREFIX}${sessionId}`);
    if (!raw) return null;
    // Refuse an unknown schema version so callers fall back to "no pending
    // review" instead of consuming a record they cannot interpret.
    if (raw.schemaVersion !== PENDING_REVIEW_SCHEMA_VERSION) return null;
    // Validate the minimal shape so a hand-edited storage value cannot crash
    // the loader.
    if (!raw.draft || !Array.isArray(raw.draft.events)) return null;
    return raw;
  }

  clearPendingReview(sessionId: string): void {
    this.storage.removeItem(`${PENDING_REVIEW_PREFIX}${sessionId}`);
  }

  // ─── Accepted Memory Persistence ─────────────────────────────────────

  saveAcceptedProjectMemory(memory: StoredAcceptedProjectMemory): StoredAcceptedProjectMemory {
    const normalized: StoredAcceptedProjectMemory = {
      ...memory,
      schemaVersion: ACCEPTED_MEMORY_SCHEMA_VERSION,
      adapter: "browser-local-storage",
    };
    const key = `${ACCEPTED_MEMORY_PREFIX}${normalized.projectId}.${normalized.id}`;
    this.write(key, normalized);
    return normalized;
  }

  saveAcceptedProjectMemories(memories: StoredAcceptedProjectMemory[]): StoredAcceptedProjectMemory[] {
    return memories.map((memory) => this.saveAcceptedProjectMemory(memory));
  }

  listAcceptedProjectMemories(projectId: string): StoredAcceptedProjectMemory[] {
    const out: StoredAcceptedProjectMemory[] = [];
    const prefix = `${ACCEPTED_MEMORY_PREFIX}${projectId}.`;
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const record = this.read<StoredAcceptedProjectMemory>(key);
      if (!record) continue;
      if (record.schemaVersion !== ACCEPTED_MEMORY_SCHEMA_VERSION) continue;
      if (record.projectId !== projectId) continue;
      out.push(record);
    }
    return out.sort((a, b) => new Date(b.acceptedAt).getTime() - new Date(a.acceptedAt).getTime());
  }

  listAllAcceptedProjectMemories(): StoredAcceptedProjectMemory[] {
    // Cross-project read: scan the whole accepted-memory prefix. Powers
    // global recall (memory search, the 메모리 surface); per-project reads
    // stay on listAcceptedProjectMemories.
    const out: StoredAcceptedProjectMemory[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(ACCEPTED_MEMORY_PREFIX)) continue;
      const record = this.read<StoredAcceptedProjectMemory>(key);
      if (!record) continue;
      if (record.schemaVersion !== ACCEPTED_MEMORY_SCHEMA_VERSION) continue;
      out.push(record);
    }
    return out.sort((a, b) => new Date(b.acceptedAt).getTime() - new Date(a.acceptedAt).getTime());
  }

  getAcceptedProjectMemory(memoryId: string): StoredAcceptedProjectMemory | null {
    // Without a projectId we have to scan; accepted memory ids are
    // intentionally globally unique so this is safe even at scale.
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(ACCEPTED_MEMORY_PREFIX)) continue;
      if (!key.endsWith(`.${memoryId}`)) continue;
      const record = this.read<StoredAcceptedProjectMemory>(key);
      if (!record) continue;
      if (record.schemaVersion !== ACCEPTED_MEMORY_SCHEMA_VERSION) continue;
      if (record.id !== memoryId) continue;
      return record;
    }
    return null;
  }

  appendMemoryReviewAction(action: StoredMemoryReviewAction): StoredMemoryReviewAction {
    const normalized: StoredMemoryReviewAction = {
      ...action,
      schemaVersion: REVIEW_ACTION_SCHEMA_VERSION,
      adapter: "browser-local-storage",
    };
    const key = `${REVIEW_ACTION_PREFIX}${normalized.projectId}.${normalized.id}`;
    this.write(key, normalized);
    return normalized;
  }

  listMemoryReviewActions(projectId: string): StoredMemoryReviewAction[] {
    const out: StoredMemoryReviewAction[] = [];
    const prefix = `${REVIEW_ACTION_PREFIX}${projectId}.`;
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const record = this.read<StoredMemoryReviewAction>(key);
      if (!record) continue;
      if (record.schemaVersion !== REVIEW_ACTION_SCHEMA_VERSION) continue;
      if (record.projectId !== projectId) continue;
      out.push(record);
    }
    return out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  saveQuickPassSettings(settings: QuickPassAnalysisSettings): QuickPassAnalysisSettings {
    const sanitized = sanitizeQuickPassSettings(settings);
    this.write(QUICK_PASS_SETTINGS_KEY, sanitized);
    return sanitized;
  }

  loadQuickPassSettings(): QuickPassAnalysisSettings {
    const raw = this.read<unknown>(QUICK_PASS_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_QUICK_PASS_SETTINGS };
    return sanitizeQuickPassSettings(raw);
  }

  saveRepositorySettings(settings: RepositorySettings): RepositorySettings {
    const sanitized = sanitizeRepositorySettings(settings);
    this.write(REPOSITORY_SETTINGS_KEY, sanitized);
    return sanitized;
  }

  loadRepositorySettings(): RepositorySettings {
    const raw = this.read<unknown>(REPOSITORY_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_REPOSITORY_SETTINGS };
    return sanitizeRepositorySettings(raw);
  }

  listConnectorEventIdentitySnapshots(
    options: { excludeSessionId?: string | null } = {},
  ): ConnectorEventIdentitySnapshot[] {
    const excluded = options.excludeSessionId ?? null;
    const snapshots: ConnectorEventIdentitySnapshot[] = [];
    const sessions = this.listStoredSessions();

    for (const summary of sessions) {
      if (excluded && summary.sessionId === excluded) continue;
      const imports = this.listSessionImports(summary.sessionId);
      const identities: string[] = [];
      for (const entry of imports) {
        for (const event of entry.events) {
          if (event.connectorEventId) identities.push(event.connectorEventId);
        }
      }
      snapshots.push({
        sessionId: summary.sessionId,
        title: summary.title,
        savedAt: summary.savedAt,
        connectorEventIds: identities,
      });
    }
    return snapshots;
  }

  private write(key: string, value: unknown): void {
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      if (isQuotaExceededError(error)) {
        // Surface the failure to the app-level health observer first, then
        // rethrow typed: a failed save must never look like a successful one.
        notifyQuotaFailure({ key, at: new Date().toISOString() });
        throw new StorageQuotaError(key, { cause: error });
      }
      throw error;
    }
  }

  private read<T>(key: string): T | null {
    const raw = this.storage.getItem(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}

export function createBrowserDraftRepository(storage?: KeyValueStorage): BrowserDraftRepository {
  if (storage) return new BrowserDraftRepository(storage);
  return new BrowserDraftRepository(window.localStorage);
}
