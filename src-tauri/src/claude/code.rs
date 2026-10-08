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
    /// Filesystem last-modified time (ISO). The honest "is this session active
    /// right now" signal (`started_at` is the first message, which a resumed
    /// long-running session keeps even while being worked on today).
    pub modified_at: String,
    /// Timestamp of the last record that carries one, or "" when none was
    /// found. Claude Code appends untimestamped bookkeeping records
    /// (`last-prompt`, `cost-state`, `ai-title`) to old sessions, which moves
    /// the file time without any conversation, so this is the activity signal
    /// and `modified_at` only the fallback.
    pub last_activity_at: String,
    /// File size in bytes. Live Follow uses this to start its tail near the end
    /// of a huge session instead of reading the whole history.
    pub file_bytes: u64,
    pub message_count: usize,
    /// False when the preview stopped at its byte budget, so `message_count`
    /// counts only the file's head: a lower bound, never the session's total.
    pub message_count_complete: bool,
    pub title: String,
    pub token_usage: ClaudeTokenUsage,
    /// What the transcript holds, decided only from a complete read:
    /// `conversation` (a user request or an assistant turn), `command-only`
    /// (slash commands and nothing else), `empty` (no user or assistant record
    /// at all), or `unknown` (the read was partial or failed, so emptiness is
    /// not proven).
    pub activity_class: String,
    /// The `entrypoint` the agent recorded (`cli`, `sdk-cli`, ...), "" if none.
    pub entrypoint: String,
    /// PR and branch observations with their coverage; `None` when the file
    /// could not be scanned (unknown, not empty).
    pub evidence: Option<crate::session_evidence::SessionEvidence>,
    /// Which Git checkout the session's work belongs to, and how that is known
    /// (`repository_identity`). `None` when nothing establishes one.
    pub repository: Option<crate::repository_identity::RepositoryObservation>,
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
    /// The assistant message's `stop_reason` (`end_turn`, `tool_use`,
    /// `stop_sequence`, `max_tokens`, …), empty for non-assistant messages.
    /// `end_turn` / `stop_sequence` on the session's last message means the turn
    /// finished and the agent is waiting for the user — the honest "not working"
    /// signal that a time window cannot give.
    pub stop_reason: String,
}

/// Line accounting for a delta read, so a live-follow surface can show parse
/// fidelity (raw lines seen vs events produced) and spot silent drops. The
/// invariant `raw_lines == parsed + skipped + unparseable` always holds.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDeltaStats {
    /// Non-empty JSONL records in this delta.
    pub raw_lines: usize,
    /// Records that became a `ClaudeCodeMessage` event.
    pub parsed: usize,
    /// Valid JSON that was not a human/assistant message with content
    /// (summary lines, token-only streaming chunks, system envelopes).
    pub skipped: usize,
    /// Records that did not parse as JSON at all.
    pub unparseable: usize,
}

/// The result of reading a growing session's new complete lines since a byte
/// offset. `new_offset` is where the next poll should resume; it never lands
/// mid-line (a trailing in-progress write is left unconsumed).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeSessionDelta {
    pub file_path: String,
    pub new_offset: u64,
    pub events: Vec<ClaudeCodeMessage>,
    pub file_touches: Vec<ClaudeFileTouch>,
    pub stats: ClaudeDeltaStats,
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

/// Read only the complete lines a session's JSONL gained since `byte_offset`,
/// returning the new events plus the offset to resume from. This is the tail
/// path Live Follow polls: because it consumes only the delta it sidesteps the
/// whole-file `MAX_FILE_BYTES` cap that `get_claude_code_session` enforces, so a
/// long-running session can be followed as it grows. Reading the delta is
/// agent-generic plumbing (`tail_new_complete_lines`); only the line parser is
/// Claude-specific, so a Codex / OpenCode tail reuses the same offset math.
#[tauri::command]
pub fn get_claude_code_session_delta(
    session_path: String,
    byte_offset: u64,
) -> Result<ClaudeCodeSessionDelta, String> {
    let trimmed = session_path.trim();
    if trimmed.is_empty() {
        return Err("sessionPath is required.".to_string());
    }
    let root = claude_code_projects_dir()?;
    read_session_delta_at(&root, trimmed, byte_offset)
}

/// Read one bounded window of a session's history, ending at `before_offset`
/// (the end of the file when absent), for a transcript too large to read whole.
/// See `read_session_window_at`.
#[tauri::command]
pub fn get_claude_code_session_window(
    session_path: String,
    before_offset: Option<u64>,
    source_id: Option<String>,
    anchor: Option<String>,
    end_anchor: Option<String>,
) -> Result<ClaudeCodeSessionWindow, String> {
    let trimmed = session_path.trim();
    if trimmed.is_empty() {
        return Err("sessionPath is required.".to_string());
    }
    let root = claude_code_projects_dir()?;
    read_session_window_with(
        &root,
        trimmed,
        before_offset,
        source_id.as_deref(),
        anchor.as_deref(),
        end_anchor.as_deref(),
        WINDOW_BYTES,
    )
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
            // Oversize sessions are NOT skipped: an active, long-running session
            // grows past the cap, and those are exactly the ones Live Follow must
            // list so it can tail them. The preview below reads only the file's
            // head (bounded), and Live Follow tails from near the end, so a huge
            // file never gets read whole here.
            let file_bytes = metadata.len();
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
            let preview_result = preview_session(&session_path);
            let activity_class = activity_class(preview_result.as_ref()).to_string();
            let preview = preview_result.unwrap_or_default();
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
            // Prefer Claude's own generated title (the clean resume-list label),
            // then the conversation summary, then a format-tolerant title match
            // (survives a field rename), then a distilled first user message.
            let title = if !preview.ai_title.trim().is_empty() {
                truncate(&preview.ai_title, 90)
            } else if !preview.summary.trim().is_empty() {
                truncate(&preview.summary, 90)
            } else if !preview.generic_title.trim().is_empty() {
                truncate(&preview.generic_title, 90)
            } else if preview.first_user_text.trim().is_empty() {
                untitled_fallback(&preview.command_name, &project_label)
            } else {
                distill_title(&preview.first_user_text, 90)
            };

            let evidence = crate::session_evidence::claude_evidence(&session_path);
            let repository = crate::repository_identity::observe_repository(
                &project_label,
                evidence
                    .as_ref()
                    .and_then(|found| found.worktree_origin.as_ref())
                    .map(|(origin, path)| (origin.as_str(), path.as_str())),
            );
            out.push(ClaudeCodeSessionMeta {
                session_id,
                project_path: project_label.clone(),
                project_name: project_label,
                file_path: session_path.to_string_lossy().to_string(),
                started_at,
                modified_at,
                last_activity_at: if preview.complete {
                    preview.last_timestamp
                } else {
                    tail_last_timestamp(&session_path).unwrap_or_default()
                },
                file_bytes,
                message_count: preview.message_count,
                message_count_complete: preview.complete,
                title,
                token_usage: preview.token_usage,
                activity_class,
                entrypoint: preview.entrypoint,
                repository,
                evidence,
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
        untitled_fallback(&parsed.command_name, &project_name)
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

pub(crate) fn read_session_delta_at(
    root: &Path,
    session_path: &str,
    offset: u64,
) -> Result<ClaudeCodeSessionDelta, String> {
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

    let (text, new_offset) = tail_new_complete_lines(&canonical, offset)?;
    let (events, file_touches, stats) = parse_jsonl_delta(&text);
    Ok(ClaudeCodeSessionDelta {
        file_path: canonical.to_string_lossy().to_string(),
        new_offset,
        events,
        file_touches,
        stats,
    })
}

/// Agent-generic tail: read only the complete lines a growing file gained since
/// `offset`, and report where the next read should resume. Partial-line safe:
/// bytes after the last newline are treated as an in-progress write and left
/// unconsumed, so `new_offset` never lands mid-line and a torn multi-byte UTF-8
/// sequence at the tail is never decoded (a `\n` byte never falls inside a
/// UTF-8 sequence, so the consumed slice is always on a line boundary).
fn tail_new_complete_lines(path: &Path, offset: u64) -> Result<(String, u64), String> {
    use std::io::{Read, Seek, SeekFrom};
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Failed to stat {}: {error}", path.display()))?;
    let len = metadata.len();
    // Caught up (offset == len), or the file was truncated / rotated below our
    // offset: nothing new to read. Rotation recovery (re-reading a shrunk file
    // from its new start) is a later slice; we never read backwards here.
    if offset >= len {
        return Ok((String::new(), offset));
    }
    let mut file = fs::File::open(path)
        .map_err(|error| format!("Failed to open {}: {error}", path.display()))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| format!("Failed to seek {}: {error}", path.display()))?;
    let mut buffer = Vec::with_capacity((len - offset) as usize);
    file.read_to_end(&mut buffer)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    // Consume only through the last newline; anything after it is an incomplete
    // trailing line still being written by the agent.
    let Some(end) = buffer.iter().rposition(|&byte| byte == b'\n') else {
        // No complete line yet in this delta, leave the offset untouched.
        return Ok((String::new(), offset));
    };
    let consumed = &buffer[..=end];
    let new_offset = offset + consumed.len() as u64;
    Ok((String::from_utf8_lossy(consumed).into_owned(), new_offset))
}

/// Parse a delta's worth of JSONL text into events + file touches + line stats.
/// Reuses the same per-line helpers as `parse_jsonl` (so turn classification
/// matches the full-read import path exactly) but skips the session-level
/// concerns (title / cwd / summary / token totals) a tail does not need. Patch
/// correlation is best-effort within the delta: a `tool_use` whose result lands
/// in a later poll keeps the honest `0 / 0` line counts until then.
fn parse_jsonl_delta(
    text: &str,
) -> (Vec<ClaudeCodeMessage>, Vec<ClaudeFileTouch>, ClaudeDeltaStats) {
    parse_jsonl_lines(text, |index| format!("line-{index}"))
}

/// The line parser behind both the delta and the window reader. `fallback_id`
/// names a record that carries no `uuid` / `id`, from its line index in `text`.
fn parse_jsonl_lines(
    text: &str,
    fallback_id: impl Fn(usize) -> String,
) -> (Vec<ClaudeCodeMessage>, Vec<ClaudeFileTouch>, ClaudeDeltaStats) {
    let mut messages: Vec<ClaudeCodeMessage> = Vec::new();
    let mut file_touches: Vec<ClaudeFileTouch> = Vec::new();
    let mut touch_ids: Vec<Option<String>> = Vec::new();
    let mut patches: std::collections::HashMap<String, (u32, u32, String)> =
        std::collections::HashMap::new();
    let mut stats = ClaudeDeltaStats::default();
    for (index, line) in text.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        stats.raw_lines += 1;
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            stats.unparseable += 1;
            continue;
        };
        collect_file_touches(&value, &mut file_touches, &mut touch_ids);
        if let Some((id, counts)) = tool_result_patch(&value) {
            patches.insert(id, counts);
        }
        let role = detect_role(&value);
        if role != "human" && role != "assistant" {
            stats.skipped += 1;
            continue;
        }
        let content = extract_content(&value);
        if content.trim().is_empty() {
            stats.skipped += 1;
            continue;
        }
        let id = value
            .get("uuid")
            .or_else(|| value.get("id"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| fallback_id(index));
        let created_at = extract_timestamp(&value).unwrap_or_default();
        let subkind = classify_subkind(&role, &content);
        let stop_reason = extract_stop_reason(&value);
        messages.push(ClaudeCodeMessage {
            id,
            role,
            content,
            created_at,
            subkind,
            stop_reason,
        });
        stats.parsed += 1;
    }
    for (index, id) in touch_ids.iter().enumerate() {
        if let Some(id) = id {
            if let Some((additions, deletions, preview)) = patches.get(id) {
                file_touches[index].additions = *additions;
                file_touches[index].deletions = *deletions;
                file_touches[index].diff_preview = preview.clone();
            }
        }
    }
    (messages, file_touches, stats)
}

#[derive(Default)]
struct SessionPreview {
    message_count: usize,
    /// Whether the whole file fit inside the preview budget.
    complete: bool,
    /// The first slash command, for a session that holds nothing else.
    command_name: String,
    first_user_text: String,
    assistant_count: usize,
    entrypoint: String,
    summary: String,
    ai_title: String,
    generic_title: String,
    first_timestamp: String,
    /// The last timestamp inside the budget; the file's last one only when
    /// `complete`.
    last_timestamp: String,
    cwd: String,
    token_usage: ClaudeTokenUsage,
}

/// How much of a session's end `tail_last_timestamp` reads. Large enough to
/// hold several records even when one carries a long tool result.
const TAIL_BUDGET: u64 = 256 * 1024;

/// The last timestamp in the final `TAIL_BUDGET` bytes of a session, for a file
/// too long for the preview to reach its end. `None` when the tail holds no
/// complete timestamped record, so the caller falls back to the file time.
fn tail_last_timestamp(path: &Path) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut file = std::fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let start = len.saturating_sub(TAIL_BUDGET);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    let mut lines = text.lines();
    if start > 0 {
        // The first line is cut at an arbitrary byte, so it is not a record.
        lines.next();
    }
    lines
        .rev()
        .filter_map(|line| serde_json::from_str::<Value>(line.trim()).ok())
        .find_map(|value| extract_timestamp(&value))
}

fn preview_session(path: &Path) -> Option<SessionPreview> {
    use std::io::{BufRead, BufReader};
    // Only the file's head is needed for the summary / title / first timestamp,
    // so a multi-hundred-MB session is never read whole here. Counts past this
    // budget are approximate, which is fine for a list preview.
    const PREVIEW_BUDGET: usize = 1_000_000;
    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut preview = SessionPreview { complete: true, ..SessionPreview::default() };
    let mut tokens = TokenAccumulator::default();
    let mut bytes_read = 0usize;
    for line_result in reader.lines() {
        let Ok(line) = line_result else {
            break;
        };
        bytes_read += line.len() + 1;
        if bytes_read > PREVIEW_BUDGET {
            preview.complete = false;
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        tokens.observe(&value);
        if preview.ai_title.is_empty() {
            if let Some(ai_title) = extract_ai_title(&value) {
                preview.ai_title = ai_title;
            }
        }
        if preview.summary.is_empty() {
            if let Some(summary) = extract_summary(&value) {
                preview.summary = summary;
            }
        }
        if preview.generic_title.is_empty() {
            if let Some(title) = detect_generic_title(&value) {
                preview.generic_title = title;
            }
        }
        let role = detect_role(&value);
        if role == "human" && preview.first_user_text.is_empty() && !is_meta_record(&value) {
            // Skip tool-result envelopes and agent boilerplate so the title is
            // the first real human prompt, not "↳ 도구 결과 …" or a continuation
            // notice.
            let content = extract_content(&value);
            if is_titleable_user_text(&content) {
                preview.first_user_text = content;
            } else if preview.command_name.is_empty() {
                if let Some(command) = crate::agent_text::slash_command_name(&content) {
                    preview.command_name = command;
                }
            }
        }
        if let Some(ts) = extract_timestamp(&value) {
            if preview.first_timestamp.is_empty() {
                preview.first_timestamp = ts.clone();
            }
            preview.last_timestamp = ts;
        }
        if preview.cwd.is_empty() {
            if let Some(cwd) = extract_cwd(&value) {
                preview.cwd = cwd;
            }
        }
        if role == "human" || role == "assistant" {
            preview.message_count += 1;
        }
        if role == "assistant" {
            preview.assistant_count += 1;
        }
        if preview.entrypoint.is_empty() {
            if let Some(entrypoint) = value.get("entrypoint").and_then(Value::as_str) {
                preview.entrypoint = entrypoint.to_string();
            }
        }
    }
    preview.token_usage = tokens.usage;
    Some(preview)
}

/// What a transcript holds, from its preview. Emptiness is claimed only for a
/// file the preview read to the end: a cut or failed read is `unknown`, because
/// a long session whose head shows nothing may hold its work further on.
fn activity_class(preview: Option<&SessionPreview>) -> &'static str {
    let Some(preview) = preview else {
        return "unknown";
    };
    if !preview.first_user_text.is_empty() || preview.assistant_count > 0 {
        return "conversation";
    }
    if !preview.complete {
        return "unknown";
    }
    if !preview.command_name.is_empty() {
        "command-only"
    } else {
        "empty"
    }
}

struct ParsedSession {
    messages: Vec<ClaudeCodeMessage>,
    title: String,
    /// The first slash command, for a session that holds nothing else.
    command_name: String,
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
    let mut command_name = String::new();
    let mut summary = String::new();
    let mut ai_title = String::new();
    let mut generic_title = String::new();
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
        if ai_title.is_empty() {
            if let Some(found) = extract_ai_title(&value) {
                ai_title = found;
            }
        }
        if summary.is_empty() {
            if let Some(found) = extract_summary(&value) {
                summary = found;
            }
        }
        if generic_title.is_empty() {
            if let Some(found) = detect_generic_title(&value) {
                generic_title = found;
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
        if role == "human" && title.is_empty() && !is_meta_record(&value) {
            if is_titleable_user_text(&content) {
                title = content.clone();
            } else if command_name.is_empty() {
                if let Some(command) = crate::agent_text::slash_command_name(&content) {
                    command_name = command;
                }
            }
        }
        let id = value
            .get("uuid")
            .or_else(|| value.get("id"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("line-{index}"));
        let created_at = extract_timestamp(&value).unwrap_or_default();
        let subkind = classify_subkind(&role, &content);
        let stop_reason = extract_stop_reason(&value);
        messages.push(ClaudeCodeMessage {
            id,
            role,
            content,
            created_at,
            subkind,
            stop_reason,
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
        // Prefer Claude's own generated title, then the conversation summary,
        // then a format-tolerant title match, then the first user message (a
        // session that was never titled).
        title: if !ai_title.trim().is_empty() {
            ai_title
        } else if !summary.trim().is_empty() {
            summary
        } else if !generic_title.trim().is_empty() {
            generic_title
        } else {
            title
        },
        command_name,
        cwd,
        token_usage: tokens.usage,
        file_touches,
    }
}

/// Claude Code marks some harness-written user records `"isMeta": true`.
fn is_meta_record(value: &Value) -> bool {
    value.get("isMeta").and_then(Value::as_bool) == Some(true)
}

/// The title of a session with no request to title it by: the slash command it
/// ran when there is one (`Claude Code · /model`), else the project. Honest
/// about what the session holds rather than inventing a summary.
fn untitled_fallback(command_name: &str, project_label: &str) -> String {
    if command_name.trim().is_empty() {
        format!("Claude Code · {project_label}")
    } else {
        format!("Claude Code · {}", command_name.trim())
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

/// Whether a human message reads as a real prompt worth using as the session
/// title — not a tool-result envelope or agent-injected boilerplate (the
/// post-compaction "continued from a previous conversation" notice, a
/// `<system-reminder>`, or a slash-command echo). Mirrors the TypeScript
/// `sanitizeTitle` rules so the picker title matches the imported title and a
/// session never reads as "↳ 도구 결과 …" or the continuation boilerplate.
fn is_titleable_user_text(content: &str) -> bool {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return false;
    }
    if classify_subkind("human", content) == "tool_result" {
        return false;
    }
    let lower = trimmed.to_lowercase();
    // Harness-injected user-role text (`<command-name>`, `<local-command-caveat>`,
    // `<system-reminder>`, ...) opens with a tag; see `agent_text`.
    if crate::agent_text::is_harness_envelope(trimmed) {
        return false;
    }
    const BOILERPLATE_PREFIXES: [&str; 2] = [
        "this session is being continued from a previous conversation",
        "caveat: the messages below were generated by the user while running",
    ];
    if BOILERPLATE_PREFIXES
        .iter()
        .any(|prefix| lower.starts_with(prefix))
    {
        return false;
    }
    // A shell prompt / command paste ("PS C:\Users\…>", "$ npm run …",
    // "C:\dev> …") is machine text, not a session title.
    if lower.starts_with("ps ")
        || lower.starts_with("$ ")
        || lower.starts_with("> ")
        || is_windows_path_prompt(trimmed)
    {
        return false;
    }
    // A bare URL or a dropped file @mention ("@C:\Users\…") is not a title.
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return false;
    }
    if trimmed.starts_with('@') && (trimmed.contains('\\') || trimmed.contains('/')) {
        return false;
    }
    // The Claude Code startup banner and other ASCII art carry no letters up
    // front; a real prompt (Latin or Hangul) does.
    if !leading_has_letter(trimmed, 24) {
        return false;
    }
    true
}

/// Whether the text opens like a Windows shell prompt, e.g. `C:\Users\me> …`.
fn is_windows_path_prompt(text: &str) -> bool {
    let mut chars = text.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic())
        && matches!(chars.next(), Some(':'))
        && matches!(chars.next(), Some('\\'))
}

/// Whether any of the first `max` characters is a letter (Latin or, via
/// `is_alphabetic`, Hangul / CJK). Rejects symbol-only leads like ASCII banners.
fn leading_has_letter(text: &str, max: usize) -> bool {
    text.chars().take(max).any(|c| c.is_alphabetic())
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
            Some(text) => format!("🔧 {name}: {}", cap_text(text, 500)),
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
        // Keep a generous, newline-preserving slice so a live surface can show
        // what the tool actually produced, not just a one-line snippet.
        return Some(format!("{prefix}: {}", cap_text(&body, 1500)));
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

/// The assistant `message.stop_reason` for a line, or "" when absent (every
/// non-assistant line, and assistant chunks that carry no stop reason yet).
fn extract_stop_reason(value: &Value) -> String {
    value
        .get("message")
        .and_then(|message| message.get("stop_reason"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
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

/// Claude Code's own generated session title, written as an `ai-title` line
/// (`{"type":"ai-title","aiTitle":"…"}`), usually at the head of the file but
/// sometimes a few lines in. This is the clean, human-readable title Claude
/// shows in its resume list (e.g. "Fix calendar time mismatch"); we prefer it
/// over the conversation summary and the first user message. Sessions that
/// were never titled have no such line, so callers fall back.
fn extract_ai_title(value: &Value) -> Option<String> {
    if value.get("type").and_then(Value::as_str) != Some("ai-title") {
        return None;
    }
    value
        .get("aiTitle")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(str::to_string)
}

/// Format-tolerant title fallback. Rather than hard-coding the exact line type
/// and field name (which Claude has already changed once: summary → ai-title),
/// this recognises a title by *role*: a head line that is not a conversation
/// turn or tool step, carrying a title-ish field whose value reads like a real
/// title. So a future rename (a new `sessionTitle` field, a `title` line type)
/// still yields a title without a code change — the exact matchers above are
/// the fast path, this is the safety net before we fall back to the first user
/// message. Deliberately conservative: it never turns a tool line or a setting
/// value like "auto" into a title.
fn detect_generic_title(value: &Value) -> Option<String> {
    let type_field = value.get("type").and_then(Value::as_str).unwrap_or("");
    // Conversation turns, tool steps, and event envelopes are never titles.
    if matches!(
        type_field,
        "user"
            | "human"
            | "assistant"
            | "response_item"
            | "event_msg"
            | "tool_use"
            | "tool_result"
            | "queue-operation"
    ) {
        return None;
    }
    for key in [
        "aiTitle",
        "title",
        "sessionTitle",
        "threadTitle",
        "thread_name",
        "summary",
        "subject",
    ] {
        if let Some(candidate) = value.get(key).and_then(Value::as_str) {
            let trimmed = candidate.trim();
            if looks_like_title(trimmed) {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

/// Whether a string reads like a human session title rather than a placeholder,
/// a setting value ("auto"), a tool / command name, or a filesystem path.
fn looks_like_title(s: &str) -> bool {
    let len = s.chars().count();
    if len == 0 || len > 120 {
        return false;
    }
    match s.to_ascii_lowercase().as_str() {
        "auto" | "none" | "null" | "default" | "untitled" | "new session" => return false,
        _ => {}
    }
    // A path or a command line, not a title.
    if s.contains('/') || s.contains('\\') {
        return false;
    }
    // Must carry at least one letter (reject pure ids / numbers / symbols).
    s.chars().any(char::is_alphabetic)
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

/// Like `truncate` but preserves line breaks, so a tool's multi-line output
/// reads as it was produced instead of collapsing to one line. Trailing `\r`
/// from Windows tools is dropped; the `\n` structure is kept.
fn cap_text(input: &str, max: usize) -> String {
    let clean = input.replace('\r', "");
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
    fn prefers_the_ai_title_over_summary_and_first_message() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-Users-alice-mori");
        // Claude's own generated title arrives a few lines in (after queue /
        // user lines), exactly as real sessions write it. It wins over both the
        // summary line and the first user message.
        write_session(
            &project,
            "session-ai.jsonl",
            "{\"type\":\"queue-operation\",\"op\":\"x\"}\n\
             {\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"What's the plan?\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"ai-title\",\"aiTitle\":\"Fix calendar time mismatch\",\"sessionId\":\"session-ai\"}\n\
             {\"type\":\"summary\",\"summary\":\"Refactor the auth middleware\",\"leafUuid\":\"x\"}\n\
             {\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Hi back.\"}]},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n",
        );
        let listing = list_sessions_at(temp.path()).unwrap();
        let row = listing.iter().find(|r| r.session_id == "session-ai").unwrap();
        assert_eq!(row.title, "Fix calendar time mismatch");
        // Neither the ai-title nor the summary line counts as a conversation message.
        assert_eq!(row.message_count, 2);

        let path = project.join("session-ai.jsonl");
        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        assert_eq!(detail.title, "Fix calendar time mismatch");
        assert_eq!(detail.messages.len(), 2);
    }

    #[test]
    fn is_titleable_rejects_banners_prompts_paths_and_urls() {
        // Real garbage-title patterns seen in desktop sessions.
        assert!(!is_titleable_user_text(".   ____          _            __ _ _")); // ASCII banner
        assert!(!is_titleable_user_text("PS C:\\Users\\Admin> ssh bogyu@host"));
        assert!(!is_titleable_user_text("C:\\dev\\mori> npm run build"));
        assert!(!is_titleable_user_text("@C:\\Users\\Admin\\Downloads\\notes.txt"));
        assert!(!is_titleable_user_text("http://bi-eis-dev.100.88.168.115/ni"));
        assert!(!is_titleable_user_text("↳ 도구 결과: ok"));
        assert!(!is_titleable_user_text("This session is being continued from a previous conversation"));
        // Real prompts survive.
        assert!(is_titleable_user_text("RAG 파이프라인 고쳐줘"));
        assert!(is_titleable_user_text("Fix the calendar time mismatch"));
        assert!(is_titleable_user_text("결제 모듈 리팩터링 방향 결정해줘"));
    }

    #[test]
    fn tolerant_title_survives_a_future_field_rename() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-Users-alice-mori");
        // A hypothetical future format with neither an ai-title nor a summary
        // line, but a metadata line carrying a renamed title field. The tolerant
        // detector still recovers the title without a code change.
        write_session(
            &project,
            "session-future.jsonl",
            "{\"type\":\"session-title\",\"sessionTitle\":\"Design the ingestion layer\"}\n\
             {\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"first request text here\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n",
        );
        let listing = list_sessions_at(temp.path()).unwrap();
        let row = listing.iter().find(|r| r.session_id == "session-future").unwrap();
        assert_eq!(row.title, "Design the ingestion layer");
    }

    #[test]
    fn looks_like_title_rejects_placeholders_and_paths() {
        assert!(looks_like_title("Design the feed system"));
        assert!(looks_like_title("GitHub에서 GitLab으로 마이그레이션"));
        assert!(!looks_like_title("auto"));
        assert!(!looks_like_title(""));
        assert!(!looks_like_title("C:/dev/mori"));
        assert!(!looks_like_title("/usr/bin/exec"));
        assert!(!looks_like_title(&"x".repeat(200)));
    }

    #[test]
    fn title_skips_boilerplate_and_tool_results_for_the_first_real_prompt() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-Users-alice-mori");
        let path = write_session(
            &project,
            "session-noise.jsonl",
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"This session is being continued from a previous conversation that ran out of context.\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"↳ 도구 결과: ok\"},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n\
             {\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"RAG 파이프라인 고쳐줘\"},\"timestamp\":\"2026-01-01T00:00:02Z\"}\n",
        );
        let listing = list_sessions_at(temp.path()).unwrap();
        let row = listing.iter().find(|r| r.session_id == "session-noise").unwrap();
        // Neither the continuation boilerplate nor the tool-result row becomes
        // the title; the first real prompt does.
        assert_eq!(row.title, "RAG 파이프라인 고쳐줘");

        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        assert_eq!(detail.title, "RAG 파이프라인 고쳐줘");
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

    fn user_line(text: &str, at: &str) -> String {
        format!(
            "{{\"type\":\"user\",\"cwd\":\"/home/u/dev/mori\",\"message\":{{\"role\":\"user\",\"content\":\"{text}\"}},\"timestamp\":\"{at}\"}}\n"
        )
    }

    #[test]
    fn list_reports_a_complete_message_count_for_a_small_session() {
        let temp = TempDir::new().unwrap();
        let body = format!("{}{}", user_line("first", "2026-10-07T13:48:42Z"), user_line("second", "2026-10-07T14:00:00Z"));
        write_session(&temp.path().join("-home-u-dev-mori"), "small.jsonl", &body);
        let listing = list_sessions_at(temp.path()).unwrap();
        assert_eq!(listing[0].message_count, 2);
        assert!(listing[0].message_count_complete);
        // The file time is explicit UTC, so JavaScript cannot read it as local.
        assert!(listing[0].modified_at.ends_with('Z'));
    }

    #[test]
    fn list_marks_the_count_partial_when_the_preview_budget_cuts_a_long_session() {
        // A session that grew for hours: far more than the 1 MB preview reads.
        let temp = TempDir::new().unwrap();
        let filler = "x".repeat(1_000);
        let mut body = String::new();
        for minute in 0..1_500 {
            body.push_str(&user_line(&format!("step {minute} {filler}"), &format!("2026-10-07T{:02}:{:02}:00Z", 13 + minute / 60 % 10, minute % 60)));
        }
        write_session(&temp.path().join("-home-u-dev-mori"), "long.jsonl", &body);
        let listing = list_sessions_at(temp.path()).unwrap();
        assert!(listing[0].file_bytes > 1_000_000);
        assert!(!listing[0].message_count_complete);
        assert!(listing[0].message_count < 1_500);
        // The end is read from the tail, so growth past the budget is still seen.
        assert_eq!(listing[0].last_activity_at, "2026-10-07T17:59:00Z");
    }

    fn classify(dir: &TempDir, project: &str, name: &str, body: &str) -> ClaudeCodeSessionMeta {
        write_session(&dir.path().join(project), name, body);
        list_sessions_at(dir.path())
            .unwrap()
            .into_iter()
            .find(|meta| meta.session_id == name.trim_end_matches(".jsonl"))
            .unwrap()
    }

    #[test]
    fn classifies_what_a_transcript_holds_only_from_a_complete_read() {
        let temp = TempDir::new().unwrap();
        // Agent bookkeeping only, no user or assistant record: a real NUC shape.
        let empty = classify(&temp, "-home-u-dev-home", "empty.jsonl", "{\"type\":\"mode\"}\n{\"type\":\"permission-mode\"}\n{\"type\":\"system\",\"timestamp\":\"2026-09-30T04:16:36Z\"}\n");
        assert_eq!(empty.activity_class, "empty");
        let command = format!(
            "{}{}",
            raw_user_line("<local-command-caveat>Caveat</local-command-caveat>", true, "2026-09-30T04:21:48Z"),
            raw_user_line("<command-name>/model</command-name>\n<command-args></command-args>", false, "2026-09-30T04:21:49Z"),
        );
        assert_eq!(classify(&temp, "-home-u-dev-home", "command.jsonl", &command).activity_class, "command-only");
        let talk = user_line("fix the importer", "2026-10-07T13:48:42Z");
        let conversation = classify(&temp, "-home-u-dev-mori", "talk.jsonl", &talk);
        assert_eq!(conversation.activity_class, "conversation");
        assert!(conversation.evidence.as_ref().unwrap().complete);
        // A long file whose first megabyte holds no message is not proven empty.
        let mut long = String::new();
        let filler = "y".repeat(2_000);
        for _ in 0..600 {
            long.push_str(&format!("{{\"type\":\"system\",\"content\":\"{filler}\"}}\n"));
        }
        long.push_str(&user_line("late request", "2026-10-07T20:00:00Z"));
        assert_eq!(classify(&temp, "-home-u-dev-mori", "long.jsonl", &long).activity_class, "unknown");
    }

    #[test]
    fn records_the_entrypoint_that_marks_a_scripted_run() {
        let temp = TempDir::new().unwrap();
        let body = "{\"type\":\"user\",\"entrypoint\":\"sdk-cli\",\"cwd\":\"/home/u/dev/mori\",\"message\":{\"role\":\"user\",\"content\":\"read only\"},\"timestamp\":\"2026-10-08T05:44:11Z\"}\n";
        assert_eq!(classify(&temp, "-home-u-dev-mori", "sdk.jsonl", body).entrypoint, "sdk-cli");
    }

    #[test]
    fn list_takes_activity_from_the_last_record_not_bookkeeping_appends() {
        // Claude Code appends untimestamped records to an old session, which
        // moves the file time days after the conversation ended.
        let temp = TempDir::new().unwrap();
        let body = format!(
            "{}{}{{\"type\":\"last-prompt\",\"sessionId\":\"s\"}}\n{{\"type\":\"cost-state\"}}\n",
            user_line("first", "2026-09-30T04:21:48.615Z"),
            user_line("second", "2026-09-30T04:22:06Z"),
        );
        write_session(&temp.path().join("-home-u-dev-home"), "old.jsonl", &body);
        let listing = list_sessions_at(temp.path()).unwrap();
        assert_eq!(listing[0].last_activity_at, "2026-09-30T04:22:06Z");
    }

    #[test]
    fn tail_read_finds_no_activity_in_a_session_without_timestamps() {
        let temp = TempDir::new().unwrap();
        let dir = temp.path().join("-home-u-dev-home");
        write_session(&dir, "stub.jsonl", "{\"type\":\"ai-title\",\"aiTitle\":\"t\"}\n");
        assert_eq!(tail_last_timestamp(&dir.join("stub.jsonl")), None);
    }

    fn raw_user_line(content: &str, meta: bool, at: &str) -> String {
        let meta_field = if meta { "\"isMeta\":true," } else { "" };
        format!(
            "{{\"type\":\"user\",{meta_field}\"cwd\":\"/home/u/dev/home\",\"message\":{{\"role\":\"user\",\"content\":{}}},\"timestamp\":\"{at}\"}}\n",
            serde_json::to_string(content).unwrap()
        )
    }

    #[test]
    fn titles_by_the_request_after_slash_command_records() {
        // The shape of the NUC's real slash-command transcripts: a meta caveat,
        // the command record, its stdout, and only then the request.
        let temp = TempDir::new().unwrap();
        let dir = temp.path().join("-home-u-dev-home");
        let body = [
            raw_user_line("<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>", true, "2026-09-30T04:21:48Z"),
            raw_user_line("<command-name>/model</command-name>\n<command-message>model</command-message>", false, "2026-09-30T04:21:49Z"),
            raw_user_line("<local-command-stdout>Set model to opus</local-command-stdout>", false, "2026-09-30T04:21:50Z"),
            raw_user_line("홈 서버 백업 스크립트 점검", false, "2026-09-30T04:22:00Z"),
        ]
        .concat();
        let path = write_session(&dir, "command-then-request.jsonl", &body);

        let listing = list_sessions_at(temp.path()).unwrap();
        assert_eq!(listing[0].title, "홈 서버 백업 스크립트 점검");
        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        assert_eq!(detail.title, listing[0].title);
    }

    #[test]
    fn titles_a_command_only_session_by_its_command_not_its_path() {
        let temp = TempDir::new().unwrap();
        let dir = temp.path().join("-home-u-dev-home");
        let body = [
            raw_user_line("<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>", true, "2026-09-30T04:21:48Z"),
            raw_user_line("<command-name>/model</command-name>\n<command-message>model</command-message>", false, "2026-09-30T04:21:49Z"),
            raw_user_line("<local-command-stdout>Set model to opus</local-command-stdout>", false, "2026-09-30T04:21:50Z"),
        ]
        .concat();
        let path = write_session(&dir, "command-only.jsonl", &body);

        let listing = list_sessions_at(temp.path()).unwrap();
        assert_eq!(listing[0].title, "Claude Code · /model");
        let detail = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        assert_eq!(detail.title, "Claude Code · /model");
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

    // ─── delta read ─────────────────────────────────────────────────────────

    fn append(path: &Path, body: &str) {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new().append(true).open(path).unwrap();
        file.write_all(body.as_bytes()).unwrap();
    }

    #[test]
    fn delta_reads_only_lines_gained_since_the_offset() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori-delta");
        let path = write_session(
            &project,
            "session-delta.jsonl",
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"first\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"reply\"}]},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n",
        );

        // First read from the start sees both lines and reports EOF as the resume point.
        let first = read_session_delta_at(temp.path(), path.to_string_lossy().as_ref(), 0).unwrap();
        assert_eq!(first.events.len(), 2);
        assert_eq!(first.events[0].content, "first");
        let file_len = std::fs::metadata(&path).unwrap().len();
        assert_eq!(first.new_offset, file_len);

        // Nothing new yet: reading again from the same offset is empty.
        let caught_up =
            read_session_delta_at(temp.path(), path.to_string_lossy().as_ref(), first.new_offset)
                .unwrap();
        assert!(caught_up.events.is_empty());
        assert_eq!(caught_up.new_offset, first.new_offset);

        // Append a third line; the delta returns only that line.
        append(
            &path,
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"third\"},\"timestamp\":\"2026-01-01T00:00:02Z\"}\n",
        );
        let next =
            read_session_delta_at(temp.path(), path.to_string_lossy().as_ref(), first.new_offset)
                .unwrap();
        assert_eq!(next.events.len(), 1);
        assert_eq!(next.events[0].content, "third");
        assert_eq!(next.new_offset, std::fs::metadata(&path).unwrap().len());
    }

    #[test]
    fn delta_leaves_an_incomplete_trailing_line_unconsumed() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori-partial");
        // A complete Korean line, then a partial line with no trailing newline —
        // exactly what a mid-write poll sees. The partial line also carries a
        // multi-byte char, so this guards the UTF-8 boundary too.
        let path = write_session(
            &project,
            "session-partial.jsonl",
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"한국어 요청\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"다음 줄",
        );

        let first = read_session_delta_at(temp.path(), path.to_string_lossy().as_ref(), 0).unwrap();
        // Only the complete line becomes an event; the offset stops before the
        // partial line, not at EOF.
        assert_eq!(first.events.len(), 1);
        assert_eq!(first.events[0].content, "한국어 요청");
        let file_len = std::fs::metadata(&path).unwrap().len();
        assert!(first.new_offset < file_len, "offset stopped before the partial tail");

        // The writer finishes the line. Reading from the saved offset now yields
        // the completed line and no duplicate of the first.
        append(&path, "\"}]},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n");
        let next =
            read_session_delta_at(temp.path(), path.to_string_lossy().as_ref(), first.new_offset)
                .unwrap();
        assert_eq!(next.events.len(), 1);
        assert!(next.events[0].content.contains("다음 줄"), "got: {}", next.events[0].content);
        assert_eq!(next.new_offset, std::fs::metadata(&path).unwrap().len());
    }

    #[test]
    fn delta_offset_at_or_past_eof_returns_empty() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori-eof");
        let path = write_session(
            &project,
            "session-eof.jsonl",
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"only\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n",
        );
        let len = std::fs::metadata(&path).unwrap().len();

        let at_eof = read_session_delta_at(temp.path(), path.to_string_lossy().as_ref(), len).unwrap();
        assert!(at_eof.events.is_empty());
        assert_eq!(at_eof.new_offset, len);

        // An offset past EOF (a truncated / rotated file) is not an error; it
        // reports nothing new and leaves the offset where it was.
        let past = read_session_delta_at(temp.path(), path.to_string_lossy().as_ref(), len + 999).unwrap();
        assert!(past.events.is_empty());
        assert_eq!(past.new_offset, len + 999);
    }

    #[test]
    fn delta_stats_account_for_every_raw_line() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori-stats");
        // One real user message (parsed), one summary line (valid JSON, non-event
        // -> skipped), one broken line (unparseable), one thinking-only assistant
        // (valid JSON, renders to empty content -> skipped).
        let path = write_session(
            &project,
            "session-stats.jsonl",
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"go\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"summary\",\"summary\":\"A title\",\"leafUuid\":\"x\"}\n\
             {not valid json\n\
             {\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"thinking\",\"thinking\":\"internal\"}]},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n",
        );

        let delta = read_session_delta_at(temp.path(), path.to_string_lossy().as_ref(), 0).unwrap();
        assert_eq!(delta.stats.raw_lines, 4);
        assert_eq!(delta.stats.parsed, 1);
        assert_eq!(delta.stats.skipped, 2);
        assert_eq!(delta.stats.unparseable, 1);
        // The invariant the fidelity panel relies on.
        assert_eq!(
            delta.stats.raw_lines,
            delta.stats.parsed + delta.stats.skipped + delta.stats.unparseable
        );
        assert_eq!(delta.events.len(), 1);
    }

    #[test]
    fn delta_turn_classification_matches_the_full_read_path() {
        // The spec's first expected bug: the delta path and the import (full
        // read) path disagreeing on how a line classifies. Same body through
        // both must yield the same events (id / role / subkind / content).
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori-parity");
        let body = "{\"type\":\"user\",\"uuid\":\"u1\",\"message\":{\"role\":\"user\",\"content\":\"RAG 고쳐줘\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"assistant\",\"uuid\":\"a1\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"name\":\"Bash\",\"input\":{\"command\":\"ls\"}}]},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n\
             {\"type\":\"user\",\"uuid\":\"u2\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"tool_result\",\"tool_use_id\":\"t\",\"content\":\"ok\"}]},\"timestamp\":\"2026-01-01T00:00:02Z\"}\n";
        let path = write_session(&project, "session-parity.jsonl", body);

        let full = read_session_at(temp.path(), path.to_string_lossy().as_ref()).unwrap();
        let delta = read_session_delta_at(temp.path(), path.to_string_lossy().as_ref(), 0).unwrap();

        assert_eq!(delta.events.len(), full.messages.len());
        for (d, f) in delta.events.iter().zip(full.messages.iter()) {
            assert_eq!(d.id, f.id, "id drift");
            assert_eq!(d.role, f.role, "role drift");
            assert_eq!(d.subkind, f.subkind, "subkind drift");
            assert_eq!(d.content, f.content, "content drift");
        }
    }

    #[test]
    fn delta_rejects_paths_outside_root_and_non_jsonl() {
        let temp = TempDir::new().unwrap();
        let outside = temp.path().join("escape.jsonl");
        std::fs::write(&outside, "{}\n").unwrap();
        let root = temp.path().join("scope");
        std::fs::create_dir_all(&root).unwrap();
        let err = read_session_delta_at(&root, outside.to_string_lossy().as_ref(), 0).unwrap_err();
        assert!(err.contains("outside"), "error: {err}");

        let not_jsonl = temp.path().join("notes.txt");
        std::fs::write(&not_jsonl, "hi").unwrap();
        let err = read_session_delta_at(temp.path(), not_jsonl.to_string_lossy().as_ref(), 0).unwrap_err();
        assert!(err.contains("JSONL"), "error: {err}");
    }

    #[test]
    fn delta_correlates_a_patch_within_the_same_read() {
        let temp = TempDir::new().unwrap();
        let project = temp.path().join("-tmp-mori-delta-patch");
        let path = write_session(
            &project,
            "session-delta-patch.jsonl",
            "{\"type\":\"assistant\",\"uuid\":\"a1\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"tu_1\",\"name\":\"Edit\",\"input\":{\"file_path\":\"/repo/a.ts\"}}]},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n\
             {\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"tool_result\",\"tool_use_id\":\"tu_1\"}]},\"toolUseResult\":{\"structuredPatch\":[{\"lines\":[\"-old\",\"+new\"]}]},\"timestamp\":\"2026-01-01T00:00:01Z\"}\n",
        );

        let delta = read_session_delta_at(temp.path(), path.to_string_lossy().as_ref(), 0).unwrap();
        let touch = delta
            .file_touches
            .iter()
            .find(|t| t.path == "/repo/a.ts")
            .expect("touch recorded");
        assert_eq!(touch.additions, 1);
        assert_eq!(touch.deletions, 1);
    }
}

// ─── bounded history windows ────────────────────────────────────────────────

/// Bytes one window may read. The cost of opening a session depends on this,
/// never on the transcript's total size.
pub const WINDOW_BYTES: u64 = 1024 * 1024;
/// How far back a single record's start is searched for, in bytes, when one
/// record is larger than a window. Searched in small chunks, never allocated.
const RECORD_START_SCAN_LIMIT: u64 = 256 * 1024 * 1024;
const SOURCE_ID_PROBE: usize = 4096;
/// Bytes of the record at a cursor that are fingerprinted, so a cursor names a
/// record and not only a byte position.
const ANCHOR_PROBE: u64 = 64;

/// One window of a session's history: the complete records between
/// `start_offset` and `end_offset`, oldest first. It is a view of part of the
/// transcript, never the whole session: counts here are the window's own.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeSessionWindow {
    pub file_path: String,
    /// Identifies the transcript's content (its first bytes). A later page
    /// passes it back; a different value means the file was replaced.
    pub source_id: String,
    pub file_bytes: u64,
    /// Where this window starts; pass it as `before_offset` for earlier history.
    pub start_offset: u64,
    /// Fingerprint of the record at `start_offset`; pass it back with the
    /// cursor so a rewritten transcript is refused, not read at a stale offset.
    pub start_anchor: String,
    /// Fingerprint of the last record before `end_offset` ("" for an empty
    /// window). A cursor at `end_offset` carrying it reads this same window
    /// again later: the record before a cursor never changes as the
    /// transcript grows, so a window the view let go of can be restored.
    pub end_anchor: String,
    pub end_offset: u64,
    /// True when the window begins at the start of the transcript.
    pub reached_start: bool,
    pub events: Vec<ClaudeCodeMessage>,
    pub file_touches: Vec<ClaudeFileTouch>,
    pub stats: ClaudeDeltaStats,
    /// Records skipped because one alone was larger than a window. Their bytes
    /// are counted, never silently dropped.
    pub omitted_records: usize,
    pub omitted_bytes: u64,
}

fn resolve_session_path(root: &Path, session_path: &str) -> Result<PathBuf, String> {
    let requested = PathBuf::from(session_path);
    let canonical_root = fs::canonicalize(root)
        .map_err(|error| format!("Failed to resolve {}: {error}", root.display()))?;
    let canonical = fs::canonicalize(&requested)
        .map_err(|error| format!("SOURCE_MISSING: Failed to resolve {}: {error}", requested.display()))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("Refused: session path is outside the Claude Code projects directory.".to_string());
    }
    if !is_jsonl(&canonical) {
        return Err("Refused: file is not a Claude Code JSONL session.".to_string());
    }
    Ok(canonical)
}

fn source_id_of(file: &mut fs::File) -> Result<String, String> {
    use std::io::{Read, Seek, SeekFrom};
    file.seek(SeekFrom::Start(0)).map_err(|error| error.to_string())?;
    let mut head = vec![0u8; SOURCE_ID_PROBE];
    let mut filled = 0;
    while filled < SOURCE_ID_PROBE {
        let read = file.read(&mut head[filled..]).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        filled += read;
    }
    // Hash only up to the end of the first complete line: an append never
    // changes it, so a session still being written keeps its id while a
    // replaced or rewritten file gets a new one.
    let probe = head[..filled]
        .iter()
        .position(|&byte| byte == b'\n')
        .map(|newline| newline + 1)
        .unwrap_or(filled);
    Ok(fnv_hex(&head[..probe]))
}

fn fnv_hex(bytes: &[u8]) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

/// Fingerprint of the record that starts at `offset`: its bytes up to its line
/// break, at most `ANCHOR_PROBE` of them.
fn anchor_at(file: &mut fs::File, offset: u64, len: u64) -> Result<String, String> {
    let bytes = read_range(file, offset, (offset + ANCHOR_PROBE).min(len))?;
    let probe = bytes.iter().position(|&byte| byte == b'\n').map(|newline| newline + 1).unwrap_or(bytes.len());
    Ok(fnv_hex(&bytes[..probe]))
}

/// Fingerprint of the last record that ends at `end` (which sits on a line
/// boundary), searched no further back than `floor`; "" when there is none.
fn last_record_anchor(file: &mut fs::File, floor: u64, end: u64, len: u64) -> Result<String, String> {
    if end <= floor {
        return Ok(String::new());
    }
    let start = record_start_before(file, end - 1)?
        .ok_or_else(|| "RECORD_TOO_LARGE: a single record exceeds the scan limit.".to_string())?
        .max(floor);
    anchor_at(file, start, len)
}

fn read_range(file: &mut fs::File, start: u64, end: u64) -> Result<Vec<u8>, String> {
    use std::io::{Read, Seek, SeekFrom};
    file.seek(SeekFrom::Start(start)).map_err(|error| error.to_string())?;
    let mut buffer = vec![0u8; (end - start) as usize];
    file.read_exact(&mut buffer).map_err(|error| error.to_string())?;
    Ok(buffer)
}

/// Offset just after the last line break strictly before `before`, scanning
/// back in small chunks; 0 when the record runs to the start of the file.
/// `None` when no line break exists within the scan limit.
fn record_start_before(file: &mut fs::File, before: u64) -> Result<Option<u64>, String> {
    const CHUNK: u64 = 64 * 1024;
    let mut end = before;
    let floor = before.saturating_sub(RECORD_START_SCAN_LIMIT);
    while end > floor {
        let start = end.saturating_sub(CHUNK).max(floor);
        let chunk = read_range(file, start, end)?;
        if let Some(position) = chunk.iter().rposition(|&byte| byte == b'\n') {
            return Ok(Some(start + position as u64 + 1));
        }
        end = start;
    }
    Ok(if floor == 0 { Some(0) } else { None })
}

/// Read the complete records that end at or before `before` (the end of the
/// file when `None`), at most `window` bytes of them.
///
/// - The first call drops a trailing line still being written.
/// - A later call must pass a `before` that sits on a line boundary and the
///   `source_id` it was given; a cursor past the end, mid-line, or for a
///   replaced file is refused instead of read as something else.
/// - A record larger than a window is skipped and counted; the next cursor
///   moves before it, so history stays navigable.
pub(crate) fn read_session_window_at(
    root: &Path,
    session_path: &str,
    before: Option<u64>,
    source_id: Option<&str>,
    anchor: Option<&str>,
    window: u64,
) -> Result<ClaudeCodeSessionWindow, String> {
    read_session_window_with(root, session_path, before, source_id, anchor, None, window)
}

/// As [`read_session_window_at`], where a cursor may instead (or also) name
/// the record that ends at it (`end_anchor`), the fingerprint that restores a
/// window the view let go of.
pub(crate) fn read_session_window_with(
    root: &Path,
    session_path: &str,
    before: Option<u64>,
    source_id: Option<&str>,
    anchor: Option<&str>,
    end_anchor: Option<&str>,
    window: u64,
) -> Result<ClaudeCodeSessionWindow, String> {
    let canonical = resolve_session_path(root, session_path)?;
    let mut file = fs::File::open(&canonical)
        .map_err(|error| format!("SOURCE_UNREADABLE: Failed to open {}: {error}", canonical.display()))?;
    let len = file.metadata().map_err(|error| error.to_string())?.len();
    let id = source_id_of(&mut file)?;
    if before.is_some() && (source_id.is_none() || (anchor.is_none() && end_anchor.is_none())) {
        return Err("INVALID_CURSOR: an earlier page needs the source id and anchor it was given.".to_string());
    }
    if let Some(expected) = source_id {
        if expected != id {
            return Err("SOURCE_CHANGED: the transcript was replaced since it was opened.".to_string());
        }
    }

    // The window's end: a validated cursor, or the end of the last complete line.
    let mut end = match before {
        Some(cursor) => {
            if cursor > len {
                return Err("SOURCE_CHANGED: the transcript is shorter than the cursor.".to_string());
            }
            if cursor > 0 && read_range(&mut file, cursor - 1, cursor)?[0] != b'\n' {
                return Err("INVALID_CURSOR: the cursor is not at a record boundary.".to_string());
            }
            if let Some(expected) = anchor {
                if expected != anchor_at(&mut file, cursor, len)? {
                    return Err("SOURCE_CHANGED: the record at the cursor is not the one it named.".to_string());
                }
            }
            if let Some(expected) = end_anchor {
                if expected != last_record_anchor(&mut file, 0, cursor, len)? {
                    return Err("SOURCE_CHANGED: the record before the cursor is not the one it named.".to_string());
                }
            }
            cursor
        }
        None => len,
    };
    if before.is_none() && end > 0 && read_range(&mut file, end - 1, end)?[0] != b'\n' {
        // A trailing record still being written is not a record yet.
        end = record_start_before(&mut file, end)?.unwrap_or(0);
    }

    let mut omitted_records = 0usize;
    let mut omitted_bytes = 0u64;
    let window = window.max(1);
    let mut start = end.saturating_sub(window);
    let mut buffer = read_range(&mut file, start, end)?;
    if start > 0 {
        // The record that straddles the window's start is incomplete here, so
        // the window begins after its line break.
        match buffer.iter().position(|&byte| byte == b'\n') {
            Some(position) if start + (position as u64) + 1 < end => {
                buffer.drain(..=position);
                start += position as u64 + 1;
            }
            _ => {
                // One record fills the whole window: skip it, count it, and move
                // the cursor to its start so earlier history stays reachable.
                let last_break = end - 1;
                let record_start = record_start_before(&mut file, last_break)?
                    .ok_or_else(|| "RECORD_TOO_LARGE: a single record exceeds the scan limit.".to_string())?;
                omitted_records = 1;
                omitted_bytes = end - record_start;
                start = record_start;
                buffer.clear();
            }
        }
    }

    // A record without its own id is named by its byte offset, so the same line
    // keeps the same id in every window that contains it. Offsets come from the
    // raw bytes: decoding replaces invalid sequences and would shift them.
    let mut offsets = Vec::new();
    let mut cursor = start;
    for line in buffer.split(|&byte| byte == b'\n') {
        offsets.push(cursor);
        cursor += line.len() as u64 + 1;
    }
    let start_anchor = anchor_at(&mut file, start, len)?;
    let end_anchor = last_record_anchor(&mut file, start, end, len)?;
    let text = String::from_utf8_lossy(&buffer);
    let (events, file_touches, stats) = parse_jsonl_lines(&text, |index| {
        format!("offset-{}", offsets.get(index).copied().unwrap_or(start))
    });
    Ok(ClaudeCodeSessionWindow {
        file_path: canonical.to_string_lossy().to_string(),
        source_id: id,
        file_bytes: len,
        start_offset: start,
        start_anchor,
        end_anchor,
        end_offset: end,
        reached_start: start == 0,
        events,
        file_touches,
        stats,
        omitted_records,
        omitted_bytes,
    })
}

#[cfg(test)]
mod window_tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn user(index: usize, text: &str) -> String {
        format!(
            "{{\"type\":\"user\",\"uuid\":\"u{index}\",\"message\":{{\"role\":\"user\",\"content\":\"{text}\"}},\"timestamp\":\"2026-10-08T00:{:02}:{:02}Z\"}}\n",
            (index / 60) % 60,
            index % 60
        )
    }

    fn assistant_without_id(text: &str) -> String {
        format!("{{\"type\":\"assistant\",\"message\":{{\"role\":\"assistant\",\"content\":[{{\"type\":\"text\",\"text\":\"{text}\"}}]}}}}\n")
    }

    fn session(dir: &TempDir, body: &str) -> (PathBuf, String) {
        let project = dir.path().join("-home-u-dev-infra");
        fs::create_dir_all(&project).unwrap();
        let path = project.join("big.jsonl");
        fs::write(&path, body).unwrap();
        let text = path.to_string_lossy().to_string();
        (path, text)
    }

    /// Every window from the end back to the start, oldest window first.
    fn all_windows(root: &Path, path: &str, window: u64) -> Vec<ClaudeCodeSessionWindow> {
        let first = read_session_window_at(root, path, None, None, None, window).unwrap();
        let mut windows = vec![first];
        while !windows.last().unwrap().reached_start {
            let last = windows.last().unwrap();
            let next = read_session_window_at(root, path, Some(last.start_offset), Some(&last.source_id), Some(&last.start_anchor), window).unwrap();
            assert!(next.end_offset == last.start_offset, "windows tile the file");
            windows.push(next);
        }
        windows.reverse();
        windows
    }

    #[test]
    fn a_transcript_larger_than_the_detail_cap_opens_from_its_end_in_bounded_windows() {
        let dir = TempDir::new().unwrap();
        let filler = "작업 내용 ".repeat(40);
        let mut body = String::new();
        let mut count = 0;
        while (body.len() as u64) <= MAX_FILE_BYTES + 512 * 1024 {
            body.push_str(&user(count, &format!("step {count} {filler}")));
            count += 1;
        }
        let (_, path) = session(&dir, &body);
        // The detailed reader refuses it: the original defect.
        assert!(read_session_at(dir.path(), &path).unwrap_err().contains("too large"));

        let first = read_session_window_at(dir.path(), &path, None, None, None, WINDOW_BYTES).unwrap();
        assert!(first.end_offset - first.start_offset <= WINDOW_BYTES);
        assert!(!first.reached_start);
        assert_eq!(first.events.last().unwrap().id, format!("u{}", count - 1));
        assert!(first.events.last().unwrap().content.contains("작업 내용"));

        // Paging back reaches the start, in order, every record exactly once.
        let ids: Vec<String> = all_windows(dir.path(), &path, WINDOW_BYTES)
            .into_iter()
            .flat_map(|window| window.events.into_iter().map(|event| event.id))
            .collect();
        let expected: Vec<String> = (0..count).map(|index| format!("u{index}")).collect();
        assert_eq!(ids, expected);
    }

    #[test]
    fn records_without_ids_keep_the_same_id_in_every_window() {
        let dir = TempDir::new().unwrap();
        let body = [user(0, "a"), assistant_without_id("첫 답"), user(1, "b"), assistant_without_id("둘째 답")].concat();
        let (_, path) = session(&dir, &body);
        let whole = read_session_window_at(dir.path(), &path, None, None, None, 1 << 20).unwrap();
        let small: Vec<String> = all_windows(dir.path(), &path, 200)
            .into_iter()
            .flat_map(|window| window.events.into_iter().map(|event| event.id))
            .collect();
        let ids: Vec<String> = whole.events.iter().map(|event| event.id.clone()).collect();
        assert_eq!(small, ids);
        assert!(ids.iter().any(|id| id.starts_with("offset-")));
    }

    #[test]
    fn a_line_still_being_written_is_not_read() {
        let dir = TempDir::new().unwrap();
        let body = format!("{}{}", user(0, "done"), "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"half");
        let (_, path) = session(&dir, &body);
        let window = read_session_window_at(dir.path(), &path, None, None, None, WINDOW_BYTES).unwrap();
        assert_eq!(window.events.len(), 1);
        assert_eq!(window.end_offset as usize, user(0, "done").len());
    }

    #[test]
    fn a_record_larger_than_a_window_is_skipped_and_counted_and_history_continues() {
        let dir = TempDir::new().unwrap();
        let huge = user(1, &"x".repeat(3000));
        let body = [user(0, "before"), huge.clone(), user(2, "after")].concat();
        let (_, path) = session(&dir, &body);
        let windows = all_windows(dir.path(), &path, 1000);
        let omitted: usize = windows.iter().map(|window| window.omitted_records).sum();
        let bytes: u64 = windows.iter().map(|window| window.omitted_bytes).sum();
        let ids: Vec<String> = windows.into_iter().flat_map(|window| window.events.into_iter().map(|event| event.id)).collect();
        assert_eq!(ids, vec!["u0".to_string(), "u2".to_string()]);
        assert_eq!(omitted, 1);
        assert_eq!(bytes, huge.len() as u64);
    }

    #[test]
    fn a_bad_cursor_or_a_replaced_file_is_refused_not_misread() {
        let dir = TempDir::new().unwrap();
        let body = [user(0, "a"), user(1, "b"), user(2, "c")].concat();
        let (file, path) = session(&dir, &body);
        let first = read_session_window_at(dir.path(), &path, None, None, None, WINDOW_BYTES).unwrap();
        let mid_line = (user(0, "a").len() + 3) as u64;
        assert!(read_session_window_at(dir.path(), &path, Some(mid_line), Some(&first.source_id), Some(&first.start_anchor), 100).unwrap_err().starts_with("INVALID_CURSOR"));
        assert!(read_session_window_at(dir.path(), &path, Some(u64::MAX), Some(&first.source_id), Some(&first.start_anchor), 100).unwrap_err().starts_with("SOURCE_CHANGED"));
        fs::write(&file, [user(9, "other"), user(10, "file")].concat()).unwrap();
        assert!(read_session_window_at(dir.path(), &path, Some(0), Some(&first.source_id), Some(&first.start_anchor), 100).unwrap_err().starts_with("SOURCE_CHANGED"));
        // Re-reading the latest window of a session that was replaced says so.
        assert!(read_session_window_at(dir.path(), &path, None, Some(&first.source_id), None, 100).unwrap_err().starts_with("SOURCE_CHANGED"));
    }

    #[test]
    fn a_rewrite_that_keeps_the_first_line_is_caught_by_the_cursor_anchor() {
        let dir = TempDir::new().unwrap();
        let body = [user(0, "a"), user(1, "b"), user(2, "c"), user(3, "d")].concat();
        let (file, path) = session(&dir, &body);
        let tail = read_session_window_at(dir.path(), &path, None, None, None, 250).unwrap();
        assert!(!tail.reached_start);
        // Same first record, different history after it: a compacted rewrite.
        fs::write(&file, [user(0, "a"), user(7, "x"), user(8, "y"), user(9, "z")].concat()).unwrap();
        let error = read_session_window_at(dir.path(), &path, Some(tail.start_offset), Some(&tail.source_id), Some(&tail.start_anchor), 250)
            .unwrap_err();
        assert!(error.starts_with("SOURCE_CHANGED"), "{error}");
        // A cursor without its source id and anchor is not accepted at all.
        assert!(read_session_window_at(dir.path(), &path, Some(tail.start_offset), None, None, 250).unwrap_err().starts_with("INVALID_CURSOR"));
    }

    #[test]
    fn a_window_let_go_of_reads_back_identically_after_the_transcript_grows() {
        let dir = TempDir::new().unwrap();
        let body = [user(0, "a"), user(1, "b"), user(2, "c"), user(3, "d"), assistant_without_id("e")].concat();
        let (file, path) = session(&dir, &body);
        let newest = read_session_window_at(dir.path(), &path, None, None, None, 300).unwrap();
        assert!(!newest.end_anchor.is_empty());
        // The session keeps running while the view holds older history.
        let mut handle = fs::OpenOptions::new().append(true).open(&file).unwrap();
        handle.write_all([user(4, "f"), user(5, "g")].concat().as_bytes()).unwrap();
        let restored = read_session_window_with(
            dir.path(),
            &path,
            Some(newest.end_offset),
            Some(&newest.source_id),
            None,
            Some(&newest.end_anchor),
            300,
        )
        .unwrap();
        assert_eq!(restored.start_offset, newest.start_offset);
        assert_eq!(restored.end_offset, newest.end_offset);
        let ids = |w: &ClaudeCodeSessionWindow| w.events.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
        assert_eq!(ids(&restored), ids(&newest));
    }

    #[test]
    fn a_rewritten_history_refuses_a_window_that_was_let_go_of() {
        let dir = TempDir::new().unwrap();
        let body = [user(0, "a"), user(1, "b"), user(2, "c")].concat();
        let (file, path) = session(&dir, &body);
        let newest = read_session_window_at(dir.path(), &path, None, None, None, 300).unwrap();
        // Same first record (same source id), same length, different history.
        fs::write(&file, [user(0, "a"), user(1, "x"), user(2, "y")].concat()).unwrap();
        let error = read_session_window_with(dir.path(), &path, Some(newest.end_offset), Some(&newest.source_id), None, Some(&newest.end_anchor), 300)
            .unwrap_err();
        assert!(error.starts_with("SOURCE_CHANGED"), "{error}");
        // The source id alone is not a cursor.
        let error = read_session_window_with(dir.path(), &path, Some(newest.end_offset), Some(&newest.source_id), None, None, 300).unwrap_err();
        assert!(error.starts_with("INVALID_CURSOR"), "{error}");
    }

    #[test]
    fn a_growing_file_keeps_earlier_cursors_valid() {
        let dir = TempDir::new().unwrap();
        let body = [user(0, "a"), user(1, "b"), user(2, "c")].concat();
        let (file, path) = session(&dir, &body);
        let first = read_session_window_at(dir.path(), &path, None, None, None, 300).unwrap();
        let mut handle = fs::OpenOptions::new().append(true).open(&file).unwrap();
        handle.write_all(user(3, "d").as_bytes()).unwrap();
        let earlier = read_session_window_at(dir.path(), &path, Some(first.start_offset), Some(&first.source_id), Some(&first.start_anchor), 300).unwrap();
        assert!(earlier.events.iter().all(|event| event.id != "u3"));
    }

    /// Cost of opening and paging, measured on a real transcript (read only).
    /// `MORI_WINDOW_BENCH=/path/to/session.jsonl cargo test --release window_bench -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn window_bench() {
        let Ok(path) = std::env::var("MORI_WINDOW_BENCH") else { return };
        let root = Path::new(&path).parent().and_then(Path::parent).unwrap().to_path_buf();
        let started = std::time::Instant::now();
        let first = read_session_window_at(&root, &path, None, None, None, WINDOW_BYTES).unwrap();
        let open = started.elapsed();
        let content = |w: &ClaudeCodeSessionWindow| w.events.iter().map(|e| e.content.len()).sum::<usize>();
        let mut pages = vec![(open, first.end_offset - first.start_offset, first.events.len(), content(&first))];
        let mut last = first.clone();
        let page_count: usize = std::env::var("MORI_WINDOW_BENCH_PAGES").ok().and_then(|v| v.parse().ok()).unwrap_or(5);
        for _ in 0..page_count {
            if last.reached_start {
                break;
            }
            let started = std::time::Instant::now();
            let next = read_session_window_at(&root, &path, Some(last.start_offset), Some(&last.source_id), Some(&last.start_anchor), WINDOW_BYTES).unwrap();
            pages.push((started.elapsed(), next.end_offset - next.start_offset, next.events.len(), content(&next)));
            last = next;
        }
        println!("file_bytes={} window_bytes={WINDOW_BYTES}", first.file_bytes);
        for (index, (elapsed, bytes, events, chars)) in pages.iter().enumerate() {
            println!("page={index} ms={:.2} bytes_read={bytes} events={events} content_bytes={chars}", elapsed.as_secs_f64() * 1000.0);
        }
        let started = std::time::Instant::now();
        let detail = read_session_at(&root, &path);
        println!("detail_read ms={:.2} result={}", started.elapsed().as_secs_f64() * 1000.0, match detail { Ok(d) => format!("ok messages={}", d.messages.len()), Err(e) => e });
    }

    /// Every window, read back by its end cursor, is the same window: on a real
    /// transcript (read only).
    /// `MORI_WINDOW_BENCH=/path/to/session.jsonl cargo test --release window_readback_check -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn window_readback_check() {
        let Ok(path) = std::env::var("MORI_WINDOW_BENCH") else { return };
        let root = Path::new(&path).parent().and_then(Path::parent).unwrap().to_path_buf();
        let mut windows = vec![read_session_window_at(&root, &path, None, None, None, WINDOW_BYTES).unwrap()];
        for _ in 0..70 {
            let last = windows.last().unwrap();
            let next = read_session_window_at(&root, &path, Some(last.start_offset), Some(&last.source_id), Some(&last.start_anchor), WINDOW_BYTES).unwrap();
            windows.push(next);
        }
        for (index, w) in windows.iter().enumerate() {
            let back = read_session_window_with(&root, &path, Some(w.end_offset), Some(&w.source_id), None, Some(&w.end_anchor), WINDOW_BYTES)
                .unwrap_or_else(|error| panic!("window {index}: {error}"));
            assert_eq!((back.start_offset, back.end_offset), (w.start_offset, w.end_offset), "window {index}");
        }
        println!("{} windows read back identically", windows.len());
    }

    #[test]
    fn the_window_reader_keeps_the_source_root_and_file_type_boundaries() {
        let dir = TempDir::new().unwrap();
        let (_, _) = session(&dir, &user(0, "a"));
        let outside = TempDir::new().unwrap();
        let foreign = outside.path().join("x.jsonl");
        fs::write(&foreign, user(0, "secret")).unwrap();
        assert!(read_session_window_at(dir.path(), &foreign.to_string_lossy(), None, None, None, 100).unwrap_err().starts_with("Refused"));
        let escape = dir.path().join("-home-u-dev-infra").join("link.jsonl");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&foreign, &escape).unwrap();
        #[cfg(unix)]
        assert!(read_session_window_at(dir.path(), &escape.to_string_lossy(), None, None, None, 100).unwrap_err().starts_with("Refused"));
        let text_file = dir.path().join("-home-u-dev-infra").join("notes.txt");
        fs::write(&text_file, "x\n").unwrap();
        assert!(read_session_window_at(dir.path(), &text_file.to_string_lossy(), None, None, None, 100).unwrap_err().starts_with("Refused"));
        let missing = dir.path().join("-home-u-dev-infra").join("gone.jsonl");
        assert!(read_session_window_at(dir.path(), &missing.to_string_lossy(), None, None, None, 100).unwrap_err().starts_with("SOURCE_MISSING"));
    }
}
