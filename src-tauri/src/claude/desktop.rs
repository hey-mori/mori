//! Claude Desktop App SQLite discovery + read.
//!
//! The Desktop app's storage layout is product-internal and not contracted
//! anywhere we control, so the strategy is:
//!
//!   1. Look in `%APPDATA%\Claude` (Windows) / `~/Library/Application Support/Claude`
//!      (macOS) / `~/.config/Claude` (Linux) for files that look like
//!      SQLite. We accept a few plausible names so a Claude rename does
//!      not silently break us.
//!   2. If we found one, open it READ-ONLY and dump
//!      `sqlite_master.sql` so the UI / a future iteration can adapt to
//!      the actual schema.
//!   3. For listing and reading conversations, we look for the most
//!      conventional schema first (a `conversations` table and a
//!      `conversation_messages` / `messages` table joined on a
//!      conversation id) and degrade gracefully when fields are missing.
//!
//! Everything below uses `rusqlite` with `OpenFlags::SQLITE_OPEN_READ_ONLY`
//! so we cannot accidentally mutate the Desktop app's database.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;

/// Plausible SQLite file names the Claude Desktop app may use. We test the
/// most-specific names first. If Anthropic ships a new name, the discovery
/// command still returns a useful "found: false" + the directory listing so
/// the UI can prompt the user.
const KNOWN_DB_FILENAMES: &[&str] = &[
    "claude_storage.db",
    "Claude.db",
    "claude.db",
    "storage.db",
    "app.db",
    "LevelDB",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDesktopDiscovery {
    pub found: bool,
    pub db_path: Option<String>,
    pub schema_tables: Vec<String>,
    pub raw_schema: Option<String>,
    pub error: Option<String>,
    /// Directory we looked in (so the UI can say "no DB found under X").
    pub searched_in: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConversationMeta {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: usize,
    pub source: &'static str,
    pub project_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConversationDetail {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: usize,
    pub source: &'static str,
    pub project_name: Option<String>,
    pub messages: Vec<ClaudeMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[tauri::command]
pub fn discover_claude_desktop() -> Result<ClaudeDesktopDiscovery, String> {
    // Probe every plausible directory. Report each one we tried so the UI
    // can show "looked in: X, Y, Z" instead of just one path. The first
    // directory that actually contains a SQLite file wins; if none do, we
    // surface the full search list with the most informative error.
    let candidates = claude_desktop_candidate_dirs();
    if candidates.is_empty() {
        return Ok(ClaudeDesktopDiscovery {
            found: false,
            db_path: None,
            schema_tables: Vec::new(),
            raw_schema: None,
            error: Some(
                "Could not derive a Claude Desktop directory on this OS.".to_string(),
            ),
            searched_in: None,
        });
    }

    let searched_in = Some(
        candidates
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join("; "),
    );

    let mut last_directory_seen: Option<PathBuf> = None;
    for dir in &candidates {
        if !dir.exists() {
            continue;
        }
        last_directory_seen = Some(dir.clone());
        let Some(db_path) = find_sqlite_db(dir) else {
            continue;
        };
        let (schema_tables, raw_schema, error) = match read_schema(&db_path) {
            Ok((tables, schema)) => (tables, Some(schema), None),
            Err(err) => (Vec::new(), None, Some(err)),
        };
        return Ok(ClaudeDesktopDiscovery {
            found: error.is_none(),
            db_path: Some(db_path.to_string_lossy().to_string()),
            schema_tables,
            raw_schema,
            error,
            searched_in,
        });
    }

    // Got here means no SQLite file was found. The error message tells the
    // user whether the storage directory existed at all (perhaps Claude
    // Desktop is using LevelDB / IndexedDB, in which case we cannot help
    // without further reverse engineering).
    let error = match last_directory_seen {
        Some(dir) => Some(format!(
            "Found a Claude Desktop directory at {} but no SQLite database inside it. Claude Desktop may be storing conversations in a non-SQLite format (e.g. LevelDB / IndexedDB).",
            dir.display()
        )),
        None => Some(
            "No Claude Desktop storage directory exists at any of the expected locations. Make sure Claude Desktop is installed and has been launched at least once."
                .to_string(),
        ),
    };

    Ok(ClaudeDesktopDiscovery {
        found: false,
        db_path: None,
        schema_tables: Vec::new(),
        raw_schema: None,
        error,
        searched_in,
    })
}

#[tauri::command]
pub fn list_claude_desktop_conversations() -> Result<Vec<ClaudeConversationMeta>, String> {
    let db_path = locate_claude_desktop_db()?;
    let conn = open_readonly(&db_path)?;
    list_conversations_from(&conn)
}

#[tauri::command]
pub fn get_claude_desktop_conversation(
    conversation_id: String,
) -> Result<ClaudeConversationDetail, String> {
    let trimmed = conversation_id.trim();
    if trimmed.is_empty() {
        return Err("conversationId is required.".to_string());
    }
    let db_path = locate_claude_desktop_db()?;
    let conn = open_readonly(&db_path)?;
    read_conversation_from(&conn, trimmed)
}

/// Walk the candidate directories and return the first SQLite database we
/// find. Used by `list` and `get` so they apply the same path resolution
/// as `discover`. Returns a structured error pointing at every directory
/// that was probed.
fn locate_claude_desktop_db() -> Result<PathBuf, String> {
    let candidates = claude_desktop_candidate_dirs();
    for dir in &candidates {
        if !dir.is_dir() {
            continue;
        }
        if let Some(path) = find_sqlite_db(dir) {
            return Ok(path);
        }
    }
    let probed = candidates
        .iter()
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>()
        .join("; ");
    Err(format!(
        "No Claude Desktop SQLite database was found. Probed: {}",
        probed
    ))
}

// ─── helpers ───────────────────────────────────────────────────────────────

/// Ordered list of plausible Claude Desktop data directories. The first
/// entry is the modern default; later entries cover older builds and
/// sideloads. The UI uses every entry it tried for the "looked in" message
/// when nothing is found.
pub(crate) fn claude_desktop_candidate_dirs() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    if cfg!(target_os = "windows") {
        if let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
            out.push(local.join("Claude"));
            out.push(local.join("Anthropic").join("Claude"));
        }
        if let Some(roaming) = std::env::var_os("APPDATA").map(PathBuf::from) {
            out.push(roaming.join("Claude"));
            out.push(roaming.join("Anthropic").join("Claude"));
        }
        return out;
    }
    if let Some(home) = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
    {
        #[cfg(target_os = "macos")]
        {
            out.push(home.join("Library").join("Application Support").join("Claude"));
            out.push(home.join("Library").join("Application Support").join("Anthropic").join("Claude"));
        }
        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            out.push(home.join(".config").join("Claude"));
            out.push(home.join(".config").join("Anthropic").join("Claude"));
        }
        if out.is_empty() {
            out.push(home);
        }
    }
    out
}

pub(crate) fn find_sqlite_db(dir: &Path) -> Option<PathBuf> {
    // Try the known names first so we pick a Claude-owned file rather than
    // some other SQLite file the user happens to have copied in.
    for name in KNOWN_DB_FILENAMES {
        let candidate = dir.join(name);
        if candidate.is_file() && is_sqlite_file(&candidate) {
            return Some(candidate);
        }
    }
    // Fall back to any file under the root that looks like SQLite. We do
    // NOT recurse — Claude Desktop keeps the DB at the top level.
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if is_sqlite_file(&path) {
            return Some(path);
        }
    }
    None
}

fn is_sqlite_file(path: &Path) -> bool {
    // SQLite files start with the literal bytes `SQLite format 3\0`. This
    // header is stable across all v3 releases.
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    use std::io::Read;
    let mut header = [0u8; 16];
    if file.read_exact(&mut header).is_err() {
        return false;
    }
    &header == b"SQLite format 3\0"
}

fn open_readonly(path: &Path) -> Result<Connection, String> {
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Failed to open {} read-only: {}", path.display(), error))
}

fn read_schema(path: &Path) -> Result<(Vec<String>, String), String> {
    let conn = open_readonly(path)?;
    let mut tables: Vec<String> = Vec::new();
    let mut raw_schema = String::new();

    let mut stmt = conn
        .prepare(
            "SELECT name, COALESCE(sql, '') FROM sqlite_master \
             WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let name: String = row.get(0)?;
            let sql: String = row.get(1)?;
            Ok((name, sql))
        })
        .map_err(|error| error.to_string())?;
    for row in rows {
        let (name, sql) = row.map_err(|error| error.to_string())?;
        tables.push(name);
        if !sql.is_empty() {
            raw_schema.push_str(&sql);
            raw_schema.push_str(";\n");
        }
    }
    Ok((tables, raw_schema))
}

/// Resolve the best (table, id-column, title-column, created-column,
/// updated-column) tuple for the conversation list. We try canonical names
/// first and degrade if the schema diverges.
fn pick_conversation_table(conn: &Connection) -> Option<ConversationTable> {
    let candidates = [
        ConversationTable {
            table: "conversations".to_string(),
            id_col: "uuid".to_string(),
            title_col: Some("name".to_string()),
            created_col: Some("created_at".to_string()),
            updated_col: Some("updated_at".to_string()),
        },
        ConversationTable {
            table: "conversations".to_string(),
            id_col: "id".to_string(),
            title_col: Some("title".to_string()),
            created_col: Some("created_at".to_string()),
            updated_col: Some("updated_at".to_string()),
        },
        ConversationTable {
            table: "chats".to_string(),
            id_col: "id".to_string(),
            title_col: Some("title".to_string()),
            created_col: Some("created_at".to_string()),
            updated_col: Some("updated_at".to_string()),
        },
    ];
    for candidate in candidates {
        let columns = column_names(conn, &candidate.table);
        if columns.is_empty() {
            continue;
        }
        if !columns.iter().any(|c| c == &candidate.id_col) {
            continue;
        }
        // Drop optional columns we cannot find — the query will just
        // emit empty strings for them.
        let resolved = ConversationTable {
            table: candidate.table.clone(),
            id_col: candidate.id_col.clone(),
            title_col: candidate
                .title_col
                .filter(|name| columns.iter().any(|c| c == name)),
            created_col: candidate
                .created_col
                .filter(|name| columns.iter().any(|c| c == name)),
            updated_col: candidate
                .updated_col
                .filter(|name| columns.iter().any(|c| c == name)),
        };
        return Some(resolved);
    }
    None
}

fn pick_messages_table(conn: &Connection) -> Option<MessagesTable> {
    let candidates = [
        MessagesTable {
            table: "conversation_messages".to_string(),
            conversation_col: "conversation_uuid".to_string(),
            id_col: "id".to_string(),
            role_col: Some("role".to_string()),
            content_col: Some("content".to_string()),
            created_col: Some("created_at".to_string()),
        },
        MessagesTable {
            table: "messages".to_string(),
            conversation_col: "conversation_id".to_string(),
            id_col: "id".to_string(),
            role_col: Some("role".to_string()),
            content_col: Some("content".to_string()),
            created_col: Some("created_at".to_string()),
        },
        MessagesTable {
            table: "messages".to_string(),
            conversation_col: "chat_id".to_string(),
            id_col: "id".to_string(),
            role_col: Some("role".to_string()),
            content_col: Some("text".to_string()),
            created_col: Some("created_at".to_string()),
        },
    ];
    for candidate in candidates {
        let columns = column_names(conn, &candidate.table);
        if columns.is_empty() {
            continue;
        }
        if !columns.iter().any(|c| c == &candidate.conversation_col) {
            continue;
        }
        if !columns.iter().any(|c| c == &candidate.id_col) {
            continue;
        }
        let resolved = MessagesTable {
            table: candidate.table.clone(),
            conversation_col: candidate.conversation_col.clone(),
            id_col: candidate.id_col.clone(),
            role_col: candidate
                .role_col
                .filter(|name| columns.iter().any(|c| c == name)),
            content_col: candidate
                .content_col
                .filter(|name| columns.iter().any(|c| c == name)),
            created_col: candidate
                .created_col
                .filter(|name| columns.iter().any(|c| c == name)),
        };
        return Some(resolved);
    }
    None
}

fn list_conversations_from(conn: &Connection) -> Result<Vec<ClaudeConversationMeta>, String> {
    let table = pick_conversation_table(conn).ok_or_else(|| {
        "No recognised Claude Desktop conversation table was found in the SQLite database."
            .to_string()
    })?;
    let messages = pick_messages_table(conn);

    let title_expr = table
        .title_col
        .as_deref()
        .map(|c| format!("COALESCE({}, '')", c))
        .unwrap_or_else(|| "''".to_string());
    let created_expr = table
        .created_col
        .as_deref()
        .map(|c| format!("COALESCE({}, '')", c))
        .unwrap_or_else(|| "''".to_string());
    let updated_expr = table
        .updated_col
        .as_deref()
        .map(|c| format!("COALESCE({}, '')", c))
        .unwrap_or_else(|| "''".to_string());

    let sql = format!(
        "SELECT {id}, {title}, {created}, {updated} FROM {table} ORDER BY {order} DESC",
        id = table.id_col,
        title = title_expr,
        created = created_expr,
        updated = updated_expr,
        table = table.table,
        order = table.updated_col.as_deref().unwrap_or(&table.id_col),
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|error| format!("Failed to prepare conversation list query: {error}"))?;
    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let created_at: String = row.get(2)?;
            let updated_at: String = row.get(3)?;
            Ok((id, title, created_at, updated_at))
        })
        .map_err(|error| error.to_string())?;

    let mut result: Vec<ClaudeConversationMeta> = Vec::new();
    for row in rows {
        let (id, title, created_at, updated_at) = row.map_err(|error| error.to_string())?;
        let message_count = if let Some(messages) = &messages {
            count_messages_for(conn, messages, &id).unwrap_or(0)
        } else {
            0
        };
        let display_title = if title.trim().is_empty() {
            format!("Untitled conversation ({})", short_id(&id))
        } else {
            title
        };
        result.push(ClaudeConversationMeta {
            id,
            title: display_title,
            created_at,
            updated_at,
            message_count,
            source: "desktop",
            project_name: None,
        });
    }
    Ok(result)
}

fn read_conversation_from(
    conn: &Connection,
    conversation_id: &str,
) -> Result<ClaudeConversationDetail, String> {
    let table = pick_conversation_table(conn).ok_or_else(|| {
        "No recognised Claude Desktop conversation table was found.".to_string()
    })?;
    let messages_table = pick_messages_table(conn).ok_or_else(|| {
        "No recognised Claude Desktop messages table was found.".to_string()
    })?;

    let title_expr = table
        .title_col
        .as_deref()
        .map(|c| format!("COALESCE({}, '')", c))
        .unwrap_or_else(|| "''".to_string());
    let created_expr = table
        .created_col
        .as_deref()
        .map(|c| format!("COALESCE({}, '')", c))
        .unwrap_or_else(|| "''".to_string());
    let updated_expr = table
        .updated_col
        .as_deref()
        .map(|c| format!("COALESCE({}, '')", c))
        .unwrap_or_else(|| "''".to_string());

    let meta_sql = format!(
        "SELECT {id}, {title}, {created}, {updated} FROM {table} WHERE {id} = ?1 LIMIT 1",
        id = table.id_col,
        title = title_expr,
        created = created_expr,
        updated = updated_expr,
        table = table.table,
    );
    let mut stmt = conn
        .prepare(&meta_sql)
        .map_err(|error| format!("Failed to prepare conversation query: {error}"))?;
    let meta = stmt
        .query_row([conversation_id], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let created_at: String = row.get(2)?;
            let updated_at: String = row.get(3)?;
            Ok((id, title, created_at, updated_at))
        })
        .map_err(|error| format!("Conversation lookup failed: {error}"))?;

    let messages = read_messages_for(conn, &messages_table, conversation_id)?;
    let display_title = if meta.1.trim().is_empty() {
        format!("Untitled conversation ({})", short_id(&meta.0))
    } else {
        meta.1
    };
    Ok(ClaudeConversationDetail {
        id: meta.0,
        title: display_title,
        created_at: meta.2,
        updated_at: meta.3,
        message_count: messages.len(),
        source: "desktop",
        project_name: None,
        messages,
    })
}

fn count_messages_for(
    conn: &Connection,
    table: &MessagesTable,
    conversation_id: &str,
) -> Result<usize, String> {
    let sql = format!(
        "SELECT COUNT(*) FROM {table} WHERE {col} = ?1",
        table = table.table,
        col = table.conversation_col,
    );
    let count: i64 = conn
        .query_row(&sql, [conversation_id], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    Ok(count.max(0) as usize)
}

fn read_messages_for(
    conn: &Connection,
    table: &MessagesTable,
    conversation_id: &str,
) -> Result<Vec<ClaudeMessage>, String> {
    let role_expr = table
        .role_col
        .as_deref()
        .map(|c| format!("COALESCE({}, '')", c))
        .unwrap_or_else(|| "''".to_string());
    let content_expr = table
        .content_col
        .as_deref()
        .map(|c| format!("COALESCE({}, '')", c))
        .unwrap_or_else(|| "''".to_string());
    let created_expr = table
        .created_col
        .as_deref()
        .map(|c| format!("COALESCE({}, '')", c))
        .unwrap_or_else(|| "''".to_string());

    let order = table.created_col.as_deref().unwrap_or(&table.id_col);
    let sql = format!(
        "SELECT {id}, {role}, {content}, {created} FROM {table} WHERE {conv} = ?1 ORDER BY {order} ASC",
        id = table.id_col,
        role = role_expr,
        content = content_expr,
        created = created_expr,
        table = table.table,
        conv = table.conversation_col,
        order = order,
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|error| format!("Failed to prepare messages query: {error}"))?;
    let rows = stmt
        .query_map([conversation_id], |row| {
            let id: String = row.get(0)?;
            let role: String = row.get(1)?;
            let content: String = row.get(2)?;
            let created_at: String = row.get(3)?;
            Ok(ClaudeMessage {
                id,
                role: normalize_role(&role),
                content: normalize_content(&content),
                created_at,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut messages = Vec::new();
    for row in rows {
        messages.push(row.map_err(|error| error.to_string())?);
    }
    Ok(messages)
}

fn column_names(conn: &Connection, table: &str) -> Vec<String> {
    // PRAGMA table_info returns one row per column; we only want the names.
    // We use string interpolation here because PRAGMA does not accept
    // bound parameters — table is from our static candidate list, never
    // user input.
    let sql = format!("PRAGMA table_info({})", quote_ident(table));
    let mut stmt = match conn.prepare(&sql) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };
    let rows = stmt.query_map([], |row| row.get::<_, String>(1));
    let Ok(rows) = rows else {
        return Vec::new();
    };
    let mut names = Vec::new();
    for row in rows.flatten() {
        names.push(row);
    }
    names
}

fn quote_ident(ident: &str) -> String {
    // Defensive quoting for our hard-coded table names — keeps the PRAGMA
    // call safe even if a candidate ever contained a non-trivial character.
    format!("\"{}\"", ident.replace('"', "\"\""))
}

fn short_id(id: &str) -> String {
    let trimmed: String = id.chars().take(8).collect();
    trimmed
}

pub(crate) fn normalize_role(raw: &str) -> String {
    let lower = raw.trim().to_ascii_lowercase();
    match lower.as_str() {
        "human" | "user" => "human".to_string(),
        "assistant" | "ai" | "model" => "assistant".to_string(),
        "" => "assistant".to_string(),
        other => other.to_string(),
    }
}

/// Best-effort plain-text projection of a stored Claude message body.
///
/// The Desktop app sometimes stores message content as plain text and
/// sometimes as a JSON-encoded array of segments. We accept both shapes
/// and never fail — anything we can't interpret comes through verbatim.
pub(crate) fn normalize_content(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if !trimmed.starts_with('[') && !trimmed.starts_with('{') {
        return raw.to_string();
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) else {
        return raw.to_string();
    };
    let mut out = String::new();
    collect_text(&value, &mut out);
    if out.trim().is_empty() {
        raw.to_string()
    } else {
        out
    }
}

fn collect_text(value: &serde_json::Value, out: &mut String) {
    match value {
        serde_json::Value::String(text) => {
            if !out.is_empty() && !out.ends_with('\n') {
                out.push('\n');
            }
            out.push_str(text);
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_text(item, out);
            }
        }
        serde_json::Value::Object(map) => {
            if let Some(serde_json::Value::String(text)) = map.get("text") {
                if !out.is_empty() && !out.ends_with('\n') {
                    out.push('\n');
                }
                out.push_str(text);
            } else if let Some(content) = map.get("content") {
                collect_text(content, out);
            }
        }
        _ => {}
    }
}

#[derive(Debug, Clone)]
struct ConversationTable {
    table: String,
    id_col: String,
    title_col: Option<String>,
    created_col: Option<String>,
    updated_col: Option<String>,
}

#[derive(Debug, Clone)]
struct MessagesTable {
    table: String,
    conversation_col: String,
    id_col: String,
    role_col: Option<String>,
    content_col: Option<String>,
    created_col: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use tempfile::TempDir;

    fn setup_canonical_db(conn: &Connection) {
        conn.execute_batch(
            "
            CREATE TABLE conversations (
                uuid TEXT PRIMARY KEY,
                name TEXT,
                created_at TEXT,
                updated_at TEXT
            );
            CREATE TABLE conversation_messages (
                id TEXT PRIMARY KEY,
                conversation_uuid TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            INSERT INTO conversations VALUES ('c1', 'Demo chat', '2026-01-01', '2026-01-02');
            INSERT INTO conversations VALUES ('c2', '', '2026-01-03', '2026-01-04');
            INSERT INTO conversation_messages VALUES
                ('m1', 'c1', 'user', 'Hello there', '2026-01-01T00:00:00'),
                ('m2', 'c1', 'assistant',
                    '[{\"type\":\"text\",\"text\":\"Hi!\"}]',
                    '2026-01-01T00:00:01');
            ",
        )
        .unwrap();
    }

    #[test]
    fn lists_conversations_with_message_counts() {
        let conn = Connection::open_in_memory().unwrap();
        setup_canonical_db(&conn);
        let listed = list_conversations_from(&conn).unwrap();
        assert_eq!(listed.len(), 2);
        let demo = listed.iter().find(|item| item.id == "c1").unwrap();
        assert_eq!(demo.title, "Demo chat");
        assert_eq!(demo.message_count, 2);
        let blank = listed.iter().find(|item| item.id == "c2").unwrap();
        assert!(blank.title.starts_with("Untitled conversation"));
    }

    #[test]
    fn reads_conversation_detail_and_decodes_json_content() {
        let conn = Connection::open_in_memory().unwrap();
        setup_canonical_db(&conn);
        let detail = read_conversation_from(&conn, "c1").unwrap();
        assert_eq!(detail.id, "c1");
        assert_eq!(detail.messages.len(), 2);
        assert_eq!(detail.messages[0].role, "human");
        assert_eq!(detail.messages[0].content, "Hello there");
        assert_eq!(detail.messages[1].role, "assistant");
        assert!(detail.messages[1].content.contains("Hi!"));
    }

    #[test]
    fn read_returns_error_for_unknown_conversation() {
        let conn = Connection::open_in_memory().unwrap();
        setup_canonical_db(&conn);
        let err = read_conversation_from(&conn, "missing").unwrap_err();
        assert!(err.to_lowercase().contains("conversation"));
    }

    #[test]
    fn list_returns_error_when_table_missing() {
        let conn = Connection::open_in_memory().unwrap();
        // Empty DB — no tables.
        let err = list_conversations_from(&conn).unwrap_err();
        assert!(err.to_lowercase().contains("conversation"));
    }

    #[test]
    fn normalize_role_maps_known_synonyms() {
        assert_eq!(normalize_role("user"), "human");
        assert_eq!(normalize_role("Human"), "human");
        assert_eq!(normalize_role("assistant"), "assistant");
        assert_eq!(normalize_role("AI"), "assistant");
        assert_eq!(normalize_role("model"), "assistant");
        assert_eq!(normalize_role(""), "assistant");
        assert_eq!(normalize_role("system"), "system");
    }

    #[test]
    fn normalize_content_handles_text_array_form() {
        let out =
            normalize_content("[{\"type\":\"text\",\"text\":\"Hi\"},{\"type\":\"text\",\"text\":\"There\"}]");
        assert!(out.contains("Hi"));
        assert!(out.contains("There"));
    }

    #[test]
    fn normalize_content_passes_through_plain_text() {
        assert_eq!(normalize_content("just text"), "just text");
        assert_eq!(normalize_content(""), "");
    }

    #[test]
    fn is_sqlite_file_detects_header() {
        let temp = TempDir::new().unwrap();
        let db_path = temp.path().join("probe.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute("CREATE TABLE x (id INTEGER)", []).unwrap();
        drop(conn);
        assert!(is_sqlite_file(&db_path));

        let not_db = temp.path().join("notes.txt");
        std::fs::write(&not_db, "hello").unwrap();
        assert!(!is_sqlite_file(&not_db));
    }
}
