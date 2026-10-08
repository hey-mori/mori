//! Cline (saoudrizwan.claude-dev) local task discovery + read.
//!
//! Cline stores each task as a directory under the VS Code extension's
//! `globalStorage/.../tasks/<taskId>/` (see `agent_paths::cline_tasks_dir`),
//! where `<taskId>` is the epoch-millis start time. Inside each task:
//!
//! - `ui_messages.json` — the user-facing transcript (the cleanest source:
//!   `say:"task"` is the initial prompt, `say:"text"` / `say:"completion_result"`
//!   are assistant turns, `say:"user_feedback"` is follow-up user input, and
//!   `ask:"followup"` / `ask:"plan_mode_respond"` are assistant questions).
//!   `say:"api_req_started"` and tool / command rows are internal noise and
//!   are skipped.
//! - `api_conversation_history.json` — the raw model transcript, where the
//!   first user message bundles a large `<environment_details>` block; we do
//!   not render from it, but we do mine it for the working directory.
//!
//! This reader is read-only, bounded, and conservative: it walks only the
//! tasks root, skips oversized files, and surfaces an honest placeholder for
//! any task it cannot parse.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

pub const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClineSessionMeta {
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
pub struct ClineSessionDetail {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub file_path: String,
    pub started_at: String,
    pub updated_at: String,
    pub message_count: usize,
    pub title: String,
    pub messages: Vec<ClineMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClineMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub subkind: String,
}

#[tauri::command]
pub fn discover_cline_sessions() -> Result<Vec<ClineSessionMeta>, String> {
    let root = cline_tasks_dir()?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    list_sessions_at(&root)
}

#[tauri::command]
pub fn get_cline_session(session_path: String) -> Result<ClineSessionDetail, String> {
    let trimmed = session_path.trim();
    if trimmed.is_empty() {
        return Err("sessionPath is required.".to_string());
    }
    let root = cline_tasks_dir()?;
    read_session_at(&root, trimmed)
}

pub(crate) fn cline_tasks_dir() -> Result<PathBuf, String> {
    crate::agent_paths::require(crate::agent_paths::cline_tasks_dir(), "Cline tasks")
}

/// List every task directory under the tasks root, newest first.
pub(crate) fn list_sessions_at(tasks_root: &Path) -> Result<Vec<ClineSessionMeta>, String> {
    let entries = fs::read_dir(tasks_root)
        .map_err(|error| format!("Failed to read {}: {error}", tasks_root.display()))?;

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let ui = dir.join("ui_messages.json");
        if !ui.exists() {
            continue;
        }
        if fs::metadata(&ui).map(|m| m.len() > MAX_FILE_BYTES).unwrap_or(false) {
            out.push(unreadable_meta(&dir, &format!("{} MB 초과", MAX_FILE_BYTES / (1024 * 1024))));
            continue;
        }
        match parse_task(&dir, false) {
            Ok(detail) => out.push(ClineSessionMeta {
                session_id: detail.session_id,
                project_path: detail.project_path,
                project_name: detail.project_name,
                file_path: detail.file_path,
                started_at: detail.started_at,
                updated_at: detail.updated_at,
                message_count: detail.message_count,
                title: detail.title,
            }),
            Err(_) => out.push(unreadable_meta(&dir, "파싱 실패")),
        }
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

fn unreadable_meta(dir: &Path, reason: &str) -> ClineSessionMeta {
    let session_id = dir
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "unreadable".to_string());
    let started_at = task_id_to_iso(&session_id).unwrap_or_default();
    ClineSessionMeta {
        session_id,
        project_path: "Cline".to_string(),
        project_name: "Cline".to_string(),
        file_path: dir.to_string_lossy().to_string(),
        started_at: started_at.clone(),
        updated_at: started_at,
        message_count: 0,
        title: format!("⚠ 읽을 수 없는 세션 · {reason}"),
    }
}

pub(crate) fn read_session_at(
    tasks_root: &Path,
    session_path: &str,
) -> Result<ClineSessionDetail, String> {
    let requested = PathBuf::from(session_path);
    let canonical_root = fs::canonicalize(tasks_root)
        .map_err(|error| format!("Failed to resolve {}: {error}", tasks_root.display()))?;
    let canonical = fs::canonicalize(&requested)
        .map_err(|error| format!("Failed to resolve {}: {error}", requested.display()))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Refused: session path is outside the Cline tasks directory.".to_string());
    }
    if !canonical.is_dir() || !canonical.join("ui_messages.json").exists() {
        return Err("Refused: not a Cline task directory.".to_string());
    }
    parse_task(&canonical, true)
}

fn parse_task(dir: &Path, include_all_messages: bool) -> Result<ClineSessionDetail, String> {
    let ui_path = dir.join("ui_messages.json");
    if fs::metadata(&ui_path).map(|m| m.len() > MAX_FILE_BYTES).unwrap_or(false) {
        return Err("ui_messages.json exceeds the size cap.".to_string());
    }
    let text = fs::read_to_string(&ui_path)
        .map_err(|error| format!("Failed to read {}: {error}", ui_path.display()))?;
    let entries: Vec<Value> = serde_json::from_str(&text)
        .map_err(|error| format!("Invalid ui_messages.json {}: {error}", ui_path.display()))?;

    let session_id = dir
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut title = String::new();
    let mut first_ts: Option<i64> = None;
    let mut last_ts: Option<i64> = None;
    let mut messages = Vec::new();

    for (index, entry) in entries.iter().enumerate() {
        if let Some(ts) = parse_millis(entry.get("ts")) {
            if first_ts.is_none() {
                first_ts = Some(ts);
            }
            last_ts = Some(ts);
        }
        let Some((role, content)) = message_from_ui_entry(entry) else {
            continue;
        };
        if content.trim().is_empty() {
            continue;
        }
        if title.is_empty() && role == "human" {
            title = truncate(&content, 90);
        }
        let created_at = entry
            .get("ts")
            .and_then(|value| parse_millis(Some(value)))
            .map(format_millis_iso)
            .unwrap_or_default();
        let message = ClineMessage {
            id: format!("{session_id}-{index}"),
            role,
            content,
            created_at,
            subkind: String::new(),
        };
        if include_all_messages {
            messages.push(message);
        } else if messages.len() < 4 {
            messages.push(message);
        }
    }

    let message_count = if include_all_messages {
        messages.len()
    } else {
        count_ui_messages(&entries)
    };

    let started_at = task_id_to_iso(&session_id)
        .or_else(|| first_ts.map(format_millis_iso))
        .unwrap_or_default();
    let updated_at = last_ts.map(format_millis_iso).unwrap_or_else(|| started_at.clone());

    if title.is_empty() {
        title = format!("Cline session {}", short_id(&session_id));
    }

    let directory = extract_working_directory(dir);
    let project_path = directory.clone().unwrap_or_else(|| "Cline".to_string());
    let project_name = directory
        .map(|dir| basename(&dir))
        .unwrap_or_else(|| "Cline".to_string());

    Ok(ClineSessionDetail {
        session_id,
        project_path,
        project_name,
        file_path: dir.to_string_lossy().to_string(),
        started_at,
        updated_at,
        message_count,
        title,
        messages,
    })
}

/// Count the renderable transcript rows without materialising them.
fn count_ui_messages(entries: &[Value]) -> usize {
    entries
        .iter()
        .filter_map(message_from_ui_entry)
        .filter(|(_, content)| !content.trim().is_empty())
        .count()
}

/// Map a `ui_messages.json` entry to a transcript row, or `None` for the
/// internal rows (api requests, tool / command output, reasoning) that are
/// not part of the human-readable conversation.
fn message_from_ui_entry(entry: &Value) -> Option<(String, String)> {
    let kind = entry.get("type").and_then(Value::as_str).unwrap_or("");
    match kind {
        "say" => match entry.get("say").and_then(Value::as_str).unwrap_or("") {
            "task" | "user_feedback" => Some(("human".to_string(), plain_text(entry))),
            "text" | "completion_result" => Some(("assistant".to_string(), plain_text(entry))),
            _ => None,
        },
        "ask" => match entry.get("ask").and_then(Value::as_str).unwrap_or("") {
            "followup" | "plan_mode_respond" => {
                Some(("assistant".to_string(), ask_text(entry)))
            }
            _ => None,
        },
        _ => None,
    }
}

fn plain_text(entry: &Value) -> String {
    entry
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

/// `ask` rows sometimes carry a JSON-encoded payload in `text`
/// (e.g. `{"response":"..."}` for plan-mode answers). Pull the human-readable
/// field when present, otherwise fall back to the raw text.
fn ask_text(entry: &Value) -> String {
    let raw = plain_text(entry);
    if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
        for key in ["response", "question", "text"] {
            if let Some(value) = parsed.get(key).and_then(Value::as_str) {
                if !value.trim().is_empty() {
                    return value.to_string();
                }
            }
        }
    }
    raw
}

/// Best-effort working-directory extraction from the environment block Cline
/// embeds in `api_conversation_history.json` (`# Current Working Directory
/// (<path>) Files`). Returns `None` when the file is absent or the marker is
/// not found, keeping the reader resilient rather than fabricating a path.
fn extract_working_directory(dir: &Path) -> Option<String> {
    let api_path = dir.join("api_conversation_history.json");
    let metadata = fs::metadata(&api_path).ok()?;
    if metadata.len() > MAX_FILE_BYTES {
        return None;
    }
    let text = fs::read_to_string(&api_path).ok()?;
    const MARKER: &str = "Current Working Directory (";
    let start = text.find(MARKER)? + MARKER.len();
    let rest = &text[start..];
    let end = rest.find(')')?;
    let path = rest[..end].trim();
    if path.is_empty() {
        None
    } else {
        Some(path.to_string())
    }
}

fn task_id_to_iso(session_id: &str) -> Option<String> {
    session_id.parse::<i64>().ok().map(format_millis_iso)
}

fn parse_millis(value: Option<&Value>) -> Option<i64> {
    match value {
        Some(Value::Number(number)) => number.as_i64(),
        Some(Value::String(text)) => text.trim().parse::<i64>().ok(),
        _ => None,
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write(path: &Path, body: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn seed_task(tasks_root: &Path, task_id: &str) {
        let dir = tasks_root.join(task_id);
        write(
            &dir.join("ui_messages.json"),
            r#"[
              {"ts":"1777520955181","type":"say","say":"task","text":"Add a retry to the upload client"},
              {"ts":1777520955200,"type":"say","say":"api_req_started","text":"{\"request\":\"noise\"}"},
              {"ts":1777520960000,"type":"say","say":"text","text":"Wrapped it in exponential backoff"},
              {"ts":1777520965000,"type":"ask","ask":"plan_mode_respond","text":"{\"response\":\"Shall I add tests?\"}"}
            ]"#,
        );
        write(
            &dir.join("api_conversation_history.json"),
            "[{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"<environment_details>\\n# Current Working Directory (c:/dev/uploader) Files\\n</environment_details>\"}]}]",
        );
    }

    #[test]
    fn lists_tasks_with_title_and_message_count() {
        let temp = TempDir::new().unwrap();
        let tasks = temp.path().join("tasks");
        seed_task(&tasks, "1777520955159");

        let sessions = list_sessions_at(&tasks).unwrap();
        assert_eq!(sessions.len(), 1);
        let session = &sessions[0];
        assert_eq!(session.session_id, "1777520955159");
        assert!(session.title.contains("Add a retry"));
        // task + assistant text + ask response = 3 rendered rows; api_req_started skipped.
        assert_eq!(session.message_count, 3);
        assert_eq!(session.project_name, "uploader");
        assert_eq!(session.project_path, "c:/dev/uploader");
    }

    #[test]
    fn reads_task_messages_skipping_internal_rows() {
        let temp = TempDir::new().unwrap();
        let tasks = temp.path().join("tasks");
        seed_task(&tasks, "1777520955159");
        let dir = tasks.join("1777520955159");

        let detail = read_session_at(&tasks, dir.to_string_lossy().as_ref()).unwrap();
        assert_eq!(detail.messages.len(), 3);
        assert_eq!(detail.messages[0].role, "human");
        assert_eq!(detail.messages[0].content, "Add a retry to the upload client");
        assert_eq!(detail.messages[0].created_at, "2026-04-30T03:49:15Z");
        assert_eq!(detail.messages[1].role, "assistant");
        assert_eq!(detail.messages[1].content, "Wrapped it in exponential backoff");
        // The plan-mode ask payload is decoded to its response text.
        assert_eq!(detail.messages[2].content, "Shall I add tests?");
    }

    #[test]
    fn read_rejects_path_outside_root() {
        let temp = TempDir::new().unwrap();
        let tasks = temp.path().join("tasks");
        std::fs::create_dir_all(&tasks).unwrap();
        let outside = temp.path().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("ui_messages.json"), "[]").unwrap();
        let err = read_session_at(&tasks, outside.to_string_lossy().as_ref()).unwrap_err();
        assert!(err.contains("outside"));
    }

    #[test]
    fn surfaces_an_unreadable_placeholder_for_bad_json() {
        let temp = TempDir::new().unwrap();
        let tasks = temp.path().join("tasks");
        write(&tasks.join("999").join("ui_messages.json"), "{ not json");
        let sessions = list_sessions_at(&tasks).unwrap();
        assert_eq!(sessions.len(), 1);
        assert!(sessions[0].title.contains("읽을 수 없는 세션"));
    }
}
