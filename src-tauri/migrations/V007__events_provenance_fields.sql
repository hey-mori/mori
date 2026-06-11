-- Persist the event provenance + classification fields the snapshot used to
-- drop, so a SQLite round-trip keeps them:
--   * file_touches_json — per-file diff provenance (which files a turn wrote /
--     edited / read, with line counts), the foundation of "어떤 파일을 어떻게
--     썼는지 추적". Lost on reload before this.
--   * actor / tool_name — drive timeline lane classification, so a reloaded
--     session lands in the right lanes (대화 / 탐색 / 명령 / 파일 …) instead of
--     collapsing to "unknown".
--   * opened_by_user — the request anchor a session's request units are built
--     on.
-- All nullable; rows persisted before this migration keep NULL and reconstruct
-- exactly as they did, so this is additive and backward-compatible.

ALTER TABLE events ADD COLUMN file_touches_json TEXT;
ALTER TABLE events ADD COLUMN actor TEXT;
ALTER TABLE events ADD COLUMN tool_name TEXT;
ALTER TABLE events ADD COLUMN opened_by_user INTEGER;
