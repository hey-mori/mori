export {
  checksumMigrationSql,
  getSqliteSchemaSql,
  isValidMigrationFilename,
  migrationMentionsRequiredTables,
  migrationTableName,
  requiredSqliteTables,
  sortMigrations,
  sqliteMigrations,
  validateMigrationCatalog,
} from "./schema";
export type { SqliteMigration } from "./schema";
export { createDesktopSqliteRepository, DesktopSqliteRepository } from "./desktopSqliteRepository";
export { createSqlitePersistenceSnapshot } from "./records";
export { reconstructMoriSession } from "./reconstruct";
export { validateSqlitePersistenceSnapshot } from "./snapshotValidation";
export type {
  ArtifactRow,
  DecisionRow,
  EventRow,
  IssueRow,
  NextActionRow,
  ProjectRow,
  RelationshipRow,
  SessionRow,
  SourceRow,
  SqlitePersistenceSnapshot,
  SummaryRow,
} from "./records";
export type {
  DatabaseStatus,
  ListSessionsOutput,
  LoadSessionSnapshotInput,
  MigrationRecord,
  MoriSqliteRepository,
  PersistSessionSnapshotInput,
  PersistSessionSnapshotOutput,
  PersistSqliteSnapshotInput,
  SqlitePersistenceAdapter,
  SqliteSessionListEntry,
} from "./repositoryContracts";
export type { SqliteSnapshotValidationResult } from "./snapshotValidation";
