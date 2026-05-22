-- Add an optional grouping label to `sessions`.
--
-- `source_label` carries a human-facing grouping value for a session — e.g.
-- the Claude project path (`C:/dev/mori`) a conversation was imported from.
-- It is set when a session is created from an external import under the
-- "1 Claude conversation = 1 Mori session" model, and the sidebar session
-- switcher groups sessions by it.
--
-- Additive and nullable: every existing session row (manual Start Session,
-- demo, pre-import) leaves the column NULL, so this migration cannot break
-- the load path for sessions saved before it shipped. Mirrors the V002
-- pattern that added `events.connector_event_id`.

ALTER TABLE sessions ADD COLUMN source_label TEXT;
