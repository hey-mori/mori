//! Local AI tool discovery — what Claude / Codex artefacts live on disk.
//!
//! The Connections page used to be a two-tab flow that pretended Claude
//! Desktop and Claude Code were different stores. They aren't — the modern
//! Claude Desktop GUI is a wrapper over the same `~/.claude/projects/` data
//! Claude Code reads. So this module replaces the "where do conversations
//! live" guess with an honest survey of the user's local AI footprint:
//!
//!   - Which Claude / Codex tools are installed?
//!   - Where do they actually store data?
//!   - Can Mori import from that store, or is the data server-side only?
//!
//! Every probe is read-only and bounded: we stat directories, count files
//! (capped per directory), and return a stable shape. No content is read.
//! `discover_local_ai_tools()` is safe to call on idle navigations.
//!
//! Naming note: a *tool* is the user-facing product (Claude Desktop, Codex
//! CLI). A *data slot* is a filesystem location associated with that tool.
//! Many tools have multiple data slots; we surface the most user-meaningful
//! one and roll the others into `searched_paths` for transparency.
//!
//! `status` values:
//!   - `data-found`   — the slot exists and contains material we can import
//!   - `active`       — the slot exists, but in-app data is server-side
//!   - `logs-only`    — only logs are on disk (no conversations to import)
//!   - `cache-only`   — caches / temp files only
//!   - `empty`        — slot exists but contains nothing relevant
//!   - `unsupported`  — we know about it but can't import (browser cookies,
//!                      OAuth tokens, etc.)
//!   - `not-found`    — not present anywhere we know about
//!
//! The TypeScript side mirrors these strings — keep them in sync.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::code::list_sessions_at;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiToolReport {
    pub tools: Vec<DetectedTool>,
    /// Every directory we tried, so the UI can show "looked in: X, Y, Z"
    /// without the user having to read each tool card to learn it.
    pub searched_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedTool {
    pub id: String,
    pub label: String,
    pub description: String,
    /// The directory or file we found. Empty when the tool was not detected.
    pub path: String,
    pub status: String,
    pub can_import: bool,
    /// Best-effort session count for tools whose data is importable.
    /// `None` for everything else (cache, logs, server-side).
    pub session_count: Option<u32>,
    pub notes: String,
}

#[tauri::command]
pub fn discover_local_ai_tools() -> Result<LocalAiToolReport, String> {
    let env = ProbeEnv::from_real_env();
    Ok(probe_with_env(&env))
}

// ─── core probe (testable, env-injected) ───────────────────────────────────

/// Captured environment — exposed for tests so we can point the probe at a
/// temp directory tree without touching the user's real `%USERPROFILE%`.
#[derive(Debug, Clone, Default)]
pub(crate) struct ProbeEnv {
    pub home: Option<PathBuf>,
    pub local_appdata: Option<PathBuf>,
    pub roaming_appdata: Option<PathBuf>,
}

impl ProbeEnv {
    fn from_real_env() -> Self {
        Self {
            home: std::env::var_os("USERPROFILE")
                .or_else(|| std::env::var_os("HOME"))
                .map(PathBuf::from),
            local_appdata: std::env::var_os("LOCALAPPDATA").map(PathBuf::from),
            roaming_appdata: std::env::var_os("APPDATA").map(PathBuf::from),
        }
    }
}

pub(crate) fn probe_with_env(env: &ProbeEnv) -> LocalAiToolReport {
    let mut tools: Vec<DetectedTool> = Vec::new();
    let mut searched: Vec<PathBuf> = Vec::new();

    // ── 1. Claude (Desktop + Code share one store) ─────────────────────────
    let claude_projects = env.home.as_ref().map(|h| h.join(".claude").join("projects"));
    if let Some(path) = &claude_projects {
        searched.push(path.clone());
    }
    let (claude_status, claude_count) = inspect_claude_projects(claude_projects.as_deref());
    let claude_path_str = claude_projects
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let (claude_label, claude_desc, claude_can_import, claude_notes) = match claude_status.as_str()
    {
        "data-found" => (
            "Claude (Desktop · Code)",
            "Claude Desktop과 Claude Code가 공유하는 로컬 세션입니다.",
            true,
            "Claude Desktop의 새 GUI는 Claude Code와 같은 ~/.claude/projects 디렉터리를 사용합니다.",
        ),
        "empty" => (
            "Claude (Desktop · Code)",
            "Claude Desktop 또는 Claude Code 세션 디렉터리가 비어 있습니다.",
            false,
            "Claude Desktop이나 Claude Code를 한 번 이상 사용한 뒤 새로고침하세요.",
        ),
        _ => (
            "Claude (Desktop · Code)",
            "Claude Desktop 또는 Claude Code 세션을 찾을 수 없습니다.",
            false,
            "Claude Desktop을 설치하고 한 번 이상 실행한 뒤 새로고침하세요.",
        ),
    };
    tools.push(DetectedTool {
        id: "claude-projects".to_string(),
        label: claude_label.to_string(),
        description: claude_desc.to_string(),
        path: claude_path_str,
        status: claude_status,
        can_import: claude_can_import,
        session_count: claude_count,
        notes: claude_notes.to_string(),
    });

    // ── 2. Chrome native-host bridge (claude.ai webapp helper) ─────────────
    let chrome_logs = env.local_appdata.as_ref().map(|l| l.join("Claude").join("Logs"));
    let chrome_root = env.local_appdata.as_ref().map(|l| l.join("Claude"));
    if let Some(p) = &chrome_logs {
        searched.push(p.clone());
    }
    let chrome_status = if chrome_logs.as_deref().map(Path::is_dir).unwrap_or(false) {
        "logs-only"
    } else if chrome_root.as_deref().map(Path::is_dir).unwrap_or(false) {
        "active"
    } else {
        "not-found"
    };
    tools.push(DetectedTool {
        id: "claude-chrome-host".to_string(),
        label: "Claude Chrome 확장 (네이티브 호스트)".to_string(),
        description: "claude.ai 웹 채팅과 연동되는 Chrome 확장의 로컬 헬퍼입니다.".to_string(),
        path: chrome_logs
            .or(chrome_root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        status: chrome_status.to_string(),
        can_import: false,
        session_count: None,
        notes: "claude.ai 웹 채팅 내용은 Anthropic 서버에 저장되므로 로컬에서 가져올 수 없습니다.".to_string(),
    });

    // ── 3. Claude Nest-3p (Cowork-style multi-account companion) ──────────
    let nest = env.local_appdata.as_ref().map(|l| l.join("Claude Nest-3p"));
    if let Some(p) = &nest {
        searched.push(p.clone());
    }
    let nest_status = if nest.as_deref().map(Path::is_dir).unwrap_or(false) {
        "active"
    } else {
        "not-found"
    };
    tools.push(DetectedTool {
        id: "claude-nest-3p".to_string(),
        label: "Claude Nest (Cowork)".to_string(),
        description: "Cowork 계열의 다중 계정 도우미가 감지되면 표시됩니다.".to_string(),
        path: nest
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        status: nest_status.to_string(),
        can_import: false,
        session_count: None,
        notes: "참조용 — 대화 데이터는 외부에 저장되며 Mori는 직접 읽지 않습니다.".to_string(),
    });

    // ── 4. Claude-3p (legacy sideload directory) ──────────────────────────
    let three_p = env.local_appdata.as_ref().map(|l| l.join("Claude-3p"));
    if let Some(p) = &three_p {
        searched.push(p.clone());
    }
    let three_p_status = if three_p.as_deref().map(Path::is_dir).unwrap_or(false) {
        "active"
    } else {
        "not-found"
    };
    tools.push(DetectedTool {
        id: "claude-3p".to_string(),
        label: "Claude-3p".to_string(),
        description: "타사 빌드 또는 사이드로드 디렉터리가 감지되면 표시됩니다.".to_string(),
        path: three_p
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        status: three_p_status.to_string(),
        can_import: false,
        session_count: None,
        notes: "참조용 — Mori는 이 디렉터리에서 데이터를 읽지 않습니다.".to_string(),
    });

    // ── 5. claude-cli-nodejs cache ─────────────────────────────────────────
    let cli_node = env.local_appdata.as_ref().map(|l| l.join("claude-cli-nodejs"));
    if let Some(p) = &cli_node {
        searched.push(p.clone());
    }
    let cli_node_status = if cli_node.as_deref().map(Path::is_dir).unwrap_or(false) {
        "cache-only"
    } else {
        "not-found"
    };
    tools.push(DetectedTool {
        id: "claude-cli-nodejs".to_string(),
        label: "claude-cli (Node.js 캐시)".to_string(),
        description: "Node 기반 Claude CLI의 캐시 디렉터리입니다.".to_string(),
        path: cli_node
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        status: cli_node_status.to_string(),
        can_import: false,
        session_count: None,
        notes: "캐시만 있고 대화 기록은 없습니다.".to_string(),
    });

    // ── 6. Claude roaming-appdata (older settings store) ──────────────────
    let claude_roaming = env.roaming_appdata.as_ref().map(|r| r.join("Claude"));
    if let Some(p) = &claude_roaming {
        searched.push(p.clone());
    }
    let claude_roaming_status = if claude_roaming.as_deref().map(Path::is_dir).unwrap_or(false) {
        "cache-only"
    } else {
        "not-found"
    };
    tools.push(DetectedTool {
        id: "claude-roaming".to_string(),
        label: "Claude (Roaming AppData)".to_string(),
        description: "구형 Claude Desktop 설정 디렉터리입니다.".to_string(),
        path: claude_roaming
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        status: claude_roaming_status.to_string(),
        can_import: false,
        session_count: None,
        notes: "설정 / 캐시만 있고 대화 기록은 없습니다.".to_string(),
    });

    // ── 7. Codex CLI (~/.codex/) ───────────────────────────────────────────
    let codex = env.home.as_ref().map(|h| h.join(".codex"));
    let codex_sessions = codex.as_ref().map(|p| p.join("sessions"));
    if let Some(p) = &codex {
        searched.push(p.clone());
    }
    if let Some(p) = &codex_sessions {
        searched.push(p.clone());
    }
    let codex_session_count = codex_sessions.as_deref().and_then(count_jsonl_files);
    let codex_status = if codex_session_count.unwrap_or(0) > 0 {
        "data-found"
    } else if codex.as_deref().map(Path::is_dir).unwrap_or(false) {
        if directory_has_any_entries(codex.as_deref().unwrap_or(Path::new(""))) {
            "data-found"
        } else {
            "empty"
        }
    } else {
        "not-found"
    };
    tools.push(DetectedTool {
        id: "codex-cli".to_string(),
        label: "Codex CLI".to_string(),
        description: "~/.codex 디렉터리에 설정과 세션 로그가 있는지 확인합니다.".to_string(),
        path: codex
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        status: codex_status.to_string(),
        can_import: codex_session_count.unwrap_or(0) > 0,
        session_count: codex_session_count,
        notes: "Codex 로컬 JSONL 세션은 ~/.codex/sessions에서 읽고, wrapper 결과는 ~/.mori/connectors/codex-cli에서 읽습니다.".to_string(),
    });

    // ── 8. OpenCode connector inbox (~/.mori/connectors/opencode-cli/) ─────
    let opencode_connector = env
        .home
        .as_ref()
        .map(|h| h.join(".mori").join("connectors").join("opencode-cli"));
    if let Some(p) = &opencode_connector {
        searched.push(p.clone());
    }
    let opencode_count = opencode_connector.as_deref().and_then(count_jsonl_files);
    let opencode_status = if opencode_count.unwrap_or(0) > 0 {
        "data-found"
    } else if opencode_connector.as_deref().map(Path::is_dir).unwrap_or(false) {
        "empty"
    } else {
        "not-found"
    };
    tools.push(DetectedTool {
        id: "opencode-cli".to_string(),
        label: "OpenCode CLI".to_string(),
        description: "OpenCode wrapper/hook JSONL이 있는지 확인합니다.".to_string(),
        path: opencode_connector
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        status: opencode_status.to_string(),
        can_import: opencode_count.unwrap_or(0) > 0,
        session_count: opencode_count,
        notes: "OpenCode는 ~/.mori/connectors/opencode-cli 아래의 wrapper/hook JSONL을 작업 세션으로 가져옵니다.".to_string(),
    });

    // ── 9. OpenAI CLI / tooling (~/.openai/) ───────────────────────────────
    let openai = env.home.as_ref().map(|h| h.join(".openai"));
    if let Some(p) = &openai {
        searched.push(p.clone());
    }
    let openai_status = if openai.as_deref().map(Path::is_dir).unwrap_or(false) {
        "active"
    } else {
        "not-found"
    };
    tools.push(DetectedTool {
        id: "openai-cli".to_string(),
        label: "OpenAI 도구".to_string(),
        description: "~/.openai 디렉터리(설정 / 토큰)가 감지되면 표시됩니다.".to_string(),
        path: openai
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        status: openai_status.to_string(),
        can_import: false,
        session_count: None,
        notes: "참조용 — Mori는 OpenAI 도구의 자격 증명을 사용하지 않습니다.".to_string(),
    });

    LocalAiToolReport {
        tools,
        searched_paths: searched
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect(),
    }
}

/// Look at `~/.claude/projects/` and return a `(status, session_count)`
/// pair. Counts use the shared Claude Code lister so the number on the card
/// always matches the number of sessions the browser shows below.
fn inspect_claude_projects(path: Option<&Path>) -> (String, Option<u32>) {
    let Some(path) = path else {
        return ("not-found".to_string(), None);
    };
    if !path.is_dir() {
        return ("not-found".to_string(), None);
    }
    // The lister already enforces the JSONL-only + size-cap contract.
    match list_sessions_at(path) {
        Ok(sessions) if !sessions.is_empty() => {
            ("data-found".to_string(), Some(sessions.len() as u32))
        }
        Ok(_) => ("empty".to_string(), Some(0)),
        Err(_) => ("empty".to_string(), Some(0)),
    }
}

fn directory_has_any_entries(path: &Path) -> bool {
    fs::read_dir(path)
        .map(|mut iter| iter.next().is_some())
        .unwrap_or(false)
}

fn count_jsonl_files(path: &Path) -> Option<u32> {
    if !path.is_dir() {
        return None;
    }
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
    let mut count = 0;
    walk(path, &mut count);
    Some(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::TempDir;

    fn empty_env() -> ProbeEnv {
        ProbeEnv {
            home: None,
            local_appdata: None,
            roaming_appdata: None,
        }
    }

    fn write_session(dir: &Path, name: &str) {
        std::fs::create_dir_all(dir).unwrap();
        let path = dir.join(name);
        let body = "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"hello\"},\"timestamp\":\"2026-01-01T00:00:00Z\"}\n";
        std::fs::write(path, body).unwrap();
    }

    fn tool_by_id<'a>(report: &'a LocalAiToolReport, id: &str) -> &'a DetectedTool {
        report
            .tools
            .iter()
            .find(|t| t.id == id)
            .unwrap_or_else(|| panic!("tool {id} not present"))
    }

    #[test]
    fn report_returns_every_known_tool_even_when_no_env_is_set() {
        let report = probe_with_env(&empty_env());
        let ids: Vec<&str> = report.tools.iter().map(|t| t.id.as_str()).collect();
        for required in [
            "claude-projects",
            "claude-chrome-host",
            "claude-nest-3p",
            "claude-3p",
            "claude-cli-nodejs",
            "claude-roaming",
            "codex-cli",
            "opencode-cli",
            "openai-cli",
        ] {
            assert!(ids.contains(&required), "missing tool {required}: {ids:?}");
        }
        // With no env set, nothing can be located.
        for tool in &report.tools {
            assert_eq!(
                tool.status, "not-found",
                "expected not-found for {} but got {}",
                tool.id, tool.status
            );
            assert!(!tool.can_import);
            assert!(tool.session_count.is_none());
        }
    }

    #[test]
    fn claude_projects_with_session_counts_reports_data_found() {
        let temp = TempDir::new().unwrap();
        let home = temp.path().to_path_buf();
        let projects = home.join(".claude").join("projects");
        write_session(&projects.join("-Users-alice-demo"), "session-aaa.jsonl");
        write_session(&projects.join("-Users-alice-other"), "session-bbb.jsonl");

        let env = ProbeEnv {
            home: Some(home),
            ..empty_env()
        };
        let report = probe_with_env(&env);
        let claude = tool_by_id(&report, "claude-projects");
        assert_eq!(claude.status, "data-found");
        assert!(claude.can_import);
        assert_eq!(claude.session_count, Some(2));
        assert!(claude.path.ends_with("projects") || claude.path.contains("projects"));
    }

    #[test]
    fn claude_projects_directory_present_but_empty_reports_empty() {
        let temp = TempDir::new().unwrap();
        let home = temp.path().to_path_buf();
        std::fs::create_dir_all(home.join(".claude").join("projects")).unwrap();
        let env = ProbeEnv {
            home: Some(home),
            ..empty_env()
        };
        let report = probe_with_env(&env);
        let claude = tool_by_id(&report, "claude-projects");
        assert_eq!(claude.status, "empty");
        assert!(!claude.can_import);
        assert_eq!(claude.session_count, Some(0));
    }

    #[test]
    fn chrome_native_host_logs_directory_is_logs_only() {
        let temp = TempDir::new().unwrap();
        let local = temp.path().to_path_buf();
        std::fs::create_dir_all(local.join("Claude").join("Logs")).unwrap();
        let env = ProbeEnv {
            local_appdata: Some(local),
            ..empty_env()
        };
        let report = probe_with_env(&env);
        let chrome = tool_by_id(&report, "claude-chrome-host");
        assert_eq!(chrome.status, "logs-only");
        assert!(!chrome.can_import);
        assert!(chrome.notes.contains("Anthropic"));
    }

    #[test]
    fn codex_sessions_report_data_found_and_importable() {
        let temp = TempDir::new().unwrap();
        let home = temp.path().to_path_buf();
        let sessions = home.join(".codex").join("sessions").join("2026").join("05").join("28");
        std::fs::create_dir_all(&sessions).unwrap();
        std::fs::write(sessions.join("session.jsonl"), "{}\n").unwrap();
        let env = ProbeEnv {
            home: Some(home),
            ..empty_env()
        };
        let report = probe_with_env(&env);
        let codex_tool = tool_by_id(&report, "codex-cli");
        assert_eq!(codex_tool.status, "data-found");
        assert!(codex_tool.can_import);
        assert_eq!(codex_tool.session_count, Some(1));
    }

    #[test]
    fn codex_directory_empty_reports_empty() {
        let temp = TempDir::new().unwrap();
        let home = temp.path().to_path_buf();
        std::fs::create_dir_all(home.join(".codex")).unwrap();
        let env = ProbeEnv {
            home: Some(home),
            ..empty_env()
        };
        let report = probe_with_env(&env);
        let codex_tool = tool_by_id(&report, "codex-cli");
        assert_eq!(codex_tool.status, "empty");
    }

    #[test]
    fn cli_nodejs_cache_is_marked_cache_only() {
        let temp = TempDir::new().unwrap();
        let local = temp.path().to_path_buf();
        std::fs::create_dir_all(local.join("claude-cli-nodejs")).unwrap();
        let env = ProbeEnv {
            local_appdata: Some(local),
            ..empty_env()
        };
        let report = probe_with_env(&env);
        let cli = tool_by_id(&report, "claude-cli-nodejs");
        assert_eq!(cli.status, "cache-only");
        assert!(!cli.can_import);
    }

    #[test]
    fn searched_paths_lists_every_probed_directory() {
        // With a partial env we should still get a deterministic searched-paths
        // list — at least one entry per probed slot that has its env root set.
        let temp = TempDir::new().unwrap();
        let env = ProbeEnv {
            home: Some(temp.path().to_path_buf()),
            local_appdata: Some(temp.path().to_path_buf()),
            roaming_appdata: Some(temp.path().to_path_buf()),
        };
        let report = probe_with_env(&env);
        // Probed paths should include each tool slot uniquely — 8 tools, 8 paths.
        let unique: HashMap<&String, ()> = report
            .searched_paths
            .iter()
            .map(|s| (s, ()))
            .collect();
        assert_eq!(
            unique.len(),
            report.searched_paths.len(),
            "duplicate paths: {:?}",
            report.searched_paths
        );
        assert!(report.searched_paths.len() >= 8);
    }
}
