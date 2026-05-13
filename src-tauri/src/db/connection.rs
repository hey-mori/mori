use std::path::PathBuf;

use rusqlite::Connection;

use crate::package::default_storage_dir;

/// Resolve the default Mori SQLite database path under the user storage dir.
pub fn database_path() -> Result<PathBuf, String> {
    Ok(default_storage_dir()?.join("mori.sqlite"))
}

/// Open or create the SQLite database file at the given path.
pub fn open_database(path: &std::path::Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let conn = Connection::open(path).map_err(|error| error.to_string())?;
    configure_pragmas(&conn)?;
    Ok(conn)
}

/// Open an in-memory database, used for tests.
#[allow(dead_code)]
pub fn open_in_memory() -> Result<Connection, String> {
    let conn = Connection::open_in_memory().map_err(|error| error.to_string())?;
    configure_pragmas(&conn)?;
    Ok(conn)
}

fn configure_pragmas(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;\nPRAGMA journal_mode = WAL;\nPRAGMA synchronous = NORMAL;",
    )
    .map_err(|error| error.to_string())
}
