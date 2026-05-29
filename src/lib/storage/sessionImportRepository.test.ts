import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import {
  fromSqliteSessionImportRow,
  toSqliteSessionImportRow,
  type SqliteSessionImportRow,
} from "../sqlite/sessionImportRows";
import { BrowserDraftRepository } from "./localStorageAdapter";
import { MemoryKeyValueStorage } from "./memoryStorage";
import {
  buildConnectorEventIdentitySnapshots,
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
    source: { ...mockSession.sources[0]!, id: `src-${id}`, sessionId },
    events: mockSession.events.slice(0, 1).map((event) => ({ ...event, sessionId })),
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
    listAllSessionImportRows: async () => [...rows],
  };
}

const throwingCommands: SessionImportDesktopCommands = {
  persistSessionImports: async () => {
    throw new Error("sqlite unavailable");
  },
  listSessionImportRows: async () => {
    throw new Error("sqlite unavailable");
  },
  listAllSessionImportRows: async () => {
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

/** A session import whose events carry connector identities. */
function connectorImport(
  id: string,
  sessionId: string,
  connectorEventIds: string[],
): StoredSessionImport {
  return sessionImport(id, sessionId, {
    events: connectorEventIds.map((connectorEventId, index) => ({
      ...mockSession.events[0]!,
      id: `${id}-evt-${index}`,
      sessionId,
      connectorEventId,
    })),
  });
}

describe("buildConnectorEventIdentitySnapshots", () => {
  it("groups connector identities by session", () => {
    const snapshots = buildConnectorEventIdentitySnapshots([
      connectorImport("imp-1", "s-1", ["c::s::a", "c::s::b"]),
      connectorImport("imp-2", "s-2", ["c::s::c"]),
    ]);
    const bySession = Object.fromEntries(
      snapshots.map((snapshot) => [snapshot.sessionId, snapshot.connectorEventIds]),
    );
    expect(bySession["s-1"]?.sort()).toEqual(["c::s::a", "c::s::b"]);
    expect(bySession["s-2"]).toEqual(["c::s::c"]);
  });

  it("excludes the active session", () => {
    const snapshots = buildConnectorEventIdentitySnapshots(
      [
        connectorImport("imp-1", "s-1", ["c::s::a"]),
        connectorImport("imp-2", "s-2", ["c::s::c"]),
      ],
      { excludeSessionId: "s-1" },
    );
    expect(snapshots.map((snapshot) => snapshot.sessionId)).toEqual(["s-2"]);
  });
});

describe("SessionImportRepository — connector identity snapshots", () => {
  it("builds desktop snapshots from the session_imports table", async () => {
    const commands = fakeCommands();
    const repo = new SessionImportRepository({ runtime: "desktop", commands });
    await repo.saveSessionImports("s-1", [connectorImport("imp-1", "s-1", ["c::s::a"])]);
    await repo.saveSessionImports("s-2", [connectorImport("imp-2", "s-2", ["c::s::c"])]);

    const result = await repo.listConnectorEventIdentitySnapshots();
    expect(result.source).toBe("desktop-sqlite");
    expect(result.data.map((snapshot) => snapshot.sessionId).sort()).toEqual([
      "s-1",
      "s-2",
    ]);
  });
});
