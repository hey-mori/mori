use serde::{Deserialize, Serialize};

use super::migrations::MigrationRecord;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseStatus {
    pub path: String,
    pub initialized: bool,
    pub applied_migrations: Vec<String>,
    pub pending_migrations: Vec<String>,
    pub migration_table_name: String,
    pub strategy: String,
    pub tables: Vec<String>,
    pub migration_records: Vec<MigrationRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListEntry {
    pub session_id: String,
    pub project_id: String,
    pub title: String,
    pub project_name: String,
    pub started_at: String,
    pub ended_at: String,
    pub status: String,
    pub event_count: i64,
    pub source_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotPersistResult {
    pub session_id: String,
    pub project_id: String,
    pub projects_written: usize,
    pub sessions_written: usize,
    pub sources_written: usize,
    pub events_written: usize,
    pub issues_written: usize,
    pub decisions_written: usize,
    pub relationships_written: usize,
    pub artifacts_written: usize,
    pub next_actions_written: usize,
    pub summaries_written: usize,
}

/// Mirror of the frontend `SqlitePersistenceSnapshot` shape produced by
/// `createSqlitePersistenceSnapshot`. Field names use snake_case to match the
/// JSON columns stored in SQLite. Field naming preserves the wire format
/// already validated by the TS-side `validateSqlitePersistenceSnapshot`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SessionSnapshot {
    pub projects: Vec<ProjectRow>,
    pub sessions: Vec<SessionRow>,
    pub sources: Vec<SourceRow>,
    pub events: Vec<EventRow>,
    pub issues: Vec<IssueRow>,
    pub decisions: Vec<DecisionRow>,
    pub relationships: Vec<RelationshipRow>,
    pub artifacts: Vec<ArtifactRow>,
    #[serde(rename = "nextActions")]
    pub next_actions: Vec<NextActionRow>,
    pub summaries: Vec<SummaryRow>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SessionRow {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub started_at: String,
    pub ended_at: String,
    pub recording_mode: String,
    pub llm_provider: String,
    pub llm_model: String,
    pub storage_location: String,
    pub selected_source_ids_json: String,
    pub status: String,
    /// Optional grouping label (e.g. the Claude project path) carried onto
    /// `Session.sourceLabel`. NULL for manual / pre-import sessions. Added by
    /// migration V005.
    #[serde(default)]
    pub source_label: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SourceRow {
    pub id: String,
    pub session_id: String,
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub uri: Option<String>,
    pub trust_level: String,
    pub redaction_status: String,
    pub raw_retention: String,
    pub captured_at: String,
    pub related_event_ids_json: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EventRow {
    pub id: String,
    pub session_id: String,
    pub project_id: String,
    pub start_at: String,
    pub end_at: Option<String>,
    #[serde(rename = "type")]
    pub type_: String,
    pub title: String,
    pub summary: String,
    pub source_refs_json: String,
    pub linked_issue_ids_json: String,
    pub linked_decision_ids_json: String,
    pub relationship_ids_json: String,
    pub artifact_ids_json: String,
    pub trust_level: String,
    pub confidence: f64,
    pub created_by: String,
    pub user_modified: i64,
    /// Stable connector identity (`<connectorId>::<sessionId|unscoped>::<eventId>`)
    /// for events imported through the connector JSONL pipeline. NULL on
    /// every other import kind. Serialised as an optional field so old
    /// snapshots without it deserialize unchanged.
    #[serde(default)]
    pub connector_event_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct IssueRow {
    pub id: String,
    pub project_id: String,
    pub session_id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub source_event_ids_json: String,
    pub related_decision_ids_json: String,
    pub related_file_ids_json: String,
    pub suggested_next_action: String,
    pub assignee: Option<String>,
    pub due_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub confidence: f64,
    pub trust_level: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DecisionRow {
    pub id: String,
    pub project_id: String,
    pub session_id: String,
    pub title: String,
    pub decision: String,
    pub rationale: String,
    pub rejected_options_json: String,
    pub impact_json: String,
    pub source_event_ids_json: String,
    pub related_issue_ids_json: String,
    pub related_source_ids_json: String,
    pub created_at: String,
    pub importance: String,
    pub trust_level: String,
    pub confirmed: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RelationshipRow {
    pub id: String,
    pub from_id: String,
    pub from_type: String,
    pub to_id: String,
    pub to_type: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub confidence: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ArtifactRow {
    pub id: String,
    pub project_id: String,
    pub session_id: String,
    pub title: String,
    pub kind: String,
    pub path: Option<String>,
    pub source_event_ids_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct NextActionRow {
    pub id: String,
    pub session_id: String,
    pub title: String,
    pub priority: String,
    pub related_issue_ids_json: String,
    pub related_event_ids_json: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SummaryRow {
    pub id: String,
    pub session_id: String,
    pub session_summary: String,
    pub resume_prompt: String,
    pub report_markdown: String,
    pub next_action_ids_json: String,
    pub generated_at: String,
}
