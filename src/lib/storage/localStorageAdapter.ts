import type { MoriAnalysisResult, QuickPassAnalysisSettings } from "../analysis";
import { DEFAULT_QUICK_PASS_SETTINGS, sanitizeQuickPassSettings } from "../analysis";
import type { ConnectorSourceImportSummary } from "../connectors";
import type { NormalizedImportCandidate } from "../import";
import type { MoriPackageV0 } from "../mori-package";
import type { RepositorySettings } from "../repositories";
import { DEFAULT_REPOSITORY_SETTINGS, sanitizeRepositorySettings } from "../repositories";
import type {
  ConnectorEventIdentitySnapshot,
  KeyValueStorage,
  MoriDraftRepository,
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
  StoredMoriPackageDraft,
  StoredSessionAnalysis,
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
const MEMORY_PREFIX = "mori.sessionMemory.";
const ACCEPTED_MEMORY_PREFIX = "mori.consolidatedMemory.";
const REVIEW_ACTION_PREFIX = "mori.consolidatedMemoryAudit.";
const QUICK_PASS_SETTINGS_KEY = "mori.quickPassSettings";
const REPOSITORY_SETTINGS_KEY = "mori.repositorySettings";

const MEMORY_BODY_SCHEMA_VERSION = 1 as const;
const ACCEPTED_MEMORY_SCHEMA_VERSION = 1 as const;
const REVIEW_ACTION_SCHEMA_VERSION = 1 as const;

export class BrowserDraftRepository implements MoriDraftRepository {
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

  listStoredSessions(): StoredSessionSummary[] {
    const sessions: StoredSessionSummary[] = [];

    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(SESSION_PREFIX)) continue;
      const draft = this.read<StoredSessionDraft>(key);
      if (!draft) continue;

      sessions.push({
        sessionId: draft.session.id,
        projectId: draft.project.id,
        title: draft.session.title,
        projectName: draft.project.name,
        savedAt: draft.savedAt,
        status: draft.session.status,
        startedAt: draft.session.startedAt ?? draft.savedAt,
        ...(draft.session.sourceLabel ? { sourceLabel: draft.session.sourceLabel } : {}),
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
      this.storage.removeItem(`${MEMORY_PREFIX}${current.session.id}`);
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

  saveSessionAnalysis(sessionId: string, result: MoriAnalysisResult): StoredSessionAnalysis {
    const stored: StoredSessionAnalysis = {
      sessionId,
      result,
      savedAt: new Date().toISOString(),
      adapter: "browser-local-storage",
    };
    this.write(`${ANALYSIS_PREFIX}${sessionId}`, stored);
    return stored;
  }

  loadSessionAnalysis(sessionId: string): StoredSessionAnalysis | null {
    return this.read<StoredSessionAnalysis>(`${ANALYSIS_PREFIX}${sessionId}`);
  }

  clearSessionAnalysis(sessionId: string): void {
    this.storage.removeItem(`${ANALYSIS_PREFIX}${sessionId}`);
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
