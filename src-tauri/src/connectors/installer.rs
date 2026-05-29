//! Connector installer status detection.
//!
//! Reports, per capture connector, whether the underlying tool is present and
//! whether Mori's capture is wired up. Read-only and bounded, like the other
//! connector + discovery probes — it stats directories, parses one settings
//! file, and counts session files. It never writes, never recurses outside
//! the known roots, and never reads session content.
//!
//! The TypeScript adapter (`connectorInstaller.ts`) turns these raw facts
//! into the Connections-hub status model; this command only states what is on
//! disk:
//!   - claude-code (config-hook): is `~/.claude` present, and does
//!     `~/.claude/settings.json` already wire in the Mori hook?
//!   - codex-cli (session-discovery): is `~/.codex` present, and how many
//!     session rollout files can Mori read back?
//!
//! Field names mirror the TypeScript `ConnectorDetectionResult` via
//! `rename_all = "camelCase"` — keep the two in sync.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

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

/// Captured environment — exposed for tests so the probe can target a temp
/// directory tree without touching the user's real home directory.
#[derive(Debug, Clone, Default)]
pub(crate) struct DetectEnv {
    pub home: Option<PathBuf>,
}

impl DetectEnv {
    fn from_real_env() -> Self {
        Self {
            home: std::env::var_os("USERPROFILE")
                .or_else(|| std::env::var_os("HOME"))
                .map(PathBuf::from),
        }
    }
}

pub(crate) fn detect_with_env(env: &DetectEnv) -> Vec<ConnectorDetection> {
    vec![detect_claude(env), detect_codex(env)]
}

fn detect_claude(env: &DetectEnv) -> ConnectorDetection {
    let claude_dir = env.home.as_ref().map(|h| h.join(".claude"));
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

/// True when `settings.json` wires in the Mori hook — i.e. some hook command
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
    let codex_dir = env.home.as_ref().map(|h| h.join(".codex"));
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
        let results = detect_with_env(&DetectEnv { home: None });
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
        let results = detect_with_env(&DetectEnv {
            home: Some(temp.path().to_path_buf()),
        });
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
        let results = detect_with_env(&DetectEnv {
            home: Some(temp.path().to_path_buf()),
        });
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
        let results = detect_with_env(&DetectEnv {
            home: Some(temp.path().to_path_buf()),
        });
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
        let results = detect_with_env(&DetectEnv {
            home: Some(temp.path().to_path_buf()),
        });
        let codex = find(&results, "codex-cli");
        assert!(codex.tool_installed);
        assert_eq!(codex.discovered_session_count, Some(2));
    }

    #[test]
    fn codex_dir_without_sessions_reports_zero() {
        let temp = TempDir::new().unwrap();
        std::fs::create_dir_all(temp.path().join(".codex")).unwrap();
        let results = detect_with_env(&DetectEnv {
            home: Some(temp.path().to_path_buf()),
        });
        assert_eq!(find(&results, "codex-cli").discovered_session_count, Some(0));
    }
}
