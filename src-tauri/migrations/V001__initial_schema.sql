PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS _mori_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  recording_mode TEXT NOT NULL,
  llm_provider TEXT NOT NULL,
  llm_model TEXT NOT NULL,
  storage_location TEXT NOT NULL,
  selected_source_ids_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  uri TEXT,
  trust_level TEXT NOT NULL,
  redaction_status TEXT NOT NULL,
  raw_retention TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  related_event_ids_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sources_session_id ON sources(session_id);
CREATE INDEX IF NOT EXISTS idx_sources_kind ON sources(kind);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL,
  end_at TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  linked_issue_ids_json TEXT NOT NULL,
  linked_decision_ids_json TEXT NOT NULL,
  relationship_ids_json TEXT NOT NULL,
  artifact_ids_json TEXT NOT NULL,
  trust_level TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_by TEXT NOT NULL,
  user_modified INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_start_at ON events(start_at);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  source_event_ids_json TEXT NOT NULL,
  related_decision_ids_json TEXT NOT NULL,
  related_file_ids_json TEXT NOT NULL,
  suggested_next_action TEXT NOT NULL,
  assignee TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confidence REAL NOT NULL,
  trust_level TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_issues_session_id ON issues(session_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL,
  rejected_options_json TEXT NOT NULL,
  impact_json TEXT NOT NULL,
  source_event_ids_json TEXT NOT NULL,
  related_issue_ids_json TEXT NOT NULL,
  related_source_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  importance TEXT NOT NULL,
  trust_level TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_decisions_session_id ON decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  from_type TEXT NOT NULL,
  to_id TEXT NOT NULL,
  to_type TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence REAL NOT NULL,
  reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_id, from_type);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_id, to_type);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT,
  source_event_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artifacts_session_id ON artifacts(session_id);

CREATE TABLE IF NOT EXISTS next_actions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority TEXT NOT NULL,
  related_issue_ids_json TEXT NOT NULL,
  related_event_ids_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  session_summary TEXT NOT NULL,
  resume_prompt TEXT NOT NULL,
  report_markdown TEXT NOT NULL,
  next_action_ids_json TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  event_id UNINDEXED,
  title,
  summary,
  content='',
  tokenize='unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(
  source_id UNINDEXED,
  title,
  detail,
  content='',
  tokenize='unicode61'
);
