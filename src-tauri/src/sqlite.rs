use serde::Serialize;
use serde_json::Value;

use crate::migrations::{MIGRATIONS, MIGRATION_TABLE_NAME};
use crate::package::default_storage_dir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseStatus {
    pub path: String,
    pub initialized: bool,
    pub applied_migrations: Vec<String>,
    pub pending_migrations: Vec<String>,
    pub migration_table_name: String,
    pub strategy: String,
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

#[tauri::command]
pub fn get_sqlite_migration_status() -> Result<DatabaseStatus, String> {
    Ok(DatabaseStatus {
        path: database_path()?,
        initialized: false,
        applied_migrations: Vec::new(),
        pending_migrations: MIGRATIONS.iter().map(|migration| migration.version.to_string()).collect(),
        migration_table_name: MIGRATION_TABLE_NAME.to_string(),
        strategy: "rusqlite-custom-runner".to_string(),
    })
}

#[tauri::command]
pub fn initialize_sqlite_database() -> Result<DatabaseStatus, String> {
    Err("SQLite runtime migrations are not implemented yet. Mori will use a Rust-native rusqlite runner at app startup.".to_string())
}

#[tauri::command]
pub fn persist_session_snapshot(snapshot: Value) -> Result<PersistSessionSnapshotOutput, String> {
    let session_id = first_string_at(&snapshot, &["sessions", "0", "id"]).unwrap_or_default();
    let project_id = first_string_at(&snapshot, &["projects", "0", "id"]).unwrap_or_default();

    Err(format!(
        "SQLite snapshot persistence is not implemented yet for session '{session_id}' in project '{project_id}'. The command boundary is registered for the upcoming rusqlite repository."
    ))
}

#[tauri::command]
pub fn load_sqlite_session_snapshot(session_id: String) -> Result<Value, String> {
    Err(format!(
        "SQLite session loading is not implemented yet for session '{session_id}'. The rusqlite repository will reconstruct Mori sessions from normalized rows."
    ))
}

#[tauri::command]
pub fn list_sqlite_sessions() -> Result<Value, String> {
    Err("SQLite session listing is not implemented yet. Use browser drafts or .mori JSON export until the rusqlite repository lands.".to_string())
}

fn database_path() -> Result<String, String> {
    Ok(default_storage_dir()?.join("mori.sqlite").to_string_lossy().to_string())
}

fn first_string_at(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;

    for segment in path {
        if let Ok(index) = segment.parse::<usize>() {
            current = current.as_array()?.get(index)?;
        } else {
            current = current.get(*segment)?;
        }
    }

    current.as_str().map(ToString::to_string)
}
