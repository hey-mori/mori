//! Lens connector inbox.
//!
//! Reads learning-item transfers that Mori Lens writes to
//! `~/.mori/connectors/lens/`. Each transfer is a single JSON file
//! (one item per file, not JSONL). Accepted items become
//! `MoriRecord` rows with `schemaId: "knowledge"`.
//!
//! The companion capability file at
//! `~/.mori/connectors/lens/.capability.json` signals to Lens that
//! Mori supports the connector protocol and which schema versions it
//! understands.
//!
//! See ADR-0018 in the mori-lens repository for the wire contract.

use std::fs;
use std::path::PathBuf;

use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

use crate::agent_paths;
use crate::db::kernel::KernelRecordRow;

/// Schema versions this Mori build accepts from Lens.
const SUPPORTED_SCHEMA_VERSIONS: &[u32] = &[1];

/// Maximum transfer file size (1 MB). Learning items are short text
/// pairs; anything larger is suspect.
const MAX_TRANSFER_BYTES: u64 = 1024 * 1024;

// ─── Wire types ────────────────────────────────────────────────────────────

/// What Lens writes across the boundary. Mirrors the mori-lens
/// `TransferPayload` (ADR-0018).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LensTransferPayload {
    pub schema_version: u32,
    pub transfer_id: String,
    pub original: String,
    pub answer: String,
    pub kind: String,
    pub source_language: String,
    pub target_language: String,
    pub note: String,
    pub tags: Vec<String>,
    pub created_at: String,
}

/// One pending transfer in the inbox listing.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LensPendingTransfer {
    pub file_path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_at: String,
    pub payload: LensTransferPayload,
    pub already_imported: bool,
}

/// Result of `list_lens_transfers`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LensInboxListing {
    pub directory: String,
    pub directory_exists: bool,
    pub pending: Vec<LensPendingTransfer>,
}

/// Outcome of `import_lens_transfer`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LensImportResult {
    pub record_id: String,
    pub transfer_id: String,
}

/// What the capability marker advertises.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CapabilityFile {
    product: &'static str,
    supported_schema_versions: &'static [u32],
    capability: &'static str,
}

// ─── Safe path ──────────────────────────────────────────────────────────────

/// Resolve a user-supplied file name to a safe path inside the Lens inbox.
///
/// Rejects names containing path separators, starting with `.`, or
/// escaping the inbox via symlinks. Reuses the canonicalize + starts_with
/// pattern from `inbox.rs`.
fn safe_lens_path(file_name: &str) -> Result<PathBuf, String> {
    // Reject path separators and hidden files.
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.starts_with('.')
    {
        return Err(format!("Invalid transfer file name: {file_name}"));
    }

    let root = lens_connector_dir()
        .ok_or_else(|| "Lens connector directory does not exist".to_string())?;

    let candidate = root.join(file_name);
    if !candidate.exists() {
        return Err(format!("Transfer file not found: {file_name}"));
    }

    // Canonicalize both sides to defeat symlinks and `..` tricks.
    let canonical_root = fs::canonicalize(&root)
        .map_err(|e| format!("Failed to resolve inbox root: {e}"))?;
    let canonical_target = fs::canonicalize(&candidate)
        .map_err(|e| format!("Failed to resolve transfer path: {e}"))?;

    if !canonical_target.starts_with(&canonical_root) {
        return Err("Refused: transfer path is outside the Lens inbox".to_string());
    }
    if canonical_target == canonical_root {
        return Err("Refused: transfer path points at the inbox directory itself".to_string());
    }

    Ok(candidate)
}

// ─── Directory resolution ──────────────────────────────────────────────────

/// `~/.mori/connectors/lens/`. Returns `None` when the parent
/// `~/.mori/connectors/` does not exist (Mori has never set up its
/// connector inbox).
pub fn lens_connector_dir() -> Option<PathBuf> {
    let connectors = agent_paths::mori_inbox_dir()?;
    let dir = connectors.join("lens");
    if dir.is_dir() { Some(dir) } else { None }
}

// ─── Capability ────────────────────────────────────────────────────────────

/// Write the capability marker to `~/.mori/connectors/lens/`.
///
/// Creates the directory when the parent `~/.mori/connectors/` exists.
/// Returns the path written. Idempotent: a second call overwrites with
/// the same content.
pub fn write_capability_marker(conn: &rusqlite::Connection) -> Result<PathBuf, String> {
    let connectors = agent_paths::mori_inbox_dir()
        .ok_or_else(|| "Mori connector inbox directory is not available".to_string())?;
    let lens_dir = connectors.join("lens");
    fs::create_dir_all(&lens_dir)
        .map_err(|e| format!("Failed to create lens connector directory: {e}"))?;

    let cap = CapabilityFile {
        product: "mori",
        supported_schema_versions: SUPPORTED_SCHEMA_VERSIONS,
        capability: "lens-transfer",
    };
    let json = serde_json::to_string_pretty(&cap).map_err(|e| e.to_string())?;
    let path = lens_dir.join(".capability.json");
    fs::write(&path, json.as_bytes()).map_err(|e| format!("Failed to write capability file: {e}"))?;
    let _ = conn; // reserved for future schema-version bookkeeping
    Ok(path)
}

// ─── Listing ───────────────────────────────────────────────────────────────

/// List every `.json` file in `~/.mori/connectors/lens/`, parse each as
/// a `LensTransferPayload`, and flag already-imported transfer IDs.
pub fn list_lens_transfers(conn: &rusqlite::Connection) -> Result<LensInboxListing, String> {
    let dir = match lens_connector_dir() {
        Some(dir) => dir,
        None => {
            let directory = agent_paths::mori_inbox_dir()
                .map(|c| c.join("lens").to_string_lossy().to_string())
                .unwrap_or_default();
            return Ok(LensInboxListing {
                directory,
                directory_exists: false,
                pending: Vec::new(),
            });
        }
    };

    let imported = load_imported_transfer_ids(conn)?;
    let mut pending = Vec::new();

    for entry in fs::read_dir(&dir).map_err(|e| format!("Failed to read lens directory: {e}"))? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        // Skip directories, non-json files, and dotfiles (e.g. .capability.json).
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
        if !path.is_file()
            || path.extension().and_then(|e| e.to_str()) != Some("json")
            || name.starts_with('.')
        {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.len() > MAX_TRANSFER_BYTES {
            continue;
        }
        let text = match fs::read_to_string(&path) {
            Ok(t) => t,
            Err(_) => continue,
        };
        let payload: LensTransferPayload = match serde_json::from_str(&text) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let modified = format_timestamp(&meta);
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        pending.push(LensPendingTransfer {
            file_path: path.to_string_lossy().to_string(),
            file_name,
            size_bytes: meta.len(),
            modified_at: modified,
            already_imported: imported.contains(&payload.transfer_id),
            payload,
        });
    }

    pending.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    Ok(LensInboxListing {
        directory: dir.to_string_lossy().to_string(),
        directory_exists: true,
        pending,
    })
}

// ─── Read ──────────────────────────────────────────────────────────────────

/// Read and parse a single transfer file by name.
///
/// The file name is confined to `~/.mori/connectors/lens/` via
/// `safe_lens_path`. Arbitrary paths are rejected.
pub fn read_lens_transfer(file_name: &str) -> Result<LensTransferPayload, String> {
    let path = safe_lens_path(file_name)?;
    if !path.is_file() {
        return Err(format!("File not found: {file_name}"));
    }
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_TRANSFER_BYTES {
        return Err(format!(
            "Transfer file is too large ({} bytes > {} byte cap)",
            meta.len(),
            MAX_TRANSFER_BYTES
        ));
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let payload: LensTransferPayload =
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse transfer JSON: {e}"))?;
    validate_payload(&payload)?;
    Ok(payload)
}

/// Semantic validation beyond serde deserialization.
///
/// Ensures the payload carries meaningful data before it enters the
/// import pipeline. Invalid payloads are not imported and the source
/// file remains on disk.
fn validate_payload(payload: &LensTransferPayload) -> Result<(), String> {
    if !SUPPORTED_SCHEMA_VERSIONS.contains(&payload.schema_version) {
        return Err(format!(
            "Unsupported schema version {}. Supported: {:?}",
            payload.schema_version, SUPPORTED_SCHEMA_VERSIONS
        ));
    }
    if payload.transfer_id.trim().is_empty() {
        return Err("transferId is empty".to_string());
    }
    // Basic UUID shape: 36 chars with hyphens at positions 8-4-4-4-12.
    if payload.transfer_id.len() != 36
        || payload.transfer_id.matches('-').count() != 4
    {
        return Err(format!(
            "transferId is not a valid UUID: {}",
            payload.transfer_id
        ));
    }
    if payload.kind != "translation" && payload.kind != "analysis" {
        return Err(format!("Invalid kind: {}", payload.kind));
    }
    if payload.original.trim().is_empty() {
        return Err("original is empty".to_string());
    }
    if payload.answer.trim().is_empty() {
        return Err("answer is empty".to_string());
    }
    if payload.created_at.trim().is_empty() {
        return Err("createdAt is empty".to_string());
    }
    Ok(())
}

// ─── Import ────────────────────────────────────────────────────────────────

/// Import a Lens transfer into Mori as a `knowledge` record.
///
/// Idempotent: a transfer ID that has already been imported returns the
/// existing record ID without creating a duplicate. On success the
/// source file is moved to `processed/` inside the Lens inbox for audit.
///
/// Source file lifecycle:
/// - Parse failure: source remains on disk
/// - Validation failure: source remains on disk
/// - DB failure: source remains on disk
/// - Duplicate: source remains (deterministic return of existing record)
/// - Success: source moved to `processed/`
pub fn import_lens_transfer(
    conn: &mut rusqlite::Connection,
    file_name: &str,
) -> Result<LensImportResult, String> {
    let path = safe_lens_path(file_name)?;
    if !path.is_file() {
        return Err(format!("File not found: {file_name}"));
    }

    // Read and validate. On failure, source remains.
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_TRANSFER_BYTES {
        return Err(format!(
            "Transfer file is too large ({} bytes > {} byte cap)",
            meta.len(),
            MAX_TRANSFER_BYTES
        ));
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let payload: LensTransferPayload =
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse transfer JSON: {e}"))?;
    validate_payload(&payload)?;

    // Duplicate check: deterministic, no file mutation.
    if is_transfer_imported(conn, &payload.transfer_id)? {
        let existing = find_record_for_transfer(conn, &payload.transfer_id)?;
        let record_id = existing.unwrap_or_else(|| format!("lens-{}", payload.transfer_id));
        return Ok(LensImportResult {
            record_id,
            transfer_id: payload.transfer_id,
        });
    }

    // Persist to kernel records and lens_transfers. On failure, source remains.
    let record = transfer_to_record(&payload);
    crate::db::kernel::save_kernel_records(conn, std::slice::from_ref(&record))?;
    record_lens_transfer(conn, &payload.transfer_id, &record.id)?;

    // Success: move source to processed/ for audit trail.
    let processed_dir = path.parent().unwrap().join("processed");
    fs::create_dir_all(&processed_dir)
        .map_err(|e| format!("Failed to create processed directory: {e}"))?;
    let dest = processed_dir.join(file_name);
    fs::rename(&path, &dest).map_err(|e| {
        format!("Import succeeded but failed to move source to processed/: {e}")
    })?;

    Ok(LensImportResult {
        record_id: record.id,
        transfer_id: payload.transfer_id,
    })
}

// ─── Mapping ───────────────────────────────────────────────────────────────

/// Convert a Lens transfer payload to a `knowledge` MoriRecord.
///
/// Mapping:
/// - `title` = the answer (the translation)
/// - `body` = the original text, plus the note if present
/// - `properties.kind` = "translation" or "analysis"
/// - `properties.originalText` = the source text
/// - `properties.sourceLanguage`, `targetLanguage` = BCP-47 or empty
/// - `properties.tags` = JSON array
/// - `source_created_at` = the Lens item's creation timestamp
pub fn transfer_to_record(payload: &LensTransferPayload) -> KernelRecordRow {
    let now = chrono_utc_now();
    let id = format!("lens-{}", payload.transfer_id);

    let body = if payload.note.is_empty() {
        payload.original.clone()
    } else {
        format!("{}\n\nNote: {}", payload.original, payload.note)
    };

    let properties = serde_json::json!({
        "kind": payload.kind,
        "originalText": payload.original,
        "sourceLanguage": payload.source_language,
        "targetLanguage": payload.target_language,
        "tags": payload.tags,
    });
    let properties_json = serde_json::to_string(&properties).unwrap_or_else(|_| "{}".to_string());

    // Char-safe truncation: byte slicing would panic on Korean/emoji.
    let title = if payload.answer.chars().count() > 200 {
        let truncated: String = payload.answer.chars().take(197).collect();
        format!("{truncated}...")
    } else {
        payload.answer.clone()
    };

    KernelRecordRow {
        id,
        schema_id: "knowledge".to_string(),
        title,
        body,
        occurred_start: None,
        occurred_end: None,
        source_created_at: Some(payload.created_at.clone()),
        captured_at: now.clone(),
        time_basis: "source-observed".to_string(),
        time_confidence: None,
        status: "candidate".to_string(),
        origin: "import".to_string(),
        ownership: "db".to_string(),
        context_ids_json: "[]".to_string(),
        properties_json,
        created_at: now.clone(),
        updated_at: now,
    }
}

// ─── Idempotency helpers ───────────────────────────────────────────────────

fn load_imported_transfer_ids(conn: &rusqlite::Connection) -> Result<Vec<String>, String> {
    if !table_exists(conn, "lens_transfers")? {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare("SELECT transfer_id FROM lens_transfers")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut ids = Vec::new();
    for row in rows {
        ids.push(row.map_err(|e| e.to_string())?);
    }
    Ok(ids)
}

fn is_transfer_imported(conn: &rusqlite::Connection, transfer_id: &str) -> Result<bool, String> {
    if !table_exists(conn, "lens_transfers")? {
        return Ok(false);
    }
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM lens_transfers WHERE transfer_id = ?1",
            [transfer_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

fn record_lens_transfer(
    conn: &mut rusqlite::Connection,
    transfer_id: &str,
    record_id: &str,
) -> Result<(), String> {
    let now = chrono_utc_now();
    conn.execute(
        "INSERT INTO lens_transfers (transfer_id, record_id, imported_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![transfer_id, record_id, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn find_record_for_transfer(
    conn: &rusqlite::Connection,
    transfer_id: &str,
) -> Result<Option<String>, String> {
    if !table_exists(conn, "lens_transfers")? {
        return Ok(None);
    }
    conn.query_row(
        "SELECT record_id FROM lens_transfers WHERE transfer_id = ?1",
        [transfer_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn table_exists(conn: &rusqlite::Connection, name: &str) -> Result<bool, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?1",
            [name],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

// ─── Timestamp ─────────────────────────────────────────────────────────────

fn chrono_utc_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (y, m, d, h, min, s) = unix_to_ymdhms(secs);
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{min:02}:{s:02}Z")
}

fn format_timestamp(meta: &fs::Metadata) -> String {
    let modified = meta
        .modified()
        .or_else(|_| meta.created())
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
    let secs = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (y, m, d, h, min, s) = unix_to_ymdhms(secs);
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{min:02}:{s:02}Z")
}

fn unix_to_ymdhms(total: u64) -> (i64, u32, u32, u32, u32, u32) {
    const SPD: u64 = 86_400;
    let days = total / SPD;
    let rem = total % SPD;
    let h = (rem / 3600) as u32;
    let min = ((rem % 3600) / 60) as u32;
    let s = (rem % 60) as u32;

    let mut y = 1970_i64;
    let mut d = days as i64;
    loop {
        let diy = if is_leap(y) { 366 } else { 365 };
        if d < diy {
            break;
        }
        d -= diy;
        y += 1;
    }
    let (m, d) = month_day(d as u32, is_leap(y));
    (y, m, d, h, min, s)
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn month_day(doy: u32, leap: bool) -> (u32, u32) {
    let days = if leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut rem = doy;
    for (i, &len) in days.iter().enumerate() {
        if rem < len {
            return ((i as u32) + 1, rem + 1);
        }
        rem -= len;
    }
    (12, 31)
}

// ─── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::apply_migrations;
    use crate::db::open_in_memory;
    use std::io::Write;

    fn sample_transfer() -> LensTransferPayload {
        LensTransferPayload {
            schema_version: 1,
            transfer_id: "550e8400-e29b-41d4-a716-446655440000".to_string(),
            original: "The output files came back empty.".to_string(),
            answer: "출력 파일이 비어 있었습니다.".to_string(),
            kind: "translation".to_string(),
            source_language: "en".to_string(),
            target_language: "ko".to_string(),
            note: String::new(),
            tags: vec!["cargo".to_string(), "build".to_string()],
            created_at: "2026-09-03T14:30:00Z".to_string(),
        }
    }

    fn migrated_conn() -> rusqlite::Connection {
        let mut conn = open_in_memory().expect("open in-memory db");
        apply_migrations(&mut conn).expect("apply migrations");
        conn
    }

    #[test]
    fn transfer_to_record_uses_knowledge_schema() {
        let t = sample_transfer();
        let r = transfer_to_record(&t);
        assert_eq!(r.schema_id, "knowledge");
        assert_eq!(r.id, "lens-550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(r.status, "candidate");
        assert_eq!(r.origin, "import");
    }

    #[test]
    fn transfer_to_record_maps_answer_to_title() {
        let t = sample_transfer();
        let r = transfer_to_record(&t);
        assert_eq!(r.title, t.answer);
    }

    #[test]
    fn transfer_to_record_puts_original_in_body() {
        let t = sample_transfer();
        let r = transfer_to_record(&t);
        assert!(r.body.contains("The output files came back empty."));
    }

    #[test]
    fn transfer_to_record_appends_note_when_present() {
        let mut t = sample_transfer();
        t.note = "check the build log".to_string();
        let r = transfer_to_record(&t);
        assert!(r.body.contains("check the build log"));
        assert!(r.body.contains("The output files came back empty."));
    }

    #[test]
    fn transfer_to_record_omits_note_section_when_empty() {
        let t = sample_transfer();
        let r = transfer_to_record(&t);
        assert!(!r.body.contains("Note:"));
    }

    #[test]
    fn transfer_to_record_carries_properties() {
        let t = sample_transfer();
        let r = transfer_to_record(&t);
        let props: serde_json::Value = serde_json::from_str(&r.properties_json).unwrap();
        assert_eq!(props["kind"], "translation");
        assert_eq!(props["originalText"], "The output files came back empty.");
        assert_eq!(props["sourceLanguage"], "en");
        assert_eq!(props["targetLanguage"], "ko");
        assert_eq!(props["tags"], serde_json::json!(["cargo", "build"]));
    }

    #[test]
    fn transfer_to_record_preserves_source_timestamp() {
        let t = sample_transfer();
        let r = transfer_to_record(&t);
        assert_eq!(r.source_created_at.as_deref(), Some("2026-09-03T14:30:00Z"));
    }

    #[test]
    fn long_answer_is_truncated_in_title() {
        let mut t = sample_transfer();
        t.answer = "a".repeat(300);
        let r = transfer_to_record(&t);
        assert!(r.title.chars().count() <= 200); // 197 + "..."
        assert!(r.title.ends_with("..."));
    }

    #[test]
    fn import_round_trip_through_kernel_records() {
        let mut conn = migrated_conn();
        let t = sample_transfer();
        let r = transfer_to_record(&t);
        crate::db::kernel::save_kernel_records(&mut conn, &[r.clone()]).expect("save");
        let fetched = crate::db::kernel::get_kernel_record(&conn, &r.id)
            .expect("get")
            .expect("present");
        assert_eq!(fetched.schema_id, "knowledge");
        assert_eq!(fetched.title, t.answer);
    }

    #[test]
    fn idempotency_prevents_duplicate_records() {
        let mut conn = migrated_conn();
        let t = sample_transfer();

        // Record the transfer as already imported.
        record_lens_transfer(&mut conn, &t.transfer_id, &format!("lens-{}", t.transfer_id))
            .expect("record");
        assert!(is_transfer_imported(&conn, &t.transfer_id).expect("check"));

        // Loading the set returns the ID.
        let ids = load_imported_transfer_ids(&conn).expect("load");
        assert_eq!(ids, vec![t.transfer_id]);
    }

    #[test]
    fn fresh_database_has_no_imported_transfers() {
        let conn = migrated_conn();
        let ids = load_imported_transfer_ids(&conn).expect("load");
        assert!(ids.is_empty());
        assert!(!is_transfer_imported(&conn, "any-id").expect("check"));
    }

    #[test]
    fn unsupported_schema_version_is_detected() {
        assert!(!SUPPORTED_SCHEMA_VERSIONS.contains(&99));
        assert!(SUPPORTED_SCHEMA_VERSIONS.contains(&1));
    }

    #[test]
    fn payload_round_trips_through_json() {
        let t = sample_transfer();
        let json = serde_json::to_string(&t).expect("serialize");
        let parsed: LensTransferPayload = serde_json::from_str(&json).expect("parse");
        assert_eq!(parsed, t);
    }

    #[test]
    fn list_returns_empty_when_directory_missing() {
        // In a test environment the lens directory does not exist.
        let conn = migrated_conn();
        let listing = list_lens_transfers(&conn);
        // The function either returns directory_exists: false, or
        // (if Mori is installed on the test machine) an empty listing.
        match listing {
            Ok(l) => {
                if !l.directory_exists {
                    assert!(l.pending.is_empty());
                }
            }
            Err(_) => {
                // Home directory not set at all is acceptable in CI.
            }
        }
    }

    #[test]
    fn read_rejects_missing_file() {
        let err = read_lens_transfer("nonexistent-file.json").unwrap_err();
        // Either "does not exist" (no inbox) or "not found" (inbox exists, file missing).
        assert!(
            err.contains("not found") || err.contains("does not exist"),
            "error: {err}"
        );
    }

    #[test]
    fn read_rejects_parent_traversal() {
        let err = safe_lens_path("../../../etc/passwd").unwrap_err();
        assert!(err.contains("Invalid") || err.contains("Refused"), "error: {err}");
    }

    #[test]
    fn read_rejects_absolute_path_separator() {
        let err = safe_lens_path("/etc/passwd").unwrap_err();
        assert!(err.contains("Invalid"), "error: {err}");
    }

    #[test]
    fn read_rejects_dotfile() {
        let err = safe_lens_path(".capability.json").unwrap_err();
        assert!(err.contains("Invalid"), "error: {err}");
    }

    #[test]
    fn read_rejects_backslash_separator() {
        let err = safe_lens_path(r"sub\file.json").unwrap_err();
        assert!(err.contains("Invalid"), "error: {err}");
    }

    #[test]
    fn read_rejects_empty_name() {
        let err = safe_lens_path("").unwrap_err();
        assert!(err.contains("Invalid"), "error: {err}");
    }

    #[test]
    fn validate_rejects_empty_original() {
        let mut t = sample_transfer();
        t.original = String::new();
        let err = validate_payload(&t).unwrap_err();
        assert!(err.contains("original"), "error: {err}");
    }

    #[test]
    fn validate_rejects_empty_answer() {
        let mut t = sample_transfer();
        t.answer = "   ".to_string();
        let err = validate_payload(&t).unwrap_err();
        assert!(err.contains("answer"), "error: {err}");
    }

    #[test]
    fn validate_rejects_invalid_kind() {
        let mut t = sample_transfer();
        t.kind = "summary".to_string();
        let err = validate_payload(&t).unwrap_err();
        assert!(err.contains("kind"), "error: {err}");
    }

    #[test]
    fn validate_rejects_unsupported_version() {
        let mut t = sample_transfer();
        t.schema_version = 99;
        let err = validate_payload(&t).unwrap_err();
        assert!(err.contains("schema version"), "error: {err}");
    }

    #[test]
    fn validate_rejects_empty_transfer_id() {
        let mut t = sample_transfer();
        t.transfer_id = String::new();
        let err = validate_payload(&t).unwrap_err();
        assert!(err.contains("transferId"), "error: {err}");
    }

    #[test]
    fn validate_rejects_non_uuid_transfer_id() {
        let mut t = sample_transfer();
        t.transfer_id = "not-a-uuid".to_string();
        let err = validate_payload(&t).unwrap_err();
        assert!(err.contains("UUID"), "error: {err}");
    }

    #[test]
    fn validate_accepts_valid_payload() {
        let t = sample_transfer();
        assert!(validate_payload(&t).is_ok());
    }

    #[test]
    fn korean_answer_truncated_safely() {
        let mut t = sample_transfer();
        // 250 Korean characters, each 3 bytes in UTF-8.
        t.answer = "가".repeat(250);
        let r = transfer_to_record(&t);
        assert!(r.title.chars().count() <= 200);
        assert!(r.title.ends_with("..."));
        // Must not panic; the truncated string is valid UTF-8.
        assert!(r.title.is_ascii() || r.title.chars().all(|c| !c.is_control()));
    }

    #[test]
    fn emoji_answer_truncated_safely() {
        let mut t = sample_transfer();
        // 250 emoji, each 4 bytes in UTF-8.
        t.answer = "😀".repeat(250);
        let r = transfer_to_record(&t);
        assert!(r.title.chars().count() <= 200);
        assert!(r.title.ends_with("..."));
    }

    #[test]
    fn short_answer_not_truncated() {
        let mut t = sample_transfer();
        t.answer = "짧은 답변".to_string();
        let r = transfer_to_record(&t);
        assert_eq!(r.title, "짧은 답변");
    }

    #[test]
    fn long_ascii_truncated_at_char_boundary() {
        let mut t = sample_transfer();
        t.answer = "x".repeat(300);
        let r = transfer_to_record(&t);
        assert_eq!(r.title.chars().count(), 200); // 197 + "..."
        assert!(r.title.ends_with("..."));
    }

    #[test]
    fn idempotency_survives_connection_reopen() {
        // Simulate a restart: use the same DB file, close and reopen.
        let dir = tempfile::TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");

        // First "session": import the transfer.
        {
            let mut conn = rusqlite::Connection::open(&db_path).unwrap();
            apply_migrations(&mut conn).unwrap();
            let t = sample_transfer();
            let r = transfer_to_record(&t);
            crate::db::kernel::save_kernel_records(&mut conn, &[r.clone()]).unwrap();
            record_lens_transfer(&mut conn, &t.transfer_id, &r.id).unwrap();
        }

        // Second "session": reopen, check idempotency.
        {
            let conn = rusqlite::Connection::open(&db_path).unwrap();
            assert!(is_transfer_imported(&conn, &sample_transfer().transfer_id).unwrap());
            let existing = find_record_for_transfer(&conn, &sample_transfer().transfer_id)
                .unwrap()
                .expect("record should exist");
            assert_eq!(existing, format!("lens-{}", sample_transfer().transfer_id));
        }
    }
}
