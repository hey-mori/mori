//! Cursor composer (chat) discovery + read.
//!
//! Recent Cursor stores chat in the global `state.vscdb` SQLite database
//! (see `agent_paths::cursor_global_db`) in a key-value table `cursorDiskKV`:
//!
//! - `composerData:<composerId>` — one session: `{ name, createdAt,
//!   lastUpdatedAt, fullConversationHeadersOnly: [{ bubbleId, type }], ... }`.
//!   Some versions also inline the messages under a `conversation` array.
//! - `bubbleId:<composerId>:<bubbleId>` — one message: `{ type: 1 (user) |
//!   2 (assistant), text, ... }`. Tool / thinking bubbles carry no `text` and
//!   are skipped from the rendered transcript.
//!
//! Schema reference: the cursorDiskKV layout is documented by community tools
//! (cursor-history, cursor-conversations-mcp, vibe-replay). This reader is
//! validated against that schema with in-memory fixtures rather than a live
//! store; the message-body rows only exist in current Cursor versions.
//!
//! Everything here opens the database with `OpenFlags::SQLITE_OPEN_READ_ONLY`
//! so Mori can never mutate Cursor's database.

use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorSessionMeta {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub file_path: String,
    pub started_at: String,
    pub updated_at: String,
    pub message_count: usize,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorSessionDetail {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub file_path: String,
    pub started_at: String,
    pub updated_at: String,
    pub message_count: usize,
    pub title: String,
    pub messages: Vec<CursorMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub subkind: String,
}

#[tauri::command]
pub fn discover_cursor_sessions() -> Result<Vec<CursorSessionMeta>, String> {
    let db = cursor_global_db()?;
    if !db.exists() {
        return Ok(Vec::new());
    }
    let conn = open_readonly(&db)?;
    let db_label = db.to_string_lossy().to_string();
    list_sessions_from(&conn, &db_label)
}

#[tauri::command]
pub fn get_cursor_session(session_path: String) -> Result<CursorSessionDetail, String> {
    let composer_id = session_path.trim();
    if composer_id.is_empty() {
        return Err("sessionPath (composerId) is required.".to_string());
    }
    let db = cursor_global_db()?;
    let conn = open_readonly(&db)?;
    let db_label = db.to_string_lossy().to_string();
    read_session_from(&conn, composer_id, &db_label)
}

fn cursor_global_db() -> Result<std::path::PathBuf, String> {
    crate::agent_paths::require(
        crate::agent_paths::cursor_global_db(),
        "Cursor state database",
    )
}

fn open_readonly(path: &std::path::Path) -> Result<Connection, String> {
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Failed to open {} read-only: {error}", path.display()))
}

/// Count composer (chat) sessions in a Cursor `state.vscdb`, opening it
/// read-only. Used by connection-status detection (`detect_cursor`). A missing
/// table, open failure, or query error reads as zero rather than erroring, so a
/// status probe never breaks on an unfamiliar Cursor layout.
pub(crate) fn count_composer_sessions(db_path: &std::path::Path) -> u32 {
    let Ok(conn) = open_readonly(db_path) else {
        return 0;
    };
    conn.query_row(
        "SELECT COUNT(*) FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count.max(0) as u32)
    .unwrap_or(0)
}

/// A `cursorDiskKV` value column may be stored as TEXT or BLOB depending on
/// the Cursor version; decode either as a UTF-8 string.
fn value_ref_to_string(value: ValueRef) -> Option<String> {
    match value {
        ValueRef::Text(bytes) | ValueRef::Blob(bytes) => {
            Some(String::from_utf8_lossy(bytes).into_owned())
        }
        _ => None,
    }
}

/// Read a `cursorDiskKV` value (TEXT or BLOB) as a UTF-8 string.
fn kv_get(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM cursorDiskKV WHERE key = ?1",
        [key],
        |row| Ok(value_ref_to_string(row.get_ref(0)?)),
    )
    .ok()
    .flatten()
}

pub(crate) fn list_sessions_from(
    conn: &Connection,
    db_label: &str,
) -> Result<Vec<CursorSessionMeta>, String> {
    let mut stmt = conn
        .prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'")
        .map_err(|error| format!("Failed to query cursorDiskKV: {error}"))?;
    let rows = stmt
        .query_map([], |row| {
            let key: String = row.get(0)?;
            let value = value_ref_to_string(row.get_ref(1)?).unwrap_or_default();
            Ok((key, value))
        })
        .map_err(|error| format!("Failed to read composer rows: {error}"))?;

    let mut out = Vec::new();
    for row in rows.flatten() {
        let (key, text) = row;
        let composer_id = key
            .strip_prefix("composerData:")
            .unwrap_or(&key)
            .to_string();
        let Ok(data) = serde_json::from_str::<Value>(&text) else {
            // No-silent-truncation: a composer row whose JSON will not parse is
            // surfaced as an unreadable placeholder, matching the other
            // discovery parsers, rather than vanishing from the session list.
            out.push(unreadable_cursor_meta(&composer_id, "파싱 실패", db_label));
            continue;
        };
        out.push(meta_from_composer(&composer_id, &data, db_label));
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

/// Placeholder meta for a composer row we could not parse. Listed so the user
/// sees the Cursor session exists and that Mori could not read it, instead of
/// silently dropping it.
fn unreadable_cursor_meta(composer_id: &str, reason: &str, db_label: &str) -> CursorSessionMeta {
    CursorSessionMeta {
        session_id: composer_id.to_string(),
        project_path: "Cursor".to_string(),
        project_name: "Cursor".to_string(),
        file_path: format!("{db_label}#{composer_id}"),
        started_at: String::new(),
        updated_at: String::new(),
        message_count: 0,
        title: format!("⚠ 읽을 수 없는 세션 · {reason}"),
    }
}

fn meta_from_composer(composer_id: &str, data: &Value, db_label: &str) -> CursorSessionMeta {
    let created = data.get("createdAt").and_then(Value::as_i64);
    let updated = data
        .get("lastUpdatedAt")
        .and_then(Value::as_i64)
        .or(created);
    let started_at = created.map(format_millis_iso).unwrap_or_default();
    let updated_at = updated
        .map(format_millis_iso)
        .unwrap_or_else(|| started_at.clone());

    let title = data
        .get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.trim().is_empty())
        .map(|name| truncate(name, 90))
        .unwrap_or_else(|| format!("Cursor session {}", short_id(composer_id)));

    let message_count = count_messages(data);

    CursorSessionMeta {
        session_id: composer_id.to_string(),
        project_path: "Cursor".to_string(),
        project_name: "Cursor".to_string(),
        file_path: format!("{db_label}#{composer_id}"),
        started_at,
        updated_at,
        message_count,
        title,
    }
}

/// Count renderable messages from a composer's metadata without reading every
/// bubble: prefer an inline `conversation` array, else the headers list.
fn count_messages(data: &Value) -> usize {
    if let Some(conversation) = data.get("conversation").and_then(Value::as_array) {
        return conversation
            .iter()
            .filter(|item| !bubble_text(item).trim().is_empty())
            .count();
    }
    data.get("fullConversationHeadersOnly")
        .and_then(Value::as_array)
        .map(|headers| headers.len())
        .unwrap_or(0)
}

pub(crate) fn read_session_from(
    conn: &Connection,
    composer_id: &str,
    db_label: &str,
) -> Result<CursorSessionDetail, String> {
    let Some(text) = kv_get(conn, &format!("composerData:{composer_id}")) else {
        return Err(format!("Cursor composer {composer_id} was not found."));
    };
    let data: Value = serde_json::from_str(&text)
        .map_err(|error| format!("Invalid composerData JSON: {error}"))?;
    let meta = meta_from_composer(composer_id, &data, db_label);

    let mut messages = Vec::new();

    // Newer split-bubble format: walk the ordered headers and resolve each
    // bubble row. Older inline format: read the `conversation` array directly.
    if let Some(headers) = data
        .get("fullConversationHeadersOnly")
        .and_then(Value::as_array)
    {
        for (index, header) in headers.iter().enumerate() {
            let Some(bubble_id) = header.get("bubbleId").and_then(Value::as_str) else {
                continue;
            };
            let header_type = header.get("type").and_then(Value::as_i64);
            let Some(raw) = kv_get(conn, &format!("bubbleId:{composer_id}:{bubble_id}")) else {
                continue;
            };
            let Ok(bubble) = serde_json::from_str::<Value>(&raw) else {
                continue;
            };
            if let Some(message) = message_from_bubble(&bubble, bubble_id, header_type, index) {
                messages.push(message);
            }
        }
    } else if let Some(conversation) = data.get("conversation").and_then(Value::as_array) {
        for (index, bubble) in conversation.iter().enumerate() {
            let bubble_id = bubble
                .get("bubbleId")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| format!("inline-{index}"));
            if let Some(message) = message_from_bubble(bubble, &bubble_id, None, index) {
                messages.push(message);
            }
        }
    }

    Ok(CursorSessionDetail {
        session_id: meta.session_id,
        project_path: meta.project_path,
        project_name: meta.project_name,
        file_path: meta.file_path,
        started_at: meta.started_at,
        updated_at: meta.updated_at,
        message_count: messages.len(),
        title: meta.title,
        messages,
    })
}

fn message_from_bubble(
    bubble: &Value,
    bubble_id: &str,
    header_type: Option<i64>,
    index: usize,
) -> Option<CursorMessage> {
    let content = bubble_text(bubble);
    if content.trim().is_empty() {
        return None;
    }
    let kind = bubble.get("type").and_then(Value::as_i64).or(header_type);
    let role = match kind {
        Some(1) => "human",
        Some(2) => "assistant",
        _ => return None,
    };
    let created_at = bubble
        .get("createdAt")
        .and_then(Value::as_i64)
        .map(format_millis_iso)
        .unwrap_or_default();
    Some(CursorMessage {
        id: if bubble_id.is_empty() {
            format!("bubble-{index}")
        } else {
            bubble_id.to_string()
        },
        role: role.to_string(),
        content,
        created_at,
        subkind: String::new(),
    })
}

/// A bubble's human-readable text. Cursor stores the message under `text`
/// (some versions also carry a `richText`); tool / thinking bubbles have
/// neither and render as empty so they drop out of the transcript.
fn bubble_text(bubble: &Value) -> String {
    bubble
        .get("text")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_default()
}

fn truncate(input: &str, max: usize) -> String {
    let clean = input.replace('\n', " ").replace('\r', " ");
    if clean.chars().count() <= max {
        return clean;
    }
    let mut out: String = clean.chars().take(max).collect();
    out.push_str("...");
    out
}

fn short_id(id: &str) -> String {
    id.chars().take(8).collect()
}

fn format_millis_iso(millis: i64) -> String {
    let seconds = if millis > 0 {
        (millis / 1000) as u64
    } else {
        0
    };
    crate::claude::format_unix_seconds(seconds)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn readonly_connection_refuses_writes() {
        let temp = TempDir::new().unwrap();
        let db_path = temp.path().join("state.vscdb");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO cursorDiskKV VALUES ('composerData:c1', ?1)",
            [r#"{"name":"Read only"}"#],
        )
        .unwrap();
        drop(conn);

        let readonly = open_readonly(&db_path).unwrap();
        let count = count_composer_sessions(&db_path);
        assert_eq!(count, 1);
        let err = readonly
            .execute(
                "INSERT INTO cursorDiskKV VALUES ('composerData:c2', ?1)",
                [r#"{"name":"Should fail"}"#],
            )
            .unwrap_err();
        assert!(
            err.to_string().contains("readonly") || err.to_string().contains("read-only"),
            "unexpected SQLite error: {err}"
        );
    }

    fn seed_split_format(conn: &Connection) {
        conn.execute(
            "CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)",
            [],
        )
        .unwrap();
        let composer = r#"{
            "name": "Resolving useQuery Argument Error",
            "createdAt": 1739000000000,
            "lastUpdatedAt": 1739000005000,
            "fullConversationHeadersOnly": [
                {"bubbleId": "b1", "type": 1},
                {"bubbleId": "b2", "type": 2},
                {"bubbleId": "b3", "type": 2}
            ]
        }"#;
        conn.execute(
            "INSERT INTO cursorDiskKV VALUES ('composerData:c1', ?1)",
            [composer],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO cursorDiskKV VALUES ('bubbleId:c1:b1', ?1)",
            [r#"{"type":1,"text":"Why does useQuery fail?"}"#],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO cursorDiskKV VALUES ('bubbleId:c1:b2', ?1)",
            [r#"{"type":2,"text":"Because the argument is undefined."}"#],
        )
        .unwrap();
        // A tool-only bubble with no text must be skipped.
        conn.execute(
            "INSERT INTO cursorDiskKV VALUES ('bubbleId:c1:b3', ?1)",
            [r#"{"type":2,"name":"run_terminal_cmd","params":"{}"}"#],
        )
        .unwrap();
    }

    #[test]
    fn lists_composers_with_title_and_message_count() {
        let conn = Connection::open_in_memory().unwrap();
        seed_split_format(&conn);
        let sessions = list_sessions_from(&conn, "db").unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "c1");
        assert_eq!(sessions[0].title, "Resolving useQuery Argument Error");
        // message_count from the headers list (3 headers).
        assert_eq!(sessions[0].message_count, 3);
        assert_eq!(sessions[0].file_path, "db#c1");
    }

    #[test]
    fn reads_split_bubbles_in_order_skipping_textless_bubbles() {
        let conn = Connection::open_in_memory().unwrap();
        seed_split_format(&conn);
        let detail = read_session_from(&conn, "c1", "db").unwrap();
        // Two text bubbles render; the tool-only bubble drops out.
        assert_eq!(detail.messages.len(), 2);
        assert_eq!(detail.messages[0].role, "human");
        assert_eq!(detail.messages[0].content, "Why does useQuery fail?");
        assert_eq!(detail.messages[1].role, "assistant");
        assert_eq!(
            detail.messages[1].content,
            "Because the argument is undefined."
        );
    }

    #[test]
    fn reads_inline_conversation_format() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)",
            [],
        )
        .unwrap();
        let composer = r#"{
            "name": "Inline session",
            "conversation": [
                {"type": 1, "text": "Add a retry"},
                {"type": 2, "text": "Done"}
            ]
        }"#;
        conn.execute(
            "INSERT INTO cursorDiskKV VALUES ('composerData:c2', ?1)",
            [composer],
        )
        .unwrap();
        let detail = read_session_from(&conn, "c2", "db").unwrap();
        assert_eq!(detail.messages.len(), 2);
        assert_eq!(detail.messages[0].content, "Add a retry");
        assert_eq!(detail.messages[1].role, "assistant");
    }

    #[test]
    fn read_missing_composer_errors() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)",
            [],
        )
        .unwrap();
        let err = read_session_from(&conn, "ghost", "db").unwrap_err();
        assert!(err.contains("ghost"));
    }

    #[test]
    fn falls_back_to_a_generated_title() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO cursorDiskKV VALUES ('composerData:abcd1234efgh', ?1)",
            [r#"{"fullConversationHeadersOnly":[]}"#],
        )
        .unwrap();
        let sessions = list_sessions_from(&conn, "db").unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].title, "Cursor session abcd1234");
    }

    #[test]
    fn surfaces_an_unreadable_placeholder_for_a_corrupt_composer_row() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)",
            [],
        )
        .unwrap();
        // One good composer and one whose JSON will not parse.
        conn.execute(
            "INSERT INTO cursorDiskKV VALUES ('composerData:good', ?1)",
            [r#"{"name":"Real session","conversation":[]}"#],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO cursorDiskKV VALUES ('composerData:broken', ?1)",
            ["{ not valid json"],
        )
        .unwrap();

        let sessions = list_sessions_from(&conn, "db").unwrap();
        assert_eq!(sessions.len(), 2, "the corrupt row must still be listed");
        let placeholder = sessions
            .iter()
            .find(|session| session.session_id == "broken")
            .expect("placeholder for the corrupt composer is missing");
        assert!(
            placeholder.title.contains("읽을 수 없는 세션"),
            "title was {}",
            placeholder.title
        );
        assert_eq!(placeholder.message_count, 0);
    }
}
