use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

/// Row mirror of the frontend `StoredSessionImport`. Object and array
/// fields arrive pre-serialised as JSON strings (`*_json`); this layer
/// treats them as opaque text and never parses them — the TypeScript
/// bridge owns (de)serialisation. `import_summary_json` is `None` for
/// imports with no connector re-import summary.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SessionImportRow {
    pub id: String,
    pub session_id: String,
    pub source_json: String,
    pub events_json: String,
    pub saved_at: String,
    pub import_summary_json: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionImportWriteResult {
    pub imports_written: usize,
}

/// Upsert a batch of session imports. Idempotent — re-saving an id
/// replaces the prior row, matching the browser adapter.
pub fn save_session_imports(
    conn: &mut Connection,
    imports: &[SessionImportRow],
) -> Result<SessionImportWriteResult, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    for import in imports {
        tx.execute(
            "INSERT OR REPLACE INTO session_imports (\
                id, session_id, source_json, events_json, saved_at, import_summary_json\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                import.id,
                import.session_id,
                import.source_json,
                import.events_json,
                import.saved_at,
                import.import_summary_json,
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(SessionImportWriteResult {
        imports_written: imports.len(),
    })
}

/// List session imports for a session, newest save first.
pub fn list_session_imports(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<SessionImportRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, source_json, events_json, saved_at, import_summary_json \
             FROM session_imports WHERE session_id = ?1 \
             ORDER BY saved_at DESC, id ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([session_id], |row| {
            Ok(SessionImportRow {
                id: row.get(0)?,
                session_id: row.get(1)?,
                source_json: row.get(2)?,
                events_json: row.get(3)?,
                saved_at: row.get(4)?,
                import_summary_json: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

/// List every session import across all sessions, newest save first.
///
/// Used to build cross-session connector identity snapshots so the
/// re-import rollup can see desktop-saved sessions, the same way the
/// browser adapter walks every localStorage session.
pub fn list_all_session_imports(conn: &Connection) -> Result<Vec<SessionImportRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, source_json, events_json, saved_at, import_summary_json \
             FROM session_imports ORDER BY saved_at DESC, id ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SessionImportRow {
                id: row.get(0)?,
                session_id: row.get(1)?,
                source_json: row.get(2)?,
                events_json: row.get(3)?,
                saved_at: row.get(4)?,
                import_summary_json: row.get(5)?,
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

    fn import(id: &str, session: &str, saved_at: &str) -> SessionImportRow {
        SessionImportRow {
            id: id.to_string(),
            session_id: session.to_string(),
            source_json: "{\"id\":\"src-1\",\"kind\":\"connectorJsonl\"}".to_string(),
            events_json: "[{\"id\":\"evt-1\"}]".to_string(),
            saved_at: saved_at.to_string(),
            import_summary_json: None,
        }
    }

    #[test]
    fn saves_and_lists_session_imports_by_session() {
        let mut conn = open_in_memory().expect("open");
        apply_migrations(&mut conn).expect("migrate");

        save_session_imports(
            &mut conn,
            &[
                import("imp-old", "s-1", "2026-05-10T08:00:00Z"),
                import("imp-new", "s-1", "2026-05-14T12:00:00Z"),
                import("imp-other", "s-2", "2026-05-14T12:00:00Z"),
            ],
        )
        .expect("save");

        let s1 = list_session_imports(&conn, "s-1").expect("list s-1");
        assert_eq!(s1.len(), 2);
        // Newest save first.
        assert_eq!(s1[0].id, "imp-new");
        assert_eq!(s1[1].id, "imp-old");

        let s2 = list_session_imports(&conn, "s-2").expect("list s-2");
        assert_eq!(s2.len(), 1);
        assert_eq!(s2[0].id, "imp-other");
    }

    #[test]
    fn round_trips_an_import_summary_and_upserts_by_id() {
        let mut conn = open_in_memory().expect("open");
        apply_migrations(&mut conn).expect("migrate");

        let mut with_summary = import("imp-1", "s-1", "2026-05-12T10:00:00Z");
        with_summary.import_summary_json =
            Some("{\"status\":\"partialReimport\",\"newEventCount\":3}".to_string());
        save_session_imports(&mut conn, &[with_summary]).expect("first save");

        let mut updated = import("imp-1", "s-1", "2026-05-12T10:00:00Z");
        updated.saved_at = "2026-05-13T10:00:00Z".to_string();
        save_session_imports(&mut conn, &[updated]).expect("second save");

        let rows = list_session_imports(&conn, "s-1").expect("list");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].saved_at, "2026-05-13T10:00:00Z");
        // The upsert replaced the row, so the summary is cleared.
        assert_eq!(rows[0].import_summary_json, None);
    }

    #[test]
    fn list_is_empty_for_an_unknown_session() {
        let mut conn = open_in_memory().expect("open");
        apply_migrations(&mut conn).expect("migrate");
        assert!(list_session_imports(&conn, "missing").expect("list").is_empty());
    }

    #[test]
    fn lists_every_session_import_across_sessions() {
        let mut conn = open_in_memory().expect("open");
        apply_migrations(&mut conn).expect("migrate");

        save_session_imports(
            &mut conn,
            &[
                import("imp-a", "s-1", "2026-05-10T08:00:00Z"),
                import("imp-b", "s-2", "2026-05-14T12:00:00Z"),
            ],
        )
        .expect("save");

        let all = list_all_session_imports(&conn).expect("list all");
        assert_eq!(all.len(), 2);
        // Newest save first, regardless of session.
        assert_eq!(all[0].id, "imp-b");
        assert_eq!(all[1].id, "imp-a");
    }
}
