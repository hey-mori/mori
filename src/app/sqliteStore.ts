import { create } from "zustand";
import { isTauriRuntime, tauriCommands } from "../lib/desktop";
import { createSqlitePersistenceSnapshot, validateSqlitePersistenceSnapshot } from "../lib/sqlite";
import type {
  DatabaseStatus,
  PersistSessionSnapshotOutput,
  SqliteSessionListEntry,
} from "../lib/sqlite/repositoryContracts";
import type { MoriMockSession } from "../domain/types";

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

export const useMoriSqliteStore = create<MoriSqliteState>((set, get) => ({
  available: isTauriRuntime(),
  status: null,
  sessions: [],
  kind: isTauriRuntime() ? "checking" : "unavailable",
  error: null,
  lastPersist: null,
  refresh: async () => {
    if (!isTauriRuntime()) {
      set({ available: false, kind: "unavailable", error: null });
      return;
    }
    set({ available: true, kind: "checking", error: null });
    try {
      const status = await tauriCommands.getSqliteMigrationStatus();
      const sessions = status.initialized
        ? (await tauriCommands.listSqliteSessions()).sessions
        : [];
      set({ status, sessions, kind: "ok", error: null });
    } catch (error) {
      set({ kind: "error", error: errorMessage(error) });
    }
  },
  initialize: async () => {
    if (!isTauriRuntime()) {
      set({ available: false, kind: "unavailable", error: null });
      return;
    }
    set({ available: true, kind: "checking", error: null });
    try {
      const status = await tauriCommands.initializeSqliteDatabase();
      const sessions = (await tauriCommands.listSqliteSessions()).sessions;
      set({ status, sessions, kind: "ok", error: null });
    } catch (error) {
      set({ kind: "error", error: errorMessage(error) });
    }
  },
  persist: async (session) => {
    if (!isTauriRuntime()) {
      set({ kind: "unavailable", error: "SQLite desktop persistence requires the Tauri app." });
      return null;
    }
    const snapshot = createSqlitePersistenceSnapshot(session);
    const validation = validateSqlitePersistenceSnapshot(snapshot);
    if (!validation.valid) {
      set({ kind: "error", error: `Invalid snapshot: ${validation.issues.join("; ")}` });
      return null;
    }
    try {
      const result = await tauriCommands.persistSessionSnapshot({ snapshot });
      set({ lastPersist: result, error: null });
      await get().refresh();
      return result;
    } catch (error) {
      set({ kind: "error", error: errorMessage(error) });
      return null;
    }
  },
}));

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
