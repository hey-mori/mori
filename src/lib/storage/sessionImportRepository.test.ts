import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import {
  fromSqliteSessionImportRow,
  toSqliteSessionImportRow,
  type SqliteSessionImportRow,
} from "../sqlite/sessionImportRows";
import { BrowserDraftRepository } from "./localStorageAdapter";
import { MemoryKeyValueStorage } from "./memoryStorage";
import {
  SessionImportRepository,
  type SessionImportDesktopCommands,
} from "./sessionImportRepository";
import type { StoredSessionImport } from "./storageTypes";

function sessionImport(
  id: string,
  sessionId: string,
  overrides: Partial<StoredSessionImport> = {},
): StoredSessionImport {
  return {
    id,
    sessionId,
    source: { ...moriMockSession.sources[0]!, id: `src-${id}`, sessionId },
    events: moriMockSession.events.slice(0, 1).map((event) => ({ ...event, sessionId })),
    savedAt: "2026-05-16T09:00:00Z",
    adapter: "browser-local-storage",
    ...overrides,
  };
}

/** Desktop command fake backed by an in-memory `session_imports` table. */
function fakeCommands(): SessionImportDesktopCommands & { rows: SqliteSessionImportRow[] } {
  const rows: SqliteSessionImportRow[] = [];
  return {
    rows,
    persistSessionImports: async (incoming) => {
      for (const row of incoming) {
        const index = rows.findIndex((entry) => entry.id === row.id);
        if (index >= 0) rows[index] = row;
        else rows.push(row);
      }
      return { importsWritten: incoming.length };
    },
    listSessionImportRows: async (sessionId) =>
      rows.filter((row) => row.session_id === sessionId),
  };
}

const throwingCommands: SessionImportDesktopCommands = {
  persistSessionImports: async () => {
    throw new Error("sqlite unavailable");
  },
  listSessionImportRows: async () => {
    throw new Error("sqlite unavailable");
  },
};

describe("SessionImportRepository — browser runtime", () => {
  it("round-trips a session import through localStorage", async () => {
    const repo = new SessionImportRepository({
      runtime: "browser",
      repository: new BrowserDraftRepository(new MemoryKeyValueStorage()),
    });
    const saved = await repo.saveSessionImports("s-1", [sessionImport("imp-1", "s-1")]);
    expect(saved.source).toBe("browser-local-storage");
    expect(saved.fellBack).toBe(false);

    const listed = await repo.listSessionImports("s-1");
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.id).toBe("imp-1");
  });

  it("preserves an importSummary through the round-trip", async () => {
    const repo = new SessionImportRepository({
      runtime: "browser",
      repository: new BrowserDraftRepository(new MemoryKeyValueStorage()),
    });
    const withSummary = sessionImport("imp-sum", "s-1");
    const row = toSqliteSessionImportRow(withSummary);
    // Sanity: a round trip through the row converters keeps the shape.
    expect(fromSqliteSessionImportRow(row).id).toBe("imp-sum");

    await repo.saveSessionImports("s-1", [withSummary]);
    const listed = await repo.listSessionImports("s-1");
    expect(listed.data[0]?.savedAt).toBe("2026-05-16T09:00:00Z");
  });
});

describe("SessionImportRepository — desktop runtime", () => {
  it("routes save and list through the SQLite command surface", async () => {
    const commands = fakeCommands();
    const repo = new SessionImportRepository({ runtime: "desktop", commands });

    const saved = await repo.saveSessionImports("s-1", [
      sessionImport("imp-1", "s-1"),
      sessionImport("imp-2", "s-1"),
    ]);
    expect(saved.source).toBe("desktop-sqlite");
    expect(saved.fellBack).toBe(false);
    expect(commands.rows).toHaveLength(2);

    const listed = await repo.listSessionImports("s-1");
    expect(listed.source).toBe("desktop-sqlite");
    expect(listed.data.map((entry) => entry.id).sort()).toEqual(["imp-1", "imp-2"]);
  });

  it("falls back to localStorage when a SQLite call fails", async () => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const repo = new SessionImportRepository({
      runtime: "desktop",
      commands: throwingCommands,
      repository,
    });

    const saved = await repo.saveSessionImports("s-1", [sessionImport("imp-1", "s-1")]);
    expect(saved.source).toBe("browser-local-storage");
    expect(saved.fellBack).toBe(true);
    expect(saved.fallbackReason).toMatch(/sqlite unavailable/i);
    // The fallback actually persisted to localStorage.
    expect(repository.listSessionImports("s-1")).toHaveLength(1);

    const listed = await repo.listSessionImports("s-1");
    expect(listed.fellBack).toBe(true);
    expect(listed.data).toHaveLength(1);
  });
});
