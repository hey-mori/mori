use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PickRepositoryDirectoryInput {
    pub initial_directory: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickRepositoryDirectoryOutput {
    pub path: Option<String>,
    pub cancelled: bool,
}

/// Open a native directory picker so the user can explicitly choose a
/// repository path. Returns `cancelled: true` and `path: None` when the user
/// dismisses the dialog so the frontend can distinguish "user said no" from
/// "system error".
///
/// Privacy notes:
/// - Mori never scans directories. This command opens a *single* picker,
///   returns the absolute path of the directory the user chooses, and that
///   path is only stored in the repository settings once the user explicitly
///   saves it from the UI.
/// - No child directories are read here. Reads happen later through
///   `run_git_diff` once the user runs a Git diff capture.
#[tauri::command]
pub fn pick_repository_directory(
    app: AppHandle,
    input: Option<PickRepositoryDirectoryInput>,
) -> Result<PickRepositoryDirectoryOutput, String> {
    let opts = input.unwrap_or_default();
    let mut builder = app.dialog().file();
    if let Some(title) = opts.title.as_deref().filter(|value| !value.trim().is_empty()) {
        builder = builder.set_title(title);
    }
    if let Some(initial) = opts.initial_directory.as_deref().filter(|value| !value.trim().is_empty()) {
        let initial_path = PathBuf::from(initial);
        if initial_path.exists() && initial_path.is_dir() {
            builder = builder.set_directory(initial_path);
        }
    }

    let (tx, rx) = mpsc::channel();
    builder.pick_folder(move |selection| {
        // Mori only forwards the absolute path string; the FilePath enum may
        // carry a Path or a Uri depending on the platform, and the dialog
        // plugin already normalizes those for us via Display.
        let value = selection.map(|file_path| file_path.to_string());
        let _ = tx.send(value);
    });

    // The dialog plugin spawns the picker on a UI thread and calls back on
    // close. We block the invoke thread for the result with a generous
    // timeout so a hung dialog cannot leak. 10 minutes mirrors a user who
    // walked away from the picker — anything longer is treated as cancelled.
    match rx.recv_timeout(Duration::from_secs(600)) {
        Ok(Some(path)) => Ok(PickRepositoryDirectoryOutput {
            path: Some(path),
            cancelled: false,
        }),
        Ok(None) => Ok(PickRepositoryDirectoryOutput {
            path: None,
            cancelled: true,
        }),
        Err(_) => Err("Directory picker timed out without a response.".to_string()),
    }
}
