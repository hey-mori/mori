import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import {
  checksumMigrationSql,
  createDesktopSqliteRepository,
  createSqlitePersistenceSnapshot,
  getSqliteSchemaSql,
  isValidMigrationFilename,
  migrationMentionsRequiredTables,
  migrationTableName,
  reconstructMoriSession,
  requiredSqliteTables,
  sortMigrations,
  sqliteMigrations,
  validateMigrationCatalog,
  validateSqlitePersistenceSnapshot,
} from "./index";

describe("SQLite persistence foundation", () => {
  it("defines an initial migration covering all normalized Mori tables", () => {
    const sql = getSqliteSchemaSql();

    expect(sqliteMigrations).toHaveLength(6);
    expect(validateMigrationCatalog()).toEqual([]);
    expect(migrationMentionsRequiredTables(sql)).toBe(true);
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${migrationTableName}`);
    expect(sql).toContain("CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5");
    expect(sql).toContain("CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5");
    expect(requiredSqliteTables).toContain("relationships");
    expect(sql).toContain("connector_event_id");
    // V005 adds the optional session grouping label.
    expect(sql).toContain("ALTER TABLE sessions ADD COLUMN source_label");
    // V006 adds the optional capture-fidelity column.
    expect(sql).toContain("ALTER TABLE sources ADD COLUMN capture_fidelity_json");
  });

  it("requires the V003 accepted-memory tables in the schema catalog", () => {
    expect(requiredSqliteTables).toContain("consolidated_memories");
    expect(requiredSqliteTables).toContain("consolidated_memory_audit");
    // The completeness check must fail if a required table is missing
    // from the migration catalog — guards against a half-applied schema.
    const sqlMissingAudit = getSqliteSchemaSql().replace(
      /consolidated_memory_audit/g,
      "renamed_audit",
    );
    expect(migrationMentionsRequiredTables(sqlMissingAudit)).toBe(false);
  });

  it("requires the V004 session_imports table in the schema catalog", () => {
    expect(requiredSqliteTables).toContain("session_imports");
    expect(getSqliteSchemaSql()).toContain("CREATE TABLE IF NOT EXISTS session_imports");
    const sqlMissingImports = getSqliteSchemaSql().replace(
      /session_imports/g,
      "renamed_imports",
    );
    expect(migrationMentionsRequiredTables(sqlMissingImports)).toBe(false);
  });

  it("uses Flyway-style filenames without depending on Flyway", () => {
    expect(sqliteMigrations[0]?.filename).toBe("V001__initial_schema.sql");
    expect(sqliteMigrations[1]?.filename).toBe("V002__events_connector_identity.sql");
    expect(sqliteMigrations[2]?.filename).toBe("V003__consolidated_memories.sql");
    expect(sqliteMigrations[3]?.filename).toBe("V004__session_imports.sql");
    expect(sqliteMigrations[4]?.filename).toBe("V005__session_source_label.sql");
    expect(sqliteMigrations[5]?.filename).toBe("V006__source_capture_fidelity.sql");
    for (const migration of sqliteMigrations) {
      expect(isValidMigrationFilename(migration.filename)).toBe(true);
    }
    expect(sortMigrations([...sqliteMigrations].reverse()).map((migration) => migration.version)).toEqual([
      "001",
      "002",
      "003",
      "004",
      "005",
      "006",
    ]);
  });

  it("computes stable migration checksums", () => {
    for (const migration of sqliteMigrations) {
      expect(migration.checksum).toMatch(/^fnv1a32:[a-f0-9]{8}$/);
      expect(migration.checksum).toBe(checksumMigrationSql(migration.sql));
      expect(checksumMigrationSql(`${migration.sql}\n-- changed`)).not.toBe(migration.checksum);
    }
  });

  it("maps a Mori session into SQLite row snapshots", () => {
    const snapshot = createSqlitePersistenceSnapshot(mockSession);

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.events).toHaveLength(mockSession.events.length);
    expect(snapshot.sources).toHaveLength(mockSession.sources.length);
    expect(snapshot.issues).toHaveLength(mockSession.issues.length);
    expect(snapshot.decisions).toHaveLength(mockSession.decisions.length);
    expect(snapshot.relationships).toHaveLength(mockSession.relationships.length);
    expect(snapshot.events[0]?.source_refs_json).toMatch(/^\[/);
  });

  it("round-trips a Mori session through snapshot and reconstruct", () => {
    const snapshot = createSqlitePersistenceSnapshot(mockSession);
    const rebuilt = reconstructMoriSession(snapshot);

    expect(rebuilt.project.id).toBe(mockSession.project.id);
    expect(rebuilt.session.id).toBe(mockSession.session.id);
    expect(rebuilt.events).toHaveLength(mockSession.events.length);
    expect(rebuilt.events[0]?.sourceRefs).toEqual(mockSession.events[0]?.sourceRefs);
    expect(rebuilt.sources).toHaveLength(mockSession.sources.length);
    expect(rebuilt.decisions[0]?.rejectedOptions).toEqual(mockSession.decisions[0]?.rejectedOptions);
  });

  it("round-trips a source's capture fidelity through snapshot and reconstruct", () => {
    const [firstSource, ...restSources] = mockSession.sources;
    const session = {
      ...mockSession,
      sources: [
        { ...firstSource!, captureFidelity: { level: "partial" as const, reasons: ["truncationMarker"] } },
        ...restSources,
      ],
    };
    const snapshot = createSqlitePersistenceSnapshot(session);
    expect(snapshot.sources[0]?.capture_fidelity_json).toContain("partial");

    const rebuilt = reconstructMoriSession(snapshot);
    expect(rebuilt.sources[0]?.captureFidelity).toEqual({
      level: "partial",
      reasons: ["truncationMarker"],
    });
    // A source with no fidelity reconstructs without the key (not `undefined`-valued).
    if (restSources.length > 0) {
      expect(rebuilt.sources[1]?.captureFidelity).toBeUndefined();
    }
  });

  it("round-trips event provenance fields (file touches, actor, tool, request anchor)", () => {
    const [firstEvent, ...restEvents] = mockSession.events;
    const session = {
      ...mockSession,
      events: [
        {
          ...firstEvent!,
          actor: "tool" as const,
          toolName: "Edit",
          openedByUser: true,
          fileTouches: [
            { path: "src/app.ts", tool: "Edit", changeKind: "edited" as const, at: "", additions: 12, deletions: 3 },
          ],
        },
        ...restEvents,
      ],
    };
    const snapshot = createSqlitePersistenceSnapshot(session);
    expect(snapshot.events[0]?.file_touches_json).toContain("src/app.ts");
    expect(snapshot.events[0]?.actor).toBe("tool");
    expect(snapshot.events[0]?.tool_name).toBe("Edit");
    expect(snapshot.events[0]?.opened_by_user).toBe(1);

    const rebuilt = reconstructMoriSession(snapshot);
    expect(rebuilt.events[0]?.actor).toBe("tool");
    expect(rebuilt.events[0]?.toolName).toBe("Edit");
    expect(rebuilt.events[0]?.openedByUser).toBe(true);
    expect(rebuilt.events[0]?.fileTouches?.[0]?.path).toBe("src/app.ts");
    expect(rebuilt.events[0]?.fileTouches?.[0]?.additions).toBe(12);
  });

  it("validates snapshot foreign keys and JSON array columns before persistence", () => {
    const snapshot = createSqlitePersistenceSnapshot(mockSession);

    expect(validateSqlitePersistenceSnapshot(snapshot)).toEqual({ valid: true, issues: [] });

    const invalid = {
      ...snapshot,
      events: [{ ...snapshot.events[0]!, source_refs_json: JSON.stringify(["missing-source"]) }],
    };

    const result = validateSqlitePersistenceSnapshot(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain(`Event ${snapshot.events[0]?.id} references missing source missing-source`);
  });

  it("creates a desktop SQLite repository that sends validated snapshots to command boundaries", async () => {
    const calls: string[] = [];
    const baseStatus = {
      path: "/tmp/mori.db",
      initialized: true,
      appliedMigrations: ["001"],
      pendingMigrations: [],
      migrationTableName: "_mori_migrations",
      strategy: "rusqlite-custom-runner" as const,
      tables: ["projects", "sessions", "events"],
      migrationRecords: [
        {
          version: "001",
          name: "initial_schema",
          checksum: "stub-checksum",
          appliedAt: "epoch:0",
        },
      ],
    };
    const repository = createDesktopSqliteRepository({
      getSqliteMigrationStatus: async () => baseStatus,
      initializeSqliteDatabase: async () => baseStatus,
      persistSessionSnapshot: async ({ snapshot }) => {
        calls.push(snapshot.sessions[0]?.id ?? "");
        return {
          sessionId: snapshot.sessions[0]?.id ?? "",
          projectId: snapshot.projects[0]?.id ?? "",
          eventsPersisted: snapshot.events.length,
          sourcesPersisted: snapshot.sources.length,
          issuesPersisted: snapshot.issues.length,
          decisionsPersisted: snapshot.decisions.length,
        };
      },
      loadSqliteSessionSnapshot: async () => createSqlitePersistenceSnapshot(mockSession),
      listSqliteSessions: async () => ({
        sessions: [
          {
            sessionId: mockSession.session.id,
            projectId: mockSession.project.id,
            title: mockSession.session.title,
            projectName: mockSession.project.name,
            startedAt: mockSession.session.startedAt,
            endedAt: mockSession.session.endedAt,
            status: mockSession.session.status,
            eventCount: mockSession.events.length,
            sourceCount: mockSession.sources.length,
          },
        ],
      }),
    });

    const status = await repository.initializeDatabase();
    const persisted = await repository.persistSessionSnapshot({ session: mockSession });
    const listed = await repository.listSessions();

    expect(status.initialized).toBe(true);
    expect(calls).toEqual([mockSession.session.id]);
    expect(persisted.eventsPersisted).toBe(mockSession.events.length);
    expect(listed.sessions[0].sessionId).toBe(mockSession.session.id);
    expect(listed.sessions[0].eventCount).toBe(mockSession.events.length);
  });
});
