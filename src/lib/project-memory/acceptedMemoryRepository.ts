/**
 * Runtime-aware Accepted Memory repository.
 *
 * Accepted project memories and memory review actions persist to two
 * backends:
 *
 *   - **Browser mode** — `BrowserDraftRepository` (localStorage).
 *   - **Tauri desktop mode** — the SQLite tables behind the
 *     `*_accepted_project_memories` / `*_memory_review_action_rows`
 *     Tauri commands.
 *
 * This service routes each operation to the right backend so the UI
 * never branches on runtime. Desktop mode prefers SQLite; if a SQLite
 * call fails it falls back to localStorage and reports `fellBack: true`
 * with a reason — it never silently claims SQLite succeeded.
 *
 * Every method is async (SQLite commands are async); the browser path
 * simply resolves its synchronous result.
 */
import { isTauriRuntime, tauriCommands } from "../desktop";
import { createBrowserDraftRepository } from "../storage/localStorageAdapter";
import type {
  MoriDraftRepository,
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";
import {
  fromSqliteAcceptedMemoryRow,
  fromSqliteMemoryReviewActionRow,
  toSqliteAcceptedMemoryRow,
  toSqliteMemoryReviewActionRow,
} from "../sqlite/acceptedMemoryRows";

export type AcceptedMemoryRuntime = "browser" | "desktop";

export type AcceptedMemoryStorageSource = "browser-local-storage" | "desktop-sqlite";

/**
 * Result of a repository operation. `source` is the backend that
 * actually serviced the call; `fellBack` is true when desktop SQLite
 * was attempted but the call dropped to localStorage instead.
 */
export type AcceptedMemoryResult<T> = {
  data: T;
  source: AcceptedMemoryStorageSource;
  fellBack: boolean;
  fallbackReason?: string;
};

export type AcceptedMemoryDesktopCommands = {
  saveAcceptedProjectMemories: typeof tauriCommands.saveAcceptedProjectMemories;
  listAcceptedProjectMemories: typeof tauriCommands.listAcceptedProjectMemories;
  appendMemoryReviewActionRows: typeof tauriCommands.appendMemoryReviewActionRows;
  listMemoryReviewActionRows: typeof tauriCommands.listMemoryReviewActionRows;
};

export type AcceptedMemoryRepositoryOptions = {
  /** Defaults to `desktop` inside Tauri, `browser` otherwise. */
  runtime?: AcceptedMemoryRuntime;
  /** localStorage repository (browser path + desktop fallback). */
  repository?: MoriDraftRepository;
  /** SQLite command bridge (desktop path). */
  commands?: AcceptedMemoryDesktopCommands;
};

export class AcceptedMemoryRepository {
  readonly runtime: AcceptedMemoryRuntime;
  private readonly repositoryOverride: MoriDraftRepository | null;
  private lazyRepository: MoriDraftRepository | null = null;
  private readonly commands: AcceptedMemoryDesktopCommands;

  constructor(options: AcceptedMemoryRepositoryOptions = {}) {
    this.runtime = options.runtime ?? (isTauriRuntime() ? "desktop" : "browser");
    this.repositoryOverride = options.repository ?? null;
    this.commands = options.commands ?? {
      saveAcceptedProjectMemories: tauriCommands.saveAcceptedProjectMemories,
      listAcceptedProjectMemories: tauriCommands.listAcceptedProjectMemories,
      appendMemoryReviewActionRows: tauriCommands.appendMemoryReviewActionRows,
      listMemoryReviewActionRows: tauriCommands.listMemoryReviewActionRows,
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

  async saveAcceptedProjectMemories(
    _projectId: string,
    memories: StoredAcceptedProjectMemory[],
  ): Promise<AcceptedMemoryResult<StoredAcceptedProjectMemory[]>> {
    if (!this.isDesktop()) {
      return browserResult(this.repository().saveAcceptedProjectMemories(memories));
    }
    try {
      await this.commands.saveAcceptedProjectMemories(
        memories.map(toSqliteAcceptedMemoryRow),
      );
      return {
        data: memories.map((memory) => ({ ...memory, adapter: "desktop-sqlite" as const })),
        source: "desktop-sqlite",
        fellBack: false,
      };
    } catch (error) {
      return fallbackResult(
        this.repository().saveAcceptedProjectMemories(memories),
        error,
      );
    }
  }

  async listAcceptedProjectMemories(
    projectId: string,
  ): Promise<AcceptedMemoryResult<StoredAcceptedProjectMemory[]>> {
    if (!this.isDesktop()) {
      return browserResult(this.repository().listAcceptedProjectMemories(projectId));
    }
    try {
      const rows = await this.commands.listAcceptedProjectMemories(projectId);
      return {
        data: rows.map(fromSqliteAcceptedMemoryRow),
        source: "desktop-sqlite",
        fellBack: false,
      };
    } catch (error) {
      return fallbackResult(this.repository().listAcceptedProjectMemories(projectId), error);
    }
  }

  async appendMemoryReviewActions(
    _projectId: string,
    actions: StoredMemoryReviewAction[],
  ): Promise<AcceptedMemoryResult<StoredMemoryReviewAction[]>> {
    if (!this.isDesktop()) {
      return browserResult(actions.map((action) => this.repository().appendMemoryReviewAction(action)));
    }
    try {
      await this.commands.appendMemoryReviewActionRows(
        actions.map(toSqliteMemoryReviewActionRow),
      );
      return {
        data: actions.map((action) => ({ ...action, adapter: "desktop-sqlite" as const })),
        source: "desktop-sqlite",
        fellBack: false,
      };
    } catch (error) {
      return fallbackResult(
        actions.map((action) => this.repository().appendMemoryReviewAction(action)),
        error,
      );
    }
  }

  async listMemoryReviewActions(
    projectId: string,
  ): Promise<AcceptedMemoryResult<StoredMemoryReviewAction[]>> {
    if (!this.isDesktop()) {
      return browserResult(this.repository().listMemoryReviewActions(projectId));
    }
    try {
      const rows = await this.commands.listMemoryReviewActionRows(projectId);
      return {
        data: rows.map(fromSqliteMemoryReviewActionRow),
        source: "desktop-sqlite",
        fellBack: false,
      };
    } catch (error) {
      return fallbackResult(this.repository().listMemoryReviewActions(projectId), error);
    }
  }
}

// ─── result helpers ───────────────────────────────────────────────────

function browserResult<T>(data: T): AcceptedMemoryResult<T> {
  return { data, source: "browser-local-storage", fellBack: false };
}

function fallbackResult<T>(data: T, error: unknown): AcceptedMemoryResult<T> {
  return {
    data,
    source: "browser-local-storage",
    fellBack: true,
    fallbackReason: error instanceof Error ? error.message : String(error),
  };
}

// ─── singleton accessor ───────────────────────────────────────────────

let repositorySingleton: AcceptedMemoryRepository | null = null;

export function getAcceptedMemoryRepository(): AcceptedMemoryRepository {
  if (!repositorySingleton) repositorySingleton = new AcceptedMemoryRepository();
  return repositorySingleton;
}

export function setAcceptedMemoryRepositoryForTesting(
  repository: AcceptedMemoryRepository | null,
): void {
  repositorySingleton = repository;
}

/** Human label for the storage source — used in honest UI copy. */
export function describeAcceptedMemoryStorageSource(
  source: AcceptedMemoryStorageSource,
): string {
  return source === "desktop-sqlite" ? "데스크톱 SQLite" : "브라우저 저장소";
}
