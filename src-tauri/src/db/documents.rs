use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// One durable document: a whole JSON body owned by one id, of one kind.
///
/// `body_json` is opaque here, following the `*_json` convention of the other
/// tables. This layer never parses it, so a body shape can change without a
/// Rust edit; the TypeScript bridge owns (de)serialisation. `schema_version`
/// is carried as a column so a loader can reject an unknown major without
/// parsing the body first.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableDocumentRow {
    pub kind: String,
    pub owner_id: String,
    pub schema_version: i64,
    pub body_json: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableDocumentWriteResult {
    pub documents_written: usize,
}

/// Upsert a batch of documents in one transaction.
///
/// Idempotent: re-saving a (kind, owner_id) replaces the prior row, matching
/// the browser adapter, where writing a key overwrites it. Batched under one
/// transaction so an adoption pass that dies half way leaves either the whole
/// batch or none of it, which is what makes re-running the pass safe.
pub fn save_durable_documents(
    conn: &mut Connection,
    documents: &[DurableDocumentRow],
) -> Result<DurableDocumentWriteResult, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    for document in documents {
        tx.execute(
            "INSERT OR REPLACE INTO durable_documents (\
                kind, owner_id, schema_version, body_json, updated_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                document.kind,
                document.owner_id,
                document.schema_version,
                document.body_json,
                document.updated_at,
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(DurableDocumentWriteResult {
        documents_written: documents.len(),
    })
}

/// Read one document, or `None` when the owner has none of that kind.
pub fn get_durable_document(
    conn: &Connection,
    kind: &str,
    owner_id: &str,
) -> Result<Option<DurableDocumentRow>, String> {
    conn.query_row(
        "SELECT kind, owner_id, schema_version, body_json, updated_at \
         FROM durable_documents WHERE kind = ?1 AND owner_id = ?2",
        params![kind, owner_id],
        read_row,
    )
    .optional()
    .map_err(|error| error.to_string())
}

/// Every document of one kind, most recently updated first.
///
/// How an adoption pass and the cross-session readers walk the store. Ordered
/// by the indexed column so the walk does not sort.
pub fn list_durable_documents(
    conn: &Connection,
    kind: &str,
) -> Result<Vec<DurableDocumentRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT kind, owner_id, schema_version, body_json, updated_at \
             FROM durable_documents WHERE kind = ?1 \
             ORDER BY updated_at DESC, owner_id ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([kind], read_row)
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

/// Delete one document. Returns how many rows went, so a caller can tell a
/// real delete from a no-op rather than assuming.
pub fn delete_durable_document(
    conn: &Connection,
    kind: &str,
    owner_id: &str,
) -> Result<usize, String> {
    conn.execute(
        "DELETE FROM durable_documents WHERE kind = ?1 AND owner_id = ?2",
        params![kind, owner_id],
    )
    .map_err(|error| error.to_string())
}

fn read_row(row: &rusqlite::Row) -> rusqlite::Result<DurableDocumentRow> {
    Ok(DurableDocumentRow {
        kind: row.get(0)?,
        owner_id: row.get(1)?,
        schema_version: row.get(2)?,
        body_json: row.get(3)?,
        updated_at: row.get(4)?,
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

    fn row(kind: &str, owner: &str, body: &str, updated: &str) -> DurableDocumentRow {
        DurableDocumentRow {
            kind: kind.to_string(),
            owner_id: owner.to_string(),
            schema_version: 1,
            body_json: body.to_string(),
            updated_at: updated.to_string(),
        }
    }

    #[test]
    fn round_trips_a_document() {
        let mut conn = connection();
        save_durable_documents(
            &mut conn,
            &[row("memory_body", "sess-1", "{\"a\":1}", "2026-08-18T00:00:00Z")],
        )
        .expect("save");

        let found = get_durable_document(&conn, "memory_body", "sess-1").expect("get");
        let found = found.expect("present");
        assert_eq!(found.body_json, "{\"a\":1}");
        assert_eq!(found.schema_version, 1);
    }

    #[test]
    fn returns_none_for_a_missing_document() {
        let conn = connection();
        assert!(get_durable_document(&conn, "memory_body", "nope")
            .expect("get")
            .is_none());
    }

    /// Re-running an adoption pass must not double-write or fail, so the
    /// second save of the same owner replaces rather than collides.
    #[test]
    fn re_saving_an_owner_replaces_rather_than_duplicates() {
        let mut conn = connection();
        save_durable_documents(
            &mut conn,
            &[row("memory_body", "sess-1", "{\"v\":1}", "2026-08-18T00:00:00Z")],
        )
        .expect("first save");
        save_durable_documents(
            &mut conn,
            &[row("memory_body", "sess-1", "{\"v\":2}", "2026-08-18T01:00:00Z")],
        )
        .expect("second save");

        assert_eq!(
            list_durable_documents(&conn, "memory_body")
                .expect("list")
                .len(),
            1
        );
        let found = get_durable_document(&conn, "memory_body", "sess-1")
            .expect("get")
            .expect("present");
        assert_eq!(found.body_json, "{\"v\":2}");
    }

    /// The same owner id in two kinds is two documents, not one. A session's
    /// memory body and its analysis share a session id, so a key that ignored
    /// kind would have them overwrite each other.
    #[test]
    fn separates_kinds_that_share_an_owner_id() {
        let mut conn = connection();
        save_durable_documents(
            &mut conn,
            &[
                row(
                    "memory_body",
                    "sess-1",
                    "{\"which\":\"memory\"}",
                    "2026-08-18T00:00:00Z",
                ),
                row(
                    "analysis",
                    "sess-1",
                    "{\"which\":\"analysis\"}",
                    "2026-08-18T00:00:00Z",
                ),
            ],
        )
        .expect("save");

        let memory = get_durable_document(&conn, "memory_body", "sess-1")
            .expect("get")
            .expect("present");
        let analysis = get_durable_document(&conn, "analysis", "sess-1")
            .expect("get")
            .expect("present");
        assert_eq!(memory.body_json, "{\"which\":\"memory\"}");
        assert_eq!(analysis.body_json, "{\"which\":\"analysis\"}");
    }

    #[test]
    fn lists_one_kind_newest_first_and_excludes_others() {
        let mut conn = connection();
        save_durable_documents(
            &mut conn,
            &[
                row("memory_body", "old", "{}", "2026-08-01T00:00:00Z"),
                row("memory_body", "new", "{}", "2026-08-18T00:00:00Z"),
                row("analysis", "other", "{}", "2026-08-19T00:00:00Z"),
            ],
        )
        .expect("save");

        let listed = list_durable_documents(&conn, "memory_body").expect("list");
        assert_eq!(
            listed
                .iter()
                .map(|row| row.owner_id.as_str())
                .collect::<Vec<_>>(),
            vec!["new", "old"]
        );
    }

    #[test]
    fn reports_whether_a_delete_removed_anything() {
        let mut conn = connection();
        save_durable_documents(
            &mut conn,
            &[row("memory_body", "sess-1", "{}", "2026-08-18T00:00:00Z")],
        )
        .expect("save");

        assert_eq!(
            delete_durable_document(&conn, "memory_body", "sess-1").expect("delete"),
            1
        );
        assert_eq!(
            delete_durable_document(&conn, "memory_body", "sess-1").expect("delete"),
            0
        );
    }

    /// A body is opaque to this layer, so a shape it has never seen still
    /// round-trips. That is what lets R3 and R4 add kinds with no Rust edit.
    #[test]
    fn treats_the_body_as_opaque_text() {
        let mut conn = connection();
        let odd = "{\"nested\":{\"deep\":[1,2,{\"ko\":\"한글\"}]},\"quote\":\"he said \\\"hi\\\"\"}";
        save_durable_documents(
            &mut conn,
            &[row("package_draft", "pkg-1", odd, "2026-08-18T00:00:00Z")],
        )
        .expect("save");

        let found = get_durable_document(&conn, "package_draft", "pkg-1")
            .expect("get")
            .expect("present");
        assert_eq!(found.body_json, odd);
    }
}
