use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use rusqlite::Connection;
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::db::{
    append_kernel_revisions, append_memory_review_actions, apply_migrations, applied_migrations,
    clear_all_data, database_path, delete_durable_document, delete_intake_requests_for_session,
    delete_kernel_object,
    delete_kernel_record, get_durable_document, get_kernel_record,
    list_accepted_memories, list_all_accepted_memories, list_all_intake_requests,
    list_all_session_imports, list_durable_documents, list_intake_requests_for_project,
    list_intake_requests_for_session, list_kernel_objects, list_kernel_records, list_kernel_revisions, list_memory_review_actions,
    list_session_imports, list_sessions, load_session_snapshot, open_database,
    save_accepted_memories, save_durable_documents, save_intake_requests, save_kernel_objects,
    save_kernel_records,
    save_session_imports, save_session_snapshot, search_kernel_records, AcceptedMemoryRow,
    AcceptedMemoryWriteResult, ClearAllDataResult, DatabaseStatus, DurableDocumentRow,
    DurableDocumentWriteResult, IntakeRequestRow, IntakeWriteResult, KernelObjectRow,
    KernelRecordRow, KernelRevisionRow,
    KernelWriteResult, MemoryReviewActionRow, MemoryReviewActionWriteResult, SessionImportRow,
    SessionImportWriteResult, MIGRATIONS, MIGRATION_TABLE_NAME,
};
use crate::db::records::{SessionListEntry, SessionSnapshot, SnapshotPersistResult};
use crate::package::default_storage_dir;

/// State container shared across Tauri commands. Holds a single mutex-guarded
/// SQLite connection. Mori is a desktop app with one user, one DB file.
pub struct SqliteState(pub Mutex<Option<Connection>>);

impl Default for SqliteState {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistSessionSnapshotOutput {
    pub session_id: String,
    pub project_id: String,
    pub events_persisted: usize,
    pub sources_persisted: usize,
    pub issues_persisted: usize,
    pub decisions_persisted: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteSessionListOutput {
    pub sessions: Vec<SessionListEntry>,
}

#[tauri::command]
pub fn append_browser_evidence(
    state: tauri::State<'_, SqliteState>,
    input: crate::db::browser_evidence::BrowserEvidenceInput,
) -> Result<i64, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        crate::db::browser_evidence::append(conn, &input)
    })
}

#[tauri::command]
pub fn list_recent_browser_evidence(
    state: tauri::State<'_, SqliteState>,
    limit: u32,
) -> Result<Vec<crate::db::browser_evidence::BrowserEvidenceRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        crate::db::browser_evidence::recent(conn, limit)
    })
}

#[tauri::command]
pub fn list_browser_evidence_page(
    state: tauri::State<'_, SqliteState>,
    limit: i64,
    cursor: Option<crate::db::browser_evidence::BrowserEvidenceCursor>,
) -> Result<crate::db::browser_evidence::BrowserEvidencePage, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        crate::db::browser_evidence::page(conn, limit, cursor.as_ref())
    }).map_err(|error| match error.as_str() {
        "invalid browser evidence cursor" | "invalid browser evidence page limit" => error,
        _ => "browser evidence read failed".into(),
    })
}

#[tauri::command]
pub fn get_sqlite_migration_status(state: tauri::State<'_, SqliteState>) -> Result<DatabaseStatus, String> {
    with_connection(&state, |conn, path| {
        let records = applied_migrations(conn)?;
        let applied_versions: Vec<String> = records.iter().map(|record| record.version.clone()).collect();
        let pending_versions: Vec<String> = MIGRATIONS
            .iter()
            .map(|migration| migration.version.to_string())
            .filter(|version| !applied_versions.contains(version))
            .collect();
        Ok(DatabaseStatus {
            path,
            initialized: !records.is_empty(),
            applied_migrations: applied_versions,
            pending_migrations: pending_versions,
            migration_table_name: MIGRATION_TABLE_NAME.to_string(),
            strategy: "rusqlite-custom-runner".to_string(),
            tables: list_tables(conn)?,
            migration_records: records,
        })
    })
}

#[tauri::command]
pub fn initialize_sqlite_database(state: tauri::State<'_, SqliteState>) -> Result<DatabaseStatus, String> {
    let path = database_path()?;
    let path_string = path.to_string_lossy().to_string();
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    if guard.is_none() {
        *guard = Some(open_database(&path)?);
    }
    let conn = guard.as_mut().expect("connection initialized above");
    let outcome = apply_migrations(conn)?;
    let records = applied_migrations(conn)?;
    let applied_versions: Vec<String> = records.iter().map(|record| record.version.clone()).collect();
    let pending_versions: Vec<String> = MIGRATIONS
        .iter()
        .map(|migration| migration.version.to_string())
        .filter(|version| !applied_versions.contains(version))
        .collect();
    let _ = outcome;
    Ok(DatabaseStatus {
        path: path_string,
        initialized: !records.is_empty(),
        applied_migrations: applied_versions,
        pending_migrations: pending_versions,
        migration_table_name: MIGRATION_TABLE_NAME.to_string(),
        strategy: "rusqlite-custom-runner".to_string(),
        tables: list_tables(conn)?,
        migration_records: records,
    })
}

#[tauri::command]
pub fn persist_session_snapshot(
    state: tauri::State<'_, SqliteState>,
    snapshot: SessionSnapshot,
) -> Result<PersistSessionSnapshotOutput, String> {
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    if guard.is_none() {
        let path = database_path()?;
        *guard = Some(open_database(&path)?);
    }
    let conn = guard.as_mut().expect("connection ready");
    ensure_migrated(conn)?;
    let result: SnapshotPersistResult = save_session_snapshot(conn, &snapshot)?;
    Ok(PersistSessionSnapshotOutput {
        session_id: result.session_id,
        project_id: result.project_id,
        events_persisted: result.events_written,
        sources_persisted: result.sources_written,
        issues_persisted: result.issues_written,
        decisions_persisted: result.decisions_written,
    })
}

#[tauri::command]
pub fn load_sqlite_session_snapshot(
    state: tauri::State<'_, SqliteState>,
    session_id: String,
) -> Result<SessionSnapshot, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        load_session_snapshot(conn, &session_id)
    })
}

#[tauri::command]
pub fn list_sqlite_sessions(
    state: tauri::State<'_, SqliteState>,
) -> Result<SqliteSessionListOutput, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        Ok(SqliteSessionListOutput {
            sessions: list_sessions(conn)?,
        })
    })
}

#[tauri::command]
pub fn save_accepted_project_memories(
    state: tauri::State<'_, SqliteState>,
    memories: Vec<AcceptedMemoryRow>,
) -> Result<AcceptedMemoryWriteResult, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        save_accepted_memories(conn, &memories)
    })
}

#[tauri::command]
pub fn list_accepted_project_memories(
    state: tauri::State<'_, SqliteState>,
    project_id: String,
) -> Result<Vec<AcceptedMemoryRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        list_accepted_memories(conn, &project_id)
    })
}

/// List accepted memories across every project. Powers cross-project recall
/// (global memory search, the 메모리 surface); per-project reads stay on
/// `list_accepted_project_memories`.
#[tauri::command]
pub fn list_all_accepted_project_memories(
    state: tauri::State<'_, SqliteState>,
) -> Result<Vec<AcceptedMemoryRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        list_all_accepted_memories(conn)
    })
}

#[tauri::command]
pub fn append_memory_review_action_rows(
    state: tauri::State<'_, SqliteState>,
    actions: Vec<MemoryReviewActionRow>,
) -> Result<MemoryReviewActionWriteResult, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        append_memory_review_actions(conn, &actions)
    })
}

#[tauri::command]
pub fn list_memory_review_action_rows(
    state: tauri::State<'_, SqliteState>,
    project_id: String,
) -> Result<Vec<MemoryReviewActionRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        list_memory_review_actions(conn, &project_id)
    })
}

// ── Record kernel (K1) ─────────────────────────────────────────────────────

#[tauri::command]
pub fn save_kernel_record_rows(
    state: tauri::State<'_, SqliteState>,
    records: Vec<KernelRecordRow>,
) -> Result<KernelWriteResult, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        save_kernel_records(conn, &records)
    })
}

#[tauri::command]
pub fn list_kernel_record_rows(
    state: tauri::State<'_, SqliteState>,
) -> Result<Vec<KernelRecordRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        list_kernel_records(conn)
    })
}

#[tauri::command]
pub fn get_kernel_record_row(
    state: tauri::State<'_, SqliteState>,
    id: String,
) -> Result<Option<KernelRecordRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        get_kernel_record(conn, &id)
    })
}

#[tauri::command]
pub fn delete_kernel_record_row(
    state: tauri::State<'_, SqliteState>,
    id: String,
) -> Result<usize, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        delete_kernel_record(conn, &id)
    })
}

#[tauri::command]
pub fn search_kernel_record_rows(
    state: tauri::State<'_, SqliteState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<KernelRecordRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        search_kernel_records(conn, &query, limit.unwrap_or(50))
    })
}

#[tauri::command]
pub fn save_kernel_object_rows(
    state: tauri::State<'_, SqliteState>,
    objects: Vec<KernelObjectRow>,
) -> Result<KernelWriteResult, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        save_kernel_objects(conn, &objects)
    })
}

#[tauri::command]
pub fn list_kernel_object_rows(
    state: tauri::State<'_, SqliteState>,
    collection: String,
) -> Result<Vec<KernelObjectRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        list_kernel_objects(conn, &collection)
    })
}

#[tauri::command]
pub fn delete_kernel_object_row(
    state: tauri::State<'_, SqliteState>,
    collection: String,
    id: String,
) -> Result<usize, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        delete_kernel_object(conn, &collection, &id)
    })
}

#[tauri::command]
pub fn append_kernel_revision_rows(
    state: tauri::State<'_, SqliteState>,
    revisions: Vec<KernelRevisionRow>,
) -> Result<KernelWriteResult, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        append_kernel_revisions(conn, &revisions)
    })
}

#[tauri::command]
pub fn list_kernel_revision_rows(
    state: tauri::State<'_, SqliteState>,
    record_id: String,
) -> Result<Vec<KernelRevisionRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        list_kernel_revisions(conn, &record_id)
    })
}

/// Live intake index commands (V010).
///
/// R5 of `docs/design/sqlite-source-of-truth-promotion.md` §7. The table and
/// bridge land first and nothing reads them yet, mirroring R1.
#[tauri::command]
pub fn save_intake_request_rows(
    state: tauri::State<'_, SqliteState>,
    rows: Vec<IntakeRequestRow>,
) -> Result<IntakeWriteResult, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        save_intake_requests(conn, &rows)
    })
}

#[tauri::command]
pub fn list_intake_request_rows_for_session(
    state: tauri::State<'_, SqliteState>,
    session_key: String,
) -> Result<Vec<IntakeRequestRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        list_intake_requests_for_session(conn, &session_key)
    })
}

#[tauri::command]
pub fn list_intake_request_rows_for_project(
    state: tauri::State<'_, SqliteState>,
    project_path: String,
) -> Result<Vec<IntakeRequestRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        list_intake_requests_for_project(conn, &project_path)
    })
}

#[tauri::command]
pub fn list_all_intake_request_rows(
    state: tauri::State<'_, SqliteState>,
) -> Result<Vec<IntakeRequestRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        list_all_intake_requests(conn)
    })
}

#[tauri::command]
pub fn delete_intake_request_rows_for_session(
    state: tauri::State<'_, SqliteState>,
    session_key: String,
) -> Result<usize, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        delete_intake_requests_for_session(conn, &session_key)
    })
}

/// Durable document commands.
///
/// R1 of `docs/design/sqlite-source-of-truth-promotion.md` section 7: the
/// bridge exists and is tested, but nothing calls it yet. Adoption is R2
/// onward, so landing these changes no behaviour and can be verified alone.
#[tauri::command]
pub fn save_durable_document_rows(
    state: tauri::State<'_, SqliteState>,
    documents: Vec<DurableDocumentRow>,
) -> Result<DurableDocumentWriteResult, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        save_durable_documents(conn, &documents)
    })
}

#[tauri::command]
pub fn get_durable_document_row(
    state: tauri::State<'_, SqliteState>,
    kind: String,
    owner_id: String,
) -> Result<Option<DurableDocumentRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        get_durable_document(conn, &kind, &owner_id)
    })
}

#[tauri::command]
pub fn list_durable_document_rows(
    state: tauri::State<'_, SqliteState>,
    kind: String,
) -> Result<Vec<DurableDocumentRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        list_durable_documents(conn, &kind)
    })
}

#[tauri::command]
pub fn delete_durable_document_row(
    state: tauri::State<'_, SqliteState>,
    kind: String,
    owner_id: String,
) -> Result<usize, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        delete_durable_document(conn, &kind, &owner_id)
    })
}

#[tauri::command]
pub fn persist_session_imports(
    state: tauri::State<'_, SqliteState>,
    imports: Vec<SessionImportRow>,
) -> Result<SessionImportWriteResult, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        save_session_imports(conn, &imports)
    })
}

#[tauri::command]
pub fn list_session_import_rows(
    state: tauri::State<'_, SqliteState>,
    session_id: String,
) -> Result<Vec<SessionImportRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        list_session_imports(conn, &session_id)
    })
}

#[tauri::command]
pub fn list_all_session_import_rows(
    state: tauri::State<'_, SqliteState>,
) -> Result<Vec<SessionImportRow>, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        list_all_session_imports(conn)
    })
}

#[tauri::command]
pub fn clear_all_sqlite_data(
    state: tauri::State<'_, SqliteState>,
) -> Result<ClearAllDataResult, String> {
    with_connection(&state, |conn, _| {
        ensure_migrated(conn)?;
        clear_all_data(conn)
    })
}

/// Recovery escape hatch: drop every table INCLUDING the migration ledger and
/// re-migrate from scratch. This is the "처음부터 시작" action on the recovery
/// card, and it deliberately does NOT call `ensure_migrated` first, because in
/// the broken-migration state that is the failing path. Rebuilding the ledger
/// clears a checksum mismatch that `clear_all_sqlite_data` (which keeps
/// `_mori_migrations`) cannot. Destructive by design and confirm-gated in the UI.
#[tauri::command]
pub fn reset_sqlite_database(state: tauri::State<'_, SqliteState>) -> Result<(), String> {
    with_connection(&state, |conn, _| reset_connection(conn))
}

/// Drop every table and view (including `_mori_migrations`), then re-migrate.
/// Extracted so it can be tested against an in-memory database.
fn reset_connection(conn: &mut Connection) -> Result<(), String> {
    let objects = list_schema_objects(conn)?;
    conn.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|error| error.to_string())?;
    for (name, kind) in &objects {
        let drop_kind = if kind == "view" { "VIEW" } else { "TABLE" };
        conn.execute_batch(&format!("DROP {drop_kind} IF EXISTS \"{name}\";"))
            .map_err(|error| error.to_string())?;
    }
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| error.to_string())?;
    apply_migrations(conn).map(|_| ())
}

/// Every non-internal table and view name plus its type, for a full reset.
/// Unlike `list_tables`, this includes the `_mori_migrations` ledger.
fn list_schema_objects(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

fn with_connection<R>(
    state: &tauri::State<'_, SqliteState>,
    handler: impl FnOnce(&mut Connection, String) -> Result<R, String>,
) -> Result<R, String> {
    let path = database_path()?;
    let path_string = path.to_string_lossy().to_string();
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    if guard.is_none() {
        *guard = Some(open_database(&path)?);
    }
    let conn = guard.as_mut().expect("connection ready");
    handler(conn, path_string)
}

fn ensure_migrated(conn: &mut Connection) -> Result<(), String> {
    // Before applying pending migrations against an *existing* database, snapshot
    // it so a migration that fails leaves a restore point instead of a dead end.
    // Skip on the common no-op run (DB already current) and on a fresh DB (no
    // applied migrations yet: nothing to lose). A backup failure aborts the
    // migration so the schema is never changed without a restore point.
    let applied = applied_migrations(conn)?;
    let pending = MIGRATIONS
        .iter()
        .any(|migration| !applied.iter().any(|record| record.version == migration.version));
    if pending && !applied.is_empty() {
        let label = format!("pre-v{}", applied.len());
        let dir = crate::db::backup::backups_dir()?;
        crate::db::backup::backup_database(conn, &dir, &label)?;
    }
    // Idempotent: this only applies pending migrations, so calls during normal
    // command paths are cheap once the DB is current.
    apply_migrations(conn).map(|_| ())
}

/// List the automatic pre-migration backups, newest first.
#[tauri::command]
pub fn list_sqlite_backups() -> Result<Vec<crate::db::backup::BackupInfo>, String> {
    crate::db::backup::list_backups_in(&crate::db::backup::backups_dir()?)
}

/// Restore a pre-migration backup over the live database. The cached connection
/// is dropped first so the file unlocks; the next command reopens it. Only a
/// file inside the backups directory can be restored.
#[tauri::command]
pub fn restore_sqlite_backup(
    state: tauri::State<'_, SqliteState>,
    backup_path: String,
) -> Result<(), String> {
    let target = database_path()?;
    let dir = crate::db::backup::backups_dir()?;
    {
        let mut guard = state.0.lock().map_err(|error| error.to_string())?;
        *guard = None;
    }
    crate::db::backup::restore_backup(Path::new(&backup_path), &dir, &target)
}

fn list_tables(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|error| error.to_string())?);
    }
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageRelocation {
    /// The new storage directory, or `None` when the user cancelled the picker.
    pub path: Option<String>,
    pub cancelled: bool,
    /// Whether an existing `mori.sqlite` was carried over to the new location.
    pub moved_db: bool,
}

/// Let the user choose a new storage directory through a native folder picker,
/// then point Mori's data there. The cached connection is dropped first so the
/// SQLite file unlocks (WAL checkpoints on close); the existing database is
/// carried over so data follows the user rather than starting empty. The next
/// DB call reopens at the new path via the persisted override.
#[tauri::command]
pub fn set_storage_location(
    app: AppHandle,
    state: tauri::State<'_, SqliteState>,
) -> Result<StorageRelocation, String> {
    let mut builder = app.dialog().file();
    if let Ok(dir) = default_storage_dir() {
        let _ = std::fs::create_dir_all(&dir);
        if dir.is_dir() {
            builder = builder.set_directory(dir);
        }
    }

    let (tx, rx) = mpsc::channel();
    builder.pick_folder(move |selection| {
        let _ = tx.send(selection.map(|folder| folder.to_string()));
    });

    let chosen = match rx.recv_timeout(Duration::from_secs(600)) {
        Ok(Some(path)) => PathBuf::from(path),
        Ok(None) => {
            return Ok(StorageRelocation {
                path: None,
                cancelled: true,
                moved_db: false,
            })
        }
        Err(_) => return Err("Folder dialog timed out without a response.".to_string()),
    };

    // Resolve the old database path before the override changes what
    // `default_storage_dir()` returns.
    let old_db = database_path()?;
    let new_db = chosen.join("mori.sqlite");

    // Drop the cached connection so the file unlocks (WAL checkpoints on the
    // last close) before anything moves; the next command reopens it.
    {
        let mut guard = state.0.lock().map_err(|error| error.to_string())?;
        *guard = None;
    }

    std::fs::create_dir_all(&chosen)
        .map_err(|error| format!("Failed to create {}: {error}", chosen.display()))?;
    crate::package::apply_storage_override(&chosen)?;

    let mut moved_db = false;
    if old_db != new_db && old_db.exists() && !new_db.exists() {
        move_sqlite_files(&old_db, &new_db)?;
        moved_db = true;
    }

    Ok(StorageRelocation {
        path: Some(chosen.to_string_lossy().to_string()),
        cancelled: false,
        moved_db,
    })
}

/// Carry a SQLite database (and any WAL/SHM sidecars) to a new path. Copies
/// every file first and only removes the originals once all copies succeed, so
/// a mid-move failure leaves the source intact.
fn move_sqlite_files(old_db: &Path, new_db: &Path) -> Result<(), String> {
    const SUFFIXES: [&str; 3] = ["", "-wal", "-shm"];
    for suffix in SUFFIXES {
        let from = sidecar_path(old_db, suffix);
        if !from.exists() {
            continue;
        }
        let to = sidecar_path(new_db, suffix);
        std::fs::copy(&from, &to)
            .map_err(|error| format!("Failed to copy {}: {error}", from.display()))?;
    }
    for suffix in SUFFIXES {
        let from = sidecar_path(old_db, suffix);
        if from.exists() {
            let _ = std::fs::remove_file(&from);
        }
    }
    Ok(())
}

/// Append a WAL/SHM suffix to a database path: `mori.sqlite` -> `mori.sqlite-wal`.
fn sidecar_path(db: &Path, suffix: &str) -> PathBuf {
    if suffix.is_empty() {
        return db.to_path_buf();
    }
    let mut name = db.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(suffix);
    db.with_file_name(name)
}

// ─── Lens connector ────────────────────────────────────────────────────────

/// Write the capability marker that signals to Lens that Mori supports
/// the Lens transfer protocol. Creates `~/.mori/connectors/lens/` if
/// needed. Safe to call on every startup.
#[tauri::command]
pub fn write_lens_capability(state: tauri::State<'_, SqliteState>) -> Result<String, String> {
    with_connection(&state, |conn, _path| {
        let path = crate::connectors::lens::write_capability_marker(conn)?;
        Ok(path.to_string_lossy().to_string())
    })
}

/// List pending Lens transfer files with parsed payloads and
/// already-imported flags.
#[tauri::command]
pub fn list_lens_transfers(
    state: tauri::State<'_, SqliteState>,
) -> Result<crate::connectors::lens::LensInboxListing, String> {
    with_connection(&state, |conn, _path| {
        crate::connectors::lens::list_lens_transfers(conn)
    })
}

/// Read and parse a single Lens transfer file without importing it.
///
/// Accepts a file name (not a full path). The name is confined to the
/// Lens inbox via `safe_lens_path`.
#[tauri::command]
pub fn read_lens_transfer(
    file_name: String,
) -> Result<crate::connectors::lens::LensTransferPayload, String> {
    crate::connectors::lens::read_lens_transfer(&file_name)
}

/// Import a Lens transfer as a `knowledge` MoriRecord. Idempotent:
/// sending the same transfer twice returns the same record ID.
///
/// Accepts a file name (not a full path). The name is confined to the
/// Lens inbox via `safe_lens_path`.
#[tauri::command]
pub fn import_lens_transfer(
    state: tauri::State<'_, SqliteState>,
    file_name: String,
) -> Result<crate::connectors::lens::LensImportResult, String> {
    with_connection(&state, |conn, _path| {
        crate::connectors::lens::import_lens_transfer(conn, &file_name)
    })
}

#[cfg(test)]
mod tests {
    use super::{list_schema_objects, move_sqlite_files, reset_connection, sidecar_path};
    use crate::db::{apply_migrations, open_in_memory};
    use tempfile::TempDir;

    #[test]
    fn reset_clears_a_checksum_mismatch_and_re_migrates() {
        let mut conn = open_in_memory().expect("open in-memory db");
        apply_migrations(&mut conn).expect("initial migrate");

        // Simulate a broken-migration state: corrupt a stored checksum so a
        // normal apply_migrations would refuse (checksum mismatch).
        conn.execute(
            "UPDATE _mori_migrations SET checksum = 'tampered' WHERE version = (SELECT MIN(version) FROM _mori_migrations)",
            [],
        )
        .unwrap();
        assert!(
            apply_migrations(&mut conn).is_err(),
            "a tampered checksum must make the normal path fail"
        );

        // Reset drops the ledger and re-migrates from scratch, clearing the error.
        reset_connection(&mut conn).expect("reset should succeed");
        apply_migrations(&mut conn).expect("post-reset migrate is clean");

        // The ledger is rebuilt and core tables exist again.
        let objects = list_schema_objects(&conn).unwrap();
        assert!(objects.iter().any(|(name, _)| name == "sessions"));
        let ledger: i64 = conn
            .query_row("SELECT COUNT(*) FROM _mori_migrations", [], |row| row.get(0))
            .unwrap();
        assert!(ledger > 0);
    }

    #[test]
    fn list_schema_objects_includes_the_migration_ledger() {
        let mut conn = open_in_memory().expect("open in-memory db");
        apply_migrations(&mut conn).expect("migrate");
        let names: Vec<String> = list_schema_objects(&conn)
            .unwrap()
            .into_iter()
            .map(|(name, _)| name)
            .collect();
        assert!(names.iter().any(|n| n == "_mori_migrations"));
    }

    #[test]
    fn sidecar_path_appends_the_wal_and_shm_suffixes() {
        let temp = TempDir::new().unwrap();
        let db = temp.path().join("mori.sqlite");
        assert_eq!(sidecar_path(&db, ""), db);
        assert_eq!(sidecar_path(&db, "-wal"), temp.path().join("mori.sqlite-wal"));
        assert_eq!(sidecar_path(&db, "-shm"), temp.path().join("mori.sqlite-shm"));
    }

    #[test]
    fn move_sqlite_files_carries_the_db_and_sidecars_then_clears_the_source() {
        let temp = TempDir::new().unwrap();
        let old_dir = temp.path().join("old");
        let new_dir = temp.path().join("new");
        std::fs::create_dir_all(&old_dir).unwrap();
        std::fs::create_dir_all(&new_dir).unwrap();
        let old_db = old_dir.join("mori.sqlite");
        std::fs::write(&old_db, b"main").unwrap();
        std::fs::write(old_dir.join("mori.sqlite-wal"), b"wal").unwrap();
        let new_db = new_dir.join("mori.sqlite");

        move_sqlite_files(&old_db, &new_db).unwrap();

        assert_eq!(std::fs::read(&new_db).unwrap(), b"main");
        assert_eq!(
            std::fs::read(new_dir.join("mori.sqlite-wal")).unwrap(),
            b"wal"
        );
        assert!(!old_db.exists());
        assert!(!old_dir.join("mori.sqlite-wal").exists());
    }

    #[test]
    fn move_sqlite_files_skips_absent_sidecars() {
        let temp = TempDir::new().unwrap();
        let old_db = temp.path().join("mori.sqlite");
        std::fs::write(&old_db, b"main").unwrap();
        let new_db = temp.path().join("moved").join("mori.sqlite");
        std::fs::create_dir_all(new_db.parent().unwrap()).unwrap();

        move_sqlite_files(&old_db, &new_db).unwrap();

        assert_eq!(std::fs::read(&new_db).unwrap(), b"main");
        assert!(!new_db.with_file_name("mori.sqlite-wal").exists());
        assert!(!old_db.exists());
    }
}
