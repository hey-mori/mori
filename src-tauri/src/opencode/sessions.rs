//! OpenCode local session discovery + read.
//!
//! OpenCode stores work locally as a three-level JSON tree under
//! `<data>/storage` (see `agent_paths::opencode_storage_dir`):
//!
//! - `session/<projectID>/ses_*.json` — one file per session (id, title,
//!   working directory, created / updated time in epoch millis).
//! - `message/<sessionID>/msg_*.json` — one file per message (role, time).
//! - `part/<messageID>/prt_*.json` — message content split into typed parts;
//!   only `type: "text"` parts carry transcript text.
//!
//! This reader is read-only, bounded, and conservative: it walks only that
//! known root, skips oversized files, surfaces an honest placeholder for any
//! session it cannot parse (no silent truncation), and renders user /
//! assistant message rows plus the session metadata Mori needs for an import
//! review. Tool / reasoning / step parts are intentionally not rendered as
//! transcript text.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

pub const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeSessionMeta {
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
pub struct OpenCodeSessionDetail {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub file_path: String,
    pub started_at: String,
    pub updated_at: String,
    pub message_count: usize,
    pub title: String,
    pub messages: Vec<OpenCodeMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub subkind: String,
}

#[tauri::command]
pub fn discover_opencode_sessions() -> Result<Vec<OpenCodeSessionMeta>, String> {
    let root = opencode_storage_dir()?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    list_sessions_at(&root)
}

#[tauri::command]
pub fn get_opencode_session(session_path: String) -> Result<OpenCodeSessionDetail, String> {
    let trimmed = session_path.trim();
    if trimmed.is_empty() {
        return Err("sessionPath is required.".to_string());
    }
    let root = opencode_storage_dir()?;
    read_session_at(&root, trimmed)
}

pub(crate) fn opencode_storage_dir() -> Result<PathBuf, String> {
    crate::agent_paths::require(crate::agent_paths::opencode_storage_dir(), "OpenCode storage")
}

/// List every session under `<storage>/session`, newest first. Each session
/// that cannot be parsed is surfaced as an unreadable placeholder so the user
/// never silently loses a session from the list.
pub(crate) fn list_sessions_at(storage_root: &Path) -> Result<Vec<OpenCodeSessionMeta>, String> {
    let session_dir = storage_root.join("session");
    if !session_dir.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    collect_json_files(&session_dir, &mut files)?;

    let mut out = Vec::new();
    for path in files {
        if !is_session_file(&path) {
            continue;
        }
        let Ok(metadata) = fs::metadata(&path) else {
            out.push(unreadable_meta(&path, "메타데이터 읽기 실패", SystemTime::UNIX_EPOCH));
            continue;
        };
        let modified = metadata
            .modified()
            .or_else(|_| metadata.created())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        if metadata.len() > MAX_FILE_BYTES {
            out.push(unreadable_meta(
                &path,
                &format!("{} MB 초과", MAX_FILE_BYTES / (1024 * 1024)),
                modified,
            ));
            continue;
        }
        match parse_session_meta(storage_root, &path) {
            Ok(meta) => out.push(meta),
            Err(_) => out.push(unreadable_meta(&path, "파싱 실패", modified)),
        }
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

/// Placeholder for a session file we could not read. Listing it honestly tells
/// the user something is there that Mori could not import, instead of dropping
/// it silently.
fn unreadable_meta(path: &Path, reason: &str, modified: SystemTime) -> OpenCodeSessionMeta {
    let session_id = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_else(|| "unreadable".to_string());
    let when = format_modified_iso(modified);
    OpenCodeSessionMeta {
        session_id,
        project_path: "OpenCode".to_string(),
        project_name: "OpenCode".to_string(),
        file_path: path.to_string_lossy().to_string(),
        started_at: when.clone(),
        updated_at: when,
        message_count: 0,
        title: format!("⚠ 읽을 수 없는 세션 · {reason}"),
    }
}

pub(crate) fn read_session_at(
    storage_root: &Path,
    session_path: &str,
) -> Result<OpenCodeSessionDetail, String> {
    let requested = PathBuf::from(session_path);
    let canonical_root = fs::canonicalize(storage_root)
        .map_err(|error| format!("Failed to resolve {}: {error}", storage_root.display()))?;
    let canonical = fs::canonicalize(&requested)
        .map_err(|error| format!("Failed to resolve {}: {error}", requested.display()))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Refused: session path is outside the OpenCode storage directory.".to_string());
    }
    if !is_session_file(&canonical) {
        return Err("Refused: file is not an OpenCode session JSON.".to_string());
    }
    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("Failed to stat {}: {error}", canonical.display()))?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(format!(
            "OpenCode session is too large ({} bytes > {} byte cap).",
            metadata.len(),
            MAX_FILE_BYTES
        ));
    }

    let meta = parse_session_meta(storage_root, &canonical)?;
    let messages = read_session_messages(storage_root, &meta.session_id);
    Ok(OpenCodeSessionDetail {
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

fn parse_session_meta(
    storage_root: &Path,
    session_file: &Path,
) -> Result<OpenCodeSessionMeta, String> {
    let text = fs::read_to_string(session_file)
        .map_err(|error| format!("Failed to read {}: {error}", session_file.display()))?;
    let value: Value = serde_json::from_str(&text)
        .map_err(|error| format!("Invalid session JSON {}: {error}", session_file.display()))?;

    let session_id = value
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            session_file
                .file_stem()
                .map(|stem| stem.to_string_lossy().to_string())
        })
        .unwrap_or_default();

    let directory = value
        .get("directory")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let created = value
        .get("time")
        .and_then(|time| time.get("created"))
        .and_then(Value::as_i64);
    let updated = value
        .get("time")
        .and_then(|time| time.get("updated"))
        .and_then(Value::as_i64)
        .or(created);

    let started_at = created.map(format_millis_iso).unwrap_or_default();
    let updated_at = updated
        .map(format_millis_iso)
        .unwrap_or_else(|| started_at.clone());

    let project_path = if directory.is_empty() {
        "OpenCode".to_string()
    } else {
        directory.clone()
    };
    let project_name = if directory.is_empty() {
        "OpenCode".to_string()
    } else {
        basename(&directory)
    };

    let title = value
        .get("title")
        .and_then(Value::as_str)
        .filter(|title| !title.trim().is_empty())
        .map(|title| truncate(title, 90))
        .unwrap_or_else(|| format!("OpenCode session {}", short_id(&session_id)));

    let message_count = count_messages(storage_root, &session_id);

    Ok(OpenCodeSessionMeta {
        session_id,
        project_path,
        project_name,
        file_path: session_file.to_string_lossy().to_string(),
        started_at,
        updated_at,
        message_count,
        title,
    })
}

/// Count message files for a session without reading them — cheap enough to
/// run while listing every session.
fn count_messages(storage_root: &Path, session_id: &str) -> usize {
    let message_dir = storage_root.join("message").join(session_id);
    let Ok(entries) = fs::read_dir(&message_dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter(|entry| is_prefixed_json(&entry.path(), "msg_"))
        .count()
}

/// Read every message for a session, oldest first, joining its text parts into
/// one content string. Messages with no text content are skipped.
fn read_session_messages(storage_root: &Path, session_id: &str) -> Vec<OpenCodeMessage> {
    let message_dir = storage_root.join("message").join(session_id);
    let Ok(entries) = fs::read_dir(&message_dir) else {
        return Vec::new();
    };

    let mut rows: Vec<(i64, OpenCodeMessage)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_prefixed_json(&path, "msg_") {
            continue;
        }
        if fs::metadata(&path).map(|m| m.len() > MAX_FILE_BYTES).unwrap_or(false) {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        let role = normalize_role(value.get("role").and_then(Value::as_str).unwrap_or(""));
        if role != "human" && role != "assistant" {
            continue;
        }
        let message_id = value
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| path.file_stem().map(|stem| stem.to_string_lossy().to_string()))
            .unwrap_or_default();
        let created = value
            .get("time")
            .and_then(|time| time.get("created"))
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let content = read_message_text(storage_root, &message_id);
        if content.trim().is_empty() {
            continue;
        }
        rows.push((
            created,
            OpenCodeMessage {
                id: message_id,
                role,
                content,
                created_at: format_millis_iso(created),
                subkind: String::new(),
            },
        ));
    }

    rows.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.id.cmp(&b.1.id)));
    rows.into_iter().map(|(_, message)| message).collect()
}

/// Join the `type: "text"` parts of a message in id order. Tool / reasoning /
/// step parts are deliberately excluded from the rendered transcript.
fn read_message_text(storage_root: &Path, message_id: &str) -> String {
    let part_dir = storage_root.join("part").join(message_id);
    let Ok(entries) = fs::read_dir(&part_dir) else {
        return String::new();
    };

    let mut parts: Vec<(String, String)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_prefixed_json(&path, "prt_") {
            continue;
        }
        if fs::metadata(&path).map(|m| m.len() > MAX_FILE_BYTES).unwrap_or(false) {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        if value.get("type").and_then(Value::as_str) != Some("text") {
            continue;
        }
        let Some(body) = value.get("text").and_then(Value::as_str) else {
            continue;
        };
        if body.trim().is_empty() {
            continue;
        }
        let key = value
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| path.file_stem().map(|stem| stem.to_string_lossy().to_string()))
            .unwrap_or_default();
        parts.push((key, body.to_string()));
    }

    parts.sort_by(|a, b| a.0.cmp(&b.0));
    parts
        .into_iter()
        .map(|(_, body)| body)
        .collect::<Vec<_>>()
        .join("\n")
}

fn collect_json_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(dir)
        .map_err(|error| format!("Failed to read {}: {error}", dir.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_json_files(&path, out)?;
        } else if is_json(&path) {
            out.push(path);
        }
    }
    Ok(())
}

fn is_session_file(path: &Path) -> bool {
    is_prefixed_json(path, "ses_")
}

fn is_prefixed_json(path: &Path, prefix: &str) -> bool {
    if !is_json(path) {
        return false;
    }
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with(prefix))
        .unwrap_or(false)
}

fn is_json(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("json"))
        .unwrap_or(false)
}

fn normalize_role(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "user" | "human" => "human".to_string(),
        "assistant" | "ai" => "assistant".to_string(),
        other => other.to_string(),
    }
}

fn basename(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    normalized
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|segment| !segment.is_empty())
        .unwrap_or(path)
        .to_string()
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
    let seconds = if millis > 0 { (millis / 1000) as u64 } else { 0 };
    crate::claude::format_unix_seconds(seconds)
}

fn format_modified_iso(when: SystemTime) -> String {
    let duration = when.duration_since(UNIX_EPOCH).unwrap_or_default();
    crate::claude::format_unix_seconds(duration.as_secs())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write(path: &Path, body: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn seed_session(storage: &Path) {
        // session
        write(
            &storage.join("session").join("global").join("ses_a.json"),
            "{\"id\":\"ses_a\",\"directory\":\"C:\\\\dev\\\\demo\",\"title\":\"Add retry to upload\",\"time\":{\"created\":1771000000000,\"updated\":1771000005000}}",
        );
        // two messages
        write(
            &storage.join("message").join("ses_a").join("msg_1.json"),
            "{\"id\":\"msg_1\",\"sessionID\":\"ses_a\",\"role\":\"user\",\"time\":{\"created\":1771000000500}}",
        );
        write(
            &storage.join("message").join("ses_a").join("msg_2.json"),
            "{\"id\":\"msg_2\",\"sessionID\":\"ses_a\",\"role\":\"assistant\",\"time\":{\"created\":1771000001000}}",
        );
        // parts: one text part per message, plus a tool part that must be ignored
        write(
            &storage.join("part").join("msg_1").join("prt_1.json"),
            "{\"id\":\"prt_1\",\"messageID\":\"msg_1\",\"type\":\"text\",\"text\":\"Add a retry\"}",
        );
        write(
            &storage.join("part").join("msg_2").join("prt_2.json"),
            "{\"id\":\"prt_2\",\"messageID\":\"msg_2\",\"type\":\"text\",\"text\":\"Done\"}",
        );
        write(
            &storage.join("part").join("msg_2").join("prt_3.json"),
            "{\"id\":\"prt_3\",\"messageID\":\"msg_2\",\"type\":\"tool\",\"tool\":\"bash\"}",
        );
    }

    #[test]
    fn lists_sessions_with_message_counts() {
        let temp = TempDir::new().unwrap();
        let storage = temp.path().join("storage");
        seed_session(&storage);

        let sessions = list_sessions_at(&storage).unwrap();
        assert_eq!(sessions.len(), 1);
        let session = &sessions[0];
        assert_eq!(session.session_id, "ses_a");
        assert_eq!(session.message_count, 2);
        assert_eq!(session.project_name, "demo");
        assert!(session.title.contains("Add retry"));
    }

    #[test]
    fn reads_session_messages_in_order_skipping_non_text_parts() {
        let temp = TempDir::new().unwrap();
        let storage = temp.path().join("storage");
        seed_session(&storage);

        let session_file = storage.join("session").join("global").join("ses_a.json");
        let detail = read_session_at(&storage, session_file.to_string_lossy().as_ref()).unwrap();
        assert_eq!(detail.messages.len(), 2);
        assert_eq!(detail.messages[0].role, "human");
        assert_eq!(detail.messages[0].content, "Add a retry");
        assert_eq!(detail.messages[1].role, "assistant");
        // The tool part is excluded; only the text part survives.
        assert_eq!(detail.messages[1].content, "Done");
    }

    #[test]
    fn read_rejects_path_outside_root() {
        let temp = TempDir::new().unwrap();
        let storage = temp.path().join("storage");
        std::fs::create_dir_all(&storage).unwrap();
        let outside = temp.path().join("outside.json");
        std::fs::write(&outside, "{\"id\":\"x\"}").unwrap();
        let err = read_session_at(&storage, outside.to_string_lossy().as_ref()).unwrap_err();
        assert!(err.contains("outside") || err.contains("not an OpenCode"));
    }

    #[test]
    fn surfaces_an_unreadable_placeholder_for_bad_json() {
        let temp = TempDir::new().unwrap();
        let storage = temp.path().join("storage");
        write(
            &storage.join("session").join("global").join("ses_bad.json"),
            "{ this is not json",
        );
        let sessions = list_sessions_at(&storage).unwrap();
        assert_eq!(sessions.len(), 1);
        assert!(sessions[0].title.contains("읽을 수 없는 세션"));
        assert_eq!(sessions[0].message_count, 0);
    }
}
