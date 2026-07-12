mod agent_paths;
mod antigravity;
mod claude;
mod cline;
mod codex;
mod cursor;
mod commands;
mod continue_agent;
mod connectors;
mod db;
mod files;
mod git;
mod llm_http;
mod opencode;
mod package;
mod repositories;
mod session;
mod sqlite;

/// Append Rust panics to `~/.mori/logs/panic.log` so a desktop crash leaves
/// a local trace the user can attach to a bug report (local-first: no remote
/// telemetry). Best-effort on purpose: the hook must never panic itself, and
/// the default hook still runs afterwards so stderr behaviour is unchanged.
fn install_panic_log_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(dir) = agent_paths::home_dir().map(|home| home.join(".mori").join("logs")) {
            if std::fs::create_dir_all(&dir).is_ok() {
                let location = info
                    .location()
                    .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
                    .unwrap_or_else(|| "unknown location".to_string());
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs().to_string())
                    .unwrap_or_else(|_| "0".to_string());
                let line = format!("[{timestamp}] panic at {location}: {info}\n");
                use std::io::Write;
                if let Ok(mut file) = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(dir.join("panic.log"))
                {
                    let _ = file.write_all(line.as_bytes());
                }
            }
        }
        default_hook(info);
    }));
}

fn main() {
    install_panic_log_hook();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(sqlite::SqliteState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::host_platform,
            commands::send_os_notification,
            commands::get_storage_location,
            sqlite::set_storage_location,
            package::save_mori_package_json,
            package::save_mori_package_json_as,
            package::save_mori_package_zip_as,
            package::open_mori_package_json,
            package::read_mori_package_file,
            package::pick_mori_package_file,
            package::list_recent_mori_packages,
            sqlite::get_sqlite_migration_status,
            sqlite::initialize_sqlite_database,
            sqlite::persist_session_snapshot,
            sqlite::load_sqlite_session_snapshot,
            sqlite::list_sqlite_sessions,
            sqlite::save_accepted_project_memories,
            sqlite::list_accepted_project_memories,
            sqlite::append_memory_review_action_rows,
            sqlite::list_memory_review_action_rows,
            sqlite::persist_session_imports,
            sqlite::list_session_import_rows,
            sqlite::list_all_session_import_rows,
            sqlite::clear_all_sqlite_data,
            sqlite::reset_sqlite_database,
            sqlite::list_sqlite_backups,
            sqlite::restore_sqlite_backup,
            git::diff::run_git_diff,
            git::verify::verify_repository_path,
            repositories::picker::pick_repository_directory,
            connectors::inbox::list_connector_jsonl_inbox,
            connectors::inbox::read_connector_jsonl_file,
            connectors::installer::detect_connector_status,
            connectors::cli_setup::stage_mori_cli,
            connectors::cli_setup::mori_cli_target_path,
            connectors::cli_setup::stage_explicit_emitters,
            connectors::mcp_setup::stage_mcp_server,
            connectors::mcp_setup::mcp_server_target_path,
            connectors::installer::install_claude_hook,
            connectors::installer::uninstall_claude_hook,
            claude::desktop::discover_claude_desktop,
            claude::desktop::list_claude_desktop_conversations,
            claude::desktop::get_claude_desktop_conversation,
            claude::code::discover_claude_code_sessions,
            claude::code::get_claude_code_session,
            claude::code::get_claude_code_session_delta,
            files::resolve_file_locations,
            files::reveal_path_in_os,
            llm_http::llm_http_request,
            claude::installations::discover_local_ai_tools,
            codex::sessions::discover_codex_sessions,
            codex::sessions::get_codex_session,
            antigravity::sessions::discover_antigravity_sessions,
            antigravity::sessions::get_antigravity_session,
            opencode::sessions::discover_opencode_sessions,
            opencode::sessions::get_opencode_session,
            continue_agent::sessions::discover_continue_sessions,
            continue_agent::sessions::get_continue_session,
            cline::sessions::discover_cline_sessions,
            cline::sessions::get_cline_session,
            cursor::sessions::discover_cursor_sessions,
            cursor::sessions::get_cursor_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mori desktop shell");
}
