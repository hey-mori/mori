//! How long Claude Code keeps transcripts on this machine, as far as Mori can
//! tell without running it: the `cleanupPeriodDays` set in managed settings
//! or the user's settings file. Read-only; nothing else in those files is
//! read or returned.
//!
//! A project's own `.claude/settings*.json` can also set the period, and the
//! sweep runs with whichever Claude Code instance starts, so the effective
//! value can differ by project. Callers present the result as an estimate.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPolicy {
    /// The configured period in days, or None when no checked file sets it
    /// (Claude Code then uses its default, 30 days).
    pub period_days: Option<u32>,
    /// "managed", "user", "unset", or "invalid" when the deciding file sets
    /// the key to something Mori cannot read as a period (0, a string, a
    /// number out of range): then nothing is assumed about its meaning.
    pub source: String,
}

enum Period {
    Absent,
    Days(u32),
    Invalid,
}

fn period_in(path: &Path) -> Period {
    let Ok(text) = std::fs::read_to_string(path) else { return Period::Absent };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else { return Period::Absent };
    match value.get("cleanupPeriodDays") {
        None => Period::Absent,
        Some(raw) => match raw.as_u64() {
            Some(days) if (1..=36_500).contains(&days) => Period::Days(days as u32),
            _ => Period::Invalid,
        },
    }
}

fn managed_settings_path() -> Option<PathBuf> {
    if cfg!(target_os = "macos") {
        Some(PathBuf::from("/Library/Application Support/ClaudeCode/managed-settings.json"))
    } else if cfg!(target_os = "windows") {
        Some(PathBuf::from(r"C:\ProgramData\ClaudeCode\managed-settings.json"))
    } else {
        Some(PathBuf::from("/etc/claude-code/managed-settings.json"))
    }
}

pub(crate) fn cleanup_policy_from(managed: Option<&Path>, user: Option<&Path>) -> CleanupPolicy {
    // Managed settings take precedence over every other scope; the first file
    // that sets the key decides, even when its value is unreadable.
    for (path, scope) in [(managed, "managed"), (user, "user")] {
        match path.map(period_in) {
            Some(Period::Days(days)) => return CleanupPolicy { period_days: Some(days), source: scope.to_string() },
            Some(Period::Invalid) => return CleanupPolicy { period_days: None, source: "invalid".to_string() },
            _ => {}
        }
    }
    CleanupPolicy { period_days: None, source: "unset".to_string() }
}

/// The transcript cleanup period Claude Code would use for the user's
/// sessions, from managed then user settings.
#[tauri::command]
pub fn claude_code_cleanup_policy() -> CleanupPolicy {
    let user = crate::agent_paths::claude_dir().map(|dir| dir.join("settings.json"));
    cleanup_policy_from(managed_settings_path().as_deref(), user.as_deref())
}

/// Whether each transcript path still exists: "present", "missing" only when
/// the system says it is not there, and "unknown" on any other error (a
/// permission or I/O failure proves nothing). Never opens the file.
#[tauri::command]
pub fn claude_code_source_presence(paths: Vec<String>) -> Vec<String> {
    paths.iter().map(|path| presence_of(Path::new(path)).to_string()).collect()
}

fn presence_of(path: &Path) -> &'static str {
    match std::fs::symlink_metadata(path) {
        Ok(_) => "present",
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => "missing",
        Err(_) => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn managed_wins_then_user_then_unset() {
        let dir = TempDir::new().unwrap();
        let managed = dir.path().join("managed.json");
        let user = dir.path().join("user.json");
        std::fs::write(&user, r#"{"cleanupPeriodDays": 90, "env": {"SECRET": "x"}}"#).unwrap();
        assert_eq!(cleanup_policy_from(Some(&managed), Some(&user)), CleanupPolicy { period_days: Some(90), source: "user".into() });
        std::fs::write(&managed, r#"{"cleanupPeriodDays": 14}"#).unwrap();
        assert_eq!(cleanup_policy_from(Some(&managed), Some(&user)), CleanupPolicy { period_days: Some(14), source: "managed".into() });
        assert_eq!(cleanup_policy_from(None, None), CleanupPolicy { period_days: None, source: "unset".into() });
    }

    #[test]
    fn ignores_missing_or_malformed_files() {
        let dir = TempDir::new().unwrap();
        let user = dir.path().join("user.json");
        for body in ["{not json", r#"{"other": 1}"#] {
            std::fs::write(&user, body).unwrap();
            assert_eq!(cleanup_policy_from(None, Some(&user)).source, "unset", "{body}");
        }
    }

    #[test]
    fn reports_an_unreadable_period_instead_of_assuming_the_default() {
        let dir = TempDir::new().unwrap();
        let managed = dir.path().join("managed.json");
        let user = dir.path().join("user.json");
        std::fs::write(&user, r#"{"cleanupPeriodDays": 90}"#).unwrap();
        for body in [r#"{"cleanupPeriodDays": 0}"#, r#"{"cleanupPeriodDays": "30"}"#, r#"{"cleanupPeriodDays": 99999}"#] {
            std::fs::write(&managed, body).unwrap();
            assert_eq!(
                cleanup_policy_from(Some(&managed), Some(&user)),
                CleanupPolicy { period_days: None, source: "invalid".into() },
                "{body}"
            );
        }
    }

    #[test]
    fn presence_is_missing_only_when_not_found() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.jsonl");
        std::fs::write(&file, "x").unwrap();
        assert_eq!(presence_of(&file), "present");
        assert_eq!(presence_of(&dir.path().join("gone.jsonl")), "missing");
        // A path through a regular file is NotADirectory, not NotFound.
        assert_eq!(presence_of(&file.join("child")), "unknown");
    }
}
