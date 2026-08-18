import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import {
  SessionPersistenceService,
  type SqliteDesktopCommands,
} from "./sessionPersistenceService";
import { BrowserDraftRepository } from "./localStorageAdapter";
import { MemoryKeyValueStorage } from "./memoryStorage";
import { createSqlitePersistenceSnapshot } from "../sqlite";

function freshRepository() {
  return new BrowserDraftRepository(new MemoryKeyValueStorage());
}

function stubDesktopCommands(overrides: Partial<SqliteDesktopCommands> = {}): SqliteDesktopCommands {
  return {
    getSqliteMigrationStatus: async () => ({
      path: "/tmp/mori.sqlite",
      initialized: true,
      appliedMigrations: ["001"],
      pendingMigrations: [],
      migrationTableName: "_mori_migrations",
      strategy: "rusqlite-custom-runner",
      tables: ["projects", "sessions"],
      migrationRecords: [
        { version: "001", name: "initial_schema", checksum: "stub", appliedAt: "epoch:0" },
      ],
    }),
    initializeSqliteDatabase: async () => ({
      path: "/tmp/mori.sqlite",
      initialized: true,
      appliedMigrations: ["001"],
      pendingMigrations: [],
      migrationTableName: "_mori_migrations",
      strategy: "rusqlite-custom-runner",
      tables: ["projects", "sessions"],
      migrationRecords: [],
    }),
    persistSessionSnapshot: async ({ snapshot }) => ({
      sessionId: snapshot.sessions[0]?.id ?? "",
      projectId: snapshot.projects[0]?.id ?? "",
      eventsPersisted: snapshot.events.length,
      sourcesPersisted: snapshot.sources.length,
      issuesPersisted: snapshot.issues.length,
      decisionsPersisted: snapshot.decisions.length,
    }),
    loadSqliteSessionSnapshot: async () => createSqlitePersistenceSnapshot(mockSession),
    clearAllSqliteData: async () => ({
      sessionsDeleted: 0,
      projectsDeleted: 0,
      sessionImportsDeleted: 0,
      consolidatedMemoriesDeleted: 0,
        kernelRecordsDeleted: 0,
        durableDocumentsDeleted: 0,
    }),
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
    ...overrides,
  };
}

describe("SessionPersistenceService", () => {
  it("reports unavailable status in browser mode and refuses desktop operations", async () => {
    const service = new SessionPersistenceService({
      runtime: "browser",
      repository: freshRepository(),
      commands: stubDesktopCommands(),
    });

    expect(service.isDesktop()).toBe(false);

    const status = await service.getStatus();
    expect(status.runtime).toBe("browser");
    expect(status.sqliteAvailable).toBe(false);

    await expect(service.initializeDesktop()).rejects.toThrow("Tauri");
    await expect(service.saveSessionToDesktop(mockSession)).rejects.toThrow("Tauri");
    await expect(service.listDesktopSessions()).rejects.toThrow("Tauri");
    await expect(service.loadSessionFromDesktop("sess-x")).rejects.toThrow("Tauri");
  });

  it("uses the desktop command bridge in desktop mode and validates snapshots before save", async () => {
    const calls: string[] = [];
    const commands = stubDesktopCommands({
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
    });
    const service = new SessionPersistenceService({
      runtime: "desktop",
      repository: freshRepository(),
      commands,
    });

    const persisted = await service.saveSessionToDesktop(mockSession);
    expect(persisted.eventsPersisted).toBe(mockSession.events.length);
    expect(calls).toEqual([mockSession.session.id]);

    const sessions = await service.listDesktopSessions();
    expect(sessions[0]?.sessionId).toBe(mockSession.session.id);
    expect(sessions[0]?.eventCount).toBe(mockSession.events.length);

    const loaded = await service.loadSessionFromDesktop(mockSession.session.id);
    expect(loaded.session.session.id).toBe(mockSession.session.id);
    expect(loaded.imports.length).toBe(mockSession.sources.length);
    expect(loaded.imports[0]?.events.length).toBeGreaterThanOrEqual(0);
  });

  it("reports an error status when the desktop status command fails", async () => {
    const commands = stubDesktopCommands({
      getSqliteMigrationStatus: async () => {
        throw new Error("desktop bridge offline");
      },
    });
    const service = new SessionPersistenceService({
      runtime: "desktop",
      repository: freshRepository(),
      commands,
    });

    const status = await service.getStatus();
    expect(status.sqliteAvailable).toBe(true);
    expect(status.sqliteInitialized).toBe(false);
    expect(status.sqliteError).toContain("desktop bridge offline");
  });
});
