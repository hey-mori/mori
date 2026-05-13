import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
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
    loadSqliteSessionSnapshot: async () => createSqlitePersistenceSnapshot(moriMockSession),
    listSqliteSessions: async () => ({
      sessions: [
        {
          sessionId: moriMockSession.session.id,
          projectId: moriMockSession.project.id,
          title: moriMockSession.session.title,
          projectName: moriMockSession.project.name,
          startedAt: moriMockSession.session.startedAt,
          endedAt: moriMockSession.session.endedAt,
          status: moriMockSession.session.status,
          eventCount: moriMockSession.events.length,
          sourceCount: moriMockSession.sources.length,
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
    await expect(service.saveSessionToDesktop(moriMockSession)).rejects.toThrow("Tauri");
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

    const persisted = await service.saveSessionToDesktop(moriMockSession);
    expect(persisted.eventsPersisted).toBe(moriMockSession.events.length);
    expect(calls).toEqual([moriMockSession.session.id]);

    const sessions = await service.listDesktopSessions();
    expect(sessions[0]?.sessionId).toBe(moriMockSession.session.id);
    expect(sessions[0]?.eventCount).toBe(moriMockSession.events.length);

    const loaded = await service.loadSessionFromDesktop(moriMockSession.session.id);
    expect(loaded.session.session.id).toBe(moriMockSession.session.id);
    expect(loaded.imports.length).toBe(moriMockSession.sources.length);
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
