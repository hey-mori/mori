use rusqlite::{params, Connection};

use super::records::{
    ArtifactRow, ClearAllDataResult, DecisionRow, EventRow, IssueRow, NextActionRow, ProjectRow,
    RelationshipRow, SessionListEntry, SessionRow, SessionSnapshot, SnapshotPersistResult,
    SourceRow, SummaryRow,
};

pub fn save_session_snapshot(
    conn: &mut Connection,
    snapshot: &SessionSnapshot,
) -> Result<SnapshotPersistResult, String> {
    let session = snapshot
        .sessions
        .first()
        .ok_or_else(|| "Snapshot must contain at least one session".to_string())?;
    let project = snapshot
        .projects
        .first()
        .ok_or_else(|| "Snapshot must contain at least one project".to_string())?;

    let tx = conn.transaction().map_err(|error| error.to_string())?;

    upsert_projects(&tx, &snapshot.projects)?;
    upsert_sessions(&tx, &snapshot.sessions)?;
    replace_sources(&tx, &session.id, &snapshot.sources)?;
    replace_events(&tx, &session.id, &snapshot.events)?;
    replace_issues(&tx, &session.id, &snapshot.issues)?;
    replace_decisions(&tx, &session.id, &snapshot.decisions)?;
    replace_relationships_for_session(&tx, &snapshot.relationships, &snapshot.events)?;
    replace_artifacts(&tx, &session.id, &snapshot.artifacts)?;
    replace_next_actions(&tx, &session.id, &snapshot.next_actions)?;
    replace_summaries(&tx, &session.id, &snapshot.summaries)?;

    tx.commit().map_err(|error| error.to_string())?;

    Ok(SnapshotPersistResult {
        session_id: session.id.clone(),
        project_id: project.id.clone(),
        projects_written: snapshot.projects.len(),
        sessions_written: snapshot.sessions.len(),
        sources_written: snapshot.sources.len(),
        events_written: snapshot.events.len(),
        issues_written: snapshot.issues.len(),
        decisions_written: snapshot.decisions.len(),
        relationships_written: snapshot.relationships.len(),
        artifacts_written: snapshot.artifacts.len(),
        next_actions_written: snapshot.next_actions.len(),
        summaries_written: snapshot.summaries.len(),
    })
}

pub fn load_session_snapshot(
    conn: &Connection,
    session_id: &str,
) -> Result<SessionSnapshot, String> {
    let session = load_session(conn, session_id)?;
    let project = load_project(conn, &session.project_id)?;
    let sources = load_sources(conn, session_id)?;
    let events = load_events(conn, session_id)?;
    let issues = load_issues(conn, session_id)?;
    let decisions = load_decisions(conn, session_id)?;
    let relationships = load_relationships_for_events(conn, &events)?;
    let artifacts = load_artifacts(conn, session_id)?;
    let next_actions = load_next_actions(conn, session_id)?;
    let summaries = load_summaries(conn, session_id)?;

    Ok(SessionSnapshot {
        projects: vec![project],
        sessions: vec![session],
        sources,
        events,
        issues,
        decisions,
        relationships,
        artifacts,
        next_actions,
        summaries,
    })
}

/// Remove every user work record from the database — all sessions, projects,
/// and their cascaded children, plus the unparented `relationships`,
/// `session_imports`, and consolidated-memory tables. Runs in one transaction
/// so a failure leaves the database untouched. Deletes are issued child→parent
/// explicitly, so the wipe is correct regardless of FK-cascade enforcement.
///
/// Migration metadata (`_mori_migrations`) and the schema itself are left
/// intact — this is a data reset, not a teardown. Used by the Settings
/// "clear data and view demo" action.
pub fn clear_all_data(conn: &mut Connection) -> Result<ClearAllDataResult, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;

    // Children of sessions (cascade targets) — explicit so order is obvious.
    tx.execute("DELETE FROM relationships", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM summaries", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM next_actions", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM artifacts", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM decisions", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM issues", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM events", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM sources", [])
        .map_err(|error| error.to_string())?;

    let session_imports_deleted = tx
        .execute("DELETE FROM session_imports", [])
        .map_err(|error| error.to_string())? as u64;
    let sessions_deleted = tx
        .execute("DELETE FROM sessions", [])
        .map_err(|error| error.to_string())? as u64;
    let projects_deleted = tx
        .execute("DELETE FROM projects", [])
        .map_err(|error| error.to_string())? as u64;

    // Durable project memory + its append-only audit. A full reset is an
    // explicit, confirmed factory wipe, so these are cleared too — matching
    // the browser localStorage reset.
    let consolidated_memories_deleted = tx
        .execute("DELETE FROM consolidated_memories", [])
        .map_err(|error| error.to_string())? as u64;
    tx.execute("DELETE FROM consolidated_memory_audit", [])
        .map_err(|error| error.to_string())?;

    tx.commit().map_err(|error| error.to_string())?;

    Ok(ClearAllDataResult {
        sessions_deleted,
        projects_deleted,
        session_imports_deleted,
        consolidated_memories_deleted,
    })
}

pub fn list_sessions(conn: &Connection) -> Result<Vec<SessionListEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.project_id, s.title, p.name, s.started_at, s.ended_at, s.status,\n  (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count,\n  (SELECT COUNT(*) FROM sources src WHERE src.session_id = s.id) AS source_count\nFROM sessions s\nJOIN projects p ON p.id = s.project_id\nORDER BY s.started_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SessionListEntry {
                session_id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                project_name: row.get(3)?,
                started_at: row.get(4)?,
                ended_at: row.get(5)?,
                status: row.get(6)?,
                event_count: row.get(7)?,
                source_count: row.get(8)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

fn upsert_projects(tx: &rusqlite::Transaction<'_>, rows: &[ProjectRow]) -> Result<(), String> {
    let mut stmt = tx
        .prepare(
            "INSERT INTO projects (id, name, description, created_at, updated_at)\nVALUES (?1, ?2, ?3, ?4, ?5)\nON CONFLICT(id) DO UPDATE SET\n  name = excluded.name,\n  description = excluded.description,\n  updated_at = excluded.updated_at",
        )
        .map_err(|error| error.to_string())?;
    for row in rows {
        stmt.execute(params![row.id, row.name, row.description, row.created_at, row.updated_at])
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn upsert_sessions(tx: &rusqlite::Transaction<'_>, rows: &[SessionRow]) -> Result<(), String> {
    let mut stmt = tx
        .prepare(
            "INSERT INTO sessions (id, project_id, title, started_at, ended_at, recording_mode,\n  llm_provider, llm_model, storage_location, selected_source_ids_json, status, source_label, created_at, updated_at)\nVALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)\nON CONFLICT(id) DO UPDATE SET\n  project_id = excluded.project_id,\n  title = excluded.title,\n  started_at = excluded.started_at,\n  ended_at = excluded.ended_at,\n  recording_mode = excluded.recording_mode,\n  llm_provider = excluded.llm_provider,\n  llm_model = excluded.llm_model,\n  storage_location = excluded.storage_location,\n  selected_source_ids_json = excluded.selected_source_ids_json,\n  status = excluded.status,\n  source_label = excluded.source_label,\n  updated_at = excluded.updated_at",
        )
        .map_err(|error| error.to_string())?;
    for row in rows {
        stmt.execute(params![
            row.id,
            row.project_id,
            row.title,
            row.started_at,
            row.ended_at,
            row.recording_mode,
            row.llm_provider,
            row.llm_model,
            row.storage_location,
            row.selected_source_ids_json,
            row.status,
            row.source_label,
            row.created_at,
            row.updated_at,
        ])
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn replace_sources(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    rows: &[SourceRow],
) -> Result<(), String> {
    tx.execute("DELETE FROM sources WHERE session_id = ?1", params![session_id])
        .map_err(|error| error.to_string())?;
    let mut stmt = tx
        .prepare(
            "INSERT INTO sources (id, session_id, kind, title, detail, uri, trust_level, redaction_status, raw_retention, captured_at, related_event_ids_json, capture_fidelity_json)\nVALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        )
        .map_err(|error| error.to_string())?;
    for row in rows {
        stmt.execute(params![
            row.id,
            row.session_id,
            row.kind,
            row.title,
            row.detail,
            row.uri,
            row.trust_level,
            row.redaction_status,
            row.raw_retention,
            row.captured_at,
            row.related_event_ids_json,
            row.capture_fidelity_json,
        ])
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn replace_events(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    rows: &[EventRow],
) -> Result<(), String> {
    tx.execute("DELETE FROM events WHERE session_id = ?1", params![session_id])
        .map_err(|error| error.to_string())?;
    let mut stmt = tx
        .prepare(
            "INSERT INTO events (id, session_id, project_id, start_at, end_at, type, title, summary, source_refs_json, linked_issue_ids_json, linked_decision_ids_json, relationship_ids_json, artifact_ids_json, trust_level, confidence, created_by, user_modified, connector_event_id)\nVALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
        )
        .map_err(|error| error.to_string())?;
    for row in rows {
        stmt.execute(params![
            row.id,
            row.session_id,
            row.project_id,
            row.start_at,
            row.end_at,
            row.type_,
            row.title,
            row.summary,
            row.source_refs_json,
            row.linked_issue_ids_json,
            row.linked_decision_ids_json,
            row.relationship_ids_json,
            row.artifact_ids_json,
            row.trust_level,
            row.confidence,
            row.created_by,
            row.user_modified,
            row.connector_event_id,
        ])
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn replace_issues(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    rows: &[IssueRow],
) -> Result<(), String> {
    tx.execute("DELETE FROM issues WHERE session_id = ?1", params![session_id])
        .map_err(|error| error.to_string())?;
    let mut stmt = tx
        .prepare(
            "INSERT INTO issues (id, project_id, session_id, title, description, status, priority, source_event_ids_json, related_decision_ids_json, related_file_ids_json, suggested_next_action, assignee, due_date, created_at, updated_at, confidence, trust_level)\nVALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        )
        .map_err(|error| error.to_string())?;
    for row in rows {
        stmt.execute(params![
            row.id,
            row.project_id,
            row.session_id,
            row.title,
            row.description,
            row.status,
            row.priority,
            row.source_event_ids_json,
            row.related_decision_ids_json,
            row.related_file_ids_json,
            row.suggested_next_action,
            row.assignee,
            row.due_date,
            row.created_at,
            row.updated_at,
            row.confidence,
            row.trust_level,
        ])
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn replace_decisions(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    rows: &[DecisionRow],
) -> Result<(), String> {
    tx.execute("DELETE FROM decisions WHERE session_id = ?1", params![session_id])
        .map_err(|error| error.to_string())?;
    let mut stmt = tx
        .prepare(
            "INSERT INTO decisions (id, project_id, session_id, title, decision, rationale, rejected_options_json, impact_json, source_event_ids_json, related_issue_ids_json, related_source_ids_json, created_at, importance, trust_level, confirmed)\nVALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        )
        .map_err(|error| error.to_string())?;
    for row in rows {
        stmt.execute(params![
            row.id,
            row.project_id,
            row.session_id,
            row.title,
            row.decision,
            row.rationale,
            row.rejected_options_json,
            row.impact_json,
            row.source_event_ids_json,
            row.related_issue_ids_json,
            row.related_source_ids_json,
            row.created_at,
            row.importance,
            row.trust_level,
            row.confirmed,
        ])
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn replace_relationships_for_session(
    tx: &rusqlite::Transaction<'_>,
    rows: &[RelationshipRow],
    events: &[EventRow],
) -> Result<(), String> {
    let event_ids: Vec<&str> = events.iter().map(|event| event.id.as_str()).collect();
    if !event_ids.is_empty() {
        let placeholders = std::iter::repeat("?")
            .take(event_ids.len())
            .collect::<Vec<&str>>()
            .join(", ");
        let sql = format!(
            "DELETE FROM relationships WHERE (from_type = 'event' AND from_id IN ({0})) OR (to_type = 'event' AND to_id IN ({0}))",
            placeholders
        );
        let mut binds: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(event_ids.len() * 2);
        for id in &event_ids {
            binds.push(id as &dyn rusqlite::ToSql);
        }
        for id in &event_ids {
            binds.push(id as &dyn rusqlite::ToSql);
        }
        tx.execute(&sql, binds.as_slice())
            .map_err(|error| error.to_string())?;
    }
    let mut stmt = tx
        .prepare(
            "INSERT INTO relationships (id, from_id, from_type, to_id, to_type, type, confidence, reason)\nVALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)\nON CONFLICT(id) DO UPDATE SET\n  from_id = excluded.from_id,\n  from_type = excluded.from_type,\n  to_id = excluded.to_id,\n  to_type = excluded.to_type,\n  type = excluded.type,\n  confidence = excluded.confidence,\n  reason = excluded.reason",
        )
        .map_err(|error| error.to_string())?;
    for row in rows {
        stmt.execute(params![
            row.id,
            row.from_id,
            row.from_type,
            row.to_id,
            row.to_type,
            row.type_,
            row.confidence,
            row.reason,
        ])
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn replace_artifacts(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    rows: &[ArtifactRow],
) -> Result<(), String> {
    tx.execute("DELETE FROM artifacts WHERE session_id = ?1", params![session_id])
        .map_err(|error| error.to_string())?;
    let mut stmt = tx
        .prepare(
            "INSERT INTO artifacts (id, project_id, session_id, title, kind, path, source_event_ids_json, created_at)\nVALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .map_err(|error| error.to_string())?;
    for row in rows {
        stmt.execute(params![
            row.id,
            row.project_id,
            row.session_id,
            row.title,
            row.kind,
            row.path,
            row.source_event_ids_json,
            row.created_at,
        ])
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn replace_next_actions(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    rows: &[NextActionRow],
) -> Result<(), String> {
    tx.execute("DELETE FROM next_actions WHERE session_id = ?1", params![session_id])
        .map_err(|error| error.to_string())?;
    let mut stmt = tx
        .prepare(
            "INSERT INTO next_actions (id, session_id, title, priority, related_issue_ids_json, related_event_ids_json)\nVALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .map_err(|error| error.to_string())?;
    for row in rows {
        stmt.execute(params![
            row.id,
            row.session_id,
            row.title,
            row.priority,
            row.related_issue_ids_json,
            row.related_event_ids_json,
        ])
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn replace_summaries(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    rows: &[SummaryRow],
) -> Result<(), String> {
    tx.execute("DELETE FROM summaries WHERE session_id = ?1", params![session_id])
        .map_err(|error| error.to_string())?;
    let mut stmt = tx
        .prepare(
            "INSERT INTO summaries (id, session_id, session_summary, resume_prompt, report_markdown, next_action_ids_json, generated_at)\nVALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .map_err(|error| error.to_string())?;
    for row in rows {
        stmt.execute(params![
            row.id,
            row.session_id,
            row.session_summary,
            row.resume_prompt,
            row.report_markdown,
            row.next_action_ids_json,
            row.generated_at,
        ])
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn load_project(conn: &Connection, project_id: &str) -> Result<ProjectRow, String> {
    conn.query_row(
        "SELECT id, name, description, created_at, updated_at FROM projects WHERE id = ?1",
        params![project_id],
        |row| {
            Ok(ProjectRow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
    .map_err(|error| format!("Project {project_id} not found: {error}"))
}

fn load_session(conn: &Connection, session_id: &str) -> Result<SessionRow, String> {
    conn.query_row(
        "SELECT id, project_id, title, started_at, ended_at, recording_mode, llm_provider, llm_model, storage_location, selected_source_ids_json, status, source_label, created_at, updated_at FROM sessions WHERE id = ?1",
        params![session_id],
        |row| {
            Ok(SessionRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                started_at: row.get(3)?,
                ended_at: row.get(4)?,
                recording_mode: row.get(5)?,
                llm_provider: row.get(6)?,
                llm_model: row.get(7)?,
                storage_location: row.get(8)?,
                selected_source_ids_json: row.get(9)?,
                status: row.get(10)?,
                source_label: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        },
    )
    .map_err(|error| format!("Session {session_id} not found: {error}"))
}

fn load_sources(conn: &Connection, session_id: &str) -> Result<Vec<SourceRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, kind, title, detail, uri, trust_level, redaction_status, raw_retention, captured_at, related_event_ids_json, capture_fidelity_json FROM sources WHERE session_id = ?1 ORDER BY captured_at",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(SourceRow {
                id: row.get(0)?,
                session_id: row.get(1)?,
                kind: row.get(2)?,
                title: row.get(3)?,
                detail: row.get(4)?,
                uri: row.get(5)?,
                trust_level: row.get(6)?,
                redaction_status: row.get(7)?,
                raw_retention: row.get(8)?,
                captured_at: row.get(9)?,
                related_event_ids_json: row.get(10)?,
                capture_fidelity_json: row.get(11)?,
            })
        })
        .map_err(|error| error.to_string())?;
    collect(rows)
}

fn load_events(conn: &Connection, session_id: &str) -> Result<Vec<EventRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, project_id, start_at, end_at, type, title, summary, source_refs_json, linked_issue_ids_json, linked_decision_ids_json, relationship_ids_json, artifact_ids_json, trust_level, confidence, created_by, user_modified, connector_event_id FROM events WHERE session_id = ?1 ORDER BY start_at",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(EventRow {
                id: row.get(0)?,
                session_id: row.get(1)?,
                project_id: row.get(2)?,
                start_at: row.get(3)?,
                end_at: row.get(4)?,
                type_: row.get(5)?,
                title: row.get(6)?,
                summary: row.get(7)?,
                source_refs_json: row.get(8)?,
                linked_issue_ids_json: row.get(9)?,
                linked_decision_ids_json: row.get(10)?,
                relationship_ids_json: row.get(11)?,
                artifact_ids_json: row.get(12)?,
                trust_level: row.get(13)?,
                confidence: row.get(14)?,
                created_by: row.get(15)?,
                user_modified: row.get(16)?,
                connector_event_id: row.get(17)?,
            })
        })
        .map_err(|error| error.to_string())?;
    collect(rows)
}

fn load_issues(conn: &Connection, session_id: &str) -> Result<Vec<IssueRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, session_id, title, description, status, priority, source_event_ids_json, related_decision_ids_json, related_file_ids_json, suggested_next_action, assignee, due_date, created_at, updated_at, confidence, trust_level FROM issues WHERE session_id = ?1 ORDER BY created_at",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(IssueRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                session_id: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                status: row.get(5)?,
                priority: row.get(6)?,
                source_event_ids_json: row.get(7)?,
                related_decision_ids_json: row.get(8)?,
                related_file_ids_json: row.get(9)?,
                suggested_next_action: row.get(10)?,
                assignee: row.get(11)?,
                due_date: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                confidence: row.get(15)?,
                trust_level: row.get(16)?,
            })
        })
        .map_err(|error| error.to_string())?;
    collect(rows)
}

fn load_decisions(conn: &Connection, session_id: &str) -> Result<Vec<DecisionRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, session_id, title, decision, rationale, rejected_options_json, impact_json, source_event_ids_json, related_issue_ids_json, related_source_ids_json, created_at, importance, trust_level, confirmed FROM decisions WHERE session_id = ?1 ORDER BY created_at",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(DecisionRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                session_id: row.get(2)?,
                title: row.get(3)?,
                decision: row.get(4)?,
                rationale: row.get(5)?,
                rejected_options_json: row.get(6)?,
                impact_json: row.get(7)?,
                source_event_ids_json: row.get(8)?,
                related_issue_ids_json: row.get(9)?,
                related_source_ids_json: row.get(10)?,
                created_at: row.get(11)?,
                importance: row.get(12)?,
                trust_level: row.get(13)?,
                confirmed: row.get(14)?,
            })
        })
        .map_err(|error| error.to_string())?;
    collect(rows)
}

fn load_relationships_for_events(
    conn: &Connection,
    events: &[EventRow],
) -> Result<Vec<RelationshipRow>, String> {
    if events.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = std::iter::repeat("?")
        .take(events.len())
        .collect::<Vec<&str>>()
        .join(", ");
    let sql = format!(
        "SELECT id, from_id, from_type, to_id, to_type, type, confidence, reason FROM relationships WHERE (from_type = 'event' AND from_id IN ({0})) OR (to_type = 'event' AND to_id IN ({0}))",
        placeholders
    );
    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let event_ids: Vec<&str> = events.iter().map(|event| event.id.as_str()).collect();
    let mut binds: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(event_ids.len() * 2);
    for id in &event_ids {
        binds.push(id as &dyn rusqlite::ToSql);
    }
    for id in &event_ids {
        binds.push(id as &dyn rusqlite::ToSql);
    }
    let rows = stmt
        .query_map(binds.as_slice(), |row| {
            Ok(RelationshipRow {
                id: row.get(0)?,
                from_id: row.get(1)?,
                from_type: row.get(2)?,
                to_id: row.get(3)?,
                to_type: row.get(4)?,
                type_: row.get(5)?,
                confidence: row.get(6)?,
                reason: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;
    collect(rows)
}

fn load_artifacts(conn: &Connection, session_id: &str) -> Result<Vec<ArtifactRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, session_id, title, kind, path, source_event_ids_json, created_at FROM artifacts WHERE session_id = ?1 ORDER BY created_at",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(ArtifactRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                session_id: row.get(2)?,
                title: row.get(3)?,
                kind: row.get(4)?,
                path: row.get(5)?,
                source_event_ids_json: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;
    collect(rows)
}

fn load_next_actions(conn: &Connection, session_id: &str) -> Result<Vec<NextActionRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, title, priority, related_issue_ids_json, related_event_ids_json FROM next_actions WHERE session_id = ?1",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(NextActionRow {
                id: row.get(0)?,
                session_id: row.get(1)?,
                title: row.get(2)?,
                priority: row.get(3)?,
                related_issue_ids_json: row.get(4)?,
                related_event_ids_json: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?;
    collect(rows)
}

fn load_summaries(conn: &Connection, session_id: &str) -> Result<Vec<SummaryRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, session_summary, resume_prompt, report_markdown, next_action_ids_json, generated_at FROM summaries WHERE session_id = ?1",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(SummaryRow {
                id: row.get(0)?,
                session_id: row.get(1)?,
                session_summary: row.get(2)?,
                resume_prompt: row.get(3)?,
                report_markdown: row.get(4)?,
                next_action_ids_json: row.get(5)?,
                generated_at: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?;
    collect(rows)
}

fn collect<T, I>(rows: I) -> Result<Vec<T>, String>
where
    I: IntoIterator<Item = rusqlite::Result<T>>,
{
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{apply_migrations, open_in_memory};

    fn fixture_snapshot() -> SessionSnapshot {
        SessionSnapshot {
            projects: vec![ProjectRow {
                id: "proj-1".into(),
                name: "Repo Test".into(),
                description: "fixture".into(),
                created_at: "2026-05-12T13:00:00Z".into(),
                updated_at: "2026-05-12T13:00:00Z".into(),
            }],
            sessions: vec![SessionRow {
                id: "sess-1".into(),
                project_id: "proj-1".into(),
                title: "Repo session".into(),
                started_at: "2026-05-12T13:00:00Z".into(),
                ended_at: "2026-05-12T13:30:00Z".into(),
                recording_mode: "summary".into(),
                llm_provider: "ollama".into(),
                llm_model: "llama3.1:8b".into(),
                storage_location: "~/Mori/Records".into(),
                selected_source_ids_json: "[]".into(),
                status: "recording".into(),
                source_label: Some("C:/dev/mori".into()),
                created_at: "2026-05-12T13:00:00Z".into(),
                updated_at: "2026-05-12T13:00:00Z".into(),
            }],
            sources: vec![SourceRow {
                id: "src-1".into(),
                session_id: "sess-1".into(),
                kind: "manualNote".into(),
                title: "Kickoff".into(),
                detail: "first note".into(),
                uri: None,
                trust_level: "verified".into(),
                redaction_status: "notNeeded".into(),
                raw_retention: "retained".into(),
                captured_at: "2026-05-12T13:05:00Z".into(),
                related_event_ids_json: "[\"evt-1\"]".into(),
                capture_fidelity_json: Some("{\"level\":\"partial\",\"reasons\":[\"truncationMarker\"]}".into()),
            }],
            events: vec![EventRow {
                id: "evt-1".into(),
                session_id: "sess-1".into(),
                project_id: "proj-1".into(),
                start_at: "2026-05-12T13:10:00Z".into(),
                end_at: None,
                type_: "documentNote".into(),
                title: "Kickoff note".into(),
                summary: "Mori is local-first".into(),
                source_refs_json: "[\"src-1\"]".into(),
                linked_issue_ids_json: "[]".into(),
                linked_decision_ids_json: "[]".into(),
                relationship_ids_json: "[]".into(),
                artifact_ids_json: "[]".into(),
                trust_level: "verified".into(),
                confidence: 0.95,
                created_by: "import".into(),
                user_modified: 0,
                connector_event_id: None,
            }],
            issues: Vec::new(),
            decisions: Vec::new(),
            relationships: Vec::new(),
            artifacts: Vec::new(),
            next_actions: Vec::new(),
            summaries: Vec::new(),
        }
    }

    #[test]
    fn save_and_load_round_trip() {
        let mut conn = open_in_memory().expect("open db");
        apply_migrations(&mut conn).expect("apply migrations");

        let snapshot = fixture_snapshot();
        let saved = save_session_snapshot(&mut conn, &snapshot).expect("save snapshot");
        assert_eq!(saved.events_written, 1);
        assert_eq!(saved.sources_written, 1);

        let loaded = load_session_snapshot(&conn, "sess-1").expect("load snapshot");
        assert_eq!(loaded.sessions.len(), 1);
        assert_eq!(loaded.events.len(), 1);
        assert_eq!(loaded.events[0].id, "evt-1");
        assert_eq!(loaded.sources[0].title, "Kickoff");
        assert_eq!(loaded.projects[0].name, "Repo Test");
        // V005: the optional session grouping label survives the round trip.
        assert_eq!(
            loaded.sessions[0].source_label.as_deref(),
            Some("C:/dev/mori")
        );
        // V006: the optional source capture-fidelity JSON survives the round trip.
        assert_eq!(
            loaded.sources[0].capture_fidelity_json.as_deref(),
            Some("{\"level\":\"partial\",\"reasons\":[\"truncationMarker\"]}")
        );
    }

    #[test]
    fn replacing_an_existing_session_does_not_duplicate_events() {
        let mut conn = open_in_memory().expect("open db");
        apply_migrations(&mut conn).expect("apply migrations");

        let mut snapshot = fixture_snapshot();
        save_session_snapshot(&mut conn, &snapshot).expect("first save");

        // mutate then save again
        snapshot.events[0].summary = "edited summary".into();
        save_session_snapshot(&mut conn, &snapshot).expect("second save");

        let loaded = load_session_snapshot(&conn, "sess-1").expect("load");
        assert_eq!(loaded.events.len(), 1);
        assert_eq!(loaded.events[0].summary, "edited summary");

        let summary_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM events", [], |row| row.get(0))
            .expect("count events");
        assert_eq!(summary_count, 1);
    }

    #[test]
    fn preserves_connector_event_id_round_trip() {
        let mut conn = open_in_memory().expect("open db");
        apply_migrations(&mut conn).expect("apply migrations");

        let mut snapshot = fixture_snapshot();
        snapshot.events[0].connector_event_id =
            Some("claudeCodeHook::claude-2026-05-14::evt-001".into());
        save_session_snapshot(&mut conn, &snapshot).expect("save with identity");

        let loaded = load_session_snapshot(&conn, "sess-1").expect("load identity row");
        assert_eq!(
            loaded.events[0].connector_event_id.as_deref(),
            Some("claudeCodeHook::claude-2026-05-14::evt-001"),
        );
    }

    #[test]
    fn list_sessions_returns_event_and_source_counts() {
        let mut conn = open_in_memory().expect("open db");
        apply_migrations(&mut conn).expect("apply migrations");
        save_session_snapshot(&mut conn, &fixture_snapshot()).expect("save");

        let entries = list_sessions(&conn).expect("list");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].session_id, "sess-1");
        assert_eq!(entries[0].event_count, 1);
        assert_eq!(entries[0].source_count, 1);
        assert_eq!(entries[0].project_name, "Repo Test");
    }

    #[test]
    fn clear_all_data_empties_every_work_table() {
        let mut conn = open_in_memory().expect("open db");
        apply_migrations(&mut conn).expect("apply migrations");
        save_session_snapshot(&mut conn, &fixture_snapshot()).expect("save");

        let result = clear_all_data(&mut conn).expect("clear");
        assert_eq!(result.sessions_deleted, 1);
        assert_eq!(result.projects_deleted, 1);

        assert!(list_sessions(&conn).expect("list").is_empty());
        for table in [
            "sessions",
            "projects",
            "sources",
            "events",
            "issues",
            "decisions",
            "relationships",
            "artifacts",
            "next_actions",
            "summaries",
        ] {
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
                .expect("count");
            assert_eq!(count, 0, "table {table} should be empty after clear");
        }
    }

    #[test]
    fn clear_all_data_on_empty_db_is_a_noop() {
        let mut conn = open_in_memory().expect("open db");
        apply_migrations(&mut conn).expect("apply migrations");

        let result = clear_all_data(&mut conn).expect("clear empty");
        assert_eq!(result.sessions_deleted, 0);
        assert_eq!(result.projects_deleted, 0);
    }
}
