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
import { deriveSessionSummaryMetrics } from "./sessionSummaryMetrics";
import type {
  ConnectorEventIdentitySnapshot,
  KeyValueStorage,
  DraftRepository,
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
  StoredMoriPackageDraft,
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
const ANALYSIS_PREFIX = "mori.sessionAnalysis.";
const ANALYSIS_HISTORY_PREFIX = "mori.sessionAnalysisHistory.";
const MEMORY_PREFIX = "mori.sessionMemory.";
const ACCEPTED_MEMORY_PREFIX = "mori.consolidatedMemory.";
const REVIEW_ACTION_PREFIX = "mori.consolidatedMemoryAudit.";
const QUICK_PASS_SETTINGS_KEY = "mori.quickPassSettings";
const REPOSITORY_SETTINGS_KEY = "mori.repositorySettings";

const MEMORY_BODY_SCHEMA_VERSION = 1 as const;
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

  listStoredSessions(): StoredSessionSummary[] {
    const sessions: StoredSessionSummary[] = [];

    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(SESSION_PREFIX)) continue;
      const draft = this.read<StoredSessionDraft>(key);
      if (!draft) continue;

      // Derive event/token metrics once from the session's persisted imports.
      // Token usage lives only on imported events, so this is the cheapest
      // honest source — sessions with no usage simply omit the token fields.
      const metrics = deriveSessionSummaryMetrics(this.listSessionImports(draft.session.id));

      sessions.push({
        sessionId: draft.session.id,
        projectId: draft.project.id,
        title: draft.session.title,
        projectName: draft.project.name,
        savedAt: draft.savedAt,
        status: draft.session.status,
        startedAt: draft.session.startedAt ?? draft.savedAt,
        ...(draft.session.sourceLabel ? { sourceLabel: draft.session.sourceLabel } : {}),
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
    this.storage.removeItem(`${IMPORTS_PREFIX}${sessionId}`);
    this.storage.removeItem(`${ANALYSIS_PREFIX}${sessionId}`);
    this.storage.removeItem(`${ANALYSIS_HISTORY_PREFIX}${sessionId}`);
    this.storage.removeItem(`${MEMORY_PREFIX}${sessionId}`);
    const current = this.loadCurrentSessionDraft();
    if (current?.session.id === sessionId) {
      this.storage.removeItem(CURRENT_SESSION_KEY);
    }
  }

  clearCurrentSessionDraft(): void {
    const current = this.loadCurrentSessionDraft();
    this.storage.removeItem(CURRENT_SESSION_KEY);
    if (current) {
      this.storage.removeItem(`${SESSION_PREFIX}${current.session.id}`);
      this.storage.removeItem(`${IMPORTS_PREFIX}${current.session.id}`);
      this.storage.removeItem(`${ANALYSIS_PREFIX}${current.session.id}`);
      this.storage.removeItem(`${ANALYSIS_HISTORY_PREFIX}${current.session.id}`);
      this.storage.removeItem(`${MEMORY_PREFIX}${current.session.id}`);
    }
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
    const existing = this.listSessionImports(sessionId);
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

    const deduped = existing.filter((entry) => entry.id !== stored.id);
    deduped.push(stored);
    // TODO(perf): this re-reads and re-stringifies the session's full imports
    // array on every add. It is bounded to one session's imports (keyed by
    // IMPORTS_PREFIX + sessionId), not the global set, so the cost stays small
    // in practice. Eliminating the full re-stringify would require a schema
    // change — e.g. one localStorage key per import entry, or an append-only
    // log — which is higher risk and would ripple through listSessionImports,
    // putSessionImports, and removeSessionImport. Left as-is intentionally.
    this.write(`${IMPORTS_PREFIX}${sessionId}`, deduped);
    return stored;
  }

  listSessionImports(sessionId: string): StoredSessionImport[] {
    const raw = this.read<StoredSessionImport[]>(`${IMPORTS_PREFIX}${sessionId}`);
    if (!Array.isArray(raw)) return [];
    return raw.sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime());
  }

  putSessionImports(
    sessionId: string,
    imports: StoredSessionImport[],
  ): StoredSessionImport[] {
    const existing = this.listSessionImports(sessionId);
    const incomingIds = new Set(imports.map((entry) => entry.id));
    const merged = existing.filter((entry) => !incomingIds.has(entry.id));
    for (const entry of imports) {
      merged.push({ ...entry, sessionId, adapter: "browser-local-storage" });
    }
    this.write(`${IMPORTS_PREFIX}${sessionId}`, merged);
    return this.listSessionImports(sessionId);
  }

  removeSessionImport(sessionId: string, importId: string): void {
    const existing = this.listSessionImports(sessionId);
    const next = existing.filter((entry) => entry.id !== importId);
    if (next.length) {
      this.write(`${IMPORTS_PREFIX}${sessionId}`, next);
    } else {
      this.storage.removeItem(`${IMPORTS_PREFIX}${sessionId}`);
    }
  }

  clearSessionImports(sessionId: string): void {
    this.storage.removeItem(`${IMPORTS_PREFIX}${sessionId}`);
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
    this.storage.setItem(key, JSON.stringify(value));
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
