mod agent_paths;
mod agent_text;
mod antigravity;
mod browser_relay;
mod browser_relay_protocol;
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
mod language;
mod llm_endpoints;
mod llm_http;
mod llm_stream;
mod opencode;
mod package;
mod repositories;
mod session;
mod session_evidence;
mod repository_identity;
mod sqlite;

use tauri::Manager;

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

/// The chord that opens the language overlay over whatever app has focus.
///
/// Ctrl+Shift+E is unclaimed by Windows itself and by the editors and browsers
/// this is meant to be used over. Registration failure is non-fatal on purpose:
/// another app may already own the chord, and Mori must still start.
#[cfg(desktop)]
const LANGUAGE_SHORTCUT: &str = "CmdOrCtrl+Shift+E";

/// Register the one global shortcut the Language Loop uses.
///
/// This chord is the ENTIRE trigger surface for reading another app's text.
/// There is no watcher and no polling: without this keypress, Mori never looks
/// at a selection.
#[cfg(desktop)]
fn install_language_shortcut(app: &tauri::App) {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

    let shortcut = Shortcut::new(
        Some(Modifiers::CONTROL | Modifiers::SHIFT),
        Code::KeyE,
    );
    let handle = app.handle().clone();

    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |_app, triggered, event| {
            // Key-down only. Without this the chord fires twice, capturing once
            // on press and again on release.
            if event.state() != ShortcutState::Pressed || triggered != &shortcut {
                return;
            }
            let outcome = language::commands::capture_foreground_selection();
            let anchor = language::commands::anchor_of(&outcome);
            if let Err(error) = language::overlay::present(&handle, outcome, anchor) {
                eprintln!("language overlay failed to open: {error}");
            }
        })
        .build();

    if let Err(error) = app.handle().plugin(plugin) {
        eprintln!("global shortcut plugin unavailable: {error}");
        return;
    }
    // A chord another app already owns is a normal condition, not a crash. The
    // settings surface reads this back so the user is told rather than left
    // pressing a key that does nothing.
    if let Err(error) = tauri_plugin_global_shortcut::GlobalShortcutExt::global_shortcut(app)
        .register(shortcut)
    {
        eprintln!("could not register {LANGUAGE_SHORTCUT}: {error}");
    }
}

fn main() {
    install_panic_log_hook();
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            install_language_shortcut(app);
            #[cfg(desktop)]
            browser_relay::start_browser_observation_relay(
                app.handle().clone(),
                app.state::<browser_relay::BrowserRelayState>()
                    .inner()
                    .clone(),
            );
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(sqlite::SqliteState::default())
        .manage(llm_endpoints::LlmEndpointState::default())
        .manage(language::overlay::OverlayPlacement::default())
        .manage(llm_stream::LlmStreamState::default())
        .manage(browser_relay::BrowserRelayState::default())
        .invoke_handler(tauri::generate_handler![
            sqlite::append_browser_evidence,
            sqlite::list_recent_browser_evidence,
            sqlite::list_browser_evidence_page,
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
            sqlite::list_all_accepted_project_memories,
            sqlite::append_memory_review_action_rows,
            sqlite::list_memory_review_action_rows,
            sqlite::save_intake_request_rows,
            sqlite::list_intake_request_rows_for_session,
            sqlite::list_intake_request_rows_for_project,
            sqlite::list_all_intake_request_rows,
            sqlite::delete_intake_request_rows_for_session,
            sqlite::save_durable_document_rows,
            sqlite::get_durable_document_row,
            sqlite::list_durable_document_rows,
            sqlite::delete_durable_document_row,
            sqlite::persist_session_imports,
            sqlite::list_session_import_rows,
            sqlite::list_all_session_import_rows,
            sqlite::save_kernel_record_rows,
            sqlite::list_kernel_record_rows,
            sqlite::get_kernel_record_row,
            sqlite::delete_kernel_record_row,
            sqlite::search_kernel_record_rows,
            sqlite::save_kernel_object_rows,
            sqlite::list_kernel_object_rows,
            sqlite::delete_kernel_object_row,
            sqlite::append_kernel_revision_rows,
            sqlite::list_kernel_revision_rows,
            sqlite::clear_all_sqlite_data,
            sqlite::reset_sqlite_database,
            sqlite::list_sqlite_backups,
            sqlite::restore_sqlite_backup,
            git::diff::run_git_diff,
            git::verify::verify_repository_path,
            repositories::picker::pick_repository_directory,
            connectors::inbox::list_connector_jsonl_inbox,
            connectors::inbox::read_connector_jsonl_file,
            sqlite::write_lens_capability,
            sqlite::list_lens_transfers,
            sqlite::read_lens_transfer,
            sqlite::import_lens_transfer,
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
            claude::code::get_claude_code_session_window,
            files::resolve_file_locations,
            files::reveal_path_in_os,
            llm_http::llm_http_request,
            llm_stream::llm_http_stream,
            llm_stream::cancel_llm_stream,
            llm_endpoints::set_llm_allowed_endpoints,
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
            browser_relay::claim_browser_observation_relay_requests,
            browser_relay::ack_browser_observation_relay,
            language::commands::capture_foreground_selection,
            language::commands::capture_selection_via_clipboard,
            language::commands::language_capture_supported,
            language::commands::open_language_overlay,
            language::commands::close_language_overlay,
            language::commands::set_language_overlay_pinned,
            language::commands::recapture_language_selection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mori desktop shell");
}
