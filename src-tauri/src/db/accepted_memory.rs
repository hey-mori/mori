use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

/// Row mirror of the frontend `StoredAcceptedProjectMemory`. Object and
/// array fields arrive pre-serialised as JSON strings (`*_json`); this
/// layer treats them as opaque text and never parses them — the
/// TypeScript bridge owns (de)serialisation.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AcceptedMemoryRow {
    pub id: String,
    pub project_id: String,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub status: String,
    pub importance: String,
    pub confidence_label: String,
    pub confidence_score: Option<f64>,
    pub confidence_rationale: Option<String>,
    pub evidence_refs_json: String,
    pub source_session_ids_json: String,
    pub origin_proposal_ids_json: String,
    pub related_issue_ids_json: String,
    pub related_decision_ids_json: String,
    pub proposed_action: String,
    pub review_note: Option<String>,
    pub sensitivity: String,
    pub resume_eligible: i64,
    pub report_eligibility: String,
    pub superseded_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub accepted_at: String,
    pub accepted_by: String,
    pub review_action_ids_json: String,
    pub schema_version: i64,
}

/// Row mirror of the frontend `StoredMemoryReviewAction`. `before` /
/// `after` arrive pre-serialised as JSON strings and are stored opaquely.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MemoryReviewActionRow {
    pub id: String,
    pub project_id: String,
    pub action_type: String,
    pub actor: String,
    pub timestamp: String,
    pub source_proposal_id: Option<String>,
    pub target_memory_ids_json: String,
    pub before_json: Option<String>,
    pub after_json: Option<String>,
    pub note: Option<String>,
    pub reversible: i64,
    pub schema_version: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptedMemoryWriteResult {
    pub memories_written: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryReviewActionWriteResult {
    pub actions_written: usize,
}

/// Upsert a batch of accepted project memories. Idempotent — re-saving an
/// id replaces the prior row, matching the browser adapter.
pub fn save_accepted_memories(
    conn: &mut Connection,
    memories: &[AcceptedMemoryRow],
) -> Result<AcceptedMemoryWriteResult, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    for memory in memories {
        tx.execute(
            "INSERT OR REPLACE INTO consolidated_memories (\
                id, project_id, kind, title, summary, status, importance, \
                confidence_label, confidence_score, confidence_rationale, \
                evidence_refs_json, source_session_ids_json, origin_proposal_ids_json, \
                related_issue_ids_json, related_decision_ids_json, proposed_action, \
                review_note, sensitivity, resume_eligible, report_eligibility, \
                superseded_by, created_at, updated_at, accepted_at, accepted_by, \
                review_action_ids_json, schema_version\
             ) VALUES (\
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, \
                ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27\
             )",
            params![
                memory.id,
                memory.project_id,
                memory.kind,
                memory.title,
                memory.summary,
                memory.status,
                memory.importance,
                memory.confidence_label,
                memory.confidence_score,
                memory.confidence_rationale,
                memory.evidence_refs_json,
                memory.source_session_ids_json,
                memory.origin_proposal_ids_json,
                memory.related_issue_ids_json,
                memory.related_decision_ids_json,
                memory.proposed_action,
                memory.review_note,
                memory.sensitivity,
                memory.resume_eligible,
                memory.report_eligibility,
                memory.superseded_by,
                memory.created_at,
                memory.updated_at,
                memory.accepted_at,
                memory.accepted_by,
                memory.review_action_ids_json,
                memory.schema_version,
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(AcceptedMemoryWriteResult {
        memories_written: memories.len(),
    })
}

/// List accepted project memories for a project, newest acceptance first.
pub fn list_accepted_memories(
    conn: &Connection,
    project_id: &str,
) -> Result<Vec<AcceptedMemoryRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, kind, title, summary, status, importance, \
                confidence_label, confidence_score, confidence_rationale, \
                evidence_refs_json, source_session_ids_json, origin_proposal_ids_json, \
                related_issue_ids_json, related_decision_ids_json, proposed_action, \
                review_note, sensitivity, resume_eligible, report_eligibility, \
                superseded_by, created_at, updated_at, accepted_at, accepted_by, \
                review_action_ids_json, schema_version \
             FROM consolidated_memories WHERE project_id = ?1 \
             ORDER BY accepted_at DESC, id ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([project_id], |row| {
            Ok(AcceptedMemoryRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                kind: row.get(2)?,
                title: row.get(3)?,
                summary: row.get(4)?,
                status: row.get(5)?,
                importance: row.get(6)?,
                confidence_label: row.get(7)?,
                confidence_score: row.get(8)?,
                confidence_rationale: row.get(9)?,
                evidence_refs_json: row.get(10)?,
                source_session_ids_json: row.get(11)?,
                origin_proposal_ids_json: row.get(12)?,
                related_issue_ids_json: row.get(13)?,
                related_decision_ids_json: row.get(14)?,
                proposed_action: row.get(15)?,
                review_note: row.get(16)?,
                sensitivity: row.get(17)?,
                resume_eligible: row.get(18)?,
                report_eligibility: row.get(19)?,
                superseded_by: row.get(20)?,
                created_at: row.get(21)?,
                updated_at: row.get(22)?,
                accepted_at: row.get(23)?,
                accepted_by: row.get(24)?,
                review_action_ids_json: row.get(25)?,
                schema_version: row.get(26)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

/// List accepted memories across every project, newest acceptance first.
/// Powers cross-project recall (global memory search, the 메모리 surface);
/// per-project reads stay on `list_accepted_memories`.
pub fn list_all_accepted_memories(conn: &Connection) -> Result<Vec<AcceptedMemoryRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, kind, title, summary, status, importance, \
                confidence_label, confidence_score, confidence_rationale, \
                evidence_refs_json, source_session_ids_json, origin_proposal_ids_json, \
                related_issue_ids_json, related_decision_ids_json, proposed_action, \
                review_note, sensitivity, resume_eligible, report_eligibility, \
                superseded_by, created_at, updated_at, accepted_at, accepted_by, \
                review_action_ids_json, schema_version \
             FROM consolidated_memories \
             ORDER BY accepted_at DESC, id ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(AcceptedMemoryRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                kind: row.get(2)?,
                title: row.get(3)?,
                summary: row.get(4)?,
                status: row.get(5)?,
                importance: row.get(6)?,
                confidence_label: row.get(7)?,
                confidence_score: row.get(8)?,
                confidence_rationale: row.get(9)?,
                evidence_refs_json: row.get(10)?,
                source_session_ids_json: row.get(11)?,
                origin_proposal_ids_json: row.get(12)?,
                related_issue_ids_json: row.get(13)?,
                related_decision_ids_json: row.get(14)?,
                proposed_action: row.get(15)?,
                review_note: row.get(16)?,
                sensitivity: row.get(17)?,
                resume_eligible: row.get(18)?,
                report_eligibility: row.get(19)?,
                superseded_by: row.get(20)?,
                created_at: row.get(21)?,
                updated_at: row.get(22)?,
                accepted_at: row.get(23)?,
                accepted_by: row.get(24)?,
                review_action_ids_json: row.get(25)?,
                schema_version: row.get(26)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

/// Append memory review-action audit rows. Append-only; an id collision
/// replaces the prior row so re-applying a pass is idempotent.
pub fn append_memory_review_actions(
    conn: &mut Connection,
    actions: &[MemoryReviewActionRow],
) -> Result<MemoryReviewActionWriteResult, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    for action in actions {
        tx.execute(
            "INSERT OR REPLACE INTO consolidated_memory_audit (\
                id, project_id, action_type, actor, timestamp, source_proposal_id, \
                target_memory_ids_json, before_json, after_json, note, reversible, \
                schema_version\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                action.id,
                action.project_id,
                action.action_type,
                action.actor,
                action.timestamp,
                action.source_proposal_id,
                action.target_memory_ids_json,
                action.before_json,
                action.after_json,
                action.note,
                action.reversible,
                action.schema_version,
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(MemoryReviewActionWriteResult {
        actions_written: actions.len(),
    })
}

/// List memory review actions for a project, newest first.
pub fn list_memory_review_actions(
    conn: &Connection,
    project_id: &str,
) -> Result<Vec<MemoryReviewActionRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, action_type, actor, timestamp, source_proposal_id, \
                target_memory_ids_json, before_json, after_json, note, reversible, \
                schema_version \
             FROM consolidated_memory_audit WHERE project_id = ?1 \
             ORDER BY timestamp DESC, id ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([project_id], |row| {
            Ok(MemoryReviewActionRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                action_type: row.get(2)?,
                actor: row.get(3)?,
                timestamp: row.get(4)?,
                source_proposal_id: row.get(5)?,
                target_memory_ids_json: row.get(6)?,
                before_json: row.get(7)?,
                after_json: row.get(8)?,
                note: row.get(9)?,
                reversible: row.get(10)?,
                schema_version: row.get(11)?,
            })
        })
        .map_err(|error| error.to_string())?;
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

    fn memory(id: &str, project: &str, accepted_at: &str) -> AcceptedMemoryRow {
        AcceptedMemoryRow {
            id: id.to_string(),
            project_id: project.to_string(),
            kind: "promotedDecision".to_string(),
            title: "Keep Import Review as a gate".to_string(),
            summary: "Every captured event passes through Import Review.".to_string(),
            status: "accepted".to_string(),
            importance: "high".to_string(),
            confidence_label: "high".to_string(),
            confidence_score: Some(0.9),
            confidence_rationale: None,
            evidence_refs_json: "[]".to_string(),
            source_session_ids_json: "[\"s-1\"]".to_string(),
            origin_proposal_ids_json: "[\"prop-1\"]".to_string(),
            related_issue_ids_json: "[]".to_string(),
            related_decision_ids_json: "[]".to_string(),
            proposed_action: "promote".to_string(),
            review_note: None,
            sensitivity: "normal".to_string(),
            resume_eligible: 1,
            report_eligibility: "personal".to_string(),
            superseded_by: None,
            created_at: "2026-05-10T10:00:00Z".to_string(),
            updated_at: "2026-05-12T10:00:00Z".to_string(),
            accepted_at: accepted_at.to_string(),
            accepted_by: "local-user".to_string(),
            review_action_ids_json: "[\"act-1\"]".to_string(),
            schema_version: 1,
        }
    }

    fn action(id: &str, project: &str, timestamp: &str) -> MemoryReviewActionRow {
        MemoryReviewActionRow {
            id: id.to_string(),
            project_id: project.to_string(),
            action_type: "accept".to_string(),
            actor: "local-user".to_string(),
            timestamp: timestamp.to_string(),
            source_proposal_id: Some("prop-1".to_string()),
            target_memory_ids_json: "[\"mem-1\"]".to_string(),
            before_json: None,
            after_json: Some("{\"title\":\"x\"}".to_string()),
            note: Some("reviewer note".to_string()),
            reversible: 1,
            schema_version: 1,
        }
    }

    #[test]
    fn saves_and_lists_accepted_memories_by_project() {
        let mut conn = open_in_memory().expect("open");
        apply_migrations(&mut conn).expect("migrate");

        save_accepted_memories(
            &mut conn,
            &[
                memory("mem-1", "p-1", "2026-05-12T10:00:00Z"),
                memory("mem-2", "p-1", "2026-05-13T10:00:00Z"),
                memory("mem-3", "p-2", "2026-05-13T10:00:00Z"),
            ],
        )
        .expect("save");

        let p1 = list_accepted_memories(&conn, "p-1").expect("list p-1");
        assert_eq!(p1.len(), 2);
        // Newest acceptance first.
        assert_eq!(p1[0].id, "mem-2");
        assert_eq!(p1[1].id, "mem-1");

        let p2 = list_accepted_memories(&conn, "p-2").expect("list p-2");
        assert_eq!(p2.len(), 1);
        assert_eq!(p2[0].id, "mem-3");
    }

    #[test]
    fn lists_all_accepted_memories_across_projects_newest_first() {
        let mut conn = open_in_memory().expect("open");
        apply_migrations(&mut conn).expect("migrate");

        save_accepted_memories(
            &mut conn,
            &[
                memory("mem-1", "p-1", "2026-05-12T10:00:00Z"),
                memory("mem-2", "p-1", "2026-05-13T10:00:00Z"),
                memory("mem-3", "p-2", "2026-05-14T10:00:00Z"),
            ],
        )
        .expect("save");

        let all = list_all_accepted_memories(&conn).expect("list all");
        assert_eq!(all.len(), 3);
        // Newest acceptance first, regardless of project.
        assert_eq!(all[0].id, "mem-3");
        assert_eq!(all[0].project_id, "p-2");
        assert_eq!(all[1].id, "mem-2");
        assert_eq!(all[2].id, "mem-1");

        let empty = open_in_memory().expect("open empty");
        let mut empty = empty;
        apply_migrations(&mut empty).expect("migrate empty");
        assert!(list_all_accepted_memories(&empty).expect("list empty").is_empty());
    }

    #[test]
    fn upserts_an_accepted_memory_by_id() {
        let mut conn = open_in_memory().expect("open");
        apply_migrations(&mut conn).expect("migrate");

        save_accepted_memories(&mut conn, &[memory("mem-1", "p-1", "2026-05-12T10:00:00Z")])
            .expect("first save");
        let mut updated = memory("mem-1", "p-1", "2026-05-12T10:00:00Z");
        updated.status = "edited".to_string();
        updated.title = "Edited title".to_string();
        save_accepted_memories(&mut conn, &[updated]).expect("second save");

        let rows = list_accepted_memories(&conn, "p-1").expect("list");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].status, "edited");
        assert_eq!(rows[0].title, "Edited title");
    }

    #[test]
    fn preserves_optional_fields_through_a_round_trip() {
        let mut conn = open_in_memory().expect("open");
        apply_migrations(&mut conn).expect("migrate");

        let mut row = memory("mem-opt", "p-1", "2026-05-12T10:00:00Z");
        row.confidence_score = None;
        row.confidence_rationale = Some("derived from two sessions".to_string());
        row.review_note = Some("looks durable".to_string());
        row.superseded_by = Some("mem-newer".to_string());
        save_accepted_memories(&mut conn, &[row]).expect("save");

        let rows = list_accepted_memories(&conn, "p-1").expect("list");
        assert_eq!(rows[0].confidence_score, None);
        assert_eq!(rows[0].confidence_rationale.as_deref(), Some("derived from two sessions"));
        assert_eq!(rows[0].review_note.as_deref(), Some("looks durable"));
        assert_eq!(rows[0].superseded_by.as_deref(), Some("mem-newer"));
    }

    #[test]
    fn appends_and_lists_review_actions_newest_first() {
        let mut conn = open_in_memory().expect("open");
        apply_migrations(&mut conn).expect("migrate");

        append_memory_review_actions(
            &mut conn,
            &[
                action("act-old", "p-1", "2026-05-10T08:00:00Z"),
                action("act-new", "p-1", "2026-05-14T12:00:00Z"),
                action("act-other", "p-2", "2026-05-14T12:00:00Z"),
            ],
        )
        .expect("append");

        let p1 = list_memory_review_actions(&conn, "p-1").expect("list p-1");
        assert_eq!(p1.len(), 2);
        assert_eq!(p1[0].id, "act-new");
        assert_eq!(p1[1].id, "act-old");
        assert_eq!(p1[0].note.as_deref(), Some("reviewer note"));
        assert_eq!(p1[0].before_json, None);
        assert_eq!(p1[0].after_json.as_deref(), Some("{\"title\":\"x\"}"));

        let p2 = list_memory_review_actions(&conn, "p-2").expect("list p-2");
        assert_eq!(p2.len(), 1);
    }

    #[test]
    fn lists_are_empty_for_an_unknown_project() {
        let mut conn = open_in_memory().expect("open");
        apply_migrations(&mut conn).expect("migrate");
        assert!(list_accepted_memories(&conn, "missing").expect("list").is_empty());
        assert!(list_memory_review_actions(&conn, "missing").expect("list").is_empty());
    }
}
