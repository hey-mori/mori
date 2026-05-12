use serde::Serialize;

#[derive(Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
}

#[derive(Serialize)]
pub struct StorageLocation {
    pub path: String,
    pub exists: bool,
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: "Mori".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        identifier: "app.mori.desktop".to_string(),
    }
}

#[tauri::command]
pub fn get_storage_location() -> Result<StorageLocation, String> {
    let path = crate::package::default_storage_dir()?;
    let exists = path.exists();
    std::fs::create_dir_all(&path).map_err(|error| error.to_string())?;

    Ok(StorageLocation {
        path: path.to_string_lossy().to_string(),
        exists,
    })
}
