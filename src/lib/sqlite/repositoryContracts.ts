import type { MoriMockSession, Session } from "../../domain/types";
import type { SqlitePersistenceSnapshot } from "./records";

export type DatabaseStatus = {
  path: string;
  initialized: boolean;
  appliedMigrations: string[];
  pendingMigrations: string[];
  migrationTableName: string;
  strategy: "rusqlite-custom-runner";
};

export type PersistSessionSnapshotInput = {
  session: MoriMockSession;
};

export type PersistSqliteSnapshotInput = {
  snapshot: SqlitePersistenceSnapshot;
};

export type PersistSessionSnapshotOutput = {
  sessionId: string;
  projectId: string;
  eventsPersisted: number;
  sourcesPersisted: number;
  issuesPersisted: number;
  decisionsPersisted: number;
};

export type LoadSessionSnapshotInput = {
  sessionId: string;
};

export type ListSessionsOutput = {
  sessions: Session[];
};

export type MoriSqliteRepository = {
  initializeDatabase: () => Promise<DatabaseStatus>;
  persistSessionSnapshot: (input: PersistSessionSnapshotInput) => Promise<PersistSessionSnapshotOutput>;
  loadSessionSnapshot: (input: LoadSessionSnapshotInput) => Promise<MoriMockSession>;
  listSessions: () => Promise<ListSessionsOutput>;
};

export type SqlitePersistenceAdapter = {
  applyMigrations: () => Promise<DatabaseStatus>;
  writeSnapshot: (snapshot: SqlitePersistenceSnapshot) => Promise<PersistSessionSnapshotOutput>;
};
