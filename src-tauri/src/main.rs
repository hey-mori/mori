mod commands;
mod migrations;
mod package;
mod session;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::get_storage_location,
            package::save_mori_package_json,
            package::open_mori_package_json,
            package::list_recent_mori_packages,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mori desktop shell");
}
