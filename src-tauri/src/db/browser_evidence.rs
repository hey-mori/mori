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
