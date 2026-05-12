import type { NormalizedImportCandidate } from "../import";
import type { MoriPackageV0 } from "../mori-package";
import type {
  KeyValueStorage,
  MoriDraftRepository,
  StoredMoriPackageDraft,
  StoredSessionDraft,
  StoredSessionImport,
  StoredSessionSummary,
} from "./storageTypes";

const CURRENT_SESSION_KEY = "mori.currentSessionDraft";
const SESSION_PREFIX = "mori.sessionDraft.";
const PACKAGE_PREFIX = "mori.packageDraft.";
const IMPORTS_PREFIX = "mori.sessionImports.";

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
    }
  }

  addSessionImport(sessionId: string, candidate: NormalizedImportCandidate): StoredSessionImport {
    const existing = this.listSessionImports(sessionId);
    const savedAt = new Date().toISOString();
    const stored: StoredSessionImport = {
      id: candidate.source.id,
      sessionId,
      source: { ...candidate.source, sessionId },
      events: candidate.events.map((event) => ({ ...event, sessionId })),
      savedAt,
      adapter: "browser-local-storage",
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
