CREATE TABLE browser_evidence (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL UNIQUE,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tab_activated', 'navigation_committed')),
  data_json TEXT NOT NULL
);
CREATE INDEX browser_evidence_observed ON browser_evidence(observed_at DESC, sequence DESC);
