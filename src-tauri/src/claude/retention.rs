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
    /// "managed", "user" or "unset".
    pub source: String,
}

fn period_in(path: &Path) -> Option<u32> {
    let text = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let days = value.get("cleanupPeriodDays")?.as_u64()?;
    (1..=36_500).contains(&days).then_some(days as u32)
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
    // Managed settings take precedence over every other scope.
    if let Some(days) = managed.and_then(period_in) {
        return CleanupPolicy { period_days: Some(days), source: "managed".to_string() };
    }
    if let Some(days) = user.and_then(period_in) {
        return CleanupPolicy { period_days: Some(days), source: "user".to_string() };
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
    fn ignores_missing_malformed_or_invalid_values() {
        let dir = TempDir::new().unwrap();
        let user = dir.path().join("user.json");
        for body in [r#"{"cleanupPeriodDays": 0}"#, r#"{"cleanupPeriodDays": "30"}"#, "{not json", r#"{"other": 1}"#] {
            std::fs::write(&user, body).unwrap();
            assert_eq!(cleanup_policy_from(None, Some(&user)).source, "unset", "{body}");
        }
    }
}
