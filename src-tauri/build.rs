fn main() {
    ensure_browser_native_host_sidecar_placeholder();
    tauri_build::build()
}

fn ensure_browser_native_host_sidecar_placeholder() {
    let Ok(target) = std::env::var("TARGET") else {
        return;
    };
    let extension = if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        ".exe"
    } else {
        ""
    };
    let path = std::path::Path::new("binaries")
        .join(format!("mori-browser-native-host-{target}{extension}"));
    if path.exists() {
        return;
    }
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, []);
}
