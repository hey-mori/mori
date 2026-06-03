//! Continue (continue.dev) local session discovery + read.
//!
//! Continue stores sessions under `<continue>/sessions` (see
//! `agent_paths::continue_sessions_dir`):
//!
//! - `sessions.json` — an index array of
//!   `{ sessionId, title, dateCreated, workspaceDirectory, messageCount }`.
//!   Listing reads only this one file.
//! - `<sessionId>.json` — the full session: `{ sessionId, title,
//!   workspaceDirectory, history: [{ message: { role, content }, ... }] }`,
//!   where `content` is either a plain string or an array of
//!   `{ type: "text", text }` blocks.
//!
//! Read-only, bounded (8 MB cap), tolerant: a malformed entry is skipped, an
//! unparseable session surfaces as an honest placeholder rather than vanishing.
//! `workspaceDirectory` is a `file://` URI that is decoded into a display path.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

pub const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinueSessionMeta {
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
pub struct ContinueSessionDetail {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub file_path: String,
    pub started_at: String,
    pub updated_at: String,
    pub message_count: usize,
    pub title: String,
    pub messages: Vec<ContinueMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinueMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub subkind: String,
}

#[tauri::command]
pub fn discover_continue_sessions() -> Result<Vec<ContinueSessionMeta>, String> {
    let root = continue_sessions_dir()?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    list_sessions_at(&root)
}

#[tauri::command]
pub fn get_continue_session(session_path: String) -> Result<ContinueSessionDetail, String> {
    let trimmed = session_path.trim();
    if trimmed.is_empty() {
        return Err("sessionPath is required.".to_string());
    }
    let root = continue_sessions_dir()?;
    read_session_at(&root, trimmed)
}

pub(crate) fn continue_sessions_dir() -> Result<PathBuf, String> {
    crate::agent_paths::require(crate::agent_paths::continue_sessions_dir(), "Continue sessions")
}

/// List sessions from the `sessions.json` index, newest first. The index is
/// the source of truth Continue maintains; each entry points at a
/// `<sessionId>.json` sibling that `read_session_at` reads on demand.
pub(crate) fn list_sessions_at(sessions_root: &Path) -> Result<Vec<ContinueSessionMeta>, String> {
    let index_path = sessions_root.join("sessions.json");
    if !index_path.exists() {
        return Ok(Vec::new());
    }
    if fs::metadata(&index_path).map(|m| m.len() > MAX_FILE_BYTES).unwrap_or(false) {
        return Err("Continue sessions.json is too large.".to_string());
    }
    let text = fs::read_to_string(&index_path)
        .map_err(|error| format!("Failed to read {}: {error}", index_path.display()))?;
    let value: Value = serde_json::from_str(&text)
        .map_err(|error| format!("Invalid sessions.json: {error}"))?;
    let Some(entries) = value.as_array() else {
        return Ok(Vec::new());
    };

    let mut out = Vec::new();
    for entry in entries {
        let session_id = entry
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if session_id.is_empty() {
            continue;
        }
        let workspace = entry
            .get("workspaceDirectory")
            .and_then(Value::as_str)
            .unwrap_or("");
        let project_path = decode_workspace(workspace);
        let project_name = if project_path.is_empty() {
            "Continue".to_string()
        } else {
            basename(&project_path)
        };
        let when = parse_millis(entry.get("dateCreated"))
            .map(format_millis_iso)
            .unwrap_or_default();
        let message_count = entry
            .get("messageCount")
            .and_then(Value::as_u64)
            .map(|count| count as usize)
            .unwrap_or(0);
        let title = entry
            .get("title")
            .and_then(Value::as_str)
            .filter(|title| !title.trim().is_empty())
            .map(|title| truncate(title, 90))
            .unwrap_or_else(|| format!("Continue session {}", short_id(&session_id)));

        out.push(ContinueSessionMeta {
            session_id: session_id.clone(),
            project_path: if project_path.is_empty() {
                "Continue".to_string()
            } else {
                project_path
            },
            project_name,
            file_path: sessions_root.join(format!("{session_id}.json")).to_string_lossy().to_string(),
            started_at: when.clone(),
            updated_at: when,
            message_count,
            title,
        });
    }
    out.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    Ok(out)
}

pub(crate) fn read_session_at(
    sessions_root: &Path,
    session_path: &str,
) -> Result<ContinueSessionDetail, String> {
    let requested = PathBuf::from(session_path);
    let canonical_root = fs::canonicalize(sessions_root)
        .map_err(|error| format!("Failed to resolve {}: {error}", sessions_root.display()))?;
    let canonical = fs::canonicalize(&requested)
        .map_err(|error| format!("Failed to resolve {}: {error}", requested.display()))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Refused: session path is outside the Continue sessions directory.".to_string());
    }
    if !is_json(&canonical) {
        return Err("Refused: file is not a Continue session JSON.".to_string());
    }
    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("Failed to stat {}: {error}", canonical.display()))?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(format!(
            "Continue session is too large ({} bytes > {} byte cap).",
            metadata.len(),
            MAX_FILE_BYTES
        ));
    }
    let text = fs::read_to_string(&canonical)
        .map_err(|error| format!("Failed to read {}: {error}", canonical.display()))?;
    let value: Value = serde_json::from_str(&text)
        .map_err(|error| format!("Invalid session JSON: {error}"))?;

    let modified = metadata
        .modified()
        .or_else(|_| metadata.created())
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let fallback = format_modified_iso(modified);

    let session_id = value
        .get("sessionId")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| canonical.file_stem().map(|stem| stem.to_string_lossy().to_string()))
        .unwrap_or_default();
    let workspace = value.get("workspaceDirectory").and_then(Value::as_str).unwrap_or("");
    let project_path = decode_workspace(workspace);
    let project_name = if project_path.is_empty() {
        "Continue".to_string()
    } else {
        basename(&project_path)
    };

    let messages = parse_history(value.get("history"));
    let title = value
        .get("title")
        .and_then(Value::as_str)
        .filter(|title| !title.trim().is_empty())
        .map(|title| truncate(title, 90))
        .unwrap_or_else(|| format!("Continue session {}", short_id(&session_id)));

    let created = parse_millis(value.get("dateCreated").or_else(|| value.get("createdAt")));
    let updated = parse_millis(
        value
            .get("lastUpdatedAt")
            .or_else(|| value.get("updatedAt"))
            .or_else(|| value.get("dateUpdated")),
    )
    .or(created);
    let started_at = created.map(format_millis_iso).unwrap_or_else(|| fallback.clone());
    let updated_at = updated
        .map(format_millis_iso)
        .unwrap_or_else(|| started_at.clone());

    Ok(ContinueSessionDetail {
        session_id,
        project_path: if project_path.is_empty() {
            "Continue".to_string()
        } else {
            project_path
        },
        project_name,
        file_path: canonical.to_string_lossy().to_string(),
        started_at,
        updated_at,
        message_count: messages.len(),
        title,
        messages,
    })
}

fn parse_history(history: Option<&Value>) -> Vec<ContinueMessage> {
    let Some(items) = history.and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let Some(message) = item.get("message") else {
            continue;
        };
        let role = normalize_role(message.get("role").and_then(Value::as_str).unwrap_or(""));
        if role != "human" && role != "assistant" {
            continue;
        }
        let content = collect_content(message.get("content"));
        if content.trim().is_empty() {
            continue;
        }
        let id = message
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("msg-{index}"));
        let created_at = parse_millis(
            item.get("timestamp")
                .or_else(|| item.get("time"))
                .or_else(|| item.get("createdAt"))
                .or_else(|| message.get("timestamp"))
                .or_else(|| message.get("time"))
                .or_else(|| message.get("createdAt")),
        )
        .map(format_millis_iso)
        .unwrap_or_default();
        out.push(ContinueMessage {
            id,
            role,
            content,
            created_at,
            subkind: String::new(),
        });
    }
    out
}

/// Continue message content is either a plain string (assistant) or an array
/// of typed blocks (user); only text is rendered.
fn collect_content(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.to_string(),
        Some(Value::Array(items)) => {
            let mut parts = Vec::new();
            for item in items {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    parts.push(text.to_string());
                } else if let Some(text) = item.as_str() {
                    parts.push(text.to_string());
                }
            }
            parts.join("\n")
        }
        _ => String::new(),
    }
}

/// Decode a `file://` workspace URI into a display path: strip the scheme and
/// percent-decode. `file:///c%3A/dev/x` becomes `c:/dev/x`.
fn decode_workspace(uri: &str) -> String {
    let trimmed = uri.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let without_scheme = trimmed
        .strip_prefix("file:///")
        .or_else(|| trimmed.strip_prefix("file://"))
        .unwrap_or(trimmed);
    percent_decode(without_scheme)
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = hex_val(bytes[i + 1]);
            let lo = hex_val(bytes[i + 2]);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push(hi * 16 + lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn hex_val(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn parse_millis(value: Option<&Value>) -> Option<i64> {
    match value {
        Some(Value::Number(number)) => number.as_i64(),
        Some(Value::String(text)) => text.trim().parse::<i64>().ok(),
        _ => None,
    }
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

fn is_json(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("json"))
        .unwrap_or(false)
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

    fn seed(sessions: &Path) {
        write(
            &sessions.join("sessions.json"),
            "[{\"sessionId\":\"s1\",\"title\":\"Analyze the gateway\",\"dateCreated\":\"1776227380882\",\"workspaceDirectory\":\"file:///c%3A/dev/ng-gw\",\"messageCount\":2}]",
        );
        write(
            &sessions.join("s1.json"),
            "{\"sessionId\":\"s1\",\"title\":\"Analyze the gateway\",\"workspaceDirectory\":\"file:///c%3A/dev/ng-gw\",\"dateCreated\":1776227380882,\"lastUpdatedAt\":1776227381882,\"history\":[{\"timestamp\":1776227380900,\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"Explain the routing\"}]}},{\"timestamp\":1776227381200,\"message\":{\"role\":\"assistant\",\"content\":\"It uses a trie matcher\"}}]}",
        );
    }

    #[test]
    fn lists_sessions_from_the_index() {
        let temp = TempDir::new().unwrap();
        let sessions = temp.path().join("sessions");
        seed(&sessions);

        let listed = list_sessions_at(&sessions).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].session_id, "s1");
        assert_eq!(listed[0].message_count, 2);
        assert_eq!(listed[0].project_name, "ng-gw");
        assert_eq!(listed[0].project_path, "c:/dev/ng-gw");
        assert!(listed[0].title.contains("Analyze the gateway"));
    }

    #[test]
    fn reads_history_with_string_and_array_content() {
        let temp = TempDir::new().unwrap();
        let sessions = temp.path().join("sessions");
        seed(&sessions);

        let detail =
            read_session_at(&sessions, sessions.join("s1.json").to_string_lossy().as_ref())
                .unwrap();
        assert_eq!(detail.messages.len(), 2);
        assert_eq!(detail.messages[0].role, "human");
        assert_eq!(detail.messages[0].content, "Explain the routing");
        assert_eq!(detail.messages[0].created_at, "2026-04-15T04:29:40");
        assert_eq!(detail.messages[1].role, "assistant");
        assert_eq!(detail.messages[1].content, "It uses a trie matcher");
        assert_eq!(detail.started_at, "2026-04-15T04:29:40");
        assert_eq!(detail.updated_at, "2026-04-15T04:29:41");
    }

    #[test]
    fn empty_when_no_index() {
        let temp = TempDir::new().unwrap();
        let sessions = temp.path().join("sessions");
        std::fs::create_dir_all(&sessions).unwrap();
        assert!(list_sessions_at(&sessions).unwrap().is_empty());
    }

    #[test]
    fn read_rejects_path_outside_root() {
        let temp = TempDir::new().unwrap();
        let sessions = temp.path().join("sessions");
        std::fs::create_dir_all(&sessions).unwrap();
        let outside = temp.path().join("outside.json");
        std::fs::write(&outside, "{\"sessionId\":\"x\"}").unwrap();
        let err = read_session_at(&sessions, outside.to_string_lossy().as_ref()).unwrap_err();
        assert!(err.contains("outside"));
    }

    #[test]
    fn decodes_file_uri() {
        assert_eq!(decode_workspace("file:///c%3A/dev/ng-gw"), "c:/dev/ng-gw");
        assert_eq!(decode_workspace("file:///home/alice/proj"), "home/alice/proj");
        assert_eq!(decode_workspace(""), "");
    }
}
