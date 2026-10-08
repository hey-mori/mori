//! Antigravity local session discovery + read.
//!
//! Google Antigravity stores authoritative conversations as protobuf
//! (`~/.gemini/antigravity/conversations/<id>.pb`), which Mori must NOT read
//! (internal store, a hard non-goal), and, for *some* conversations, a
//! readable JSON Lines transcript at
//! `~/.gemini/antigravity/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`.
//!
//! This reader walks only the `brain/*/.system_generated/logs/` transcripts.
//! It is read-only, bounded (8 MB cap, skips large files), and tolerant: a
//! malformed line is skipped, never fatal. Capture is therefore deliberately
//! **partial**: conversations that only have a `.pb` and no generated
//! transcript are not discoverable, and the transcript format is undocumented
//! and has changed across Antigravity releases, so this parser favours
//! resilience over completeness. The UI must label the capture partial.
//!
//! Transcript line shape (observed 2026-05):
//!   { "step_index", "source", "type", "status", "created_at", "content"?, "tool_calls"? }
//! where `source` is USER_EXPLICIT / MODEL / SYSTEM, `type` is USER_INPUT /
//! PLANNER_RESPONSE / a tool action (LIST_DIRECTORY, GREP_SEARCH, VIEW_FILE,
//! CODE_ACTION, RUN_COMMAND, …), and `content` is a string.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

pub const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AntigravitySessionMeta {
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
pub struct AntigravitySessionDetail {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub file_path: String,
    pub started_at: String,
    pub updated_at: String,
    pub message_count: usize,
    pub title: String,
    pub messages: Vec<AntigravityMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AntigravityMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub subkind: String,
}

#[tauri::command]
pub fn discover_antigravity_sessions() -> Result<Vec<AntigravitySessionMeta>, String> {
    let root = antigravity_brain_dir()?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    list_sessions_at(&root)
}

#[tauri::command]
pub fn get_antigravity_session(session_path: String) -> Result<AntigravitySessionDetail, String> {
    let trimmed = session_path.trim();
    if trimmed.is_empty() {
        return Err("sessionPath is required.".to_string());
    }
    let root = antigravity_brain_dir()?;
    read_session_at(&root, trimmed)
}

pub(crate) fn antigravity_brain_dir() -> Result<PathBuf, String> {
    // Honors $ANTIGRAVITY_HOME, else ~/.gemini/antigravity/brain (see agent_paths).
    crate::agent_paths::require(
        crate::agent_paths::antigravity_brain_dir(),
        "Antigravity sessions",
    )
}

pub(crate) fn list_sessions_at(brain_root: &Path) -> Result<Vec<AntigravitySessionMeta>, String> {
    let mut transcripts = Vec::new();
    collect_transcripts(brain_root, &mut transcripts);
    let mut out = Vec::new();
    for path in transcripts {
        let Ok(metadata) = fs::metadata(&path) else {
            // No-silent-truncation: surface a placeholder rather than drop.
            out.push(unreadable_antigravity_meta(
                &path,
                "메타데이터 읽기 실패",
                SystemTime::UNIX_EPOCH,
            ));
            continue;
        };
        let modified = metadata
            .modified()
            .or_else(|_| metadata.created())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        if metadata.len() > MAX_FILE_BYTES {
            out.push(unreadable_antigravity_meta(
                &path,
                &format!("{} MB 초과", MAX_FILE_BYTES / (1024 * 1024)),
                modified,
            ));
            continue;
        }
        match parse_transcript(&path, false) {
            Ok(detail) => {
                out.push(AntigravitySessionMeta {
                    session_id: detail.session_id,
                    project_path: detail.project_path,
                    project_name: detail.project_name,
                    file_path: detail.file_path,
                    started_at: detail.started_at,
                    updated_at: detail.updated_at,
                    message_count: detail.message_count,
                    title: detail.title,
                });
            }
            Err(_) => {
                out.push(unreadable_antigravity_meta(&path, "파싱 실패", modified));
            }
        }
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

/// Placeholder meta for a transcript we could not read (too large, IO
/// failure, etc.). Listed as an unreadable row so the user sees the file
/// rather than silently losing it; the partial-capture reality already means
/// the feed must honestly distinguish what was readable.
fn unreadable_antigravity_meta(
    path: &Path,
    reason: &str,
    modified: SystemTime,
) -> AntigravitySessionMeta {
    let session_id = conversation_id_from_path(path);
    let when = format_modified_iso(modified);
    AntigravitySessionMeta {
        session_id,
        project_path: "Antigravity".to_string(),
        project_name: "Antigravity".to_string(),
        file_path: path.to_string_lossy().to_string(),
        started_at: when.clone(),
        updated_at: when,
        message_count: 0,
        title: format!("⚠ 읽을 수 없는 세션 · {reason}"),
    }
}

pub(crate) fn read_session_at(
    brain_root: &Path,
    session_path: &str,
) -> Result<AntigravitySessionDetail, String> {
    let requested = PathBuf::from(session_path);
    let canonical_root = fs::canonicalize(brain_root)
        .map_err(|error| format!("Failed to resolve {}: {error}", brain_root.display()))?;
    let canonical = fs::canonicalize(&requested)
        .map_err(|error| format!("Failed to resolve {}: {error}", requested.display()))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Refused: session path is outside the Antigravity brain directory.".to_string());
    }
    if !is_transcript(&canonical) {
        return Err("Refused: file is not an Antigravity transcript.".to_string());
    }
    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("Failed to stat {}: {error}", canonical.display()))?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(format!(
            "Antigravity transcript is too large ({} bytes > {} byte cap).",
            metadata.len(),
            MAX_FILE_BYTES
        ));
    }
    parse_transcript(&canonical, true)
}

/// Walk `brain/<id>/.system_generated/logs/transcript.jsonl`. We do not recurse
/// arbitrarily; only the fixed `.system_generated/logs` leaf under each
/// conversation directory is inspected.
fn collect_transcripts(brain_root: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(brain_root) else {
        return;
    };
    for entry in entries.flatten() {
        let conv_dir = entry.path();
        if !conv_dir.is_dir() {
            continue;
        }
        let transcript = conv_dir
            .join(".system_generated")
            .join("logs")
            .join("transcript.jsonl");
        if transcript.is_file() {
            out.push(transcript);
        }
    }
}

fn parse_transcript(path: &Path, include_all_messages: bool) -> Result<AntigravitySessionDetail, String> {
    let text = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    let modified = fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().or_else(|_| m.created()).ok())
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let fallback_time = format_modified_iso(modified);

    let session_id = conversation_id_from_path(path);
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
        if let Some(ts) = timestamp_from_value(&value) {
            if started_at.is_empty() {
                started_at = ts.clone();
            }
            updated_at = ts;
        }

        let Some(message) = message_from_value(&value, index) else {
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
    if title.is_empty() {
        title = format!("Antigravity session {}", short_id(&session_id));
    }

    Ok(AntigravitySessionDetail {
        session_id,
        project_path: "Antigravity".to_string(),
        project_name: "Antigravity".to_string(),
        file_path: path.to_string_lossy().to_string(),
        started_at,
        updated_at,
        message_count,
        title,
        messages,
    })
}

fn message_from_value(value: &Value, index: usize) -> Option<AntigravityMessage> {
    let source = value
        .get("source")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_uppercase();
    let kind = value.get("type").and_then(Value::as_str).unwrap_or("");
    let raw_content = collect_content(value);
    let content = strip_user_request(&raw_content).trim().to_string();
    if content.is_empty() {
        return None;
    }
    let (role, subkind) = match source.as_str() {
        "USER_EXPLICIT" => ("human", ""),
        "MODEL" => (
            "assistant",
            if kind == "PLANNER_RESPONSE" { "" } else { "tool_use" },
        ),
        "SYSTEM" => ("system", ""),
        _ => return None,
    };
    let created_at = timestamp_from_value(value).unwrap_or_default();
    Some(AntigravityMessage {
        id: format!("antigravity-{index}"),
        role: role.to_string(),
        content,
        created_at,
        subkind: subkind.to_string(),
    })
}

fn timestamp_from_value(value: &Value) -> Option<String> {
    let raw = value
        .get("created_at")
        .or_else(|| value.get("timestamp"))
        .or_else(|| value.get("time"))?;
    match raw {
        Value::String(text) => Some(text.to_string()),
        Value::Number(number) => {
            let n = number.as_i64()?;
            let seconds = if n > 1_000_000_000_000 { n / 1000 } else { n };
            Some(crate::claude::format_unix_seconds(seconds as u64))
        }
        _ => None,
    }
}

fn collect_content(value: &Value) -> String {
    for key in ["content", "text", "message"] {
        if let Some(raw) = value.get(key) {
            let text = collect_text_value(raw);
            if !text.trim().is_empty() {
                return text;
            }
        }
    }
    String::new()
}

fn collect_text_value(value: &Value) -> String {
    match value {
        Value::String(text) => text.to_string(),
        Value::Array(items) => items
            .iter()
            .map(collect_text_value)
            .filter(|text| !text.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(map) => {
            if map
                .get("type")
                .and_then(Value::as_str)
                .map(|kind| kind != "text")
                .unwrap_or(false)
            {
                return String::new();
            }
            for key in ["content", "text", "message"] {
                if let Some(raw) = map.get(key) {
                    let text = collect_text_value(raw);
                    if !text.trim().is_empty() {
                        return text;
                    }
                }
            }
            String::new()
        }
        _ => String::new(),
    }
}

/// User input arrives wrapped in `<USER_REQUEST>…</USER_REQUEST>`; strip the
/// wrapper so the reconstructed transcript reads cleanly.
fn strip_user_request(text: &str) -> String {
    let trimmed = text.trim();
    let without_open = trimmed
        .strip_prefix("<USER_REQUEST>")
        .unwrap_or(trimmed);
    without_open
        .strip_suffix("</USER_REQUEST>")
        .unwrap_or(without_open)
        .to_string()
}

/// `…/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`
/// → `<conversation-id>`.
fn conversation_id_from_path(path: &Path) -> String {
    path.parent() // logs
        .and_then(Path::parent) // .system_generated
        .and_then(Path::parent) // <conversation-id>
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "antigravity".to_string())
}

fn is_transcript(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.eq_ignore_ascii_case("transcript.jsonl"))
        .unwrap_or(false)
}

fn truncate(input: &str, max: usize) -> String {
    let clean = input.replace('\n', " ").replace('\r', " ");
    if clean.chars().count() <= max {
        return clean;
    }
    let out: String = clean.chars().take(max).collect();
    format!("{out}...")
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

    fn write_transcript(brain: &Path, conv_id: &str, body: &str) -> PathBuf {
        let logs = brain.join(conv_id).join(".system_generated").join("logs");
        std::fs::create_dir_all(&logs).unwrap();
        let path = logs.join("transcript.jsonl");
        std::fs::write(&path, body).unwrap();
        path
    }

    const SAMPLE: &str = "{\"step_index\":0,\"source\":\"USER_EXPLICIT\",\"type\":\"USER_INPUT\",\"created_at\":\"2026-05-27T05:28:40Z\",\"content\":\"<USER_REQUEST>\\nFix the navigation\\n</USER_REQUEST>\"}\n\
{\"step_index\":1,\"source\":\"MODEL\",\"type\":\"PLANNER_RESPONSE\",\"created_at\":\"2026-05-27T05:28:46Z\",\"content\":\"I will analyze the workspace.\"}\n\
{\"step_index\":2,\"source\":\"MODEL\",\"type\":\"GREP_SEARCH\",\"created_at\":\"2026-05-27T05:28:52Z\",\"content\":\"searched for nav\"}\n\
{\"step_index\":3,\"source\":\"model\",\"type\":\"PLANNER_RESPONSE\",\"timestamp\":1777520955000,\"content\":[{\"type\":\"text\",\"text\":\"Inline array response\"},{\"type\":\"tool\",\"text\":\"ignored\"}]}\n\
{\"step_index\":4,\"source\":\"SYSTEM\",\"type\":\"GENERIC\",\"created_at\":\"2026-05-27T05:28:55Z\",\"content\":null}\n";

    #[test]
    fn discovers_transcripts_under_brain() {
        let temp = TempDir::new().unwrap();
        write_transcript(temp.path(), "conv-aaa", SAMPLE);
        // A conversation with only a .pb (no transcript) must not appear.
        std::fs::create_dir_all(temp.path().join("conv-bbb")).unwrap();
        std::fs::write(temp.path().join("conv-bbb").join("conv.pb"), b"\x00\x01").unwrap();

        let sessions = list_sessions_at(temp.path()).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "conv-aaa");
        assert!(sessions[0].title.contains("Fix the navigation"));
        // user + planner + tool action + inline-array planner = 4 messages (the null-content SYSTEM line is skipped).
        assert_eq!(sessions[0].message_count, 4);
    }

    #[test]
    fn reads_messages_with_roles_and_strips_user_wrapper() {
        let temp = TempDir::new().unwrap();
        let path = write_transcript(temp.path(), "conv-aaa", SAMPLE);
        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        assert_eq!(detail.messages.len(), 4);
        assert_eq!(detail.messages[0].role, "human");
        assert_eq!(detail.messages[0].content, "Fix the navigation");
        assert_eq!(detail.messages[1].role, "assistant");
        assert_eq!(detail.messages[1].subkind, "");
        assert_eq!(detail.messages[2].role, "assistant");
        assert_eq!(detail.messages[2].subkind, "tool_use");
        assert_eq!(detail.messages[3].role, "assistant");
        assert_eq!(detail.messages[3].content, "Inline array response");
        assert_eq!(detail.messages[3].created_at, "2026-04-30T03:49:15Z");
    }

    #[test]
    fn read_rejects_path_outside_brain() {
        let temp = TempDir::new().unwrap();
        let brain = temp.path().join("brain");
        std::fs::create_dir_all(&brain).unwrap();
        let outside = temp.path().join("outside.jsonl");
        std::fs::write(&outside, "{}\n").unwrap();
        let err = read_session_at(&brain, outside.to_string_lossy().as_ref()).unwrap_err();
        assert!(err.contains("outside") || err.contains("transcript"));
    }

    #[test]
    fn empty_brain_returns_no_sessions() {
        let temp = TempDir::new().unwrap();
        std::fs::create_dir_all(temp.path()).unwrap();
        assert!(list_sessions_at(temp.path()).unwrap().is_empty());
    }

    #[test]
    fn surfaces_an_unreadable_placeholder_for_a_too_large_transcript() {
        use std::io::Write;
        let temp = TempDir::new().unwrap();
        // A readable transcript next to the unreadable one.
        write_transcript(temp.path(), "conv-good", SAMPLE);
        // A transcript just over the 8 MB cap.
        let big_logs = temp
            .path()
            .join("conv-big")
            .join(".system_generated")
            .join("logs");
        std::fs::create_dir_all(&big_logs).unwrap();
        let big = big_logs.join("transcript.jsonl");
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
            .find(|session| session.session_id == "conv-big")
            .expect("placeholder for the too-large transcript is missing");
        assert!(
            placeholder.title.contains("읽을 수 없는 세션"),
            "title was {}",
            placeholder.title
        );
        assert!(
            placeholder.title.contains("MB 초과"),
            "title was {}",
            placeholder.title
        );
        assert_eq!(placeholder.message_count, 0);
    }
}
