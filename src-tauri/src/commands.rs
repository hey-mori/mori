use serde::Serialize;
use tauri_plugin_notification::NotificationExt;

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

/// Show one OS-native notification. Mori wraps the notification plugin's Rust
/// API in its own command (the same pattern as `pick_repository_directory`
/// wraps the dialog plugin), so the frontend invokes it like any other Mori
/// command — no JS plugin package and no capability wiring. Only the gated,
/// de-duplicated payloads from `selectOsNotifications` ever reach here, so this
/// is not a spam surface; the policy lives in the frontend.
#[tauri::command]
pub fn send_os_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|error| error.to_string())
}

/// Host OS family, so the frontend picks OS-correct launchers (e.g. the Claude
/// hook command, python on Windows vs the .sh launcher on POSIX) from an
/// authoritative compile-time signal instead of inferring the OS from the
/// shape of a resolved path. Returns `std::env::consts::OS`: "windows",
/// "macos", "linux", and so on.
#[tauri::command]
pub fn host_platform() -> String {
    std::env::consts::OS.to_string()
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
