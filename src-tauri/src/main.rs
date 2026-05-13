mod commands;
mod db;
mod git;
mod package;
mod repositories;
mod session;
mod sqlite;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(sqlite::SqliteState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::get_storage_location,
            package::save_mori_package_json,
            package::open_mori_package_json,
            package::list_recent_mori_packages,
            sqlite::get_sqlite_migration_status,
            sqlite::initialize_sqlite_database,
            sqlite::persist_session_snapshot,
            sqlite::load_sqlite_session_snapshot,
            sqlite::list_sqlite_sessions,
            git::diff::run_git_diff,
            git::verify::verify_repository_path,
            repositories::picker::pick_repository_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mori desktop shell");
}
