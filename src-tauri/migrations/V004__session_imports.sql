-- Session import storage.
--
-- Mirrors the browser localStorage record `StoredSessionImport`: one row
-- per applied connector / paste import, carrying the import's source,
-- normalized events, and — when the import came through the connector
-- pipeline — its `ConnectorSourceImportSummary`.
--
-- Object / array fields are flattened to JSON TEXT columns (the `*_json`
-- convention used by the other tables); the TypeScript bridge owns
-- (de)serialising those columns. `import_summary_json` is nullable —
-- imports applied before the summary existed, and non-connector imports,
-- carry no summary.
--
-- This table lets desktop SQLite-saved sessions contribute to the
-- connector re-import rollup, the same way browser-saved sessions
-- already do.

CREATE TABLE IF NOT EXISTS session_imports (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  source_json TEXT NOT NULL,
  events_json TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  import_summary_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_session_imports_session_id
  ON session_imports(session_id);
