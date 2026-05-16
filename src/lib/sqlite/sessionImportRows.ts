/**
 * SQLite Session Import Storage — row mirror + converters.
 *
 * The desktop SQLite table `session_imports` (migration V004) stores
 * one row per applied connector / paste import, mirroring the browser
 * localStorage record `StoredSessionImport`. Object / array fields are
 * flattened to JSON `*_json` columns; the Rust layer treats those
 * columns as opaque text.
 *
 * This module owns the conversion between `StoredSessionImport` and the
 * flat SQLite row shape. It is pure — no IO — so the Tauri bridge and
 * tests can round-trip records without touching a database.
 */
import type { SourceRef, TimelineEvent } from "../../domain/types";
import type { ConnectorSourceImportSummary } from "../connectors";
import type { StoredSessionImport } from "../storage/storageTypes";

/** Flat row mirror of the Rust `SessionImportRow` (snake_case keys). */
export type SqliteSessionImportRow = {
  id: string;
  session_id: string;
  source_json: string;
  events_json: string;
  saved_at: string;
  /** NULL for imports with no connector re-import summary. */
  import_summary_json: string | null;
};

/** Mirror of the Rust `SessionImportWriteResult`. */
export type SqliteSessionImportWriteResult = { importsWritten: number };

export function toSqliteSessionImportRow(
  sessionImport: StoredSessionImport,
): SqliteSessionImportRow {
  return {
    id: sessionImport.id,
    session_id: sessionImport.sessionId,
    source_json: JSON.stringify(sessionImport.source),
    events_json: JSON.stringify(sessionImport.events),
    saved_at: sessionImport.savedAt,
    import_summary_json:
      sessionImport.importSummary === undefined
        ? null
        : JSON.stringify(sessionImport.importSummary),
  };
}

export function fromSqliteSessionImportRow(
  row: SqliteSessionImportRow,
): StoredSessionImport {
  const sessionImport: StoredSessionImport = {
    id: row.id,
    sessionId: row.session_id,
    source: parseJsonObject<SourceRef>(row.source_json),
    events: parseJsonArray<TimelineEvent>(row.events_json),
    savedAt: row.saved_at,
    // `StoredSessionImport.adapter` is a literal today; a SQLite-loaded
    // import still reports the only value the type allows.
    adapter: "browser-local-storage",
  };
  if (row.import_summary_json !== null) {
    sessionImport.importSummary = parseJsonObject<ConnectorSourceImportSummary>(
      row.import_summary_json,
    );
  }
  return sessionImport;
}

// ─── internals ────────────────────────────────────────────────────────

function parseJsonArray<T>(json: string): T[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(json: string): T {
  return JSON.parse(json) as T;
}
