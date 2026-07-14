-- Record kernel (K1): the generic center of the personal context workspace
-- (docs/design/mori-context-workspace-architecture.md §3). Additive: nothing
-- in the legacy session schema changes; adapters convert legacy data INTO
-- these tables, never the reverse.
--
-- kernel_records carries the queryable columns plus JSON payloads for
-- properties and context ids. The smaller kernel collections (contexts,
-- entities, aliases, relations, sources, source links, derivations, rules,
-- user schemas) share one keyed-JSON table until a real query need promotes
-- a collection to its own columns. Revisions are append-only per record.
-- FTS mirrors title/body via triggers; writes use UPSERT (never INSERT OR
-- REPLACE) so the UPDATE trigger keeps the index in sync.

CREATE TABLE IF NOT EXISTS kernel_records (
  id TEXT PRIMARY KEY,
  schema_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  occurred_start TEXT,
  occurred_end TEXT,
  source_created_at TEXT,
  captured_at TEXT NOT NULL,
  time_basis TEXT NOT NULL,
  time_confidence REAL,
  status TEXT NOT NULL,
  origin TEXT NOT NULL,
  ownership TEXT NOT NULL DEFAULT 'db',
  context_ids_json TEXT NOT NULL DEFAULT '[]',
  properties_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kernel_records_schema ON kernel_records(schema_id);
CREATE INDEX IF NOT EXISTS idx_kernel_records_status ON kernel_records(status);
CREATE INDEX IF NOT EXISTS idx_kernel_records_occurred ON kernel_records(occurred_start);
CREATE INDEX IF NOT EXISTS idx_kernel_records_captured ON kernel_records(captured_at);

CREATE TABLE IF NOT EXISTS kernel_objects (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (collection, id)
);

CREATE TABLE IF NOT EXISTS kernel_revisions (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  operation TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kernel_revisions_record
  ON kernel_revisions(record_id, created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS kernel_records_fts USING fts5(
  title,
  body,
  content='kernel_records',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS kernel_records_fts_ai AFTER INSERT ON kernel_records BEGIN
  INSERT INTO kernel_records_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS kernel_records_fts_ad AFTER DELETE ON kernel_records BEGIN
  INSERT INTO kernel_records_fts(kernel_records_fts, rowid, title, body)
  VALUES ('delete', old.rowid, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS kernel_records_fts_au AFTER UPDATE ON kernel_records BEGIN
  INSERT INTO kernel_records_fts(kernel_records_fts, rowid, title, body)
  VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO kernel_records_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
