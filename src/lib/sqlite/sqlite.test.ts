import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import {
  checksumMigrationSql,
  createSqlitePersistenceSnapshot,
  getSqliteSchemaSql,
  isValidMigrationFilename,
  migrationMentionsRequiredTables,
  migrationTableName,
  requiredSqliteTables,
  sortMigrations,
  sqliteMigrations,
  validateMigrationCatalog,
} from "./index";

describe("SQLite persistence foundation", () => {
  it("defines an initial migration covering all normalized Mori tables", () => {
    const sql = getSqliteSchemaSql();

    expect(sqliteMigrations).toHaveLength(1);
    expect(validateMigrationCatalog()).toEqual([]);
    expect(migrationMentionsRequiredTables(sql)).toBe(true);
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${migrationTableName}`);
    expect(sql).toContain("CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5");
    expect(sql).toContain("CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5");
    expect(requiredSqliteTables).toContain("relationships");
  });

  it("uses Flyway-style filenames without depending on Flyway", () => {
    expect(sqliteMigrations[0]?.filename).toBe("V001__initial_schema.sql");
    expect(isValidMigrationFilename(sqliteMigrations[0]?.filename ?? "")).toBe(true);
    expect(sortMigrations([...sqliteMigrations].reverse()).map((migration) => migration.version)).toEqual(["001"]);
  });

  it("computes stable migration checksums", () => {
    const migration = sqliteMigrations[0];

    expect(migration?.checksum).toMatch(/^fnv1a32:[a-f0-9]{8}$/);
    expect(migration?.checksum).toBe(checksumMigrationSql(migration?.sql ?? ""));
    expect(checksumMigrationSql(`${migration?.sql ?? ""}\n-- changed`)).not.toBe(migration?.checksum);
  });

  it("maps a Mori session into SQLite row snapshots", () => {
    const snapshot = createSqlitePersistenceSnapshot(moriMockSession);

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.events).toHaveLength(moriMockSession.events.length);
    expect(snapshot.sources).toHaveLength(moriMockSession.sources.length);
    expect(snapshot.issues).toHaveLength(moriMockSession.issues.length);
    expect(snapshot.decisions).toHaveLength(moriMockSession.decisions.length);
    expect(snapshot.relationships).toHaveLength(moriMockSession.relationships.length);
    expect(snapshot.events[0]?.source_refs_json).toMatch(/^\[/);
  });
});
