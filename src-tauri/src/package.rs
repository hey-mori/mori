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

/// Save a real `.mori` zip package through a native Save As dialog.
/// `package_bytes` is the zip archive produced by `zipMoriPackage` on
/// the frontend. Returns `cancelled: true` when the user dismisses the
/// dialog. Writes a `.mori` file (not `.mori.json`).
#[tauri::command]
pub fn save_mori_package_zip_as(
    app: AppHandle,
    package_bytes: Vec<u8>,
    suggested_filename: Option<String>,
) -> Result<SavedMoriPackageDialog, String> {
    if package_bytes.is_empty() {
        return Err("Empty .mori package — nothing to save.".to_string());
    }

    let filename = resolve_zip_package_filename(suggested_filename);
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
            fs::write(&path, &package_bytes).map_err(|error| error.to_string())?;
            Ok(SavedMoriPackageDialog {
                path: Some(path),
                bytes_written: package_bytes.len(),
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedMoriPackageFile {
    /// Absolute path the user chose, or `None` when the dialog was cancelled.
    pub path: Option<String>,
    pub cancelled: bool,
}

/// Open a native file picker so the user can choose a `.mori v0`
/// package to import. Returns `cancelled: true` when the dialog is
/// dismissed so the frontend can tell "user said no" from an error.
/// This only opens a single picker — the file is read separately via
/// `open_mori_package_json`, and imported memory still enters review.
#[tauri::command]
pub fn pick_mori_package_file(app: AppHandle) -> Result<PickedMoriPackageFile, String> {
    let mut builder = app.dialog().file();
    if let Ok(dir) = default_storage_dir() {
        if dir.is_dir() {
            builder = builder.set_directory(dir);
        }
    }

    let (tx, rx) = mpsc::channel();
    builder.pick_file(move |selection| {
        let _ = tx.send(selection.map(|file_path| file_path.to_string()));
    });

    match rx.recv_timeout(Duration::from_secs(600)) {
        Ok(Some(path)) => Ok(PickedMoriPackageFile {
            path: Some(path),
            cancelled: false,
        }),
        Ok(None) => Ok(PickedMoriPackageFile {
            path: None,
            cancelled: true,
        }),
        Err(_) => Err("Open dialog timed out without a response.".to_string()),
    }
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

fn default_zip_package_filename() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("mori-package-{timestamp}.mori")
}

/// Resolve the `.mori` filename for a real zip package save: sanitise
/// the suggested name and force a single `.mori` extension, or fall
/// back to a timestamped default.
fn resolve_zip_package_filename(suggested: Option<String>) -> String {
    suggested
        .map(sanitize_filename)
        .filter(|value| !value.is_empty())
        .map(|value| ensure_mori_extension(&value))
        .unwrap_or_else(default_zip_package_filename)
}

fn ensure_mori_extension(filename: &str) -> String {
    if filename.ends_with(".mori") {
        filename.to_string()
    } else if filename.ends_with(".mori.json") {
        filename.trim_end_matches(".json").to_string()
    } else if filename.ends_with(".json") {
        format!("{}.mori", filename.trim_end_matches(".json"))
    } else {
        format!("{filename}.mori")
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
    use super::{
        ensure_mori_extension, ensure_mori_json_extension, resolve_package_filename,
        resolve_zip_package_filename, sanitize_filename,
    };

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

    #[test]
    fn enforces_a_single_mori_extension_for_zip_packages() {
        assert_eq!(ensure_mori_extension("session"), "session.mori");
        assert_eq!(ensure_mori_extension("session.mori"), "session.mori");
        assert_eq!(ensure_mori_extension("session.json"), "session.mori");
        assert_eq!(ensure_mori_extension("session.mori.json"), "session.mori");
    }

    #[test]
    fn resolves_a_zip_package_filename() {
        assert_eq!(
            resolve_zip_package_filename(Some("my session".to_string())),
            "my session.mori"
        );
        assert!(resolve_zip_package_filename(None).ends_with(".mori"));
        assert!(!resolve_zip_package_filename(None).ends_with(".mori.json"));
    }
}
