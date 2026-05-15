-- Add a stable connector-event identity column to `events` so cross-session
-- duplicate detection survives SQLite round-trips. The value is the same
-- `<connectorId>::<externalSessionId|unscoped>::<eventId>` string the TS
-- side already stamps onto `TimelineEvent.connectorEventId` for events
-- imported through the connector JSONL pipeline. Non-connector events
-- (manual notes, URL imports, AI transcripts, git diffs) leave the column
-- as NULL — the duplicate index only walks rows that carry an identity.

ALTER TABLE events ADD COLUMN connector_event_id TEXT;

-- Index for the duplicate-detection lookup. Multiple rows can share a NULL
-- value, so this stays a non-unique index — we only need fast lookup of
-- rows that DO carry an identity. Uniqueness across sessions is a
-- product-level concern, not a DB-level one (the user may legitimately
-- import the same connector event into a different project).
CREATE INDEX IF NOT EXISTS idx_events_connector_event_id ON events(connector_event_id);
