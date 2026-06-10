//! Claude Code CLI session discovery + read.
//!
//! Claude Code stores one JSONL file per session under
//! `~/.claude/projects/<encoded-project>/<session>.jsonl`. Each line is one
//! event — typically a `user` / `assistant` message envelope, but other
//! event types (system, tool, etc.) may appear in newer releases.
//!
//! We scan the projects directory exactly once per command call (no
//! filesystem watcher) and we read each file at most once. The file size
//! cap matches the connector inbox to keep the UI responsive even when
//! someone points us at a multi-megabyte session.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

use super::desktop::{normalize_content, normalize_role};

/// Maximum size (bytes) of a JSONL session we will read. Matches the
/// connector inbox cap so the user sees consistent "too large" behaviour
/// across the app.
pub const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;

/// Aggregated token usage for a Claude Code session.
///
/// Claude Code logs the same assistant `message.id` across several streaming
/// chunk lines, each repeating the final cumulative `usage`. We dedupe by
/// `message.id` and count each unique assistant message's usage exactly once
/// so the totals match what the user actually spent.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeTokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    /// `input_tokens + output_tokens` — the headline figure most users mean
    /// by "tokens used". Cache figures are surfaced separately.
    pub total_tokens: u64,
    /// Number of distinct assistant messages that carried a usage record.
    pub assistant_turns: u64,
    /// Last model id seen in the session (e.g. "claude-opus-4-7").
    pub model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeSessionMeta {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub file_path: String,
    pub started_at: String,
    pub message_count: usize,
    pub title: String,
    pub token_usage: ClaudeTokenUsage,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeSessionDetail {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub file_path: String,
    pub started_at: String,
    pub message_count: usize,
    pub title: String,
    pub messages: Vec<ClaudeCodeMessage>,
    pub token_usage: ClaudeTokenUsage,
    /// Every file the session's tool calls touched, in order, faithful to the
    /// raw `tool_use` blocks. One entry per touch (a file read three times
    /// appears three times); the per-file rollup is a pure derivation done on
    /// the TypeScript side. This is the structured provenance that the flat
    /// `content` string ("🔧 Edit: …") used to discard.
    pub file_touches: Vec<ClaudeFileTouch>,
}

/// One file a tool call touched. Extracted from a `tool_use` block's `input`
/// (`file_path` / `notebook_path`) before the block is flattened into the
/// rendered `content` string. Faithful and minimal: it records what was
/// touched, by which tool, how, and when. Line-level change counts are a
/// later refinement that correlates the call with its `toolUseResult`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeFileTouch {
    /// Absolute path exactly as the tool recorded it (not validated against
    /// the current filesystem — move/deletion detection is a later slice).
    pub path: String,
    /// The tool that touched it, e.g. "Edit", "Write", "Read", "MultiEdit",
    /// "NotebookEdit".
    pub tool: String,
    /// Coarse change kind derived from the tool: "wrote", "edited", "read",
    /// or "touched" for a path-bearing tool we don't specifically map.
    pub change_kind: String,
    /// Timestamp of the enclosing JSONL line, when present. Empty otherwise.
    pub at: String,
    /// Lines added by this change, counted from the result's `structuredPatch`
    /// (`+` lines). `0` when the tool produced no patch (reads, or a result
    /// Mori could not correlate). Honest minimum, never an estimate.
    pub additions: u32,
    /// Lines removed by this change (`-` lines in `structuredPatch`). `0` when
    /// no patch was correlated.
    pub deletions: u32,
    /// Id of the JSONL line (assistant message) this touch came from — the same
    /// id used for `ClaudeCodeMessage.id`, so the import can attribute a touch
    /// to the exact turn / timeline event it belongs to. Empty when the line
    /// carried no id.
    pub message_id: String,
    /// A bounded preview of the change: just the added / removed lines from the
    /// result's `structuredPatch` (no context), capped to a handful of short
    /// lines. Summary-level (like an event summary), never the full file. Empty
    /// for reads or changes Mori could not correlate.
    pub diff_preview: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    /// Coarse classifier for `content` so the UI can distinguish real user
    /// input from tool-result envelopes and assistant tool invocations from
    /// plain text replies. Values:
    /// - `""` — ordinary human / assistant message
    /// - `"tool_result"` — a `user` row that is actually a tool response
    /// - `"tool_use"` — an `assistant` row that starts with a tool invocation
    pub subkind: String,
}

#[tauri::command]
pub fn discover_claude_code_sessions() -> Result<Vec<ClaudeCodeSessionMeta>, String> {
    let root = claude_code_projects_dir()?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    list_sessions_at(&root)
}

#[tauri::command]
pub fn get_claude_code_session(session_path: String) -> Result<ClaudeCodeSessionDetail, String> {
    let trimmed = session_path.trim();
    if trimmed.is_empty() {
        return Err("sessionPath is required.".to_string());
    }
    let root = claude_code_projects_dir()?;
    read_session_at(&root, trimmed)
}

// ─── helpers ───────────────────────────────────────────────────────────────

pub(crate) fn claude_code_projects_dir() -> Result<PathBuf, String> {
    // Honors $CLAUDE_CONFIG_DIR, else ~/.claude/projects (see agent_paths).
    crate::agent_paths::require(
        crate::agent_paths::claude_projects_dir(),
        "Claude Code sessions",
    )
}

pub(crate) fn list_sessions_at(root: &Path) -> Result<Vec<ClaudeCodeSessionMeta>, String> {
    let mut out: Vec<ClaudeCodeSessionMeta> = Vec::new();
    let project_dirs = match fs::read_dir(root) {
        Ok(iter) => iter,
        Err(error) => {
            return Err(format!(
                "Failed to read Claude Code projects directory {}: {error}",
                root.display()
            ));
        }
    };
    for project_entry in project_dirs.flatten() {
        let project_path = project_entry.path();
        if !project_path.is_dir() {
            continue;
        }
        let encoded_name = project_path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        let decoded_project_name = decode_project_name(&encoded_name);

        let session_files = match fs::read_dir(&project_path) {
            Ok(iter) => iter,
            Err(_) => continue,
        };
        for session_entry in session_files.flatten() {
            let session_path = session_entry.path();
            if !session_path.is_file() {
                continue;
            }
            if !is_jsonl(&session_path) {
                continue;
            }
            let metadata = match session_entry.metadata() {
                Ok(meta) => meta,
                Err(_) => continue,
            };
            if metadata.len() > MAX_FILE_BYTES {
                // Skip oversize sessions rather than fail the whole listing —
                // we surface the others and let the user open this one
                // explicitly if they need to triage it.
                continue;
            }
            let modified_at = format_modified_iso(metadata
                .modified()
                .or_else(|_| metadata.created())
                .unwrap_or(SystemTime::UNIX_EPOCH));

            let session_id = session_path
                .file_stem()
                .map(|stem| stem.to_string_lossy().to_string())
                .unwrap_or_default();

            // Cheap preview pass: count lines and grab the first user
            // message for the title. We never load the whole file into
            // memory beyond what we need to show in the list.
            let preview = preview_session(&session_path).unwrap_or_default();
            let project_label = if preview.cwd.trim().is_empty() {
                decoded_project_name.clone()
            } else {
                preview.cwd.clone()
            };
            let started_at = if preview.first_timestamp.is_empty() {
                modified_at.clone()
            } else {
                preview.first_timestamp
            };
            let title = if !preview.summary.trim().is_empty() {
                truncate(&preview.summary, 90)
            } else if preview.first_user_text.trim().is_empty() {
                format!("Claude Code · {}", project_label)
            } else {
                distill_title(&preview.first_user_text, 90)
            };

            out.push(ClaudeCodeSessionMeta {
                session_id,
                project_path: project_label.clone(),
                project_name: project_label,
                file_path: session_path.to_string_lossy().to_string(),
                started_at,
                message_count: preview.message_count,
                title,
                token_usage: preview.token_usage,
            });
        }
    }
    out.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    Ok(out)
}

pub(crate) fn read_session_at(
    root: &Path,
    session_path: &str,
) -> Result<ClaudeCodeSessionDetail, String> {
    let requested = PathBuf::from(session_path);
    let canonical_root = fs::canonicalize(root)
        .map_err(|error| format!("Failed to resolve {}: {error}", root.display()))?;
    let canonical = fs::canonicalize(&requested)
        .map_err(|error| format!("Failed to resolve {}: {error}", requested.display()))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Refused: session path is outside the Claude Code projects directory.".to_string());
    }
    if !is_jsonl(&canonical) {
        return Err("Refused: file is not a Claude Code JSONL session.".to_string());
    }

    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("Failed to stat {}: {error}", canonical.display()))?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(format!(
            "Claude Code session is too large ({} bytes > {} byte cap).",
            metadata.len(),
            MAX_FILE_BYTES
        ));
    }

    let text = fs::read_to_string(&canonical)
        .map_err(|error| format!("Failed to read {}: {error}", canonical.display()))?;

    let parsed = parse_jsonl(&text);

    let encoded_name = canonical
        .parent()
        .and_then(|parent| parent.file_name())
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    let decoded_project_name = decode_project_name(&encoded_name);
    let project_name = if parsed.cwd.trim().is_empty() {
        decoded_project_name
    } else {
        parsed.cwd.clone()
    };
    let session_id = canonical
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_default();

    let started_at = parsed
        .messages
        .first()
        .map(|m| m.created_at.clone())
        .unwrap_or_else(|| {
            format_modified_iso(
                metadata
                    .modified()
                    .or_else(|_| metadata.created())
                    .unwrap_or(SystemTime::UNIX_EPOCH),
            )
        });
    let title = if parsed.title.trim().is_empty() {
        format!("Claude Code · {}", project_name)
    } else {
        distill_title(&parsed.title, 90)
    };

    Ok(ClaudeCodeSessionDetail {
        session_id,
        project_path: project_name.clone(),
        project_name,
        file_path: canonical.to_string_lossy().to_string(),
        started_at,
        message_count: parsed.messages.len(),
        title,
        token_usage: parsed.token_usage,
        file_touches: parsed.file_touches,
        messages: parsed.messages,
    })
}

#[derive(Default)]
struct SessionPreview {
    message_count: usize,
    first_user_text: String,
    summary: String,
    first_timestamp: String,
    cwd: String,
    token_usage: ClaudeTokenUsage,
}

fn preview_session(path: &Path) -> Option<SessionPreview> {
    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut preview = SessionPreview::default();
    let mut tokens = TokenAccumulator::default();
    for line_result in reader.lines() {
        let Ok(line) = line_result else {
            break;
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        tokens.observe(&value);
        if preview.summary.is_empty() {
            if let Some(summary) = extract_summary(&value) {
                preview.summary = summary;
            }
        }
        let role = detect_role(&value);
        if role == "human" && preview.first_user_text.is_empty() {
            preview.first_user_text = extract_content(&value);
        }
        if preview.first_timestamp.is_empty() {
            if let Some(ts) = extract_timestamp(&value) {
                preview.first_timestamp = ts;
            }
        }
        if preview.cwd.is_empty() {
            if let Some(cwd) = extract_cwd(&value) {
                preview.cwd = cwd;
            }
        }
        if role == "human" || role == "assistant" {
            preview.message_count += 1;
        }
    }
    preview.token_usage = tokens.usage;
    Some(preview)
}

struct ParsedSession {
    messages: Vec<ClaudeCodeMessage>,
    title: String,
    cwd: String,
    token_usage: ClaudeTokenUsage,
    file_touches: Vec<ClaudeFileTouch>,
}

/// Accumulates token usage across a session, deduping by assistant
/// `message.id` so repeated streaming-chunk lines are counted once.
#[derive(Default)]
struct TokenAccumulator {
    seen_message_ids: std::collections::HashSet<String>,
    usage: ClaudeTokenUsage,
}

impl TokenAccumulator {
    /// Inspect one parsed JSONL line. If it is an assistant message that
    /// carries a `usage` block and we have not yet counted its `message.id`,
    /// fold its token counts into the running total.
    fn observe(&mut self, value: &Value) {
        let message = match value.get("message") {
            Some(m) => m,
            None => return,
        };
        let usage = match message.get("usage") {
            Some(u) if u.is_object() => u,
            _ => return,
        };
        // Dedupe by the assistant message id. Fall back to never-collapsing
        // if no id is present (rare) so we don't silently drop usage.
        if let Some(id) = message.get("id").and_then(Value::as_str) {
            if !self.seen_message_ids.insert(id.to_string()) {
                return;
            }
        }
        let read = |key: &str| usage.get(key).and_then(Value::as_u64).unwrap_or(0);
        let input = read("input_tokens");
        let output = read("output_tokens");
        self.usage.input_tokens += input;
        self.usage.output_tokens += output;
        self.usage.cache_creation_tokens += read("cache_creation_input_tokens");
        self.usage.cache_read_tokens += read("cache_read_input_tokens");
        self.usage.total_tokens += input + output;
        self.usage.assistant_turns += 1;
        if let Some(model) = message.get("model").and_then(Value::as_str) {
            if !model.is_empty() {
                self.usage.model = model.to_string();
            }
        }
    }
}

fn parse_jsonl(text: &str) -> ParsedSession {
    let mut messages: Vec<ClaudeCodeMessage> = Vec::new();
    let mut title = String::new();
    let mut summary = String::new();
    let mut cwd = String::new();
    let mut tokens = TokenAccumulator::default();
    let mut file_touches: Vec<ClaudeFileTouch> = Vec::new();
    let mut touch_ids: Vec<Option<String>> = Vec::new();
    let mut patches: std::collections::HashMap<String, (u32, u32, String)> =
        std::collections::HashMap::new();
    for (index, line) in text.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        // Token accounting happens for every assistant line (including the
        // streaming chunks that carry no displayable content), independent
        // of whether the message survives the content filter below.
        tokens.observe(&value);
        // File provenance is collected before the content filter: a tool-only
        // assistant line still records which file it touched even though its
        // rendered content may be dropped as noise downstream.
        collect_file_touches(&value, &mut file_touches, &mut touch_ids);
        if let Some((id, counts)) = tool_result_patch(&value) {
            patches.insert(id, counts);
        }
        if cwd.is_empty() {
            if let Some(found) = extract_cwd(&value) {
                cwd = found;
            }
        }
        if summary.is_empty() {
            if let Some(found) = extract_summary(&value) {
                summary = found;
            }
        }
        let role = detect_role(&value);
        if role != "human" && role != "assistant" {
            continue;
        }
        let content = extract_content(&value);
        if content.trim().is_empty() {
            continue;
        }
        if role == "human" && title.is_empty() {
            title = content.clone();
        }
        let id = value
            .get("uuid")
            .or_else(|| value.get("id"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("line-{index}"));
        let created_at = extract_timestamp(&value).unwrap_or_default();
        let subkind = classify_subkind(&role, &content);
        messages.push(ClaudeCodeMessage {
            id,
            role,
            content,
            created_at,
            subkind,
        });
    }
    // Attach line counts to each touch from its correlated result. The result
    // line usually arrives after its call, so this join happens once the whole
    // file has been read.
    for (index, id) in touch_ids.iter().enumerate() {
        if let Some(id) = id {
            if let Some((additions, deletions, preview)) = patches.get(id) {
                file_touches[index].additions = *additions;
                file_touches[index].deletions = *deletions;
                file_touches[index].diff_preview = preview.clone();
            }
        }
    }

    ParsedSession {
        messages,
        // Prefer the real conversation summary; fall back to the first user
        // message only when the session was never summarised.
        title: if summary.trim().is_empty() { title } else { summary },
        cwd,
        token_usage: tokens.usage,
        file_touches,
    }
}

/// Classify a parsed message so the UI can render tool-use and tool-result
/// rows differently from real user / assistant turns. The classifier looks
/// at the prefixes our own `render_content_block` produces (🔧 for tool
/// invocations, `↳ 도구 결과` / `↳ 도구 오류` for tool responses) so it stays
/// in sync with how the same content is shown elsewhere.
fn classify_subkind(role: &str, content: &str) -> String {
    let trimmed = content.trim_start();
    if role == "human" {
        if trimmed.starts_with("↳ 도구 결과") || trimmed.starts_with("↳ 도구 오류") {
            return "tool_result".to_string();
        }
        return String::new();
    }
    if role == "assistant" {
        // An assistant turn that begins with a tool-use glyph is a tool
        // invocation. A turn that interleaves text + tool blocks lists the
        // text first, so this check only fires when the assistant's reply
        // was tool-only — which is exactly what we want.
        if trimmed.starts_with("🔧") {
            return "tool_use".to_string();
        }
    }
    String::new()
}

fn detect_role(value: &Value) -> String {
    // Claude Code emits envelopes of the form
    //   { "type": "user" | "assistant" | "system" | "tool_use" | ... ,
    //     "message": { "role": "user" | "assistant", "content": ... },
    //     "timestamp": "..." }
    // We prefer the inner `message.role` because newer envelope types can
    // appear at the top level while still wrapping a user/assistant body.
    if let Some(role) = value
        .get("message")
        .and_then(|m| m.get("role"))
        .and_then(Value::as_str)
    {
        return normalize_role(role);
    }
    if let Some(top) = value.get("type").and_then(Value::as_str) {
        return normalize_role(top);
    }
    if let Some(role) = value.get("role").and_then(Value::as_str) {
        return normalize_role(role);
    }
    String::new()
}

fn extract_content(value: &Value) -> String {
    if let Some(message) = value.get("message") {
        if let Some(content) = message.get("content") {
            return collect_message_text(content);
        }
    }
    if let Some(content) = value.get("content") {
        return collect_message_text(content);
    }
    if let Some(text) = value.get("text").and_then(Value::as_str) {
        return text.to_string();
    }
    String::new()
}

fn collect_message_text(content: &Value) -> String {
    match content {
        Value::String(text) => text.to_string(),
        Value::Array(items) => {
            let mut parts: Vec<String> = Vec::new();
            let mut had_recognized_noise = false;
            for item in items {
                if let Value::String(text) = item {
                    parts.push(text.clone());
                    continue;
                }
                // Track whether this block was a known "noise" block (thinking
                // / signed reasoning envelope). If every block in the array is
                // noise, we intentionally produce an empty message rather than
                // dumping the raw JSON envelope.
                if is_recognized_noise_block(item) {
                    had_recognized_noise = true;
                    continue;
                }
                if let Some(rendered) = render_content_block(item) {
                    if !rendered.trim().is_empty() {
                        parts.push(rendered);
                    }
                }
            }
            if !parts.is_empty() {
                return parts.join("\n");
            }
            if had_recognized_noise {
                // Message contained only internal-reasoning blocks. Return
                // empty so the parent skips it instead of leaking opaque
                // base64 signatures into the timeline.
                return String::new();
            }
            // Truly unknown shape — fall back to the conservative projection.
            normalize_content(&content.to_string())
        }
        Value::Object(_) => normalize_content(&content.to_string()),
        _ => String::new(),
    }
}

/// Returns `true` for content blocks that Claude emits for internal
/// reasoning — chain-of-thought, redacted_thinking, or any object that
/// only carries a cryptographic signature. These never become user
/// memory.
fn is_recognized_noise_block(item: &Value) -> bool {
    let block_type = item.get("type").and_then(Value::as_str).unwrap_or("");
    if block_type == "thinking" || block_type == "redacted_thinking" {
        return true;
    }
    if let Some(object) = item.as_object() {
        let has_signature = object.contains_key("signature");
        let has_visible = object.contains_key("text")
            || object.contains_key("name")
            || object.contains_key("content");
        if has_signature && !has_visible {
            return true;
        }
    }
    false
}

/// Collect every file a JSONL line's tool calls touched, appending the touch to
/// `out` and its originating `tool_use` id (parallel index) to `ids`, so a
/// later pass can attach the matching result's line counts.
///
/// Mirrors how `extract_content` reaches the content array, but instead of
/// rendering blocks to a string it pulls the structured file path out of each
/// `tool_use` block. Only assistant lines carry `tool_use` blocks; non-array
/// content (a plain string reply) contributes nothing and is skipped.
fn collect_file_touches(value: &Value, out: &mut Vec<ClaudeFileTouch>, ids: &mut Vec<Option<String>>) {
    let content = value
        .get("message")
        .and_then(|m| m.get("content"))
        .or_else(|| value.get("content"));
    let Some(Value::Array(items)) = content else {
        return;
    };
    let at = extract_timestamp(value).unwrap_or_default();
    // The line's id, derived the same way as `ClaudeCodeMessage.id`, so a touch
    // can be attributed to the exact assistant turn it came from.
    let message_id = value
        .get("uuid")
        .or_else(|| value.get("id"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    for item in items {
        if let Some((touch, id)) = file_touch_from_tool_use(item, &at, message_id) {
            out.push(touch);
            ids.push(id);
        }
    }
}

/// Map a single `tool_use` block to a `ClaudeFileTouch` (plus its `id`) when it
/// names a file. Returns `None` for non-tool blocks, tools that touch no file
/// (Bash, Grep, Glob, MCP calls, …), or a tool whose path input is empty. Line
/// counts start at zero and are filled in later from the correlated result.
fn file_touch_from_tool_use(
    item: &Value,
    at: &str,
    message_id: &str,
) -> Option<(ClaudeFileTouch, Option<String>)> {
    if item.get("type").and_then(Value::as_str) != Some("tool_use") {
        return None;
    }
    let tool = item.get("name").and_then(Value::as_str).unwrap_or("tool");
    let (change_kind, path_key) = match tool {
        "Write" => ("wrote", "file_path"),
        "Edit" | "MultiEdit" => ("edited", "file_path"),
        "Read" => ("read", "file_path"),
        "NotebookEdit" => ("edited", "notebook_path"),
        _ => ("touched", "file_path"),
    };
    let input = item.get("input")?;
    let path = input
        .get(path_key)
        // A tool we don't specifically map may still carry a `file_path`; the
        // "touched" fallback above already covers it. NotebookEdit is the only
        // tool whose path lives under a different key, handled by `path_key`.
        .or_else(|| input.get("file_path"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|p| !p.is_empty())?;
    let id = item
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string);
    Some((
        ClaudeFileTouch {
            path: path.to_string(),
            tool: tool.to_string(),
            change_kind: change_kind.to_string(),
            at: at.to_string(),
            additions: 0,
            deletions: 0,
            message_id: message_id.to_string(),
            diff_preview: String::new(),
        },
        id,
    ))
}

/// Pull `(tool_use_id, (additions, deletions))` from a result line. Claude Code
/// writes the diff under a top-level `toolUseResult.structuredPatch`, while the
/// `tool_use_id` that ties it back to the call lives on the line's
/// `tool_result` content block. Additions / deletions are counted from the
/// hunk lines (`+` / `-` prefixes), so the count is exact, never estimated.
fn tool_result_patch(value: &Value) -> Option<(String, (u32, u32, String))> {
    let content = value
        .get("message")
        .and_then(|m| m.get("content"))
        .or_else(|| value.get("content"));
    let Some(Value::Array(items)) = content else {
        return None;
    };
    let tool_use_id = items.iter().find_map(|item| {
        if item.get("type").and_then(Value::as_str) == Some("tool_result") {
            item.get("tool_use_id").and_then(Value::as_str).map(str::to_string)
        } else {
            None
        }
    })?;
    let patch = value.get("toolUseResult").and_then(|r| r.get("structuredPatch"));
    let Some(Value::Array(hunks)) = patch else {
        // A correlated result with no structured patch (e.g. a Write) still
        // registers, contributing zero counts rather than being dropped.
        return Some((tool_use_id, (0, 0, String::new())));
    };
    let mut additions = 0u32;
    let mut deletions = 0u32;
    // A bounded preview of just the changed lines (no context), so the user can
    // see *what* changed without storing the whole file.
    let mut preview_lines: Vec<String> = Vec::new();
    for hunk in hunks {
        if let Some(Value::Array(lines)) = hunk.get("lines") {
            for line in lines {
                if let Some(text) = line.as_str() {
                    let first = text.as_bytes().first();
                    match first {
                        Some(b'+') => additions += 1,
                        Some(b'-') => deletions += 1,
                        _ => {}
                    }
                    if matches!(first, Some(b'+') | Some(b'-'))
                        && preview_lines.len() < MAX_DIFF_PREVIEW_LINES
                    {
                        preview_lines.push(truncate(text, MAX_DIFF_PREVIEW_LINE_CHARS));
                    }
                }
            }
        }
    }
    Some((tool_use_id, (additions, deletions, preview_lines.join("\n"))))
}

/// How many changed lines a diff preview keeps, and how wide each may be —
/// enough to read the gist, bounded so it stays summary-level.
const MAX_DIFF_PREVIEW_LINES: usize = 12;
const MAX_DIFF_PREVIEW_LINE_CHARS: usize = 120;

/// Render one Claude Code content block (object form). Returns `None` if
/// the block contributes nothing visible (e.g. `thinking`, which we skip
/// by design — chain-of-thought is not user-facing memory).
fn render_content_block(item: &Value) -> Option<String> {
    let block_type = item.get("type").and_then(Value::as_str).unwrap_or("");

    // Plain text — the common case.
    if block_type == "text" {
        return item.get("text").and_then(Value::as_str).map(str::to_string);
    }

    // Tool use — the assistant invoking a tool. Format as a calm one-liner
    // ("🔧 Bash: <description or command>") so the timeline shows what the
    // assistant did instead of dumping raw JSON.
    if block_type == "tool_use" {
        let name = item.get("name").and_then(Value::as_str).unwrap_or("tool");
        let description = item
            .get("input")
            .and_then(|input| input.get("description"))
            .and_then(Value::as_str);
        let command = item
            .get("input")
            .and_then(|input| input.get("command"))
            .and_then(Value::as_str);
        let file_path = item
            .get("input")
            .and_then(|input| input.get("file_path"))
            .and_then(Value::as_str);
        let pattern = item
            .get("input")
            .and_then(|input| input.get("pattern"))
            .and_then(Value::as_str);
        let prompt = item
            .get("input")
            .and_then(|input| input.get("prompt"))
            .and_then(Value::as_str);
        let summary = description
            .or(command)
            .or(file_path)
            .or(pattern)
            .or(prompt);
        return Some(match summary {
            Some(text) => format!("🔧 {name}: {}", truncate(text, 140)),
            None => format!("🔧 {name}"),
        });
    }

    // Tool result — the response coming back to the assistant. Surface a
    // short preview so the user can see what the tool produced.
    if block_type == "tool_result" {
        let body = item
            .get("content")
            .map(|c| match c {
                Value::String(s) => s.clone(),
                Value::Array(items) => {
                    let mut out = String::new();
                    for sub in items {
                        if let Some(text) = sub.get("text").and_then(Value::as_str) {
                            if !out.is_empty() {
                                out.push('\n');
                            }
                            out.push_str(text);
                        } else if let Value::String(text) = sub {
                            if !out.is_empty() {
                                out.push('\n');
                            }
                            out.push_str(text);
                        }
                    }
                    out
                }
                _ => String::new(),
            })
            .unwrap_or_default();
        if body.trim().is_empty() {
            return Some("↳ (도구 결과 없음)".to_string());
        }
        let is_error = item.get("is_error").and_then(Value::as_bool).unwrap_or(false);
        let prefix = if is_error { "↳ 도구 오류" } else { "↳ 도구 결과" };
        return Some(format!("{prefix}: {}", truncate(&body, 200)));
    }

    // Thinking — internal chain-of-thought. We deliberately drop it so it
    // never enters durable memory.
    if block_type == "thinking" || block_type == "redacted_thinking" {
        return None;
    }

    // Signed thinking blocks — Claude sometimes emits objects that only
    // carry an opaque `signature` (and optionally `data`) value. These are
    // cryptographic envelopes around encrypted internal reasoning; they
    // contain no user-facing content and must not leak into the timeline
    // as raw JSON noise.
    if item.is_object() {
        let object = item.as_object().unwrap();
        let has_signature = object.contains_key("signature");
        let has_visible = object.contains_key("text")
            || object.contains_key("name")
            || object.contains_key("content");
        if has_signature && !has_visible {
            return None;
        }
    }

    // Unknown block type — drop silently. The session-level fallback in
    // `collect_message_text` will still emit something if no blocks
    // rendered, so a totally-unknown message is not lost.
    None
}

fn extract_timestamp(value: &Value) -> Option<String> {
    let keys = ["timestamp", "createdAt", "created_at", "time"];
    for key in keys {
        if let Some(text) = value.get(key).and_then(Value::as_str) {
            if !text.is_empty() {
                return Some(text.to_string());
            }
        }
    }
    None
}

fn extract_cwd(value: &Value) -> Option<String> {
    value
        .get("cwd")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|cwd| !cwd.is_empty())
        .map(str::to_string)
}

/// Claude Code writes a `{"type":"summary","summary":"…"}` line (usually at the
/// top of a resumed session) that holds the conversation's real title — the same
/// label `claude --resume` lists. Prefer it over the first user message, which
/// only happens to read like a title.
fn extract_summary(value: &Value) -> Option<String> {
    if value.get("type").and_then(Value::as_str) != Some("summary") {
        return None;
    }
    value
        .get("summary")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|summary| !summary.is_empty())
        .map(str::to_string)
}

fn is_jsonl(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("jsonl"))
        .unwrap_or(false)
}

/// Claude Code encodes a project's absolute path by replacing the path
/// separators with dashes. We try to undo that for display: an encoded name
/// like `-Users-alice-projects-mori` is shown as `/Users/alice/projects/mori`,
/// and the Windows variant `-C--Users-alice-mori` becomes a recognisable
/// `C:/Users/alice/mori`. We never validate that the result exists — it's
/// only used as a label.
fn decode_project_name(encoded: &str) -> String {
    if encoded.is_empty() {
        return String::new();
    }
    let mut path = encoded.replace('-', "/");
    // The CLI uses a leading dash on POSIX paths (-Users-foo) which becomes
    // "/Users/foo" naturally. On Windows the drive letter is written as
    // `C--Users-foo`, so a doubled slash sneaks in; collapse it.
    while path.contains("//") {
        path = path.replace("//", "/");
    }
    // For Windows drive letters, restore the colon (`C/Users` → `C:/Users`).
    let bytes = path.as_bytes();
    if bytes.len() >= 2
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b'/'
    {
        let drive = bytes[0] as char;
        let rest = &path[1..];
        return format!("{drive}:{rest}");
    }
    path
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

/// Distill a clean session title from a raw first user message.
///
/// Claude Code stores no session title of its own (no `summary` line in the
/// JSONL), so the first user request is the only available signal. But a real
/// first request is often a long prompt with pasted file dumps after a `---`
/// fence and several sentences, which makes a blunt 90-char truncation read as
/// noise in the sidebar. We keep the first sentence of the first real line
/// (everything before any horizontal-rule fence), strip leading markdown
/// markers, then truncate — turning a messy paste into a scannable title. Falls
/// back to a plain truncation when there is no clean headline to find.
fn distill_title(raw: &str, max: usize) -> String {
    // Take lines until a horizontal-rule fence (--- or longer), where a pasted
    // document / screenshot dump typically begins rather than the actual ask.
    let mut headline = String::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.len() >= 3 && trimmed.chars().all(|c| c == '-') {
            break;
        }
        let stripped = strip_markdown_lead(trimmed);
        if !stripped.is_empty() {
            headline = stripped;
            break;
        }
    }
    if headline.is_empty() {
        return truncate(raw, max);
    }
    truncate(&first_sentence(&headline), max)
}

/// Strip leading markdown markers (heading, quote, bullet, code fence) and
/// surrounding whitespace from a single line.
fn strip_markdown_lead(line: &str) -> String {
    line.trim_start_matches(|c: char| {
        matches!(c, '#' | '>' | '-' | '*' | '`' | ' ' | '\t')
    })
    .trim()
    .to_string()
}

/// The first sentence of a line: text up to and including the first terminator
/// (`.`, `!`, `?`, and their CJK forms) that is followed by whitespace or the
/// end of the line, so a decimal like "v1.2" is not mistaken for a break.
fn first_sentence(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        if matches!(c, '.' | '!' | '?' | '。' | '！' | '？') {
            let followed_by_break = chars
                .get(i + 1)
                .map(|next| next.is_whitespace())
                .unwrap_or(true);
            if followed_by_break {
                return chars[..=i].iter().collect::<String>().trim().to_string();
            }
        }
    }
    line.trim().to_string()
}

fn format_modified_iso(when: SystemTime) -> String {
    let duration = when.duration_since(UNIX_EPOCH).unwrap_or_default();
    crate::claude::format_unix_seconds(duration.as_secs())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn write_session(dir: &Path, name: &str, body: &str) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let path = dir.join(name);
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(body.as_bytes()).unwrap();
        path
    }

    #[test]
    fn distill_title_cuts_pasted_dump_after_a_fence() {
        let raw = "이거에 대해서 어떻게 생각해? 코덱스에서 이렇게 해왔었거든\n\n---\n파일편집보기창도움말\n홈 대시보드 기획";
        // The headline keeps only the first sentence before the --- fence.
        assert_eq!(distill_title(raw, 90), "이거에 대해서 어떻게 생각해?");
    }

    #[test]
    fn distill_title_keeps_a_short_single_line_request() {
        assert_eq!(distill_title("RAG과 LLM-Wiki 관련해서 작업중", 90), "RAG과 LLM-Wiki 관련해서 작업중");
    }

    #[test]
    fn distill_title_strips_a_leading_markdown_marker() {
        assert_eq!(distill_title("## 홈 화면 개선해줘", 90), "홈 화면 개선해줘");
    }

    #[test]
    fn distill_title_does_not_break_on_a_decimal_point() {
        assert_eq!(distill_title("v1.2 업데이트 반영해줘", 90), "v1.2 업데이트 반영해줘");
    }

    #[test]
    fn distill_title_truncates_a_long_run_on_request() {
        let raw = "가".repeat(200);
        let out = distill_title(&raw, 90);
        assert!(out.chars().count() <= 93, "title was {} chars", out.chars().count());
        assert!(out.ends_with("..."));
    }

    #[test]
    fn distill_title_falls_back_when_there_is_no_clean_headline() {
        // A message that is only a fence + dump has no headline line; fall back.
        assert_eq!(distill_title("---\n붙여넣은 내용", 90), truncate("---\n붙여넣은 내용", 90));
    }

    #[test]
    fn lists_sessions_and_extracts_first_user_message_as_title() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-Users-alice-mori");
        write_session(
            &project,
            "session-aaa.jsonl",
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"What's the plan?\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Hi back.\"}]},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n",
        );
        let listing = list_sessions_at(temp.path()).unwrap();
        assert_eq!(listing.len(), 1);
        let row = &listing[0];
        assert_eq!(row.session_id, "session-aaa");
        assert!(row.title.contains("plan"));
        assert_eq!(row.message_count, 2);
        // The decoded project name should be human readable.
        assert!(row.project_name.contains("Users"));
    }

    #[test]
    fn prefers_the_summary_line_as_the_real_title() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-Users-alice-mori");
        write_session(
            &project,
            "session-sum.jsonl",
            "{\"type\":\"summary\",\"summary\":\"Refactor the auth middleware\",\"leafUuid\":\"x\"}\n\
             {\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"What's the plan?\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Hi back.\"}]},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n",
        );
        let listing = list_sessions_at(temp.path()).unwrap();
        let row = listing.iter().find(|r| r.session_id == "session-sum").unwrap();
        // The real title wins over the first user message.
        assert_eq!(row.title, "Refactor the auth middleware");
        // The summary line is not counted as a conversation message.
        assert_eq!(row.message_count, 2);

        let path = project.join("session-sum.jsonl");
        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        assert_eq!(detail.title, "Refactor the auth middleware");
        assert_eq!(detail.messages.len(), 2);
    }

    #[test]
    fn reads_session_detail_and_decodes_content_array() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori");
        let path = write_session(
            &project,
            "session-bbb.jsonl",
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"Hello\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Hi.\"}]},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n",
        );
        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        assert_eq!(detail.messages.len(), 2);
        assert_eq!(detail.messages[0].role, "human");
        assert_eq!(detail.messages[0].content, "Hello");
        assert_eq!(detail.messages[1].role, "assistant");
        assert!(detail.messages[1].content.contains("Hi."));
    }

    #[test]
    fn list_prefers_jsonl_cwd_so_hyphenated_folder_names_survive() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("C--dev-ng-gw");
        write_session(
            &project,
            "session-hyphen.jsonl",
            "{\"type\":\"user\",\"cwd\":\"C:\\\\dev\\\\ng-gw\",\"message\":{\"role\":\"user\",\"content\":\"Check gateway\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n",
        );

        let listing = list_sessions_at(temp.path()).unwrap();

        assert_eq!(listing.len(), 1);
        assert_eq!(listing[0].project_name, "C:\\dev\\ng-gw");
        assert_eq!(listing[0].project_path, "C:\\dev\\ng-gw");
    }

    #[test]
    fn read_prefers_jsonl_cwd_so_hyphenated_folder_names_survive() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("C--dev-ng-gw");
        let path = write_session(
            &project,
            "session-hyphen-detail.jsonl",
            "{\"type\":\"user\",\"cwd\":\"C:\\\\dev\\\\ng-gw\",\"message\":{\"role\":\"user\",\"content\":\"Check gateway\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n",
        );

        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();

        assert_eq!(detail.project_name, "C:\\dev\\ng-gw");
        assert_eq!(detail.project_path, "C:\\dev\\ng-gw");
    }

    #[test]
    fn read_rejects_paths_outside_root() {
        let temp = TempDir::new().unwrap();
        let outside = temp.path().join("escape.jsonl");
        std::fs::write(&outside, "{}\n").unwrap();
        let root = temp.path().join("scope");
        std::fs::create_dir_all(&root).unwrap();
        let err = read_session_at(&root, outside.to_string_lossy().as_ref()).unwrap_err();
        assert!(err.contains("outside"), "error: {err}");
    }

    #[test]
    fn read_rejects_non_jsonl_files() {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("notes.txt");
        std::fs::write(&path, "hi").unwrap();
        let err = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap_err();
        assert!(err.contains("JSONL"), "error: {err}");
    }

    #[test]
    fn collects_file_touches_from_tool_use_blocks() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori");
        let path = write_session(
            &project,
            "session-touch.jsonl",
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"Edit the file\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"name\":\"Edit\",\"input\":{\"file_path\":\"/repo/src/a.ts\",\"old_string\":\"x\",\"new_string\":\"y\"}}]},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n\
             {\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"name\":\"Write\",\"input\":{\"file_path\":\"/repo/src/b.ts\",\"content\":\"new\"}},{\"type\":\"tool_use\",\"name\":\"Read\",\"input\":{\"file_path\":\"/repo/src/a.ts\"}}]},\"timestamp\":\"2026-01-01T00:00:02Z\"}\n\
             {\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"name\":\"Bash\",\"input\":{\"command\":\"ls\"}},{\"type\":\"tool_use\",\"name\":\"NotebookEdit\",\"input\":{\"notebook_path\":\"/repo/nb.ipynb\"}}]},\"timestamp\":\"2026-01-01T00:00:03Z\"}\n",
        );

        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        let touches = &detail.file_touches;

        // Edit, Write, Read, NotebookEdit are recorded; Bash (no file) is not.
        assert_eq!(touches.len(), 4, "touches: {touches:?}");

        assert_eq!(touches[0].path, "/repo/src/a.ts");
        assert_eq!(touches[0].tool, "Edit");
        assert_eq!(touches[0].change_kind, "edited");
        assert_eq!(touches[0].at, "2026-01-01T00:00:01Z");

        assert_eq!(touches[1].tool, "Write");
        assert_eq!(touches[1].change_kind, "wrote");

        // A file read after being written appears as its own faithful touch.
        assert_eq!(touches[2].path, "/repo/src/a.ts");
        assert_eq!(touches[2].change_kind, "read");

        // NotebookEdit reads its path from the notebook_path key.
        assert_eq!(touches[3].path, "/repo/nb.ipynb");
        assert_eq!(touches[3].tool, "NotebookEdit");
        assert_eq!(touches[3].change_kind, "edited");
    }

    #[test]
    fn attaches_line_counts_from_tool_result_patch() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori");
        let path = write_session(
            &project,
            "session-patch.jsonl",
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"Edit it\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"tu_1\",\"name\":\"Edit\",\"input\":{\"file_path\":\"/repo/a.ts\"}}]},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n\
             {\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"tool_result\",\"tool_use_id\":\"tu_1\"}]},\"toolUseResult\":{\"structuredPatch\":[{\"lines\":[\" ctx\",\"-old\",\"+new1\",\"+new2\"]}]},\"timestamp\":\"2026-01-01T00:00:02Z\"}\n",
        );

        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        let touch = detail
            .file_touches
            .iter()
            .find(|t| t.path == "/repo/a.ts")
            .expect("touch recorded");
        assert_eq!(touch.additions, 2);
        assert_eq!(touch.deletions, 1);
        // The preview keeps the changed lines (no context), so the user sees
        // what changed without the whole file.
        assert!(touch.diff_preview.contains("-old"), "preview: {}", touch.diff_preview);
        assert!(touch.diff_preview.contains("+new1"), "preview: {}", touch.diff_preview);
        assert!(!touch.diff_preview.contains("ctx"), "context dropped: {}", touch.diff_preview);
    }

    #[test]
    fn file_touch_carries_the_originating_message_id() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori");
        let path = write_session(
            &project,
            "session-mid.jsonl",
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"go\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"assistant\",\"uuid\":\"asst-uuid-1\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"name\":\"Edit\",\"input\":{\"file_path\":\"/r/a.ts\"}}]},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n",
        );
        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        let touch = detail
            .file_touches
            .iter()
            .find(|t| t.path == "/r/a.ts")
            .expect("touch recorded");
        // The line's uuid is the message id used to attribute the touch to a turn.
        assert_eq!(touch.message_id, "asst-uuid-1");
    }

    #[test]
    fn ignores_tool_use_without_a_file_path() {
        let mut out = Vec::new();
        let mut ids = Vec::new();
        let block = serde_json::json!({
            "type": "tool_use",
            "name": "Grep",
            "input": { "pattern": "TODO" }
        });
        collect_file_touches(
            &serde_json::json!({ "message": { "content": [block] } }),
            &mut out,
            &mut ids,
        );
        assert!(out.is_empty(), "Grep has no file path: {out:?}");

        // An empty path string is skipped too.
        let empty = serde_json::json!({
            "type": "tool_use",
            "name": "Edit",
            "input": { "file_path": "   " }
        });
        assert!(file_touch_from_tool_use(&empty, "t", "m").is_none());
    }

    #[test]
    fn decode_project_name_restores_posix_path() {
        assert_eq!(
            decode_project_name("-Users-alice-mori"),
            "/Users/alice/mori"
        );
    }

    #[test]
    fn decode_project_name_restores_windows_drive() {
        let out = decode_project_name("C--Users-alice-mori");
        assert!(out.starts_with("C:/"), "got: {out}");
        assert!(out.contains("Users"));
    }

    #[test]
    fn renders_tool_use_block_as_readable_summary() {
        let tool_use = serde_json::json!({
            "type": "tool_use",
            "name": "Bash",
            "input": {
                "command": "grep -n foo bar.rs",
                "description": "Find foo references"
            }
        });
        let rendered = render_content_block(&tool_use).unwrap();
        assert!(rendered.contains("🔧 Bash"), "got: {rendered}");
        // The description wins over the raw command when both are present.
        assert!(rendered.contains("Find foo references"), "got: {rendered}");
        assert!(!rendered.contains("\"input\""), "got: {rendered}");
    }

    #[test]
    fn renders_tool_use_falls_back_to_command_when_no_description() {
        let tool_use = serde_json::json!({
            "type": "tool_use",
            "name": "Read",
            "input": { "file_path": "/etc/hosts" }
        });
        let rendered = render_content_block(&tool_use).unwrap();
        assert!(rendered.contains("Read"), "got: {rendered}");
        assert!(rendered.contains("/etc/hosts"), "got: {rendered}");
    }

    #[test]
    fn renders_tool_result_with_text_content() {
        let tool_result = serde_json::json!({
            "type": "tool_result",
            "tool_use_id": "toolu_xyz",
            "content": "line one\nline two"
        });
        let rendered = render_content_block(&tool_result).unwrap();
        assert!(rendered.starts_with("↳ 도구 결과"), "got: {rendered}");
        assert!(rendered.contains("line one"), "got: {rendered}");
    }

    #[test]
    fn renders_tool_result_with_array_content() {
        let tool_result = serde_json::json!({
            "type": "tool_result",
            "content": [{"type": "text", "text": "wrapped result"}]
        });
        let rendered = render_content_block(&tool_result).unwrap();
        assert!(rendered.contains("wrapped result"), "got: {rendered}");
    }

    #[test]
    fn renders_tool_result_marks_errors() {
        let tool_result = serde_json::json!({
            "type": "tool_result",
            "content": "boom",
            "is_error": true
        });
        let rendered = render_content_block(&tool_result).unwrap();
        assert!(rendered.contains("도구 오류"), "got: {rendered}");
    }

    #[test]
    fn thinking_blocks_are_dropped_from_rendered_content() {
        let thinking = serde_json::json!({
            "type": "thinking",
            "thinking": "internal reasoning the user never sees"
        });
        assert!(render_content_block(&thinking).is_none());
    }

    #[test]
    fn redacted_thinking_blocks_are_dropped() {
        let redacted = serde_json::json!({
            "type": "redacted_thinking",
            "data": "encrypted-thinking-payload"
        });
        assert!(render_content_block(&redacted).is_none());
    }

    #[test]
    fn signature_only_blocks_are_dropped() {
        // Claude sometimes emits opaque signed envelopes that carry no
        // user-visible content. They look like {"signature":"<base64>"}
        // and used to leak through as raw JSON noise.
        let signed = serde_json::json!({
            "signature": "EoQDCmUIDRgCKkB0BSB3nYNFU4SOTX2jDDPRGKpyheohzQF3..."
        });
        assert!(render_content_block(&signed).is_none());
    }

    #[test]
    fn signature_with_visible_content_is_kept() {
        // A signed block that ALSO carries text should still surface the
        // text — we only drop signature envelopes that are otherwise empty.
        let signed_with_text = serde_json::json!({
            "type": "text",
            "text": "Here is my answer.",
            "signature": "EoQDCmU..."
        });
        let rendered = render_content_block(&signed_with_text).unwrap();
        assert!(rendered.contains("Here is my answer."));
    }

    #[test]
    fn message_with_only_noise_blocks_returns_empty_not_raw_json() {
        // Regression: an assistant message whose content array contains
        // only thinking + signed envelopes used to fall through to a JSON
        // dump. It must now produce an empty string so the parser drops
        // the (essentially empty) message instead.
        let content = serde_json::json!([
            { "type": "thinking", "thinking": "..." },
            { "signature": "EoQDCmU..." }
        ]);
        let out = collect_message_text(&content);
        assert!(out.is_empty(), "got: {out:?}");
    }

    #[test]
    fn message_mixing_noise_and_text_keeps_the_text_only() {
        let content = serde_json::json!([
            { "signature": "EoQDCmU..." },
            { "type": "text", "text": "Real answer." },
            { "type": "redacted_thinking", "data": "..." }
        ]);
        let out = collect_message_text(&content);
        assert_eq!(out, "Real answer.");
    }

    #[test]
    fn token_accumulator_sums_usage_and_dedupes_by_message_id() {
        let mut acc = TokenAccumulator::default();
        // Three streaming-chunk lines for the SAME assistant message — the
        // usage repeats and must be counted once.
        let chunk = serde_json::json!({
            "type": "assistant",
            "message": {
                "id": "msg_abc",
                "model": "claude-opus-4-7",
                "role": "assistant",
                "usage": {
                    "input_tokens": 100,
                    "output_tokens": 50,
                    "cache_creation_input_tokens": 10,
                    "cache_read_input_tokens": 200
                }
            }
        });
        acc.observe(&chunk);
        acc.observe(&chunk);
        acc.observe(&chunk);
        // A second distinct message adds on top.
        let second = serde_json::json!({
            "type": "assistant",
            "message": {
                "id": "msg_def",
                "model": "claude-opus-4-7",
                "role": "assistant",
                "usage": { "input_tokens": 8, "output_tokens": 12 }
            }
        });
        acc.observe(&second);

        assert_eq!(acc.usage.input_tokens, 108);
        assert_eq!(acc.usage.output_tokens, 62);
        assert_eq!(acc.usage.cache_creation_tokens, 10);
        assert_eq!(acc.usage.cache_read_tokens, 200);
        assert_eq!(acc.usage.total_tokens, 170);
        assert_eq!(acc.usage.assistant_turns, 2);
        assert_eq!(acc.usage.model, "claude-opus-4-7");
    }

    #[test]
    fn token_accumulator_ignores_lines_without_usage() {
        let mut acc = TokenAccumulator::default();
        acc.observe(&serde_json::json!({
            "type": "user",
            "message": { "role": "user", "content": "hi" }
        }));
        assert_eq!(acc.usage.total_tokens, 0);
        assert_eq!(acc.usage.assistant_turns, 0);
    }

    #[test]
    fn parse_jsonl_aggregates_session_token_usage() {
        let body = "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"hi\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
            {\"type\":\"assistant\",\"message\":{\"id\":\"msg_1\",\"role\":\"assistant\",\"model\":\"claude-opus-4-7\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}],\"usage\":{\"input_tokens\":30,\"output_tokens\":15}},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n\
            {\"type\":\"assistant\",\"message\":{\"id\":\"msg_1\",\"role\":\"assistant\",\"model\":\"claude-opus-4-7\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}],\"usage\":{\"input_tokens\":30,\"output_tokens\":15}},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n";
        let parsed = parse_jsonl(body);
        // The duplicated msg_1 chunk is counted once.
        assert_eq!(parsed.token_usage.input_tokens, 30);
        assert_eq!(parsed.token_usage.output_tokens, 15);
        assert_eq!(parsed.token_usage.total_tokens, 45);
        assert_eq!(parsed.token_usage.assistant_turns, 1);
    }

    #[test]
    fn assistant_message_with_text_and_tool_use_renders_both_legibly() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori-tools");
        let line = "{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[\
            {\"type\":\"text\",\"text\":\"Let me check.\"},\
            {\"type\":\"tool_use\",\"name\":\"Bash\",\"input\":{\"command\":\"ls\",\"description\":\"List files\"}}\
        ]},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n";
        let path = write_session(&project, "session-tools.jsonl", line);
        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        assert_eq!(detail.messages.len(), 1);
        let body = &detail.messages[0].content;
        assert!(body.contains("Let me check."), "got: {body}");
        assert!(body.contains("🔧 Bash"), "got: {body}");
        assert!(body.contains("List files"), "got: {body}");
        // Most importantly: no raw JSON envelope keys leaked through.
        assert!(!body.contains("\"caller\""), "got: {body}");
        assert!(!body.contains("\"input\":{"), "got: {body}");
    }

    #[test]
    fn classify_subkind_marks_human_tool_results() {
        assert_eq!(
            classify_subkind("human", "↳ 도구 결과: file1.rs\nfile2.rs"),
            "tool_result"
        );
        assert_eq!(
            classify_subkind("human", "↳ 도구 오류: command failed"),
            "tool_result"
        );
        assert_eq!(classify_subkind("human", "Please fix the bug."), "");
    }

    #[test]
    fn classify_subkind_marks_assistant_tool_uses() {
        assert_eq!(
            classify_subkind("assistant", "🔧 Bash: ls -la"),
            "tool_use"
        );
        assert_eq!(
            classify_subkind("assistant", "Let me check.\n🔧 Bash: ls"),
            ""
        );
        assert_eq!(classify_subkind("assistant", "Here is the result."), "");
    }

    #[test]
    fn parsed_messages_carry_subkind_for_tool_results() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori-subkind");
        let line = "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":[\
            {\"type\":\"tool_result\",\"tool_use_id\":\"abc\",\"content\":\"ok\"}\
        ]},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n";
        let path = write_session(&project, "session-subkind.jsonl", line);
        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        assert_eq!(detail.messages.len(), 1);
        assert_eq!(detail.messages[0].role, "human");
        assert_eq!(detail.messages[0].subkind, "tool_result");
    }

    #[test]
    fn user_message_with_tool_result_renders_result_text() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori-toolres");
        let line = "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":[\
            {\"type\":\"tool_result\",\"tool_use_id\":\"abc\",\"content\":\"file1.rs\\nfile2.rs\"}\
        ]},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n";
        let path = write_session(&project, "session-result.jsonl", line);
        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        assert_eq!(detail.messages.len(), 1);
        let body = &detail.messages[0].content;
        assert!(body.contains("file1.rs"), "got: {body}");
        assert!(body.starts_with("↳ 도구 결과"), "got: {body}");
    }
}
