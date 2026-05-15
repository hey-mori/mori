-- Accepted Project Memory storage.
--
-- Mirrors the browser localStorage records `StoredAcceptedProjectMemory`
-- and `StoredMemoryReviewAction`. Object / array fields are flattened to
-- JSON TEXT columns (the `*_json` convention used by the session tables);
-- the TypeScript bridge owns (de)serialising those columns.
--
-- These tables intentionally carry no foreign key to `projects` /
-- `sessions`: a consolidated memory is durable project-level memory that
-- must survive pruning of the sessions it was derived from.

CREATE TABLE IF NOT EXISTS consolidated_memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  importance TEXT NOT NULL,
  confidence_label TEXT NOT NULL,
  confidence_score REAL,
  confidence_rationale TEXT,
  evidence_refs_json TEXT NOT NULL,
  source_session_ids_json TEXT NOT NULL,
  origin_proposal_ids_json TEXT NOT NULL,
  related_issue_ids_json TEXT NOT NULL,
  related_decision_ids_json TEXT NOT NULL,
  proposed_action TEXT NOT NULL,
  review_note TEXT,
  sensitivity TEXT NOT NULL,
  resume_eligible INTEGER NOT NULL DEFAULT 0,
  report_eligibility TEXT NOT NULL,
  superseded_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  accepted_by TEXT NOT NULL,
  review_action_ids_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_consolidated_memories_project_id
  ON consolidated_memories(project_id);

CREATE TABLE IF NOT EXISTS consolidated_memory_audit (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  source_proposal_id TEXT,
  target_memory_ids_json TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT,
  reversible INTEGER NOT NULL DEFAULT 0,
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_consolidated_memory_audit_project_id
  ON consolidated_memory_audit(project_id);
CREATE INDEX IF NOT EXISTS idx_consolidated_memory_audit_timestamp
  ON consolidated_memory_audit(timestamp);
