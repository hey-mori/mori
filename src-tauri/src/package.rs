use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
pub struct SavedMoriPackage {
    pub path: String,
    pub bytes_written: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedMoriPackageDialog {
    /// Absolute path written, or `None` when the user cancelled.
    pub path: Option<String>,
    pub bytes_written: usize,
    pub cancelled: bool,
}

#[derive(Serialize)]
pub struct RecentMoriPackage {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn save_mori_package_json(
    serialized_package: String,
    suggested_filename: Option<String>,
) -> Result<SavedMoriPackage, String> {
    serde_json::from_str::<serde_json::Value>(&serialized_package)
        .map_err(|error| format!("Invalid .mori JSON package: {error}"))?;

    let storage_dir = default_storage_dir()?;
    fs::create_dir_all(&storage_dir).map_err(|error| error.to_string())?;

    let path = storage_dir.join(resolve_package_filename(suggested_filename));

    fs::write(&path, serialized_package.as_bytes()).map_err(|error| error.to_string())?;

    Ok(SavedMoriPackage {
        path: path.to_string_lossy().to_string(),
        bytes_written: serialized_package.len(),
    })
}

/// Save a `.mori v0` package through a native Save As dialog so the user
/// chooses where the file lands. Returns `cancelled: true` when the user
/// dismisses the dialog, so the frontend can distinguish "user said no"
/// from a real error. The browser build keeps its blob-download path.
#[tauri::command]
pub fn save_mori_package_json_as(
    app: AppHandle,
    serialized_package: String,
    suggested_filename: Option<String>,
) -> Result<SavedMoriPackageDialog, String> {
    serde_json::from_str::<serde_json::Value>(&serialized_package)
        .map_err(|error| format!("Invalid .mori JSON package: {error}"))?;

    let filename = resolve_package_filename(suggested_filename);
    let mut builder = app.dialog().file().set_file_name(&filename);
    if let Ok(dir) = default_storage_dir() {
        let _ = fs::create_dir_all(&dir);
        if dir.is_dir() {
            builder = builder.set_directory(dir);
        }
    }

    let (tx, rx) = mpsc::channel();
    builder.save_file(move |selection| {
        let _ = tx.send(selection.map(|file_path| file_path.to_string()));
    });

    match rx.recv_timeout(Duration::from_secs(600)) {
        Ok(Some(path)) => {
            fs::write(&path, serialized_package.as_bytes())
                .map_err(|error| error.to_string())?;
            Ok(SavedMoriPackageDialog {
                path: Some(path),
                bytes_written: serialized_package.len(),
                cancelled: false,
            })
        }
        Ok(None) => Ok(SavedMoriPackageDialog {
            path: None,
            bytes_written: 0,
            cancelled: true,
        }),
        Err(_) => Err("Save dialog timed out without a response.".to_string()),
    }
}

#[tauri::command]
pub fn open_mori_package_json(path: String) -> Result<String, String> {
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|error| format!("Invalid .mori JSON package: {error}"))?;
    Ok(contents)
}

#[tauri::command]
pub fn list_recent_mori_packages() -> Result<Vec<RecentMoriPackage>, String> {
    let storage_dir = default_storage_dir()?;
    if !storage_dir.exists() {
        return Ok(Vec::new());
    }

    let mut packages = Vec::new();
    for entry in fs::read_dir(storage_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let Some(filename) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        if !filename.ends_with(".mori.json") {
            continue;
        }

        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        packages.push(RecentMoriPackage {
            path: path.to_string_lossy().to_string(),
            filename: filename.to_string(),
            size_bytes: metadata.len(),
        });
    }

    packages.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(packages)
}

pub fn default_storage_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "Unable to determine home directory for Mori storage".to_string())?;

    Ok(home.join("Mori").join("Records"))
}

fn default_package_filename() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("mori-package-{timestamp}.mori.json")
}

/// Resolve the `.mori.json` filename for a save: sanitise the suggested
/// name and force the extension, or fall back to a timestamped default.
fn resolve_package_filename(suggested: Option<String>) -> String {
    suggested
        .map(sanitize_filename)
        .filter(|value| !value.is_empty())
        .map(|value| ensure_mori_json_extension(&value))
        .unwrap_or_else(default_package_filename)
}

fn ensure_mori_json_extension(filename: &str) -> String {
    if filename.ends_with(".mori.json") {
        filename.to_string()
    } else if filename.ends_with(".json") {
        filename.replace(".json", ".mori.json")
    } else {
        format!("{filename}.mori.json")
    }
}

fn sanitize_filename(filename: String) -> String {
    filename
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => character,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::{ensure_mori_json_extension, resolve_package_filename, sanitize_filename};

    #[test]
    fn enforces_mori_json_extension() {
        assert_eq!(ensure_mori_json_extension("session"), "session.mori.json");
        assert_eq!(ensure_mori_json_extension("session.json"), "session.mori.json");
        assert_eq!(ensure_mori_json_extension("session.mori.json"), "session.mori.json");
    }

    #[test]
    fn sanitizes_filename() {
        assert_eq!(sanitize_filename("a/b:c.json".to_string()), "a-b-c.json");
    }

    #[test]
    fn resolves_a_suggested_filename_with_the_mori_extension() {
        assert_eq!(
            resolve_package_filename(Some("my session".to_string())),
            "my session.mori.json"
        );
        assert_eq!(
            resolve_package_filename(Some("a/b:c".to_string())),
            "a-b-c.mori.json"
        );
    }

    #[test]
    fn resolves_a_default_filename_when_none_is_suggested() {
        assert!(resolve_package_filename(None).ends_with(".mori.json"));
        assert!(resolve_package_filename(Some("   ".to_string())).ends_with(".mori.json"));
    }
}
