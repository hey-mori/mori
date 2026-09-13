CREATE TABLE browser_evidence_v013 (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL UNIQUE,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tab_activated', 'navigation_committed', 'history_state_updated')),
  data_json TEXT NOT NULL
);
INSERT INTO browser_evidence_v013 (
  sequence,
  delivery_id,
  observed_at,
  received_at,
  kind,
  data_json
)
SELECT
  sequence,
  delivery_id,
  observed_at,
  received_at,
  kind,
  data_json
FROM browser_evidence;
DROP TABLE browser_evidence;
ALTER TABLE browser_evidence_v013 RENAME TO browser_evidence;
CREATE INDEX browser_evidence_observed ON browser_evidence(observed_at DESC, sequence DESC);
