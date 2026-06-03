//! Connector installer status detection.
//!
//! Reports, per capture connector, whether the underlying tool is present and
//! whether Mori's capture is wired up. Read-only and bounded, like the other
//! connector + discovery probes: it stats directories, parses one settings
//! file, and counts session files. It never writes, never recurses outside
//! the known roots, and never reads session content.
//!
//! The TypeScript adapter (`connectorInstaller.ts`) turns these raw facts
//! into the Connections-hub status model; this command only states what is on
//! disk:
//!   - claude-code (config-hook): is `~/.claude` present, and does
//!     `~/.claude/settings.json` already wire in the Mori hook?
//!   - codex-cli / opencode / antigravity / continue / cline / cursor
//!     (session-discovery): is the tool's local store present, and how many
//!     sessions can Mori read back from it?
//!
//! Field names mirror the TypeScript `ConnectorDetectionResult` via
//! `rename_all = "camelCase"`. Keep the two in sync.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorDetection {
    pub id: String,
    pub tool_installed: bool,
    pub tool_version: Option<String>,
    pub hook_installed: Option<bool>,
    pub hook_scope: Option<String>,
    pub discovered_session_count: Option<u32>,
}

#[tauri::command]
pub fn detect_connector_status() -> Result<Vec<ConnectorDetection>, String> {
    let env = DetectEnv::from_real_env();
    Ok(detect_with_env(&env))
}

/// Captured environment: the *resolved* data roots for each agent (env
/// overrides already applied via `agent_paths`), so detection honors the same
/// `CLAUDE_CONFIG_DIR` / `CODEX_HOME` relocations that discovery does. Exposed
/// for tests so the probe can target a temp directory tree.
#[derive(Debug, Clone, Default)]
pub(crate) struct DetectEnv {
    pub claude_dir: Option<PathBuf>,
    pub codex_dir: Option<PathBuf>,
    pub antigravity_brain_dir: Option<PathBuf>,
    pub continue_sessions_dir: Option<PathBuf>,
    pub cline_tasks_dir: Option<PathBuf>,
    pub cursor_global_db: Option<PathBuf>,
    pub opencode_storage_dir: Option<PathBuf>,
}

impl DetectEnv {
    fn from_real_env() -> Self {
        Self {
            claude_dir: crate::agent_paths::claude_dir(),
            codex_dir: crate::agent_paths::codex_dir(),
            antigravity_brain_dir: crate::agent_paths::antigravity_brain_dir(),
            continue_sessions_dir: crate::agent_paths::continue_sessions_dir(),
            cline_tasks_dir: crate::agent_paths::cline_tasks_dir(),
            cursor_global_db: crate::agent_paths::cursor_global_db(),
            opencode_storage_dir: crate::agent_paths::opencode_storage_dir(),
        }
    }
}

pub(crate) fn detect_with_env(env: &DetectEnv) -> Vec<ConnectorDetection> {
    vec![
        detect_claude(env),
        detect_codex(env),
        detect_antigravity(env),
        detect_continue(env),
        detect_cline(env),
        detect_cursor(env),
        detect_opencode(env),
    ]
}

fn detect_claude(env: &DetectEnv) -> ConnectorDetection {
    let claude_dir = env.claude_dir.clone();
    let tool_installed = claude_dir.as_deref().map(Path::is_dir).unwrap_or(false);
    let hook_installed = if tool_installed {
        let settings = claude_dir.as_ref().map(|d| d.join("settings.json"));
        Some(settings.as_deref().map(claude_hook_present).unwrap_or(false))
    } else {
        None
    };
    let hook_scope = if hook_installed == Some(true) {
        Some("global".to_string())
    } else {
        None
    };
    ConnectorDetection {
        id: "claude-code".to_string(),
        tool_installed,
        tool_version: None,
        hook_installed,
        hook_scope,
        discovered_session_count: None,
    }
}

/// True when `settings.json` wires in the Mori hook (some hook command
/// string references the `mori-claude-hook` script. Tolerant of the exact
/// path and launcher (`.py` / `.sh` / `.ps1`); a malformed or hookless file
/// reads as "not installed" rather than erroring.
fn claude_hook_present(settings_path: &Path) -> bool {
    let Ok(text) = fs::read_to_string(settings_path) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return false;
    };
    value
        .get("hooks")
        .map(json_mentions_mori_hook)
        .unwrap_or(false)
}

fn json_mentions_mori_hook(value: &Value) -> bool {
    match value {
        Value::String(text) => text.contains("mori-claude-hook"),
        Value::Array(items) => items.iter().any(json_mentions_mori_hook),
        Value::Object(map) => map.values().any(json_mentions_mori_hook),
        _ => false,
    }
}

fn detect_codex(env: &DetectEnv) -> ConnectorDetection {
    let codex_dir = env.codex_dir.clone();
    let tool_installed = codex_dir.as_deref().map(Path::is_dir).unwrap_or(false);
    let discovered_session_count = if tool_installed {
        let sessions = codex_dir.as_ref().map(|d| d.join("sessions"));
        Some(sessions.as_deref().map(count_jsonl_files).unwrap_or(0))
    } else {
        None
    };
    ConnectorDetection {
        id: "codex-cli".to_string(),
        tool_installed,
        tool_version: None,
        hook_installed: None,
        hook_scope: None,
        discovered_session_count,
    }
}

fn detect_antigravity(env: &DetectEnv) -> ConnectorDetection {
    let brain = env.antigravity_brain_dir.clone();
    let tool_installed = brain.as_deref().map(Path::is_dir).unwrap_or(false);
    let discovered_session_count = if tool_installed {
        Some(brain.as_deref().map(count_antigravity_transcripts).unwrap_or(0))
    } else {
        None
    };
    ConnectorDetection {
        id: "antigravity".to_string(),
        tool_installed,
        tool_version: None,
        hook_installed: None,
        hook_scope: None,
        discovered_session_count,
    }
}

fn detect_continue(env: &DetectEnv) -> ConnectorDetection {
    let sessions = env.continue_sessions_dir.clone();
    let tool_installed = sessions.as_deref().map(Path::is_dir).unwrap_or(false);
    let discovered_session_count = if tool_installed {
        Some(sessions.as_deref().map(count_continue_sessions).unwrap_or(0))
    } else {
        None
    };
    ConnectorDetection {
        id: "continue".to_string(),
        tool_installed,
        tool_version: None,
        hook_installed: None,
        hook_scope: None,
        discovered_session_count,
    }
}

/// Cline (session-discovery): is the VS Code globalStorage tasks root present,
/// and how many task directories can Mori read back?
fn detect_cline(env: &DetectEnv) -> ConnectorDetection {
    let tasks = env.cline_tasks_dir.clone();
    let tool_installed = tasks.as_deref().map(Path::is_dir).unwrap_or(false);
    let discovered_session_count = if tool_installed {
        Some(tasks.as_deref().map(count_cline_tasks).unwrap_or(0))
    } else {
        None
    };
    ConnectorDetection {
        id: "cline".to_string(),
        tool_installed,
        tool_version: None,
        hook_installed: None,
        hook_scope: None,
        discovered_session_count,
    }
}

/// Cursor (session-discovery): is the global `state.vscdb` present, and how
/// many composer (chat) sessions does its `cursorDiskKV` table hold?
fn detect_cursor(env: &DetectEnv) -> ConnectorDetection {
    let db = env.cursor_global_db.clone();
    let tool_installed = db.as_deref().map(Path::is_file).unwrap_or(false);
    let discovered_session_count = if tool_installed {
        Some(
            db.as_deref()
                .map(crate::cursor::sessions::count_composer_sessions)
                .unwrap_or(0),
        )
    } else {
        None
    };
    ConnectorDetection {
        id: "cursor".to_string(),
        tool_installed,
        tool_version: None,
        hook_installed: None,
        hook_scope: None,
        discovered_session_count,
    }
}

/// OpenCode (session-discovery): is the local `<data>/storage` present, and how
/// many sessions can Mori read back from `storage/session`?
fn detect_opencode(env: &DetectEnv) -> ConnectorDetection {
    let storage = env.opencode_storage_dir.clone();
    let tool_installed = storage.as_deref().map(Path::is_dir).unwrap_or(false);
    let discovered_session_count = if tool_installed {
        Some(storage.as_deref().map(count_opencode_sessions).unwrap_or(0))
    } else {
        None
    };
    ConnectorDetection {
        id: "opencode".to_string(),
        tool_installed,
        tool_version: None,
        hook_installed: None,
        hook_scope: None,
        discovered_session_count,
    }
}

/// Count Cline tasks: one directory per task that holds a `ui_messages.json`,
/// matching what `cline::sessions::list_sessions_at` lists. A missing or
/// unreadable root reads as zero.
fn count_cline_tasks(tasks_root: &Path) -> u32 {
    let Ok(entries) = fs::read_dir(tasks_root) else {
        return 0;
    };
    let mut count = 0;
    for entry in entries.flatten() {
        if entry.path().join("ui_messages.json").is_file() {
            count += 1;
        }
    }
    count
}

/// Count OpenCode sessions by deferring to the discovery lister, so the probe
/// counts exactly what Mori could read back. A read error reads as zero.
fn count_opencode_sessions(storage_root: &Path) -> u32 {
    crate::opencode::sessions::list_sessions_at(storage_root)
        .map(|sessions| sessions.len() as u32)
        .unwrap_or(0)
}

/// Count sessions from Continue's `sessions.json` index (the source of truth
/// Continue maintains). A missing or malformed index reads as zero rather than
/// erroring, matching the tolerant-reader stance.
fn count_continue_sessions(sessions_dir: &Path) -> u32 {
    let index = sessions_dir.join("sessions.json");
    let Ok(text) = fs::read_to_string(&index) else {
        return 0;
    };
    serde_json::from_str::<Value>(&text)
        .ok()
        .and_then(|value| value.as_array().map(|entries| entries.len() as u32))
        .unwrap_or(0)
}

/// Count conversations that have a readable transcript under
/// `brain/<id>/.system_generated/logs/transcript.jsonl`. Conversations with
/// only a protobuf store (no generated transcript) are not counted, matching
/// the partial-capture reality.
fn count_antigravity_transcripts(brain: &Path) -> u32 {
    let Ok(entries) = fs::read_dir(brain) else {
        return 0;
    };
    let mut count = 0;
    for entry in entries.flatten() {
        let transcript = entry
            .path()
            .join(".system_generated")
            .join("logs")
            .join("transcript.jsonl");
        if transcript.is_file() {
            count += 1;
        }
    }
    count
}

fn count_jsonl_files(path: &Path) -> u32 {
    fn walk(path: &Path, count: &mut u32) {
        let Ok(entries) = fs::read_dir(path) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, count);
            } else if path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("jsonl"))
                .unwrap_or(false)
            {
                *count += 1;
            }
        }
    }
    if !path.is_dir() {
        return 0;
    }
    let mut count = 0;
    walk(path, &mut count);
    count
}

// ─── Claude hook install / uninstall ────────────────────────────────────────
//
// Writes are the only mutating part of this module. They are deliberately
// conservative: existing settings keys and existing (non-Mori) hooks are
// always preserved, a malformed settings.json is never overwritten, install is
// idempotent (a second call is a no-op), and uninstall removes only entries
// that reference the Mori hook. The TypeScript side computes the OS-aware
// `command` string (python on Windows, the .sh launcher on POSIX); this code
// only does the safe merge / removal.

/// The four hook events Mori installs, with the optional PostToolUse matcher.
const HOOK_EVENTS: &[(&str, Option<&str>)] = &[
    ("SessionStart", None),
    ("UserPromptSubmit", None),
    ("PostToolUse", Some("Edit|Write|MultiEdit|NotebookEdit|Bash")),
    ("SessionEnd", None),
];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HookInstallResult {
    pub settings_path: String,
    pub installed: bool,
    pub already_present: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HookUninstallResult {
    pub settings_path: String,
    pub removed: usize,
}

#[tauri::command]
pub fn install_claude_hook(
    scope: String,
    command: String,
    project_path: Option<String>,
) -> Result<HookInstallResult, String> {
    let env = DetectEnv::from_real_env();
    install_claude_hook_at(&env, &scope, &command, project_path.as_deref())
}

#[tauri::command]
pub fn uninstall_claude_hook(
    scope: String,
    project_path: Option<String>,
) -> Result<HookUninstallResult, String> {
    let env = DetectEnv::from_real_env();
    uninstall_claude_hook_at(&env, &scope, project_path.as_deref())
}

fn settings_path_for(
    env: &DetectEnv,
    scope: &str,
    project_path: Option<&str>,
) -> Result<PathBuf, String> {
    match scope {
        "global" => {
            // Honors $CLAUDE_CONFIG_DIR via the resolved claude_dir, so the
            // hook is installed where Claude Code actually reads it.
            let dir = env
                .claude_dir
                .as_ref()
                .ok_or_else(|| "Claude config directory is not set.".to_string())?;
            Ok(dir.join("settings.json"))
        }
        "project" => {
            let path = project_path
                .filter(|p| !p.trim().is_empty())
                .ok_or_else(|| "project scope requires a project path.".to_string())?;
            Ok(PathBuf::from(path).join(".claude").join("settings.json"))
        }
        other => Err(format!("Unknown scope: {other}")),
    }
}

/// Read settings.json into a JSON object. Missing / empty file is an empty
/// object; an existing file that is not valid JSON, or not an object, is an
/// error so we never overwrite the user's data.
fn read_settings(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Object(Map::new()));
    }
    let text = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    if text.trim().is_empty() {
        return Ok(Value::Object(Map::new()));
    }
    let value: Value = serde_json::from_str(&text)
        .map_err(|_| format!("{} is not valid JSON; refusing to overwrite.", path.display()))?;
    if !value.is_object() {
        return Err(format!(
            "{} is not a JSON object; refusing to overwrite.",
            path.display()
        ));
    }
    Ok(value)
}

fn write_settings(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }
    let text = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Failed to serialize settings: {error}"))?;
    fs::write(path, format!("{text}\n"))
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

fn hook_entry(command: &str, matcher: Option<&str>) -> Value {
    let mut entry = Map::new();
    if let Some(matcher) = matcher {
        entry.insert("matcher".to_string(), json!(matcher));
    }
    entry.insert(
        "hooks".to_string(),
        json!([{ "type": "command", "command": command }]),
    );
    Value::Object(entry)
}

fn install_claude_hook_at(
    env: &DetectEnv,
    scope: &str,
    command: &str,
    project_path: Option<&str>,
) -> Result<HookInstallResult, String> {
    if command.trim().is_empty() {
        return Err("hook command is required.".to_string());
    }
    let path = settings_path_for(env, scope, project_path)?;
    let mut root = read_settings(&path)?;
    let settings_path = path.to_string_lossy().to_string();

    // Idempotent: a Mori hook already wired in means there is nothing to do.
    let already = root
        .as_object()
        .and_then(|obj| obj.get("hooks"))
        .map(json_mentions_mori_hook)
        .unwrap_or(false);
    if already {
        return Ok(HookInstallResult {
            settings_path,
            installed: true,
            already_present: true,
        });
    }

    let obj = root
        .as_object_mut()
        .ok_or_else(|| "settings.json root is not an object.".to_string())?;
    let hooks = obj
        .entry("hooks".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let hooks_obj = hooks
        .as_object_mut()
        .ok_or_else(|| "settings.json hooks is not an object.".to_string())?;
    for (event, matcher) in HOOK_EVENTS {
        let arr = hooks_obj
            .entry((*event).to_string())
            .or_insert_with(|| Value::Array(Vec::new()));
        let list = arr
            .as_array_mut()
            .ok_or_else(|| format!("settings.json hooks.{event} is not an array."))?;
        list.push(hook_entry(command, *matcher));
    }

    write_settings(&path, &root)?;
    Ok(HookInstallResult {
        settings_path,
        installed: true,
        already_present: false,
    })
}

fn uninstall_claude_hook_at(
    env: &DetectEnv,
    scope: &str,
    project_path: Option<&str>,
) -> Result<HookUninstallResult, String> {
    let path = settings_path_for(env, scope, project_path)?;
    let settings_path = path.to_string_lossy().to_string();
    if !path.exists() {
        return Ok(HookUninstallResult {
            settings_path,
            removed: 0,
        });
    }
    let mut root = read_settings(&path)?;
    let mut removed = 0usize;

    if let Some(hooks) = root
        .as_object_mut()
        .and_then(|obj| obj.get_mut("hooks"))
        .and_then(|hooks| hooks.as_object_mut())
    {
        let events: Vec<String> = hooks.keys().cloned().collect();
        for event in events {
            if let Some(arr) = hooks.get_mut(&event).and_then(|value| value.as_array_mut()) {
                let before = arr.len();
                arr.retain(|entry| !json_mentions_mori_hook(entry));
                removed += before - arr.len();
                if arr.is_empty() {
                    hooks.remove(&event);
                }
            }
        }
    }
    // Drop an emptied hooks object so the file returns to its pre-install shape.
    if let Some(obj) = root.as_object_mut() {
        let empty = obj
            .get("hooks")
            .and_then(Value::as_object)
            .map(Map::is_empty)
            .unwrap_or(false);
        if empty {
            obj.remove("hooks");
        }
    }

    if removed > 0 {
        write_settings(&path, &root)?;
    }
    Ok(HookUninstallResult {
        settings_path,
        removed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn find<'a>(results: &'a [ConnectorDetection], id: &str) -> &'a ConnectorDetection {
        results
            .iter()
            .find(|r| r.id == id)
            .unwrap_or_else(|| panic!("missing detection for {id}"))
    }

    #[test]
    fn no_home_reports_nothing_installed() {
        let results = detect_with_env(&DetectEnv::default());
        let claude = find(&results, "claude-code");
        let codex = find(&results, "codex-cli");
        assert!(!claude.tool_installed);
        assert_eq!(claude.hook_installed, None);
        assert!(!codex.tool_installed);
        assert_eq!(codex.discovered_session_count, None);
    }

    #[test]
    fn claude_dir_without_hook_requires_setup() {
        let temp = TempDir::new().unwrap();
        std::fs::create_dir_all(temp.path().join(".claude")).unwrap();
        std::fs::write(
            temp.path().join(".claude").join("settings.json"),
            "{\"permissions\":{\"defaultMode\":\"auto\"}}",
        )
        .unwrap();
        let results = detect_with_env(&global_env(&temp));
        let claude = find(&results, "claude-code");
        assert!(claude.tool_installed);
        assert_eq!(claude.hook_installed, Some(false));
        assert_eq!(claude.hook_scope, None);
    }

    #[test]
    fn claude_hook_in_settings_reads_as_installed_global() {
        let temp = TempDir::new().unwrap();
        std::fs::create_dir_all(temp.path().join(".claude")).unwrap();
        std::fs::write(
            temp.path().join(".claude").join("settings.json"),
            "{\"hooks\":{\"SessionStart\":[{\"hooks\":[{\"type\":\"command\",\"command\":\"python /x/mori-claude-hook.py\"}]}]}}",
        )
        .unwrap();
        let results = detect_with_env(&global_env(&temp));
        let claude = find(&results, "claude-code");
        assert!(claude.tool_installed);
        assert_eq!(claude.hook_installed, Some(true));
        assert_eq!(claude.hook_scope.as_deref(), Some("global"));
    }

    #[test]
    fn malformed_settings_reads_as_not_hooked() {
        let temp = TempDir::new().unwrap();
        std::fs::create_dir_all(temp.path().join(".claude")).unwrap();
        std::fs::write(
            temp.path().join(".claude").join("settings.json"),
            "{ this is not json",
        )
        .unwrap();
        let results = detect_with_env(&global_env(&temp));
        assert_eq!(find(&results, "claude-code").hook_installed, Some(false));
    }

    #[test]
    fn codex_sessions_are_counted_across_the_date_tree() {
        let temp = TempDir::new().unwrap();
        let day = temp
            .path()
            .join(".codex")
            .join("sessions")
            .join("2026")
            .join("05")
            .join("29");
        std::fs::create_dir_all(&day).unwrap();
        std::fs::write(day.join("rollout-a.jsonl"), "{}\n").unwrap();
        std::fs::write(day.join("rollout-b.jsonl"), "{}\n").unwrap();
        std::fs::write(day.join("notes.txt"), "ignored").unwrap();
        let results = detect_with_env(&global_env(&temp));
        let codex = find(&results, "codex-cli");
        assert!(codex.tool_installed);
        assert_eq!(codex.discovered_session_count, Some(2));
    }

    #[test]
    fn codex_dir_without_sessions_reports_zero() {
        let temp = TempDir::new().unwrap();
        std::fs::create_dir_all(temp.path().join(".codex")).unwrap();
        let results = detect_with_env(&global_env(&temp));
        assert_eq!(find(&results, "codex-cli").discovered_session_count, Some(0));
    }

    #[test]
    fn antigravity_counts_only_conversations_with_a_transcript() {
        let temp = TempDir::new().unwrap();
        let brain = temp.path().join(".gemini").join("antigravity").join("brain");
        // One conversation with a transcript, one with only a protobuf store.
        let logs = brain.join("conv-aaa").join(".system_generated").join("logs");
        std::fs::create_dir_all(&logs).unwrap();
        std::fs::write(logs.join("transcript.jsonl"), "{}\n").unwrap();
        std::fs::create_dir_all(brain.join("conv-bbb")).unwrap();
        std::fs::write(brain.join("conv-bbb").join("conv.pb"), b"\x00").unwrap();

        let results = detect_with_env(&global_env(&temp));
        let ag = find(&results, "antigravity");
        assert!(ag.tool_installed);
        assert_eq!(ag.discovered_session_count, Some(1));
    }

    #[test]
    fn continue_counts_sessions_from_its_index() {
        let temp = TempDir::new().unwrap();
        let sessions = temp.path().join(".continue").join("sessions");
        std::fs::create_dir_all(&sessions).unwrap();
        std::fs::write(
            sessions.join("sessions.json"),
            "[{\"sessionId\":\"a\"},{\"sessionId\":\"b\"}]",
        )
        .unwrap();

        let results = detect_with_env(&DetectEnv {
            continue_sessions_dir: Some(sessions),
            ..DetectEnv::default()
        });
        let cont = find(&results, "continue");
        assert!(cont.tool_installed);
        assert_eq!(cont.discovered_session_count, Some(2));
    }

    #[test]
    fn cline_counts_task_directories_with_ui_messages() {
        let temp = TempDir::new().unwrap();
        let tasks = temp.path().join("cline").join("tasks");
        for id in ["1700000000000", "1700000001000"] {
            std::fs::create_dir_all(tasks.join(id)).unwrap();
            std::fs::write(tasks.join(id).join("ui_messages.json"), "[]").unwrap();
        }
        // A stray directory without ui_messages.json is not a task.
        std::fs::create_dir_all(tasks.join("scratch")).unwrap();
        let results = detect_with_env(&global_env(&temp));
        let cline = find(&results, "cline");
        assert!(cline.tool_installed);
        assert_eq!(cline.discovered_session_count, Some(2));
    }

    #[test]
    fn cline_without_tasks_root_reports_nothing() {
        let results = detect_with_env(&DetectEnv::default());
        let cline = find(&results, "cline");
        assert!(!cline.tool_installed);
        assert_eq!(cline.discovered_session_count, None);
    }

    #[test]
    fn opencode_counts_session_files_from_storage() {
        let temp = TempDir::new().unwrap();
        let session = temp
            .path()
            .join("opencode")
            .join("storage")
            .join("session")
            .join("global");
        std::fs::create_dir_all(&session).unwrap();
        for id in ["ses_a", "ses_b"] {
            std::fs::write(
                session.join(format!("{id}.json")),
                format!("{{\"id\":\"{id}\",\"directory\":\"/x\",\"title\":\"t\",\"time\":{{\"created\":1771000000000,\"updated\":1771000005000}}}}"),
            )
            .unwrap();
        }
        // A non-session json under the tree is ignored (no ses_ prefix).
        std::fs::write(session.join("notes.json"), "{}").unwrap();
        let results = detect_with_env(&global_env(&temp));
        let opencode = find(&results, "opencode");
        assert!(opencode.tool_installed);
        assert_eq!(opencode.discovered_session_count, Some(2));
    }

    #[test]
    fn cursor_counts_composer_sessions_in_state_db() {
        let temp = TempDir::new().unwrap();
        let db_path = temp.path().join("cursor").join("state.vscdb");
        std::fs::create_dir_all(db_path.parent().unwrap()).unwrap();
        {
            let conn = rusqlite::Connection::open(&db_path).unwrap();
            conn.execute(
                "CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)",
                [],
            )
            .unwrap();
            for id in ["c1", "c2", "c3"] {
                conn.execute(
                    "INSERT INTO cursorDiskKV (key, value) VALUES (?1, ?2)",
                    rusqlite::params![format!("composerData:{id}"), "{}"],
                )
                .unwrap();
            }
            // A non-composer row must not be counted.
            conn.execute(
                "INSERT INTO cursorDiskKV (key, value) VALUES (?1, ?2)",
                rusqlite::params!["bubbleId:c1:b1", "{}"],
            )
            .unwrap();
        }
        let results = detect_with_env(&global_env(&temp));
        let cursor = find(&results, "cursor");
        assert!(cursor.tool_installed);
        assert_eq!(cursor.discovered_session_count, Some(3));
    }

    const CMD: &str = "python \"C:\\\\dev\\\\mori\\\\connectors\\\\claude-code\\\\mori-claude-hook.py\"";

    fn global_env(temp: &TempDir) -> DetectEnv {
        DetectEnv {
            claude_dir: Some(temp.path().join(".claude")),
            codex_dir: Some(temp.path().join(".codex")),
            antigravity_brain_dir: Some(
                temp.path().join(".gemini").join("antigravity").join("brain"),
            ),
            continue_sessions_dir: Some(temp.path().join(".continue").join("sessions")),
            cline_tasks_dir: Some(temp.path().join("cline").join("tasks")),
            cursor_global_db: Some(temp.path().join("cursor").join("state.vscdb")),
            opencode_storage_dir: Some(temp.path().join("opencode").join("storage")),
        }
    }

    fn settings_text(temp: &TempDir) -> String {
        std::fs::read_to_string(temp.path().join(".claude").join("settings.json")).unwrap()
    }

    #[test]
    fn install_creates_settings_with_all_four_events() {
        let temp = TempDir::new().unwrap();
        let result = install_claude_hook_at(&global_env(&temp), "global", CMD, None).unwrap();
        assert!(result.installed);
        assert!(!result.already_present);
        let text = settings_text(&temp);
        let value: Value = serde_json::from_str(&text).unwrap();
        let hooks = value.get("hooks").and_then(Value::as_object).unwrap();
        for event in ["SessionStart", "UserPromptSubmit", "PostToolUse", "SessionEnd"] {
            assert!(hooks.contains_key(event), "missing {event}");
        }
        assert_eq!(text.matches("mori-claude-hook").count(), 4);
    }

    #[test]
    fn install_preserves_existing_settings_and_hooks() {
        let temp = TempDir::new().unwrap();
        let dir = temp.path().join(".claude");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("settings.json"),
            "{\"permissions\":{\"defaultMode\":\"auto\"},\"hooks\":{\"SessionStart\":[{\"hooks\":[{\"type\":\"command\",\"command\":\"other-tool.sh\"}]}]}}",
        )
        .unwrap();

        install_claude_hook_at(&global_env(&temp), "global", CMD, None).unwrap();
        let value: Value = serde_json::from_str(&settings_text(&temp)).unwrap();
        // Unrelated key preserved.
        assert_eq!(
            value.pointer("/permissions/defaultMode").and_then(Value::as_str),
            Some("auto")
        );
        // Existing non-Mori hook preserved alongside the new Mori entry.
        let session_start = value.pointer("/hooks/SessionStart").and_then(Value::as_array).unwrap();
        assert_eq!(session_start.len(), 2);
        let blob = settings_text(&temp);
        assert!(blob.contains("other-tool.sh"));
        assert!(blob.contains("mori-claude-hook"));
    }

    #[test]
    fn install_is_idempotent() {
        let temp = TempDir::new().unwrap();
        install_claude_hook_at(&global_env(&temp), "global", CMD, None).unwrap();
        let first = settings_text(&temp);
        let second_result = install_claude_hook_at(&global_env(&temp), "global", CMD, None).unwrap();
        assert!(second_result.already_present);
        let second = settings_text(&temp);
        assert_eq!(first, second, "second install must not change the file");
        assert_eq!(second.matches("mori-claude-hook").count(), 4, "no duplicate entries");
    }

    #[test]
    fn install_refuses_to_overwrite_invalid_json() {
        let temp = TempDir::new().unwrap();
        let dir = temp.path().join(".claude");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("settings.json"), "{ this is not json").unwrap();
        let err = install_claude_hook_at(&global_env(&temp), "global", CMD, None).unwrap_err();
        assert!(err.contains("not valid JSON"));
        // The bad file is left untouched.
        assert_eq!(settings_text(&temp), "{ this is not json");
    }

    #[test]
    fn uninstall_removes_only_mori_hooks() {
        let temp = TempDir::new().unwrap();
        install_claude_hook_at(&global_env(&temp), "global", CMD, None).unwrap();
        // Add a non-Mori hook that must survive uninstall.
        let dir = temp.path().join(".claude");
        let mut value: Value = serde_json::from_str(&settings_text(&temp)).unwrap();
        value
            .pointer_mut("/hooks/SessionStart")
            .and_then(Value::as_array_mut)
            .unwrap()
            .push(json!({ "hooks": [{ "type": "command", "command": "keep-me.sh" }] }));
        std::fs::write(dir.join("settings.json"), value.to_string()).unwrap();

        let result = uninstall_claude_hook_at(&global_env(&temp), "global", None).unwrap();
        assert_eq!(result.removed, 4);
        let blob = settings_text(&temp);
        assert!(blob.contains("keep-me.sh"), "non-Mori hook must survive");
        assert!(!blob.contains("mori-claude-hook"), "Mori hooks must be gone");
    }

    #[test]
    fn honors_a_relocated_claude_dir_for_detection_and_install() {
        // A relocated claude_dir simulates $CLAUDE_CONFIG_DIR pointing somewhere
        // other than ~/.claude. Both detection and install must follow it.
        let temp = TempDir::new().unwrap();
        let relocated = temp.path().join("xdg").join("claude");
        std::fs::create_dir_all(&relocated).unwrap();
        let env = DetectEnv {
            claude_dir: Some(relocated.clone()),
            ..DetectEnv::default()
        };

        // Detection sees the relocated dir, not ~/.claude.
        let before = detect_with_env(&env);
        let claude = find(&before, "claude-code");
        assert!(claude.tool_installed);
        assert_eq!(claude.hook_installed, Some(false));

        // Install writes into the relocated dir.
        install_claude_hook_at(&env, "global", CMD, None).unwrap();
        let text = std::fs::read_to_string(relocated.join("settings.json")).unwrap();
        assert!(text.contains("mori-claude-hook"));
        // ...and detection now reports it connected.
        let after_results = detect_with_env(&env);
        let after = find(&after_results, "claude-code");
        assert_eq!(after.hook_installed, Some(true));
        assert_eq!(after.hook_scope.as_deref(), Some("global"));
    }
}
