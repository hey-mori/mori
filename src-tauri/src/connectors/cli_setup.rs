//! Mori CLI staging.
//!
//! The `mori` CLI scaffold lives under `connectors/mori-cli/` in the repo, but
//! a packaged desktop app cannot rely on that checkout path. This command
//! stages the CLI and the scripts it delegates to into `~/.mori/`:
//!
//! - `~/.mori/cli/mori.py`
//! - `~/.mori/local-capture/mori-local-capture.py`
//! - `~/.mori/codex-cli/mori-codex-wrapper.sh`
//! - `~/.mori/opencode-cli/mori-opencode-wrapper.sh`
//! - `~/.mori/terminal-helper/mori-capture.sh`
//! - `~/.mori/vscode-task/mori-tasks.json`
//!
//! Staging is an explicit local file copy. Mori does not edit shell rc files or
//! create a PATH symlink; the user still chooses whether to link / invoke it.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

const MORI_CLI: &str = include_str!("../../../connectors/mori-cli/mori.py");
const LOCAL_CAPTURE: &str = include_str!("../../../connectors/local-capture/mori-local-capture.py");
const CODEX_WRAPPER: &str = include_str!("../../../connectors/codex-cli/mori-codex-wrapper.sh");
const OPENCODE_WRAPPER: &str =
    include_str!("../../../connectors/opencode-cli/mori-opencode-wrapper.sh");
const TERMINAL_HELPER: &str = include_str!("../../../connectors/terminal-helper/mori-capture.sh");
const VSCODE_TASKS: &str = include_str!("../../../connectors/vscode-task/mori-tasks.json");
const TEMPLATE_LOCAL_CAPTURE_PATH: &str =
    "${env:HOME}/Dev/Projects/mori/connectors/local-capture/mori-local-capture.py";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MoriCliStagedFile {
    pub label: String,
    pub path: String,
    pub wrote: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MoriCliStaged {
    pub root_path: String,
    pub cli_path: String,
    pub files: Vec<MoriCliStagedFile>,
    pub wrote_count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExplicitEmittersStaged {
    pub root_path: String,
    pub local_capture_path: String,
    pub terminal_helper_path: String,
    pub vscode_tasks_path: String,
    pub files: Vec<MoriCliStagedFile>,
    pub wrote_count: usize,
}

#[tauri::command]
pub fn stage_mori_cli() -> Result<MoriCliStaged, String> {
    let root = crate::agent_paths::require(crate::agent_paths::mori_home_dir(), "Mori home")?;
    stage_to(&root)
}

#[tauri::command]
pub fn mori_cli_target_path() -> Result<String, String> {
    let root = crate::agent_paths::require(crate::agent_paths::mori_home_dir(), "Mori home")?;
    Ok(root
        .join("cli")
        .join("mori.py")
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
pub fn stage_explicit_emitters() -> Result<ExplicitEmittersStaged, String> {
    let root = crate::agent_paths::require(crate::agent_paths::mori_home_dir(), "Mori home")?;
    stage_emitters_to(&root)
}

pub(crate) fn stage_to(root: &Path) -> Result<MoriCliStaged, String> {
    let files = vec![
        stage_file(root, "mori", &["cli", "mori.py"], MORI_CLI)?,
        stage_file(
            root,
            "local-capture",
            &["local-capture", "mori-local-capture.py"],
            LOCAL_CAPTURE,
        )?,
        stage_file(
            root,
            "codex-wrapper",
            &["codex-cli", "mori-codex-wrapper.sh"],
            CODEX_WRAPPER,
        )?,
        stage_file(
            root,
            "opencode-wrapper",
            &["opencode-cli", "mori-opencode-wrapper.sh"],
            OPENCODE_WRAPPER,
        )?,
    ];
    let wrote_count = files.iter().filter(|file| file.wrote).count();
    Ok(MoriCliStaged {
        root_path: root.to_string_lossy().to_string(),
        cli_path: root
            .join("cli")
            .join("mori.py")
            .to_string_lossy()
            .to_string(),
        files,
        wrote_count,
    })
}

pub(crate) fn stage_emitters_to(root: &Path) -> Result<ExplicitEmittersStaged, String> {
    let local_capture_path = join(root, &["local-capture", "mori-local-capture.py"]);
    let local_capture_string = local_capture_path.to_string_lossy().to_string();
    let terminal_helper = build_terminal_helper(&local_capture_string);
    let vscode_tasks = build_vscode_tasks(&local_capture_string)?;
    let files = vec![
        stage_file(
            root,
            "local-capture",
            &["local-capture", "mori-local-capture.py"],
            LOCAL_CAPTURE,
        )?,
        stage_file(
            root,
            "terminal-helper",
            &["terminal-helper", "mori-capture.sh"],
            &terminal_helper,
        )?,
        stage_file(
            root,
            "vscode-tasks",
            &["vscode-task", "mori-tasks.json"],
            &vscode_tasks,
        )?,
    ];
    let wrote_count = files.iter().filter(|file| file.wrote).count();
    Ok(ExplicitEmittersStaged {
        root_path: root.to_string_lossy().to_string(),
        local_capture_path: local_capture_string,
        terminal_helper_path: root
            .join("terminal-helper")
            .join("mori-capture.sh")
            .to_string_lossy()
            .to_string(),
        vscode_tasks_path: root
            .join("vscode-task")
            .join("mori-tasks.json")
            .to_string_lossy()
            .to_string(),
        files,
        wrote_count,
    })
}

fn build_terminal_helper(local_capture_path: &str) -> String {
    TERMINAL_HELPER.replace(
        r#"MORI_LOCAL_CAPTURE="${MORI_LOCAL_CAPTURE:-$HOME/Dev/Projects/mori/connectors/local-capture/mori-local-capture.py}""#,
        &format!(
            r#"MORI_LOCAL_CAPTURE="${{MORI_LOCAL_CAPTURE:-{}}}""#,
            escape_shell_default(local_capture_path)
        ),
    )
}

fn build_vscode_tasks(local_capture_path: &str) -> Result<String, String> {
    let replacement = serde_json::to_string(local_capture_path)
        .map_err(|error| format!("Failed to encode VS Code task path: {error}"))?;
    Ok(VSCODE_TASKS.replace(
        &format!("\"{}\"", TEMPLATE_LOCAL_CAPTURE_PATH),
        &replacement,
    ))
}

fn escape_shell_default(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('$', "\\$")
        .replace('`', "\\`")
}

fn stage_file(
    root: &Path,
    label: &str,
    relative: &[&str],
    content: &str,
) -> Result<MoriCliStagedFile, String> {
    let path = join(root, relative);
    let parent = path
        .parent()
        .ok_or_else(|| format!("Failed to derive parent directory for {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    let current = fs::read_to_string(&path).ok();
    let wrote = if current.as_deref() == Some(content) {
        false
    } else {
        fs::write(&path, content)
            .map_err(|error| format!("Failed to write {}: {error}", path.display()))?;
        true
    };
    make_executable(&path)?;
    Ok(MoriCliStagedFile {
        label: label.to_string(),
        path: path.to_string_lossy().to_string(),
        wrote,
    })
}

fn join(root: &Path, parts: &[&str]) -> PathBuf {
    let mut out = root.to_path_buf();
    for part in parts {
        out.push(part);
    }
    out
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)
        .map_err(|error| format!("Failed to read permissions for {}: {error}", path.display()))?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions)
        .map_err(|error| format!("Failed to chmod {}: {error}", path.display()))
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn stages_cli_and_delegate_scripts() {
        let temp = TempDir::new().unwrap();
        let staged = stage_to(temp.path()).unwrap();
        assert_eq!(staged.files.len(), 4);
        assert_eq!(staged.wrote_count, 4);
        assert!(
            staged.cli_path.ends_with("cli/mori.py") || staged.cli_path.ends_with("cli\\mori.py")
        );
        for file in staged.files {
            assert!(PathBuf::from(file.path).exists());
            assert!(file.wrote);
        }
    }

    #[test]
    fn restaging_identical_content_is_idempotent() {
        let temp = TempDir::new().unwrap();
        let first = stage_to(temp.path()).unwrap();
        let second = stage_to(temp.path()).unwrap();
        assert_eq!(first.files.len(), second.files.len());
        assert_eq!(second.wrote_count, 0);
        assert!(second.files.iter().all(|file| !file.wrote));
    }

    #[test]
    fn stages_explicit_emitters_with_stable_local_capture_path() {
        let temp = TempDir::new().unwrap();
        let staged = stage_emitters_to(temp.path()).unwrap();
        assert_eq!(staged.files.len(), 3);
        assert_eq!(staged.wrote_count, 3);
        assert!(
            staged.terminal_helper_path.ends_with("terminal-helper/mori-capture.sh")
                || staged
                    .terminal_helper_path
                    .ends_with("terminal-helper\\mori-capture.sh")
        );
        assert!(
            staged.vscode_tasks_path.ends_with("vscode-task/mori-tasks.json")
                || staged.vscode_tasks_path.ends_with("vscode-task\\mori-tasks.json")
        );

        let terminal = std::fs::read_to_string(&staged.terminal_helper_path).unwrap();
        // The shell emitter holds the shell-escaped path (on Windows the temp
        // path has backslashes that escape_shell_default doubles), so assert
        // the escaped form rather than the raw path, which only coincides on
        // POSIX where there are no backslashes to escape.
        assert!(terminal.contains(&escape_shell_default(&staged.local_capture_path)));
        assert!(!terminal.contains("$HOME/Dev/Projects/mori"));

        let tasks = std::fs::read_to_string(&staged.vscode_tasks_path).unwrap();
        // The VS Code task holds the JSON-encoded path (backslashes doubled by
        // serde_json on Windows), so assert the JSON-encoded form.
        let json_path = serde_json::to_string(&staged.local_capture_path).unwrap();
        assert!(tasks.contains(&json_path));
        assert!(!tasks.contains(TEMPLATE_LOCAL_CAPTURE_PATH));
    }

    #[test]
    fn restaging_explicit_emitters_is_idempotent() {
        let temp = TempDir::new().unwrap();
        let first = stage_emitters_to(temp.path()).unwrap();
        let second = stage_emitters_to(temp.path()).unwrap();
        assert_eq!(first.files.len(), second.files.len());
        assert_eq!(second.wrote_count, 0);
        assert!(second.files.iter().all(|file| !file.wrote));
    }
}
