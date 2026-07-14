use rusqlite::{params, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;

/// One migration that the Rust runner knows how to apply.
///
/// `sql` is embedded at compile time so the desktop binary does not depend on
/// the migrations folder being present on disk at runtime. Filenames mirror the
/// `src-tauri/migrations` files for parity with the documented Flyway-style
/// naming.
pub struct MigrationManifestEntry {
    pub version: &'static str,
    pub filename: &'static str,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATION_TABLE_NAME: &str = "_mori_migrations";

pub const MIGRATIONS: &[MigrationManifestEntry] = &[
    MigrationManifestEntry {
        version: "001",
        filename: "V001__initial_schema.sql",
        name: "initial_schema",
        sql: include_str!("../../migrations/V001__initial_schema.sql"),
    },
    MigrationManifestEntry {
        version: "002",
        filename: "V002__events_connector_identity.sql",
        name: "events_connector_identity",
        sql: include_str!("../../migrations/V002__events_connector_identity.sql"),
    },
    MigrationManifestEntry {
        version: "003",
        filename: "V003__consolidated_memories.sql",
        name: "consolidated_memories",
        sql: include_str!("../../migrations/V003__consolidated_memories.sql"),
    },
    MigrationManifestEntry {
        version: "004",
        filename: "V004__session_imports.sql",
        name: "session_imports",
        sql: include_str!("../../migrations/V004__session_imports.sql"),
    },
    MigrationManifestEntry {
        version: "005",
        filename: "V005__session_source_label.sql",
        name: "session_source_label",
        sql: include_str!("../../migrations/V005__session_source_label.sql"),
    },
    MigrationManifestEntry {
        version: "006",
        filename: "V006__source_capture_fidelity.sql",
        name: "source_capture_fidelity",
        sql: include_str!("../../migrations/V006__source_capture_fidelity.sql"),
    },
    MigrationManifestEntry {
        version: "007",
        filename: "V007__events_provenance_fields.sql",
        name: "events_provenance_fields",
        sql: include_str!("../../migrations/V007__events_provenance_fields.sql"),
    },
    MigrationManifestEntry {
        version: "008",
        filename: "V008__record_kernel.sql",
        name: "record_kernel",
        sql: include_str!("../../migrations/V008__record_kernel.sql"),
    },
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationRecord {
    pub version: String,
    pub name: String,
    pub checksum: String,
    pub applied_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationOutcome {
    pub applied: Vec<String>,
    pub already_applied: Vec<String>,
}

/// Apply every pending migration in version order.
///
/// On a fresh database this seeds the `_mori_migrations` table and applies all
/// known migrations. On an existing database it skips already-applied entries
/// and returns an error if a previously applied migration's checksum no longer
/// matches the embedded SQL.
pub fn apply_migrations(conn: &mut Connection) -> Result<MigrationOutcome, String> {
    ensure_migration_table(conn)?;
    let mut applied = applied_map(conn)?;
    let mut outcome = MigrationOutcome {
        applied: Vec::new(),
        already_applied: Vec::new(),
    };

    for migration in MIGRATIONS {
        let checksum = checksum_for(migration.sql);
        if let Some(existing) = applied.get(migration.version) {
            if existing.checksum != checksum {
                return Err(format!(
                    "Migration {} ({}) checksum mismatch: stored {} vs expected {}. Refusing to reapply a changed migration.",
                    migration.version, migration.filename, existing.checksum, checksum
                ));
            }
            outcome.already_applied.push(migration.version.to_string());
            continue;
        }

        apply_one(conn, migration, &checksum)?;
        applied.insert(
            migration.version.to_string(),
            MigrationRecord {
                version: migration.version.to_string(),
                name: migration.name.to_string(),
                checksum,
                applied_at: now_iso(),
            },
        );
        outcome.applied.push(migration.version.to_string());
    }

    Ok(outcome)
}

/// Return every row of `_mori_migrations` in version order.
pub fn applied_migrations(conn: &Connection) -> Result<Vec<MigrationRecord>, String> {
    if !migration_table_exists(conn)? {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare("SELECT version, name, checksum, applied_at FROM _mori_migrations ORDER BY version")
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MigrationRecord {
                version: row.get(0)?,
                name: row.get(1)?,
                checksum: row.get(2)?,
                applied_at: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

fn applied_map(conn: &Connection) -> Result<HashMap<String, MigrationRecord>, String> {
    let mut map = HashMap::new();
    for record in applied_migrations(conn)? {
        map.insert(record.version.clone(), record);
    }
    Ok(map)
}

fn ensure_migration_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _mori_migrations (\n  version TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  checksum TEXT NOT NULL,\n  applied_at TEXT NOT NULL\n);",
    )
    .map_err(|error| error.to_string())
}

fn migration_table_exists(conn: &Connection) -> Result<bool, String> {
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?1",
            [MIGRATION_TABLE_NAME],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    Ok(exists > 0)
}

fn apply_one(
    conn: &mut Connection,
    migration: &MigrationManifestEntry,
    checksum: &str,
) -> Result<(), String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute_batch(migration.sql)
        .map_err(|error| format!("Failed to apply migration {}: {}", migration.filename, error))?;
    tx.execute(
        "INSERT INTO _mori_migrations (version, name, checksum, applied_at) VALUES (?1, ?2, ?3, ?4)",
        params![
            migration.version,
            migration.name,
            checksum,
            now_iso(),
        ],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())
}

fn checksum_for(sql: &str) -> String {
    let normalized: String = sql
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect();
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest.iter() {
        hex.push_str(&format!("{:02x}", byte));
    }
    hex
}

fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("epoch:{seconds}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    #[test]
    fn applies_initial_migration_on_empty_database() {
        let mut conn = open_in_memory().expect("open in-memory db");
        let outcome = apply_migrations(&mut conn).expect("apply migrations");
        assert_eq!(
            outcome.applied,
            vec![
                "001".to_string(),
                "002".to_string(),
                "003".to_string(),
                "004".to_string(),
                "005".to_string(),
                "006".to_string(),
                "007".to_string(),
                "008".to_string()
            ]
        );
        assert!(outcome.already_applied.is_empty());

        let applied = applied_migrations(&conn).expect("read applied");
        assert_eq!(applied.len(), 8);
        assert_eq!(applied[0].version, "001");
        assert_eq!(applied[1].version, "002");
        assert_eq!(applied[2].version, "003");
        assert_eq!(applied[3].version, "004");
        assert_eq!(applied[4].version, "005");
        assert_eq!(applied[5].version, "006");
        assert_eq!(applied[6].version, "007");
        assert_eq!(applied[7].version, "008");
        for record in &applied {
            assert!(!record.checksum.is_empty());
        }
    }

    #[test]
    fn skips_already_applied_migrations() {
        let mut conn = open_in_memory().expect("open in-memory db");
        apply_migrations(&mut conn).expect("first run");
        let outcome = apply_migrations(&mut conn).expect("second run");
        assert!(outcome.applied.is_empty());
        assert_eq!(
            outcome.already_applied,
            vec![
                "001".to_string(),
                "002".to_string(),
                "003".to_string(),
                "004".to_string(),
                "005".to_string(),
                "006".to_string(),
                "007".to_string(),
                "008".to_string()
            ]
        );
    }

    #[test]
    fn rejects_checksum_mismatch_on_previously_applied_migration() {
        let mut conn = open_in_memory().expect("open in-memory db");
        apply_migrations(&mut conn).expect("apply once");
        conn.execute(
            "UPDATE _mori_migrations SET checksum = ?1 WHERE version = '001'",
            params!["tampered"],
        )
        .expect("tamper");
        let error = apply_migrations(&mut conn).expect_err("should detect mismatch");
        assert!(error.contains("checksum mismatch"));
    }
}
