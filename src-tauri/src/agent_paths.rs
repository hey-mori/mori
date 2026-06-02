//! Centralized, env-aware resolution of where each agent stores its data.
//!
//! Agents do not use XDG / Known Folder conventions: they use literal
//! dot-directories under the user's home, but several honor an environment
//! override that relocates that root (Codex: `CODEX_HOME`; Claude Code:
//! `CLAUDE_CONFIG_DIR`). Resolving here, once and env-aware, keeps discovery
//! resilient when a user relocates a root or a future tool version moves it:
//! the change is one function, not a hunt across modules.
//!
//! Resolution follows the tolerant-reader spirit: an unset / empty override
//! falls back to the conventional path, and a missing home directory yields
//! `None` rather than panicking. The pure `resolve_root` core is unit-tested
//! with injected inputs so we never depend on process-global env in tests.

use std::ffi::OsString;
use std::path::PathBuf;

/// User home directory: `USERPROFILE` (Windows) or `HOME` (POSIX).
pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

/// First non-empty environment variable among `names`, as a path.
fn env_override(names: &[&str]) -> Option<OsString> {
    names
        .iter()
        .filter_map(|name| std::env::var_os(name))
        .find(|value| !value.is_empty())
}

/// Pure resolution core (testable without touching the process environment):
/// an env override wins outright; otherwise append `default_rel` segments to
/// the home directory. Returns `None` only when neither a usable override nor
/// a home directory is available.
pub(crate) fn resolve_root(
    override_value: Option<OsString>,
    home: Option<PathBuf>,
    default_rel: &[&str],
) -> Option<PathBuf> {
    if let Some(value) = override_value.filter(|value| !value.is_empty()) {
        return Some(PathBuf::from(value));
    }
    home.map(|mut path| {
        for segment in default_rel {
            path.push(segment);
        }
        path
    })
}

/// Append path segments to an optional base.
fn join(base: Option<PathBuf>, segments: &[&str]) -> Option<PathBuf> {
    base.map(|mut path| {
        for segment in segments {
            path.push(segment);
        }
        path
    })
}

/// Claude Code config root: `$CLAUDE_CONFIG_DIR`, else `~/.claude`.
pub fn claude_dir() -> Option<PathBuf> {
    resolve_root(env_override(&["CLAUDE_CONFIG_DIR"]), home_dir(), &[".claude"])
}

/// Claude Code session store: `<claude dir>/projects`.
pub fn claude_projects_dir() -> Option<PathBuf> {
    join(claude_dir(), &["projects"])
}

/// Codex CLI home: `$CODEX_HOME`, else `~/.codex`.
pub fn codex_dir() -> Option<PathBuf> {
    resolve_root(env_override(&["CODEX_HOME"]), home_dir(), &[".codex"])
}

/// Codex CLI session rollouts: `<codex dir>/sessions`.
pub fn codex_sessions_dir() -> Option<PathBuf> {
    join(codex_dir(), &["sessions"])
}

/// Antigravity brain root: `$ANTIGRAVITY_HOME/brain`, else
/// `~/.gemini/antigravity/brain`.
pub fn antigravity_brain_dir() -> Option<PathBuf> {
    match env_override(&["ANTIGRAVITY_HOME"]) {
        Some(value) => Some(PathBuf::from(value).join("brain")),
        None => join(home_dir(), &[".gemini", "antigravity", "brain"]),
    }
}

/// OpenCode data root. OpenCode uses an XDG-style data dir even on Windows
/// (`%USERPROFILE%\.local\share\opencode`). A direct `$OPENCODE_DATA`
/// override points at the data dir itself; otherwise `$XDG_DATA_HOME`
/// relocates the parent and we append `opencode`, falling back to
/// `~/.local/share/opencode`.
pub fn opencode_data_dir() -> Option<PathBuf> {
    if let Some(value) = env_override(&["OPENCODE_DATA"]) {
        return Some(PathBuf::from(value));
    }
    match env_override(&["XDG_DATA_HOME"]) {
        Some(value) => Some(PathBuf::from(value).join("opencode")),
        None => join(home_dir(), &[".local", "share", "opencode"]),
    }
}

/// OpenCode session store: `<opencode data dir>/storage`. Sessions, messages,
/// and message parts live in `storage/session`, `storage/message`, and
/// `storage/part` respectively.
pub fn opencode_storage_dir() -> Option<PathBuf> {
    join(opencode_data_dir(), &["storage"])
}

/// Continue global dir: `$CONTINUE_GLOBAL_DIR`, else `~/.continue`.
pub fn continue_dir() -> Option<PathBuf> {
    resolve_root(env_override(&["CONTINUE_GLOBAL_DIR"]), home_dir(), &[".continue"])
}

/// Continue session store: `<continue dir>/sessions` (one `sessions.json`
/// index plus one `<sessionId>.json` per session).
pub fn continue_sessions_dir() -> Option<PathBuf> {
    join(continue_dir(), &["sessions"])
}

/// Cline task store: `<VS Code globalStorage>/saoudrizwan.claude-dev/tasks`.
/// A `$CLINE_DATA` override points at the extension's globalStorage dir
/// (the parent of `tasks`); otherwise the location follows VS Code's
/// per-OS user-data dir. Other editors (Insiders, VSCodium, Cursor) relocate
/// this, so `$CLINE_DATA` is the escape hatch.
pub fn cline_tasks_dir() -> Option<PathBuf> {
    if let Some(value) = env_override(&["CLINE_DATA"]) {
        return Some(PathBuf::from(value).join("tasks"));
    }
    join(cline_global_storage_dir(), &["tasks"])
}

fn cline_global_storage_dir() -> Option<PathBuf> {
    const EXT: &str = "saoudrizwan.claude-dev";
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .filter(|value| !value.is_empty())
            .map(|appdata| {
                PathBuf::from(appdata)
                    .join("Code")
                    .join("User")
                    .join("globalStorage")
                    .join(EXT)
            })
    }
    #[cfg(target_os = "macos")]
    {
        join(
            home_dir(),
            &[
                "Library",
                "Application Support",
                "Code",
                "User",
                "globalStorage",
                EXT,
            ],
        )
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        join(home_dir(), &[".config", "Code", "User", "globalStorage", EXT])
    }
}

/// Cursor global state database: `<Cursor globalStorage>/state.vscdb`. Recent
/// Cursor stores composer (chat) sessions in this SQLite file's `cursorDiskKV`
/// table. A `$CURSOR_DATA` override points at the globalStorage dir; otherwise
/// the location follows Cursor's per-OS user-data dir.
pub fn cursor_global_db() -> Option<PathBuf> {
    join(cursor_global_storage_dir(), &["state.vscdb"])
}

fn cursor_global_storage_dir() -> Option<PathBuf> {
    if let Some(value) = env_override(&["CURSOR_DATA"]) {
        return Some(PathBuf::from(value));
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .filter(|value| !value.is_empty())
            .map(|appdata| {
                PathBuf::from(appdata)
                    .join("Cursor")
                    .join("User")
                    .join("globalStorage")
            })
    }
    #[cfg(target_os = "macos")]
    {
        join(
            home_dir(),
            &[
                "Library",
                "Application Support",
                "Cursor",
                "User",
                "globalStorage",
            ],
        )
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        join(home_dir(), &[".config", "Cursor", "User", "globalStorage"])
    }
}

/// Mori connector inbox root: `~/.mori/connectors` (the hook writes here; no
/// override, so reader and writer never disagree).
pub fn mori_inbox_dir() -> Option<PathBuf> {
    join(home_dir(), &[".mori", "connectors"])
}

/// Convert an `Option<PathBuf>` resolver result into a `Result` with a clear
/// message, for command entry points that surface errors to the UI.
pub fn require(path: Option<PathBuf>, what: &str) -> Result<PathBuf, String> {
    path.ok_or_else(|| format!("Home directory is not set; cannot locate {what}."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn override_wins_over_home() {
        let resolved = resolve_root(
            Some(OsString::from("/custom/codex")),
            Some(PathBuf::from("/home/alice")),
            &[".codex"],
        );
        assert_eq!(resolved, Some(PathBuf::from("/custom/codex")));
    }

    #[test]
    fn empty_override_falls_back_to_home() {
        let resolved = resolve_root(
            Some(OsString::from("")),
            Some(PathBuf::from("/home/alice")),
            &[".codex"],
        );
        assert_eq!(resolved, Some(PathBuf::from("/home/alice/.codex")));
    }

    #[test]
    fn no_override_appends_default_rel_to_home() {
        let resolved = resolve_root(None, Some(PathBuf::from("/home/alice")), &[".claude"]);
        assert_eq!(resolved, Some(PathBuf::from("/home/alice/.claude")));
    }

    #[test]
    fn multi_segment_default_rel() {
        let resolved = resolve_root(
            None,
            Some(PathBuf::from("/home/alice")),
            &[".gemini", "antigravity"],
        );
        assert_eq!(
            resolved,
            Some(PathBuf::from("/home/alice/.gemini/antigravity"))
        );
    }

    #[test]
    fn no_home_and_no_override_is_none() {
        assert_eq!(resolve_root(None, None, &[".codex"]), None);
    }

    #[test]
    fn require_reports_a_clear_error() {
        let err = require(None, "Codex sessions").unwrap_err();
        assert!(err.contains("Codex sessions"));
    }
}
