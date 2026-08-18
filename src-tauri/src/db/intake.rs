use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

/// One observed agent request, reduced from the agent's own transcript.
///
/// `row_json` holds the whole reduced row and is opaque here, following the
/// `*_json` convention of the other tables. The four columns beside it are
/// copies of fields inside it, present only because they are what the reads
/// filter and order by.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntakeRequestRow {
    pub id: String,
    pub session_key: String,
    pub project_path: String,
    pub started_at: String,
    pub row_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntakeWriteResult {
    pub rows_written: usize,
}

/// Upsert a batch of observed requests in one transaction.
///
/// Idempotent by id, because re-observing a request that is still running is
/// the normal case: the same id is written again with a later step count and a
/// changed status, and must replace rather than duplicate.
pub fn save_intake_requests(
    conn: &mut Connection,
    rows: &[IntakeRequestRow],
) -> Result<IntakeWriteResult, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    for row in rows {
        tx.execute(
            "INSERT OR REPLACE INTO intake_requests \
               (id, session_key, project_path, started_at, row_json) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                row.id,
                row.session_key,
                row.project_path,
                row.started_at,
                row.row_json,
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(IntakeWriteResult {
        rows_written: rows.len(),
    })
}

/// One session's requests, newest first.
pub fn list_intake_requests_for_session(
    conn: &Connection,
    session_key: &str,
) -> Result<Vec<IntakeRequestRow>, String> {
    query(
        conn,
        "SELECT id, session_key, project_path, started_at, row_json \
         FROM intake_requests WHERE session_key = ?1 \
         ORDER BY started_at DESC, id ASC",
        session_key,
    )
}

/// One project's requests, newest first.
///
/// The read the project projection is built from, and the reason this is a
/// table rather than a document per session: a document store would make this
/// a full scan and a deserialisation of every session.
pub fn list_intake_requests_for_project(
    conn: &Connection,
    project_path: &str,
) -> Result<Vec<IntakeRequestRow>, String> {
    query(
        conn,
        "SELECT id, session_key, project_path, started_at, row_json \
         FROM intake_requests WHERE project_path = ?1 \
         ORDER BY started_at DESC, id ASC",
        project_path,
    )
}

/// Every request, newest first.
///
/// Cross-session conflict detection cannot be done from inside one session, so
/// it reads the lot.
pub fn list_all_intake_requests(conn: &Connection) -> Result<Vec<IntakeRequestRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, session_key, project_path, started_at, row_json \
             FROM intake_requests ORDER BY started_at DESC, id ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], read_row)
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

/// Drop one session's requests. Returns how many rows went.
pub fn delete_intake_requests_for_session(
    conn: &Connection,
    session_key: &str,
) -> Result<usize, String> {
    conn.execute(
        "DELETE FROM intake_requests WHERE session_key = ?1",
        params![session_key],
    )
    .map_err(|error| error.to_string())
}

fn query(conn: &Connection, sql: &str, argument: &str) -> Result<Vec<IntakeRequestRow>, String> {
    let mut stmt = conn.prepare(sql).map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([argument], read_row)
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

fn read_row(row: &rusqlite::Row) -> rusqlite::Result<IntakeRequestRow> {
    Ok(IntakeRequestRow {
        id: row.get(0)?,
        session_key: row.get(1)?,
        project_path: row.get(2)?,
        started_at: row.get(3)?,
        row_json: row.get(4)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{apply_migrations, open_in_memory};

    fn connection() -> Connection {
        let mut conn = open_in_memory().expect("in-memory database");
        apply_migrations(&mut conn).expect("migrations");
        conn
    }

    fn row(id: &str, session: &str, project: &str, started: &str) -> IntakeRequestRow {
        IntakeRequestRow {
            id: id.to_string(),
            session_key: session.to_string(),
            project_path: project.to_string(),
            started_at: started.to_string(),
            row_json: format!("{{\"id\":\"{id}\"}}"),
        }
    }

    #[test]
    fn round_trips_a_request_by_session() {
        let mut conn = connection();
        save_intake_requests(
            &mut conn,
            &[row("req-1", "sess-1", "C:/dev/mori", "2026-08-18T00:00:00Z")],
        )
        .expect("save");

        let found = list_intake_requests_for_session(&conn, "sess-1").expect("list");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].row_json, "{\"id\":\"req-1\"}");
    }

    /// Re-observing a running request writes the same id again with a later
    /// step count. It must replace, not accumulate.
    #[test]
    fn re_observing_a_request_replaces_it() {
        let mut conn = connection();
        let mut first = row("req-1", "sess-1", "C:/dev/mori", "2026-08-18T00:00:00Z");
        first.row_json = "{\"steps\":2}".to_string();
        save_intake_requests(&mut conn, &[first]).expect("first");
        let mut second = row("req-1", "sess-1", "C:/dev/mori", "2026-08-18T00:00:00Z");
        second.row_json = "{\"steps\":9}".to_string();
        save_intake_requests(&mut conn, &[second]).expect("second");

        let found = list_intake_requests_for_session(&conn, "sess-1").expect("list");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].row_json, "{\"steps\":9}");
    }

    /// The read the project projection is built from, and the reason this is a
    /// table: it spans sessions and must not see other projects.
    #[test]
    fn lists_a_project_across_its_sessions_and_excludes_others() {
        let mut conn = connection();
        save_intake_requests(
            &mut conn,
            &[
                row("a", "sess-1", "C:/dev/mori", "2026-08-18T01:00:00Z"),
                row("b", "sess-2", "C:/dev/mori", "2026-08-18T02:00:00Z"),
                row("c", "sess-3", "C:/dev/other", "2026-08-18T03:00:00Z"),
            ],
        )
        .expect("save");

        let found = list_intake_requests_for_project(&conn, "C:/dev/mori").expect("list");
        assert_eq!(
            found.iter().map(|row| row.id.as_str()).collect::<Vec<_>>(),
            vec!["b", "a"]
        );
    }

    /// Windows paths carry spaces. An earlier version of this feature joined
    /// project and file into one key and split on a space, which broke on
    /// exactly these paths, so the column form is pinned.
    #[test]
    fn handles_a_project_path_with_spaces() {
        let mut conn = connection();
        let path = "C:/Users/Admin/My Projects/mori app";
        save_intake_requests(&mut conn, &[row("a", "sess-1", path, "2026-08-18T00:00:00Z")])
            .expect("save");

        assert_eq!(
            list_intake_requests_for_project(&conn, path)
                .expect("list")
                .len(),
            1
        );
    }

    #[test]
    fn lists_every_request_for_cross_session_reads() {
        let mut conn = connection();
        save_intake_requests(
            &mut conn,
            &[
                row("a", "sess-1", "C:/dev/mori", "2026-08-18T01:00:00Z"),
                row("b", "sess-2", "C:/dev/other", "2026-08-18T02:00:00Z"),
            ],
        )
        .expect("save");

        assert_eq!(list_all_intake_requests(&conn).expect("list").len(), 2);
    }

    #[test]
    fn deletes_one_session_and_leaves_the_rest() {
        let mut conn = connection();
        save_intake_requests(
            &mut conn,
            &[
                row("a", "sess-1", "C:/dev/mori", "2026-08-18T01:00:00Z"),
                row("b", "sess-2", "C:/dev/mori", "2026-08-18T02:00:00Z"),
            ],
        )
        .expect("save");

        assert_eq!(
            delete_intake_requests_for_session(&conn, "sess-1").expect("delete"),
            1
        );
        assert_eq!(list_all_intake_requests(&conn).expect("list").len(), 1);
    }
}
