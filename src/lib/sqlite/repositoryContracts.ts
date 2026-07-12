import type { MockSession } from "../../domain/types";
import type { SqlitePersistenceSnapshot } from "./records";

export type MigrationRecord = {
  version: string;
  name: string;
  checksum: string;
  appliedAt: string;
};

export type DatabaseStatus = {
  path: string;
  initialized: boolean;
  appliedMigrations: string[];
  pendingMigrations: string[];
  migrationTableName: string;
  strategy: "rusqlite-custom-runner";
  tables?: string[];
  migrationRecords?: MigrationRecord[];
};

export type PersistSessionSnapshotInput = {
  session: MockSession;
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

export type SqliteSessionListEntry = {
  sessionId: string;
  projectId: string;
  title: string;
  projectName: string;
  startedAt: string;
  endedAt: string;
  status: string;
  eventCount: number;
  sourceCount: number;
};

export type ListSessionsOutput = {
  sessions: SqliteSessionListEntry[];
};

/** Per-table row counts removed by a full desktop SQLite data wipe. */
export type ClearAllSqliteDataResult = {
  sessionsDeleted: number;
  projectsDeleted: number;
  sessionImportsDeleted: number;
  consolidatedMemoriesDeleted: number;
};

/** One automatic pre-migration backup file, as returned by list_sqlite_backups. */
export type SqliteBackupInfo = {
  path: string;
  fileName: string;
  sizeBytes: number;
  /** Filesystem modified time in Unix milliseconds. */
  modifiedMs: number;
};

export type SqliteRepository = {
  initializeDatabase: () => Promise<DatabaseStatus>;
  persistSessionSnapshot: (input: PersistSessionSnapshotInput) => Promise<PersistSessionSnapshotOutput>;
  loadSessionSnapshot: (input: LoadSessionSnapshotInput) => Promise<SqlitePersistenceSnapshot>;
  listSessions: () => Promise<ListSessionsOutput>;
};

export type SqlitePersistenceAdapter = {
  applyMigrations: () => Promise<DatabaseStatus>;
  writeSnapshot: (snapshot: SqlitePersistenceSnapshot) => Promise<PersistSessionSnapshotOutput>;
};
