import { create } from "zustand";
import {
  getSessionPersistenceService,
  type PersistenceStatus,
  type SessionPersistenceService,
} from "../lib/storage/sessionPersistenceService";
import type { MoriMockSession } from "../domain/types";
import type {
  DatabaseStatus,
  PersistSessionSnapshotOutput,
  SqliteSessionListEntry,
} from "../lib/sqlite/repositoryContracts";
import { useMoriSessionStore } from "./sessionStore";

export type SqliteStatusKind = "unavailable" | "checking" | "ok" | "error";

export type MoriSqliteState = {
  available: boolean;
  status: DatabaseStatus | null;
  sessions: SqliteSessionListEntry[];
  kind: SqliteStatusKind;
  error: string | null;
  lastPersist: PersistSessionSnapshotOutput | null;
  refresh: () => Promise<void>;
  initialize: () => Promise<void>;
  persist: (session: MoriMockSession) => Promise<PersistSessionSnapshotOutput | null>;
};

let lazyService: SessionPersistenceService | null = null;

function getService(): SessionPersistenceService {
  if (!lazyService) lazyService = getSessionPersistenceService();
  return lazyService;
}

export function setSqliteStoreServiceForTesting(service: SessionPersistenceService | null): void {
  lazyService = service;
}

function deriveInitialState(): Pick<MoriSqliteState, "available" | "kind"> {
  const service = getService();
  return {
    available: service.isDesktop(),
    kind: service.isDesktop() ? "checking" : "unavailable",
  };
}

export const useMoriSqliteStore = create<MoriSqliteState>((set, get) => ({
  ...deriveInitialState(),
  status: null,
  sessions: [],
  error: null,
  lastPersist: null,
  refresh: async () => {
    const service = getService();
    if (!service.isDesktop()) {
      set({ available: false, kind: "unavailable", error: null, status: null, sessions: [] });
      return;
    }
    set({ available: true, kind: "checking", error: null });
    try {
      const status = await service.getStatus();
      applyStatus(set, status);
      if (status.sqliteInitialized) {
        const sessions = await service.listDesktopSessions();
        set({ sessions });
      } else {
        set({ sessions: [] });
      }
    } catch (error) {
      set({ kind: "error", error: errorMessage(error) });
    }
  },
  initialize: async () => {
    const service = getService();
    if (!service.isDesktop()) {
      set({ available: false, kind: "unavailable", error: null });
      return;
    }
    set({ available: true, kind: "checking", error: null });
    try {
      const status = await service.initializeDesktop();
      set({ status, kind: "ok", error: null });
      const sessions = await service.listDesktopSessions();
      set({ sessions });
    } catch (error) {
      set({ kind: "error", error: errorMessage(error) });
    }
  },
  persist: async (session) => {
    const service = getService();
    if (!service.isDesktop()) {
      set({ kind: "unavailable", error: "SQLite desktop persistence requires the Tauri app." });
      return null;
    }
    try {
      const result = await service.saveSessionToDesktop(session);
      set({ lastPersist: result, error: null });
      useMoriSessionStore.getState().markPersistedToDesktop();
      await get().refresh();
      return result;
    } catch (error) {
      set({ kind: "error", error: errorMessage(error) });
      return null;
    }
  },
}));

function applyStatus(
  set: (partial: Partial<MoriSqliteState>) => void,
  status: PersistenceStatus,
): void {
  if (!status.sqliteAvailable) {
    set({ available: false, kind: "unavailable", status: null, error: null });
    return;
  }
  if (status.sqliteError) {
    set({ available: true, kind: "error", error: status.sqliteError, status: status.databaseStatus });
    return;
  }
  set({ available: true, kind: "ok", status: status.databaseStatus, error: null });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
