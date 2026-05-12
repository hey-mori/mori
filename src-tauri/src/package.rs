use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
pub struct SavedMoriPackage {
    pub path: String,
    pub bytes_written: usize,
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

    let filename = suggested_filename
        .map(sanitize_filename)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(default_package_filename);
    let path = storage_dir.join(ensure_mori_json_extension(&filename));

    fs::write(&path, serialized_package.as_bytes()).map_err(|error| error.to_string())?;

    Ok(SavedMoriPackage {
        path: path.to_string_lossy().to_string(),
        bytes_written: serialized_package.len(),
    })
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
    use super::{ensure_mori_json_extension, sanitize_filename};

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
}
