/**
 * Tests for the desktop-aware connector import history loader.
 *
 * `loadConnectorImportHistorySavedSessionsAsync` branches on the
 * runtime: in Tauri mode it reads cross-session connector identities
 * from the SQLite `session_imports` table via `SessionImportRepository`;
 * in browser mode it resolves the synchronous localStorage result.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as desktop from "../lib/desktop";
import {
  SessionImportRepository,
  setSessionImportRepositoryForTesting,
  type SessionImportDesktopCommands,
} from "../lib/storage/sessionImportRepository";
import type { SqliteSessionImportRow } from "../lib/sqlite/sessionImportRows";
import { loadConnectorImportHistorySavedSessionsAsync } from "./sessionStore";

function importRow(
  id: string,
  sessionId: string,
  connectorEventIds: string[],
): SqliteSessionImportRow {
  return {
    id,
    session_id: sessionId,
    source_json: JSON.stringify({ id: `src-${id}`, sessionId }),
    events_json: JSON.stringify(
      connectorEventIds.map((connectorEventId, index) => ({
        id: `${id}-evt-${index}`,
        sessionId,
        connectorEventId,
      })),
    ),
    saved_at: "2026-05-16T09:00:00Z",
    import_summary_json: null,
  };
}

function desktopCommands(rows: SqliteSessionImportRow[]): SessionImportDesktopCommands {
  return {
    persistSessionImports: async () => ({ importsWritten: 0 }),
    listSessionImportRows: async (sessionId) =>
      rows.filter((row) => row.session_id === sessionId),
    listAllSessionImportRows: async () => [...rows],
  };
}

afterEach(() => {
  setSessionImportRepositoryForTesting(null);
  vi.restoreAllMocks();
});

describe("loadConnectorImportHistorySavedSessionsAsync", () => {
  it("reads SQLite session imports in desktop mode", async () => {
    vi.spyOn(desktop, "isTauriRuntime").mockReturnValue(true);
    setSessionImportRepositoryForTesting(
      new SessionImportRepository({
        runtime: "desktop",
        commands: desktopCommands([
          importRow("imp-1", "s-1", ["c::s::a", "c::s::b"]),
          importRow("imp-2", "s-2", ["c::s::c"]),
        ]),
      }),
    );

    const sessions = await loadConnectorImportHistorySavedSessionsAsync();
    const bySession = Object.fromEntries(
      sessions.map((session) => [session.sessionId, session.events.length]),
    );
    expect(bySession["s-1"]).toBe(2);
    expect(bySession["s-2"]).toBe(1);
  });

  it("excludes the active session in desktop mode", async () => {
    vi.spyOn(desktop, "isTauriRuntime").mockReturnValue(true);
    setSessionImportRepositoryForTesting(
      new SessionImportRepository({
        runtime: "desktop",
        commands: desktopCommands([
          importRow("imp-1", "s-1", ["c::s::a"]),
          importRow("imp-2", "s-2", ["c::s::c"]),
        ]),
      }),
    );

    const sessions = await loadConnectorImportHistorySavedSessionsAsync({
      excludeSessionId: "s-1",
    });
    expect(sessions.map((session) => session.sessionId)).toEqual(["s-2"]);
  });
});
