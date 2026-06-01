//! Codex local session discovery + read.
//!
//! Codex stores local JSONL transcripts under
//! `~/.codex/sessions/YYYY/MM/DD/*.jsonl`. This reader is read-only,
//! bounded, and deliberately conservative: it only walks that known root,
//! skips large files, and renders user/assistant message rows plus the
//! session metadata Mori needs to create an import review.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

pub const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionMeta {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub file_path: String,
    pub started_at: String,
    pub updated_at: String,
    pub message_count: usize,
    pub title: String,
    pub originator: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionDetail {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub file_path: String,
    pub started_at: String,
    pub updated_at: String,
    pub message_count: usize,
    pub title: String,
    pub originator: String,
    pub messages: Vec<CodexMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub subkind: String,
}

#[tauri::command]
pub fn discover_codex_sessions() -> Result<Vec<CodexSessionMeta>, String> {
    let root = codex_sessions_dir()?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    list_sessions_at(&root)
}

#[tauri::command]
pub fn get_codex_session(session_path: String) -> Result<CodexSessionDetail, String> {
    let trimmed = session_path.trim();
    if trimmed.is_empty() {
        return Err("sessionPath is required.".to_string());
    }
    let root = codex_sessions_dir()?;
    read_session_at(&root, trimmed)
}

pub(crate) fn codex_sessions_dir() -> Result<PathBuf, String> {
    // Honors $CODEX_HOME, else ~/.codex/sessions (see agent_paths).
    crate::agent_paths::require(crate::agent_paths::codex_sessions_dir(), "Codex sessions")
}

pub(crate) fn list_sessions_at(root: &Path) -> Result<Vec<CodexSessionMeta>, String> {
    let mut files = Vec::new();
    collect_jsonl_files(root, &mut files)?;
    let mut out = Vec::new();
    for path in files {
        let Ok(metadata) = fs::metadata(&path) else {
            // No-silent-truncation: surface a placeholder so the user sees
            // there was a file we could not even stat, instead of dropping it.
            out.push(unreadable_codex_meta(&path, "메타데이터 읽기 실패", SystemTime::UNIX_EPOCH));
            continue;
        };
        let modified = metadata
            .modified()
            .or_else(|_| metadata.created())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        if metadata.len() > MAX_FILE_BYTES {
            out.push(unreadable_codex_meta(
                &path,
                &format!("{} MB 초과", MAX_FILE_BYTES / (1024 * 1024)),
                modified,
            ));
            continue;
        }
        match parse_session_file(&path, false) {
            Ok(detail) => {
                out.push(CodexSessionMeta {
                    session_id: detail.session_id,
                    project_path: detail.project_path,
                    project_name: detail.project_name,
                    file_path: detail.file_path,
                    started_at: detail.started_at,
                    updated_at: detail.updated_at,
                    message_count: detail.message_count,
                    title: detail.title,
                    originator: detail.originator,
                });
            }
            Err(_) => {
                out.push(unreadable_codex_meta(&path, "파싱 실패", modified));
            }
        }
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

/// Placeholder meta for a rollout file we could not read (too large, IO
/// failure, etc.). Listing it as an unreadable row is honest: the user sees
/// something is there and that Mori could not import it, rather than silently
/// losing the session.
fn unreadable_codex_meta(path: &Path, reason: &str, modified: SystemTime) -> CodexSessionMeta {
    let session_id = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_else(|| "unreadable".to_string());
    let when = format_modified_iso(modified);
    CodexSessionMeta {
        session_id,
        project_path: "Codex".to_string(),
        project_name: "Codex".to_string(),
        file_path: path.to_string_lossy().to_string(),
        started_at: when.clone(),
        updated_at: when,
        message_count: 0,
        title: format!("⚠ 읽을 수 없는 세션 · {reason}"),
        originator: "Codex".to_string(),
    }
}

pub(crate) fn read_session_at(
    root: &Path,
    session_path: &str,
) -> Result<CodexSessionDetail, String> {
    let requested = PathBuf::from(session_path);
    let canonical_root = fs::canonicalize(root)
        .map_err(|error| format!("Failed to resolve {}: {error}", root.display()))?;
    let canonical = fs::canonicalize(&requested)
        .map_err(|error| format!("Failed to resolve {}: {error}", requested.display()))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Refused: session path is outside the Codex sessions directory.".to_string());
    }
    if !is_jsonl(&canonical) {
        return Err("Refused: file is not a Codex JSONL session.".to_string());
    }
    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("Failed to stat {}: {error}", canonical.display()))?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(format!(
            "Codex session is too large ({} bytes > {} byte cap).",
            metadata.len(),
            MAX_FILE_BYTES
        ));
    }
    parse_session_file(&canonical, true)
}

fn collect_jsonl_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(dir)
        .map_err(|error| format!("Failed to read {}: {error}", dir.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl_files(&path, out)?;
        } else if is_jsonl(&path) {
            out.push(path);
        }
    }
    Ok(())
}

fn parse_session_file(path: &Path, include_all_messages: bool) -> Result<CodexSessionDetail, String> {
    let text = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    let modified = fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().or_else(|_| m.created()).ok())
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let fallback_time = format_modified_iso(modified);

    let mut session_id = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut project_path = String::new();
    let mut originator = "Codex".to_string();
    let mut started_at = String::new();
    let mut updated_at = String::new();
    let mut title = String::new();
    let mut messages = Vec::new();
    let mut message_count = 0usize;

    for (index, line) in text.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        if let Some(ts) = value.get("timestamp").and_then(Value::as_str) {
            if started_at.is_empty() {
                started_at = ts.to_string();
            }
            updated_at = ts.to_string();
        }

        if value.get("type").and_then(Value::as_str) == Some("session_meta") {
            if let Some(payload) = value.get("payload") {
                if let Some(id) = payload.get("id").and_then(Value::as_str) {
                    session_id = id.to_string();
                }
                if let Some(cwd) = payload.get("cwd").and_then(Value::as_str) {
                    project_path = cwd.to_string();
                }
                if let Some(origin) = payload.get("originator").and_then(Value::as_str) {
                    originator = origin.to_string();
                }
                if let Some(ts) = payload.get("timestamp").and_then(Value::as_str) {
                    if started_at.is_empty() {
                        started_at = ts.to_string();
                    }
                }
            }
            continue;
        }

        let Some(message) = codex_message_from_value(&value, index) else {
            continue;
        };
        message_count += 1;
        if title.is_empty() && message.role == "human" {
            title = truncate(&message.content, 90);
        }
        if include_all_messages {
            messages.push(message);
        } else if messages.len() < 4 {
            messages.push(message);
        }
    }

    if started_at.is_empty() {
        started_at = fallback_time.clone();
    }
    if updated_at.is_empty() {
        updated_at = started_at.clone();
    }
    if project_path.is_empty() {
        project_path = "Codex".to_string();
    }
    if title.is_empty() {
        title = format!("Codex session {}", short_id(&session_id));
    }

    Ok(CodexSessionDetail {
        session_id,
        project_name: project_path.clone(),
        project_path,
        file_path: path.to_string_lossy().to_string(),
        started_at,
        updated_at,
        message_count,
        title,
        originator,
        messages,
    })
}

fn codex_message_from_value(value: &Value, index: usize) -> Option<CodexMessage> {
    if value.get("type").and_then(Value::as_str) != Some("response_item") {
        return None;
    }
    let payload = value.get("payload")?;
    if payload.get("type").and_then(Value::as_str) != Some("message") {
        return None;
    }
    let role = normalize_role(payload.get("role").and_then(Value::as_str).unwrap_or(""));
    if role != "human" && role != "assistant" {
        return None;
    }
    let content = collect_content(payload.get("content")?);
    if content.trim().is_empty() {
        return None;
    }
    let created_at = value
        .get("timestamp")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let id = payload
        .get("id")
        .or_else(|| value.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("line-{index}"));
    Some(CodexMessage {
        id,
        role,
        content,
        created_at,
        subkind: String::new(),
    })
}

fn collect_content(value: &Value) -> String {
    match value {
        Value::String(text) => text.to_string(),
        Value::Array(items) => {
            let mut parts = Vec::new();
            for item in items {
                match item {
                    Value::String(text) => parts.push(text.clone()),
                    Value::Object(map) => {
                        if let Some(text) = map
                            .get("text")
                            .or_else(|| map.get("input_text"))
                            .or_else(|| map.get("output_text"))
                            .and_then(Value::as_str)
                        {
                            parts.push(text.to_string());
                        }
                    }
                    _ => {}
                }
            }
            parts.join("\n")
        }
        Value::Object(map) => map
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    }
}

fn normalize_role(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "user" | "human" => "human".to_string(),
        "assistant" | "ai" => "assistant".to_string(),
        other => other.to_string(),
    }
}

fn is_jsonl(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("jsonl"))
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

fn format_modified_iso(when: SystemTime) -> String {
    let duration = when.duration_since(UNIX_EPOCH).unwrap_or_default();
    crate::claude::format_unix_seconds(duration.as_secs())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn lists_codex_sessions_from_date_tree() {
        let temp = TempDir::new().unwrap();
        let dir = temp.path().join("2026").join("05").join("28");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("rollout-demo.jsonl");
        std::fs::write(
            &path,
            "{\"timestamp\":\"2026-05-28T00:00:00Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"s1\",\"cwd\":\"C:\\\\dev\\\\mori\",\"originator\":\"Codex Desktop\"}}\n\
             {\"timestamp\":\"2026-05-28T00:00:01Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"Fix import\"}]}}\n\
             {\"timestamp\":\"2026-05-28T00:00:02Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"Done\"}]}}\n",
        )
        .unwrap();

        let sessions = list_sessions_at(temp.path()).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "s1");
        assert_eq!(sessions[0].message_count, 2);
        assert!(sessions[0].title.contains("Fix import"));
    }

    #[test]
    fn read_rejects_path_outside_root() {
        let temp = TempDir::new().unwrap();
        let root = temp.path().join("sessions");
        std::fs::create_dir_all(&root).unwrap();
        let outside = temp.path().join("outside.jsonl");
        std::fs::write(&outside, "{}\n").unwrap();
        let err = read_session_at(&root, outside.to_string_lossy().as_ref()).unwrap_err();
        assert!(err.contains("outside"));
    }

    #[test]
    fn surfaces_an_unreadable_placeholder_for_a_too_large_session() {
        use std::io::Write;
        let temp = TempDir::new().unwrap();
        let dir = temp.path().join("2026").join("05").join("28");
        std::fs::create_dir_all(&dir).unwrap();
        // A valid small session next to the unreadable one.
        std::fs::write(
            dir.join("rollout-good.jsonl"),
            "{\"timestamp\":\"2026-05-28T00:00:00Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"good\",\"cwd\":\"C:\\\\x\",\"originator\":\"Codex\"}}\n",
        )
        .unwrap();
        // A file just over the 8 MB cap.
        let big = dir.join("rollout-too-large.jsonl");
        let mut file = std::fs::File::create(&big).unwrap();
        let chunk = vec![b'a'; 64 * 1024];
        let chunks_required = (MAX_FILE_BYTES / chunk.len() as u64) + 1;
        for _ in 0..chunks_required {
            file.write_all(&chunk).unwrap();
        }
        drop(file);

        let sessions = list_sessions_at(temp.path()).unwrap();
        assert_eq!(sessions.len(), 2);
        let placeholder = sessions
            .iter()
            .find(|session| session.title.contains("읽을 수 없는 세션"))
            .expect("placeholder for the too-large file is missing");
        assert!(
            placeholder.title.contains("MB 초과"),
            "title was {}",
            placeholder.title
        );
        assert_eq!(placeholder.message_count, 0);
        assert_eq!(placeholder.session_id, "rollout-too-large");
        assert_eq!(placeholder.originator, "Codex");
    }
}
