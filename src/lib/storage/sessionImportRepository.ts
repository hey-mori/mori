/**
 * Runtime-aware Session Import repository.
 *
 * Session imports — one `StoredSessionImport` per applied connector /
 * paste import — persist to two backends:
 *
 *   - **Browser mode** — `BrowserDraftRepository` (localStorage).
 *   - **Tauri desktop mode** — the SQLite `session_imports` table
 *     behind the `persist_session_imports` / `list_session_import_rows`
 *     Tauri commands.
 *
 * This service routes each operation to the right backend so callers
 * never branch on runtime. Desktop mode prefers SQLite; if a SQLite
 * call fails it falls back to localStorage and reports `fellBack: true`
 * with a reason — it never silently claims SQLite succeeded.
 *
 * Wiring this into the connector re-import rollup (so desktop-saved
 * sessions contribute) is a follow-up slice.
 */
import { isTauriRuntime, tauriCommands } from "../desktop";
import {
  fromSqliteSessionImportRow,
  toSqliteSessionImportRow,
} from "../sqlite/sessionImportRows";
import { createBrowserDraftRepository } from "./localStorageAdapter";
import type { MoriDraftRepository, StoredSessionImport } from "./storageTypes";

export type SessionImportRuntime = "browser" | "desktop";

export type SessionImportStorageSource =
  | "browser-local-storage"
  | "desktop-sqlite";

/**
 * Result of a repository operation. `source` is the backend that
 * actually serviced the call; `fellBack` is true when desktop SQLite
 * was attempted but the call dropped to localStorage instead.
 */
export type SessionImportResult<T> = {
  data: T;
  source: SessionImportStorageSource;
  fellBack: boolean;
  fallbackReason?: string;
};

export type SessionImportDesktopCommands = {
  persistSessionImports: typeof tauriCommands.persistSessionImports;
  listSessionImportRows: typeof tauriCommands.listSessionImportRows;
};

export type SessionImportRepositoryOptions = {
  /** Defaults to `desktop` inside Tauri, `browser` otherwise. */
  runtime?: SessionImportRuntime;
  /** localStorage repository (browser path + desktop fallback). */
  repository?: MoriDraftRepository;
  /** SQLite command bridge (desktop path). */
  commands?: SessionImportDesktopCommands;
};

export class SessionImportRepository {
  readonly runtime: SessionImportRuntime;
  private readonly repositoryOverride: MoriDraftRepository | null;
  private lazyRepository: MoriDraftRepository | null = null;
  private readonly commands: SessionImportDesktopCommands;

  constructor(options: SessionImportRepositoryOptions = {}) {
    this.runtime = options.runtime ?? (isTauriRuntime() ? "desktop" : "browser");
    this.repositoryOverride = options.repository ?? null;
    this.commands = options.commands ?? {
      persistSessionImports: tauriCommands.persistSessionImports,
      listSessionImportRows: tauriCommands.listSessionImportRows,
    };
  }

  isDesktop(): boolean {
    return this.runtime === "desktop";
  }

  private repository(): MoriDraftRepository {
    if (this.repositoryOverride) return this.repositoryOverride;
    if (!this.lazyRepository) this.lazyRepository = createBrowserDraftRepository();
    return this.lazyRepository;
  }

  async saveSessionImports(
    sessionId: string,
    imports: StoredSessionImport[],
  ): Promise<SessionImportResult<StoredSessionImport[]>> {
    if (!this.isDesktop()) {
      return browserResult(this.repository().putSessionImports(sessionId, imports));
    }
    try {
      await this.commands.persistSessionImports(imports.map(toSqliteSessionImportRow));
      return { data: imports, source: "desktop-sqlite", fellBack: false };
    } catch (error) {
      return fallbackResult(
        this.repository().putSessionImports(sessionId, imports),
        error,
      );
    }
  }

  async listSessionImports(
    sessionId: string,
  ): Promise<SessionImportResult<StoredSessionImport[]>> {
    if (!this.isDesktop()) {
      return browserResult(this.repository().listSessionImports(sessionId));
    }
    try {
      const rows = await this.commands.listSessionImportRows(sessionId);
      return {
        data: rows.map(fromSqliteSessionImportRow),
        source: "desktop-sqlite",
        fellBack: false,
      };
    } catch (error) {
      return fallbackResult(this.repository().listSessionImports(sessionId), error);
    }
  }
}

// ─── result helpers ───────────────────────────────────────────────────

function browserResult<T>(data: T): SessionImportResult<T> {
  return { data, source: "browser-local-storage", fellBack: false };
}

function fallbackResult<T>(data: T, error: unknown): SessionImportResult<T> {
  return {
    data,
    source: "browser-local-storage",
    fellBack: true,
    fallbackReason: error instanceof Error ? error.message : String(error),
  };
}

// ─── singleton accessor ───────────────────────────────────────────────

let repositorySingleton: SessionImportRepository | null = null;

export function getSessionImportRepository(): SessionImportRepository {
  if (!repositorySingleton) repositorySingleton = new SessionImportRepository();
  return repositorySingleton;
}

export function setSessionImportRepositoryForTesting(
  repository: SessionImportRepository | null,
): void {
  repositorySingleton = repository;
}
