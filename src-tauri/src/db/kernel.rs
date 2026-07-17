use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// Row mirror of the frontend `MoriRecord`. `context_ids_json` and
/// `properties_json` arrive pre-serialised; this layer stores them as opaque
/// text, the TypeScript bridge owns (de)serialisation.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct KernelRecordRow {
    pub id: String,
    pub schema_id: String,
    pub title: String,
    pub body: String,
    pub occurred_start: Option<String>,
    pub occurred_end: Option<String>,
    pub source_created_at: Option<String>,
    pub captured_at: String,
    pub time_basis: String,
    pub time_confidence: Option<f64>,
    pub status: String,
    pub origin: String,
    pub ownership: String,
    pub context_ids_json: String,
    pub properties_json: String,
    pub created_at: String,
    pub updated_at: String,
}

/// One entry of a small kernel collection (contexts, entities, aliases,
/// relations, sources, source links, derivations, rules, user schemas):
/// keyed JSON until a real query need promotes the collection to columns.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct KernelObjectRow {
    pub collection: String,
    pub id: String,
    pub payload_json: String,
    pub saved_at: String,
}

/// Append-only change history row. Never updated, never deleted: revisions
/// outlive their record so history survives a record deletion.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct KernelRevisionRow {
    pub id: String,
    pub record_id: String,
    pub actor: String,
    pub operation: String,
    pub before_json: Option<String>,
    pub after_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelWriteResult {
    pub rows_written: usize,
}

/// The collections `kernel_objects` accepts. Mirrors the browser store's
/// key prefixes; an unknown name is a caller bug, not new data.
pub const KERNEL_OBJECT_COLLECTIONS: &[&str] = &[
    "reading",
    "context",
    "entity",
    "entityAliases",
    "relation",
    "source",
    "sourceLink",
    "derivation",
    "rule",
    "userSchema",
];

fn validate_collection(collection: &str) -> Result<(), String> {
    if KERNEL_OBJECT_COLLECTIONS.contains(&collection) {
        Ok(())
    } else {
        Err(format!("unknown kernel collection \"{collection}\""))
    }
}

/// Upsert a batch of kernel records. Uses ON CONFLICT DO UPDATE (never
/// INSERT OR REPLACE) so the FTS UPDATE trigger keeps the index in sync.
pub fn save_kernel_records(
    conn: &mut Connection,
    rows: &[KernelRecordRow],
) -> Result<KernelWriteResult, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    for row in rows {
        tx.execute(
            "INSERT INTO kernel_records (\
                id, schema_id, title, body, occurred_start, occurred_end, \
                source_created_at, captured_at, time_basis, time_confidence, \
                status, origin, ownership, context_ids_json, properties_json, \
                created_at, updated_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)\
             ON CONFLICT(id) DO UPDATE SET \
                schema_id = excluded.schema_id, \
                title = excluded.title, \
                body = excluded.body, \
                occurred_start = excluded.occurred_start, \
                occurred_end = excluded.occurred_end, \
                source_created_at = excluded.source_created_at, \
                captured_at = excluded.captured_at, \
                time_basis = excluded.time_basis, \
                time_confidence = excluded.time_confidence, \
                status = excluded.status, \
                origin = excluded.origin, \
                ownership = excluded.ownership, \
                context_ids_json = excluded.context_ids_json, \
                properties_json = excluded.properties_json, \
                created_at = excluded.created_at, \
                updated_at = excluded.updated_at",
            params![
                row.id,
                row.schema_id,
                row.title,
                row.body,
                row.occurred_start,
                row.occurred_end,
                row.source_created_at,
                row.captured_at,
                row.time_basis,
                row.time_confidence,
                row.status,
                row.origin,
                row.ownership,
                row.context_ids_json,
                row.properties_json,
                row.created_at,
                row.updated_at,
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(KernelWriteResult {
        rows_written: rows.len(),
    })
}

const RECORD_COLUMNS: &str = "id, schema_id, title, body, occurred_start, occurred_end, \
    source_created_at, captured_at, time_basis, time_confidence, status, origin, ownership, \
    context_ids_json, properties_json, created_at, updated_at";

fn record_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<KernelRecordRow> {
    Ok(KernelRecordRow {
        id: row.get(0)?,
        schema_id: row.get(1)?,
        title: row.get(2)?,
        body: row.get(3)?,
        occurred_start: row.get(4)?,
        occurred_end: row.get(5)?,
        source_created_at: row.get(6)?,
        captured_at: row.get(7)?,
        time_basis: row.get(8)?,
        time_confidence: row.get(9)?,
        status: row.get(10)?,
        origin: row.get(11)?,
        ownership: row.get(12)?,
        context_ids_json: row.get(13)?,
        properties_json: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

pub fn list_kernel_records(conn: &Connection) -> Result<Vec<KernelRecordRow>, String> {
    let sql = format!("SELECT {RECORD_COLUMNS} FROM kernel_records ORDER BY captured_at DESC");
    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], record_from_row)
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

pub fn get_kernel_record(conn: &Connection, id: &str) -> Result<Option<KernelRecordRow>, String> {
    let sql = format!("SELECT {RECORD_COLUMNS} FROM kernel_records WHERE id = ?1");
    conn.query_row(&sql, [id], record_from_row)
        .optional()
        .map_err(|error| error.to_string())
}

/// Deletes the record row. Revisions are intentionally left in place: the
/// change history is append-only and outlives the record.
pub fn delete_kernel_record(conn: &mut Connection, id: &str) -> Result<usize, String> {
    conn.execute("DELETE FROM kernel_records WHERE id = ?1", [id])
        .map_err(|error| error.to_string())
}

/// Escape free text into an FTS5 MATCH expression: each whitespace token is
/// double-quoted (embedded quotes doubled), tokens AND-combined. Keeps user
/// input from being parsed as FTS syntax.
fn fts_match_expression(query: &str) -> Option<String> {
    let tokens: Vec<String> = query
        .split_whitespace()
        .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
        .collect();
    if tokens.is_empty() {
        None
    } else {
        Some(tokens.join(" "))
    }
}

pub fn search_kernel_records(
    conn: &Connection,
    query: &str,
    limit: i64,
) -> Result<Vec<KernelRecordRow>, String> {
    let Some(expression) = fts_match_expression(query) else {
        return Ok(Vec::new());
    };
    let sql = format!(
        "SELECT {} FROM kernel_records r \
         JOIN kernel_records_fts f ON r.rowid = f.rowid \
         WHERE kernel_records_fts MATCH ?1 \
         ORDER BY rank LIMIT ?2",
        RECORD_COLUMNS
            .split(", ")
            .map(|column| format!("r.{column}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![expression, limit], record_from_row)
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

pub fn save_kernel_objects(
    conn: &mut Connection,
    rows: &[KernelObjectRow],
) -> Result<KernelWriteResult, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    for row in rows {
        validate_collection(&row.collection)?;
        tx.execute(
            "INSERT INTO kernel_objects (collection, id, payload_json, saved_at) \
             VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT(collection, id) DO UPDATE SET \
                payload_json = excluded.payload_json, \
                saved_at = excluded.saved_at",
            params![row.collection, row.id, row.payload_json, row.saved_at],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(KernelWriteResult {
        rows_written: rows.len(),
    })
}

pub fn list_kernel_objects(
    conn: &Connection,
    collection: &str,
) -> Result<Vec<KernelObjectRow>, String> {
    validate_collection(collection)?;
    let mut stmt = conn
        .prepare(
            "SELECT collection, id, payload_json, saved_at FROM kernel_objects \
             WHERE collection = ?1 ORDER BY id",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([collection], |row| {
            Ok(KernelObjectRow {
                collection: row.get(0)?,
                id: row.get(1)?,
                payload_json: row.get(2)?,
                saved_at: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

pub fn delete_kernel_object(
    conn: &mut Connection,
    collection: &str,
    id: &str,
) -> Result<usize, String> {
    validate_collection(collection)?;
    conn.execute(
        "DELETE FROM kernel_objects WHERE collection = ?1 AND id = ?2",
        params![collection, id],
    )
    .map_err(|error| error.to_string())
}

/// Insert-only: a revision id that already exists is a caller bug and errors
/// rather than silently rewriting history.
pub fn append_kernel_revisions(
    conn: &mut Connection,
    rows: &[KernelRevisionRow],
) -> Result<KernelWriteResult, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    for row in rows {
        tx.execute(
            "INSERT INTO kernel_revisions (\
                id, record_id, actor, operation, before_json, after_json, created_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                row.id,
                row.record_id,
                row.actor,
                row.operation,
                row.before_json,
                row.after_json,
                row.created_at,
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(KernelWriteResult {
        rows_written: rows.len(),
    })
}

pub fn list_kernel_revisions(
    conn: &Connection,
    record_id: &str,
) -> Result<Vec<KernelRevisionRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, record_id, actor, operation, before_json, after_json, created_at \
             FROM kernel_revisions WHERE record_id = ?1 ORDER BY created_at, id",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([record_id], |row| {
            Ok(KernelRevisionRow {
                id: row.get(0)?,
                record_id: row.get(1)?,
                actor: row.get(2)?,
                operation: row.get(3)?,
                before_json: row.get(4)?,
                after_json: row.get(5)?,
                created_at: row.get(6)?,
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
    use crate::db::migrations::apply_migrations;
    use crate::db::open_in_memory;

    fn kernel_conn() -> Connection {
        let mut conn = open_in_memory().expect("open in-memory db");
        apply_migrations(&mut conn).expect("apply migrations");
        conn
    }

    fn sample_record(id: &str, title: &str, body: &str) -> KernelRecordRow {
        KernelRecordRow {
            id: id.to_string(),
            schema_id: "note".to_string(),
            title: title.to_string(),
            body: body.to_string(),
            occurred_start: None,
            occurred_end: None,
            source_created_at: None,
            captured_at: "2026-07-14T09:00:00Z".to_string(),
            time_basis: "unknown".to_string(),
            time_confidence: None,
            status: "active".to_string(),
            origin: "user".to_string(),
            ownership: "db".to_string(),
            context_ids_json: "[]".to_string(),
            properties_json: "{}".to_string(),
            created_at: "2026-07-14T09:00:00Z".to_string(),
            updated_at: "2026-07-14T09:00:00Z".to_string(),
        }
    }

    #[test]
    fn round_trips_records() {
        let mut conn = kernel_conn();
        let record = sample_record("rec-1", "메모", "오늘 운동 러닝 10분");
        save_kernel_records(&mut conn, &[record.clone()]).expect("save");
        let listed = list_kernel_records(&conn).expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "메모");
        let fetched = get_kernel_record(&conn, "rec-1").expect("get");
        assert_eq!(fetched.expect("present").body, record.body);
        assert!(get_kernel_record(&conn, "rec-2").expect("get missing").is_none());
    }

    #[test]
    fn upsert_replaces_and_fts_follows() {
        let mut conn = kernel_conn();
        save_kernel_records(&mut conn, &[sample_record("rec-1", "메모", "러닝 기록")])
            .expect("save");
        let hits = search_kernel_records(&conn, "러닝", 10).expect("search");
        assert_eq!(hits.len(), 1);

        save_kernel_records(&mut conn, &[sample_record("rec-1", "메모", "독서 기록")])
            .expect("update");
        assert!(search_kernel_records(&conn, "러닝", 10).expect("search").is_empty());
        let hits = search_kernel_records(&conn, "독서", 10).expect("search");
        assert_eq!(hits.len(), 1);
        assert_eq!(list_kernel_records(&conn).expect("list").len(), 1);
    }

    #[test]
    fn delete_removes_record_and_search_hit() {
        let mut conn = kernel_conn();
        save_kernel_records(&mut conn, &[sample_record("rec-1", "메모", "러닝 기록")])
            .expect("save");
        let deleted = delete_kernel_record(&mut conn, "rec-1").expect("delete");
        assert_eq!(deleted, 1);
        assert!(list_kernel_records(&conn).expect("list").is_empty());
        assert!(search_kernel_records(&conn, "러닝", 10).expect("search").is_empty());
    }

    #[test]
    fn search_treats_input_as_text_not_fts_syntax() {
        let mut conn = kernel_conn();
        save_kernel_records(&mut conn, &[sample_record("rec-1", "메모", "러닝 기록")])
            .expect("save");
        // Raw FTS operators in user input must not error or match everything.
        let hits = search_kernel_records(&conn, "러닝 AND \"", 10).expect("search");
        assert!(hits.is_empty());
        assert!(search_kernel_records(&conn, "   ", 10).expect("blank").is_empty());
    }

    #[test]
    fn round_trips_objects_and_rejects_unknown_collections() {
        let mut conn = kernel_conn();
        let object = KernelObjectRow {
            collection: "context".to_string(),
            id: "ctx-1".to_string(),
            payload_json: "{\"name\":\"mori\"}".to_string(),
            saved_at: "2026-07-14T09:00:00Z".to_string(),
        };
        save_kernel_objects(&mut conn, &[object.clone()]).expect("save");
        let listed = list_kernel_objects(&conn, "context").expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].payload_json, object.payload_json);

        let bad = KernelObjectRow {
            collection: "no-such".to_string(),
            ..object.clone()
        };
        assert!(save_kernel_objects(&mut conn, &[bad]).is_err());
        assert!(list_kernel_objects(&conn, "no-such").is_err());

        delete_kernel_object(&mut conn, "context", "ctx-1").expect("delete");
        assert!(list_kernel_objects(&conn, "context").expect("list").is_empty());
    }

    #[test]
    fn revisions_are_append_only_and_ordered() {
        let mut conn = kernel_conn();
        let revision = |id: &str, created_at: &str| KernelRevisionRow {
            id: id.to_string(),
            record_id: "rec-1".to_string(),
            actor: "user".to_string(),
            operation: "update".to_string(),
            before_json: None,
            after_json: None,
            created_at: created_at.to_string(),
        };
        append_kernel_revisions(
            &mut conn,
            &[revision("rev-b", "2026-07-14T10:00:00Z"), revision("rev-a", "2026-07-14T09:00:00Z")],
        )
        .expect("append");
        let listed = list_kernel_revisions(&conn, "rec-1").expect("list");
        assert_eq!(
            listed.iter().map(|row| row.id.as_str()).collect::<Vec<_>>(),
            vec!["rev-a", "rev-b"]
        );
        // Re-appending an existing revision id is a bug, not a rewrite.
        assert!(append_kernel_revisions(&mut conn, &[revision("rev-a", "2026-07-14T09:00:00Z")]).is_err());
    }
}
