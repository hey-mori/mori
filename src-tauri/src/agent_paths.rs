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
