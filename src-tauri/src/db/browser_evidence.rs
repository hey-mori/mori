use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrowserEvidenceData {
    pub provider: String,
    pub runtime_id: Option<String>,
    pub tab_id: String,
    pub window_id: Option<String>,
    pub url: Option<String>,
    pub active: Option<bool>,
    pub focused: Option<bool>,
    pub transition_type: Option<String>,
    pub transition_qualifiers: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrowserEvidenceInput {
    pub delivery_id: String,
    pub observed_at: String,
    pub received_at: String,
    pub kind: String,
    pub data: BrowserEvidenceData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserEvidenceRow {
    pub sequence: i64,
    #[serde(flatten)]
    pub evidence: BrowserEvidenceInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrowserEvidenceCursor {
    pub snapshot_sequence: i64,
    pub observed_at: String,
    pub sequence: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserEvidencePage {
    pub items: Vec<BrowserEvidenceRow>,
    pub next_cursor: Option<BrowserEvidenceCursor>,
}

const FIRST_PAGE_SQL: &str =
    "SELECT sequence, delivery_id, observed_at, received_at, kind, data_json
    FROM browser_evidence WHERE sequence <= ?1
    ORDER BY observed_at DESC, sequence DESC LIMIT ?2";
// Tuple comparison lets SQLite seek the existing observed-time index, including ties.
const OLDER_PAGE_SQL: &str =
    "SELECT sequence, delivery_id, observed_at, received_at, kind, data_json
    FROM browser_evidence WHERE sequence <= ?1 AND (observed_at, sequence) < (?2, ?3)
    ORDER BY observed_at DESC, sequence DESC LIMIT ?4";
const MAX_SAFE_SEQUENCE: i64 = 9_007_199_254_740_991;

pub fn page(
    conn: &Connection,
    limit: i64,
    cursor: Option<&BrowserEvidenceCursor>,
) -> Result<BrowserEvidencePage, String> {
    if !(1..=100).contains(&limit) {
        return Err("invalid browser evidence page limit".into());
    }
    // Keep boundary validation and the page read coherent even with another connection.
    let tx = conn
        .unchecked_transaction()
        .map_err(|_| "browser evidence read failed")?;
    let snapshot: i64 = match cursor {
        None => tx
            .query_row(
                "SELECT COALESCE(MAX(sequence), 0) FROM browser_evidence",
                [],
                |r| r.get(0),
            )
            .map_err(|_| "browser evidence read failed")?,
        Some(cursor) => {
            if cursor.sequence <= 0
                || cursor.snapshot_sequence < cursor.sequence
                || cursor.snapshot_sequence > MAX_SAFE_SEQUENCE
                || cursor.observed_at.len() != 24
            {
                return Err("invalid browser evidence cursor".into());
            }
            let valid: bool = tx.query_row(
                "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ?1) IS ?1
                 AND EXISTS(SELECT 1 FROM browser_evidence WHERE sequence = ?2)
                 AND EXISTS(SELECT 1 FROM browser_evidence WHERE sequence = ?3 AND observed_at = ?1)",
                params![cursor.observed_at, cursor.snapshot_sequence, cursor.sequence], |r| r.get(0),
            ).map_err(|_| "browser evidence read failed")?;
            if !valid {
                return Err("invalid browser evidence cursor".into());
            }
            cursor.snapshot_sequence
        }
    };
    if snapshot > MAX_SAFE_SEQUENCE {
        return Err("browser evidence read failed".into());
    }
    let mut stmt = tx
        .prepare(if cursor.is_some() {
            OLDER_PAGE_SQL
        } else {
            FIRST_PAGE_SQL
        })
        .map_err(|_| "browser evidence read failed")?;
    let mapped = match cursor {
        Some(cursor) => stmt.query_map(
            params![snapshot, cursor.observed_at, cursor.sequence, limit + 1],
            decode_row,
        ),
        None => stmt.query_map(params![snapshot, limit + 1], decode_row),
    }
    .map_err(|_| "browser evidence read failed")?;
    let mut items = mapped
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "browser evidence read failed")?;
    let next_cursor = if items.len() > limit as usize {
        items.truncate(limit as usize);
        items.last().map(|row| BrowserEvidenceCursor {
            snapshot_sequence: snapshot,
            observed_at: row.evidence.observed_at.clone(),
            sequence: row.sequence,
        })
    } else {
        None
    };
    drop(stmt);
    tx.commit().map_err(|_| "browser evidence read failed")?;
    Ok(BrowserEvidencePage { items, next_cursor })
}

fn decode_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BrowserEvidenceRow> {
    let json: String = row.get(5)?;
    let data = serde_json::from_str(&json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(BrowserEvidenceRow {
        sequence: row.get(0)?,
        evidence: BrowserEvidenceInput {
            delivery_id: row.get(1)?,
            observed_at: row.get(2)?,
            received_at: row.get(3)?,
            kind: row.get(4)?,
            data,
        },
    })
}

pub fn append(conn: &Connection, input: &BrowserEvidenceInput) -> Result<i64, String> {
    validate(conn, input)?;
    let data = serde_json::to_string(&input.data).map_err(|_| "invalid browser evidence")?;
    conn.execute(
        "INSERT INTO browser_evidence (delivery_id, observed_at, received_at, kind, data_json)
         VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(delivery_id) DO NOTHING",
        params![
            input.delivery_id,
            input.observed_at,
            input.received_at,
            input.kind,
            data
        ],
    )
    .map_err(|_| "browser evidence write failed")?;
    // A relay delivery is idempotent, but must never silently replace other evidence.
    let existing: (i64, String, String, String) = conn.query_row(
        "SELECT sequence, observed_at, kind, data_json FROM browser_evidence WHERE delivery_id = ?1",
        [&input.delivery_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).map_err(|_| "browser evidence read failed")?;
    if existing.1 != input.observed_at || existing.2 != input.kind || existing.3 != data {
        return Err("browser delivery identity conflict".into());
    }
    Ok(existing.0)
}

pub fn recent(conn: &Connection, limit: u32) -> Result<Vec<BrowserEvidenceRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT sequence, delivery_id, observed_at, received_at, kind, data_json
         FROM browser_evidence ORDER BY observed_at DESC, sequence DESC LIMIT ?1",
        )
        .map_err(|_| "browser evidence read failed")?;
    let rows = stmt
        .query_map([limit.clamp(1, 200)], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|_| "browser evidence read failed")?;
    rows.map(|row| {
        let (sequence, delivery_id, observed_at, received_at, kind, json) =
            row.map_err(|_| "browser evidence read failed")?;
        let data = serde_json::from_str(&json).map_err(|_| "invalid stored browser evidence")?;
        Ok(BrowserEvidenceRow {
            sequence,
            evidence: BrowserEvidenceInput {
                delivery_id,
                observed_at,
                received_at,
                kind,
                data,
            },
        })
    })
    .collect()
}

fn validate(conn: &Connection, input: &BrowserEvidenceInput) -> Result<(), String> {
    if !matches!(
        input.kind.as_str(),
        "tab_activated" | "navigation_committed"
    ) || input.delivery_id.is_empty()
        || input.delivery_id.len() > 256
        || input.data.provider.is_empty()
        || input.data.provider.len() > 64
        || input.data.tab_id.is_empty()
        || input.data.tab_id.len() > 128
        || input
            .data
            .runtime_id
            .as_ref()
            .is_some_and(|id| id.len() > 128)
        || input
            .data
            .window_id
            .as_ref()
            .is_some_and(|id| id.len() > 128)
    {
        return Err("invalid browser evidence".into());
    }
    // Application writes normalized UTC milliseconds, so indexed text order is time order.
    for time in [&input.observed_at, &input.received_at] {
        let valid: Option<String> = conn
            .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ?1)", [time], |r| {
                r.get(0)
            })
            .map_err(|_| "invalid timestamp")?;
        if valid.as_ref() != Some(time) {
            return Err("invalid browser evidence timestamp".into());
        }
    }
    if input.kind == "navigation_committed" && input.data.url.is_none() {
        return Err("navigation requires a URL".into());
    }
    if let Some(raw) = &input.data.url {
        let url = reqwest::Url::parse(raw).map_err(|_| "invalid browser URL")?;
        if raw.len() > 16384
            || !matches!(url.scheme(), "http" | "https")
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err("browser URL violates privacy policy".into());
        }
    }
    if input
        .data
        .transition_type
        .as_ref()
        .is_some_and(|v| v.len() > 64)
        || input
            .data
            .transition_qualifiers
            .as_ref()
            .is_some_and(|v| v.len() > 16 || v.iter().any(|s| s.len() > 64))
    {
        return Err("invalid navigation transition".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{apply_migrations, open_database, open_in_memory};

    fn input(delivery: &str) -> BrowserEvidenceInput {
        BrowserEvidenceInput {
            delivery_id: delivery.into(),
            observed_at: "2026-09-12T00:00:00.000Z".into(),
            received_at: "2026-09-12T00:00:01.000Z".into(),
            kind: "navigation_committed".into(),
            data: BrowserEvidenceData {
                provider: "chrome".into(),
                runtime_id: None,
                tab_id: "17".into(),
                window_id: Some("1".into()),
                url: Some("https://example.com/a".into()),
                active: Some(true),
                focused: Some(true),
                transition_type: Some("link".into()),
                transition_qualifiers: Some(vec![]),
            },
        }
    }

    #[test]
    fn pages_mixed_ties_and_late_arrivals_without_gaps_across_reopen() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("history.sqlite");
        let mut conn = open_database(&path).unwrap();
        apply_migrations(&mut conn).unwrap();
        assert!(page(&conn, 50, None).unwrap().items.is_empty());
        let mut expected = Vec::new();
        for i in 0..325 {
            let mut row = input(&format!("mixed-{i}"));
            row.observed_at = format!("2026-09-12T00:00:{:02}.000Z", (i * 7) % 13);
            if i % 2 == 0 {
                row.kind = "tab_activated".into();
                row.data.url = None;
            }
            let sequence = append(&conn, &row).unwrap();
            expected.push((row.observed_at, sequence));
        }
        expected.sort_by(|a, b| b.cmp(a));
        let first = page(&conn, 50, None).unwrap();
        let mut actual: Vec<_> = first
            .items
            .iter()
            .map(|row| (row.evidence.observed_at.clone(), row.sequence))
            .collect();
        let mut cursor = first.next_cursor;
        assert_eq!(cursor.as_ref().unwrap().snapshot_sequence, 325);
        // A second connection appends both an older and a newer observation mid-read.
        let writer = open_database(&path).unwrap();
        for (id, time) in [
            ("new-old", "2026-09-11T00:00:00.000Z"),
            ("new-new", "2026-09-13T00:00:00.000Z"),
        ] {
            let mut row = input(id);
            row.observed_at = time.into();
            append(&writer, &row).unwrap();
        }
        drop(conn);
        let conn = open_database(&path).unwrap();
        conn.execute_batch("PRAGMA query_only = ON").unwrap();
        while let Some(position) = cursor {
            let batch = page(&conn, 50, Some(&position)).unwrap();
            assert!(batch.items.len() <= 50);
            actual.extend(
                batch
                    .items
                    .iter()
                    .map(|row| (row.evidence.observed_at.clone(), row.sequence)),
            );
            cursor = batch.next_cursor;
        }
        assert_eq!(actual, expected);
        assert_eq!(
            actual
                .iter()
                .map(|(_, seq)| seq)
                .collect::<std::collections::HashSet<_>>()
                .len(),
            325
        );
        let mut refreshed = page(&conn, 100, None).unwrap();
        assert_eq!(refreshed.items[0].evidence.delivery_id, "new-new");
        let mut total = refreshed.items.len();
        while let Some(cursor) = refreshed.next_cursor {
            refreshed = page(&conn, 100, Some(&cursor)).unwrap();
            total += refreshed.items.len();
        }
        assert_eq!(total, 327);
        assert_eq!(
            refreshed.items.last().unwrap().evidence.delivery_id,
            "new-old"
        );
        assert_eq!(conn.total_changes(), 0);
        assert_eq!(recent(&conn, 999).unwrap().len(), 200);
    }

    #[test]
    fn validates_cursor_positions_and_limits_without_disclosing_data() {
        let mut conn = open_in_memory().unwrap();
        apply_migrations(&mut conn).unwrap();
        append(&conn, &input("one")).unwrap();
        append(&conn, &input("one")).unwrap(); // An ignored insert consumes a sequence.
        append(&conn, &input("three")).unwrap();
        let valid = page(&conn, 1, None).unwrap().next_cursor.unwrap();
        assert_eq!(valid.sequence, 3);
        for limit in [i64::MIN, -1, 0, 101, i64::MAX] {
            assert_eq!(
                page(&conn, limit, None).unwrap_err(),
                "invalid browser evidence page limit"
            );
        }
        for (snapshot, sequence, observed) in [
            (0, 0, valid.observed_at.as_str()),
            (-1, 1, valid.observed_at.as_str()),
            (4, 1, valid.observed_at.as_str()),
            (2, 1, valid.observed_at.as_str()),
            (3, 0, valid.observed_at.as_str()),
            (3, -1, valid.observed_at.as_str()),
            (1, 3, valid.observed_at.as_str()),
            (3, 2, valid.observed_at.as_str()),
            (3, 1, "invalid"),
            (3, 1, "2026-09-12T00:00:00Z"),
            (3, 1, "2026-02-30T00:00:00.000Z"),
            (3, 1, "2026-09-11T00:00:00.000Z"),
            (i64::MAX, 1, valid.observed_at.as_str()),
        ] {
            let cursor = BrowserEvidenceCursor {
                snapshot_sequence: snapshot,
                sequence,
                observed_at: observed.into(),
            };
            assert_eq!(
                page(&conn, 50, Some(&cursor)).unwrap_err(),
                "invalid browser evidence cursor"
            );
        }
        let last = page(&conn, 1, Some(&valid)).unwrap();
        assert_eq!(last.items.len(), 1);
        assert!(last.next_cursor.is_none());
        assert!(serde_json::from_value::<BrowserEvidenceCursor>(serde_json::json!({
            "snapshotSequence": 3, "sequence": 1, "observedAt": valid.observed_at, "extra": true,
        })).is_err());
        conn.execute_batch("DROP TABLE browser_evidence").unwrap();
        assert_eq!(
            page(&conn, 50, None).unwrap_err(),
            "browser evidence read failed"
        );
    }

    #[test]
    fn pagination_uses_existing_ordering_index_on_large_dataset() {
        let mut conn = open_in_memory().unwrap();
        apply_migrations(&mut conn).unwrap();
        let tx = conn.transaction().unwrap();
        for i in 0..10_000 {
            let mut row = input(&format!("volume-{i}"));
            row.observed_at = format!("2026-09-12T00:{:02}:{:02}.000Z", (i / 60) % 60, i % 60);
            append(&tx, &row).unwrap();
        }
        tx.commit().unwrap();
        conn.execute_batch("ANALYZE").unwrap();
        for (sql, values) in [
            (
                FIRST_PAGE_SQL,
                vec![rusqlite::types::Value::Integer(10_000), 51.into()],
            ),
            (
                OLDER_PAGE_SQL,
                vec![
                    10_000.into(),
                    "2026-09-12T00:30:00.000Z".to_string().into(),
                    5000.into(),
                    51.into(),
                ],
            ),
        ] {
            let plan: Vec<String> = conn
                .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
                .unwrap()
                .query_map(rusqlite::params_from_iter(values), |row| row.get(3))
                .unwrap()
                .map(Result::unwrap)
                .collect();
            assert!(
                plan.iter()
                    .any(|line| line.contains("browser_evidence_observed")),
                "{plan:?}"
            );
            assert!(
                !plan.iter().any(|line| line.contains("TEMP B-TREE")),
                "{plan:?}"
            );
            if sql == OLDER_PAGE_SQL {
                assert!(plan.iter().any(|line| line.contains("SEARCH")), "{plan:?}");
            }
            println!("browser page plan: {plan:?}");
        }
        let start = std::time::Instant::now();
        let first = page(&conn, 50, None).unwrap();
        assert_eq!(
            page(&conn, 50, first.next_cursor.as_ref())
                .unwrap()
                .items
                .len(),
            50
        );
        println!("two 50-row pages from 10000 rows: {:?}", start.elapsed());
    }

    #[test]
    fn upgrades_existing_database_and_survives_reopen() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("mori.sqlite");
        let mut conn = open_database(&path).unwrap();
        apply_migrations(&mut conn).unwrap();
        conn.execute("DROP TABLE browser_evidence", []).unwrap();
        conn.execute("DELETE FROM _mori_migrations WHERE version = '012'", [])
            .unwrap();
        conn.execute(
            "INSERT INTO durable_documents VALUES ('user_projects', '@app', 1, '[]', 'before')",
            [],
        )
        .unwrap();
        let outcome = apply_migrations(&mut conn).unwrap();
        assert_eq!(outcome.applied, vec!["012"]);
        append(&conn, &input("one")).unwrap();
        drop(conn);
        let conn = open_database(&path).unwrap();
        assert_eq!(
            recent(&conn, 10).unwrap()[0].evidence.data.url,
            input("one").data.url
        );
        assert_eq!(
            conn.query_row(
                "SELECT body_json FROM durable_documents WHERE owner_id = '@app'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "[]"
        );
    }

    #[test]
    fn only_deduplicates_same_delivery_and_preserves_time_order() {
        let mut conn = open_in_memory().unwrap();
        apply_migrations(&mut conn).unwrap();
        let first = append(&conn, &input("one")).unwrap();
        assert_eq!(append(&conn, &input("one")).unwrap(), first);
        append(&conn, &input("different-delivery")).unwrap();
        let mut older = input("older-arriving-later");
        older.observed_at = "2026-09-11T00:00:00.000Z".into();
        append(&conn, &older).unwrap();
        let rows = recent(&conn, 10).unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].evidence.delivery_id, "different-delivery");
        assert!(rows[2].sequence > rows[0].sequence);
        let mut conflict = input("one");
        conflict.data.tab_id = "18".into();
        assert!(append(&conn, &conflict).unwrap_err().contains("conflict"));
        assert_eq!(recent(&conn, 1).unwrap().len(), 1);
    }

    #[test]
    fn rejects_sensitive_fields_and_urls_at_storage_boundary() {
        let mut conn = open_in_memory().unwrap();
        apply_migrations(&mut conn).unwrap();
        for url in [
            "https://example.com/?secret=x",
            "https://example.com/#private",
            "https://u:p@example.com/",
            "file:///secret",
            "chrome://settings",
        ] {
            let mut row = input("bad");
            row.data.url = Some(url.into());
            assert!(append(&conn, &row).is_err());
        }
        let mut json = serde_json::to_value(input("bad")).unwrap();
        json["data"]["title"] = serde_json::json!("secret");
        assert!(serde_json::from_value::<BrowserEvidenceInput>(json).is_err());
        assert!(recent(&conn, 10).unwrap().is_empty());
        conn.execute_batch("PRAGMA query_only = ON").unwrap();
        assert!(append(&conn, &input("read-only")).is_err());
        assert!(recent(&conn, 10).unwrap().is_empty());
    }

    #[test]
    fn bounds_reads_without_deleting_evidence_and_honors_explicit_reset() {
        let mut conn = open_in_memory().unwrap();
        apply_migrations(&mut conn).unwrap();
        for i in 0..250 {
            append(&conn, &input(&format!("delivery-{i}"))).unwrap();
        }
        assert_eq!(recent(&conn, u32::MAX).unwrap().len(), 200);
        assert_eq!(
            conn.query_row("SELECT count(*) FROM browser_evidence", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            250
        );
        crate::db::clear_all_data(&mut conn).unwrap();
        assert!(recent(&conn, 10).unwrap().is_empty());
    }
}
