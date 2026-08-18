-- Durable document storage.
--
-- The store for the classes that section 0.6 of
-- `docs/design/sqlite-source-of-truth-promotion.md` classifies as durable
-- content and that have no SQLite path today: session memory bodies,
-- analysis results and their run history, pending reviews, session and
-- package drafts, and the user-authored project mappings.
--
-- One table rather than one per kind, because every one of those classes
-- has the same access pattern: read the whole document for an owner,
-- write the whole document for an owner, delete it. Nothing queries
-- inside them in SQL. Content search belongs to the record kernel and its
-- FTS index (V008), not here. So a column per field would buy queries
-- nobody makes and cost a migration per class; R3 and R4 of that plan add
-- their kinds without touching schema.
--
-- When to break a kind out into its own table: when it needs to be found
-- by something other than its owner. The live intake index is the known
-- case, since it is read per project rather than per session, and it is
-- deliberately not in here.
--
-- `body_json` is opaque to Rust, following the `*_json` convention of the
-- other tables: the TypeScript bridge owns (de)serialisation and the
-- document's own shape. `schema_version` is the body's version, carried
-- as a column so a loader can reject an unknown major without parsing.

CREATE TABLE IF NOT EXISTS durable_documents (
  kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  body_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, owner_id)
);

-- Listing every document of one kind is how an adoption pass and the
-- cross-session readers walk the store.
CREATE INDEX IF NOT EXISTS idx_durable_documents_kind
  ON durable_documents(kind, updated_at DESC);
