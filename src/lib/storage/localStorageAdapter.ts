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
  StoredMoriPackageDraft,
  StoredSessionAnalysis,
  StoredSessionDraft,
  StoredSessionImport,
  StoredSessionSummary,
} from "./storageTypes";

const CURRENT_SESSION_KEY = "mori.currentSessionDraft";
const SESSION_PREFIX = "mori.sessionDraft.";
const PACKAGE_PREFIX = "mori.packageDraft.";
const IMPORTS_PREFIX = "mori.sessionImports.";
const ANALYSIS_PREFIX = "mori.sessionAnalysis.";
const QUICK_PASS_SETTINGS_KEY = "mori.quickPassSettings";
const REPOSITORY_SETTINGS_KEY = "mori.repositorySettings";

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

  clearStoredSession(sessionId: string): void {
    this.storage.removeItem(`${SESSION_PREFIX}${sessionId}`);
    this.storage.removeItem(`${IMPORTS_PREFIX}${sessionId}`);
    this.storage.removeItem(`${ANALYSIS_PREFIX}${sessionId}`);
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
