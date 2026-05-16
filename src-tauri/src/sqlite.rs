use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;

use crate::db::{
    append_memory_review_actions, apply_migrations, applied_migrations, database_path,
    list_accepted_memories, list_all_session_imports, list_memory_review_actions,
    list_session_imports, list_sessions, load_session_snapshot, open_database,
    save_accepted_memories, save_session_imports, save_session_snapshot, AcceptedMemoryRow,
    AcceptedMemoryWriteResult, DatabaseStatus, MemoryReviewActionRow, MemoryReviewActionWriteResult,
    SessionImportRow, SessionImportWriteResult, MIGRATIONS, MIGRATION_TABLE_NAME,
};
use crate::db::records::{SessionListEntry, SessionSnapshot, SnapshotPersistResult};

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
    // Idempotent: this only applies pending migrations, so calls during normal
    // command paths are cheap once the DB is current.
    apply_migrations(conn).map(|_| ())
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

