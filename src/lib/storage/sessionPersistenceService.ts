import type { MoriMockSession, Session } from "../../domain/types";
import { isTauriRuntime, tauriCommands } from "../desktop";
import { createBrowserDraftRepository } from "./localStorageAdapter";
import type {
  MoriDraftRepository,
  StoredSessionDraft,
  StoredSessionImport,
} from "./storageTypes";
import {
  createSqlitePersistenceSnapshot,
  reconstructMoriSession,
  validateSqlitePersistenceSnapshot,
} from "../sqlite";
import type {
  ClearAllSqliteDataResult,
  DatabaseStatus,
  PersistSessionSnapshotOutput,
  SqliteSessionListEntry,
} from "../sqlite/repositoryContracts";

export type PersistenceRuntime = "browser" | "desktop";

export type PersistenceSource = "demo" | "browser-draft" | "desktop-sqlite";

export type SqliteDesktopCommands = {
  getSqliteMigrationStatus: typeof tauriCommands.getSqliteMigrationStatus;
  initializeSqliteDatabase: typeof tauriCommands.initializeSqliteDatabase;
  persistSessionSnapshot: typeof tauriCommands.persistSessionSnapshot;
  loadSqliteSessionSnapshot: typeof tauriCommands.loadSqliteSessionSnapshot;
  listSqliteSessions: typeof tauriCommands.listSqliteSessions;
  clearAllSqliteData: typeof tauriCommands.clearAllSqliteData;
};

export type SessionPersistenceServiceOptions = {
  runtime?: PersistenceRuntime;
  repository?: MoriDraftRepository;
  commands?: SqliteDesktopCommands;
};

export type LoadedDesktopSession = {
  draft: StoredSessionDraft;
  imports: StoredSessionImport[];
  session: MoriMockSession;
};

export type PersistenceStatus = {
  runtime: PersistenceRuntime;
  sqliteAvailable: boolean;
  sqliteInitialized: boolean;
  sqliteError: string | null;
  databaseStatus: DatabaseStatus | null;
};

/**
 * Routes session persistence between the browser localStorage adapter and the
 * Tauri SQLite command bridge. React components and the Zustand stores call
 * this service so that runtime decisions live in a single place.
 */
export class SessionPersistenceService {
  readonly runtime: PersistenceRuntime;
  private repositoryOverride: MoriDraftRepository | null;
  private lazyRepository: MoriDraftRepository | null = null;
  private readonly commands: SqliteDesktopCommands;

  constructor(options: SessionPersistenceServiceOptions = {}) {
    this.runtime = options.runtime ?? (isTauriRuntime() ? "desktop" : "browser");
    this.repositoryOverride = options.repository ?? null;
    this.commands = options.commands ?? tauriCommands;
  }

  isDesktop(): boolean {
    return this.runtime === "desktop";
  }

  getRepository(): MoriDraftRepository {
    if (this.repositoryOverride) return this.repositoryOverride;
    if (!this.lazyRepository) {
      this.lazyRepository = createBrowserDraftRepository();
    }
    return this.lazyRepository;
  }

  async getStatus(): Promise<PersistenceStatus> {
    if (!this.isDesktop()) {
      return {
        runtime: "browser",
        sqliteAvailable: false,
        sqliteInitialized: false,
        sqliteError: null,
        databaseStatus: null,
      };
    }
    try {
      const status = await this.commands.getSqliteMigrationStatus();
      return {
        runtime: "desktop",
        sqliteAvailable: true,
        sqliteInitialized: status.initialized,
        sqliteError: null,
        databaseStatus: status,
      };
    } catch (error) {
      return {
        runtime: "desktop",
        sqliteAvailable: true,
        sqliteInitialized: false,
        sqliteError: errorMessage(error),
        databaseStatus: null,
      };
    }
  }

  async initializeDesktop(): Promise<DatabaseStatus> {
    requireDesktop(this.runtime);
    return this.commands.initializeSqliteDatabase();
  }

  async listDesktopSessions(): Promise<SqliteSessionListEntry[]> {
    requireDesktop(this.runtime);
    const result = await this.commands.listSqliteSessions();
    return result.sessions;
  }

  async saveSessionToDesktop(session: MoriMockSession): Promise<PersistSessionSnapshotOutput> {
    requireDesktop(this.runtime);
    const snapshot = createSqlitePersistenceSnapshot(session);
    const validation = validateSqlitePersistenceSnapshot(snapshot);
    if (!validation.valid) {
      throw new Error(`Invalid snapshot: ${validation.issues.join("; ")}`);
    }
    return this.commands.persistSessionSnapshot({ snapshot });
  }

  /**
   * Wipe every user work record from the desktop SQLite database (sessions,
   * projects, their children, session imports, and consolidated memory).
   * Desktop-only — the browser path clears localStorage instead.
   */
  async clearAllDesktopData(): Promise<ClearAllSqliteDataResult> {
    requireDesktop(this.runtime);
    return this.commands.clearAllSqliteData();
  }

  async loadSessionFromDesktop(sessionId: string): Promise<LoadedDesktopSession> {
    requireDesktop(this.runtime);
    const snapshot = await this.commands.loadSqliteSessionSnapshot(sessionId);
    const session = reconstructMoriSession(snapshot);
    return {
      session,
      draft: toStoredDraft(session.project, session.session),
      imports: toStoredImports(session),
    };
  }
}

let serviceSingleton: SessionPersistenceService | null = null;

export function getSessionPersistenceService(): SessionPersistenceService {
  if (!serviceSingleton) serviceSingleton = new SessionPersistenceService();
  return serviceSingleton;
}

export function setSessionPersistenceServiceForTesting(service: SessionPersistenceService | null): void {
  serviceSingleton = service;
}

function requireDesktop(runtime: PersistenceRuntime): void {
  if (runtime !== "desktop") {
    throw new Error("SQLite desktop persistence requires the Tauri app.");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toStoredDraft(project: MoriMockSession["project"], session: Session): StoredSessionDraft {
  return {
    project,
    session,
    savedAt: new Date().toISOString(),
    adapter: "browser-local-storage",
  };
}

function toStoredImports(session: MoriMockSession): StoredSessionImport[] {
  return session.sources.map((source) => {
    const relatedEvents = session.events.filter((event) => source.relatedEventIds.includes(event.id));
    return {
      id: source.id,
      sessionId: session.session.id,
      source,
      events: relatedEvents,
      savedAt: new Date().toISOString(),
      adapter: "browser-local-storage",
    };
  });
}
