//! Tauri boundary for the Language Loop.
//!
//! Deliberately thin: no product rules live here. Each command selects the
//! platform adapter, hands the raw read to `capture::classify`, and returns the
//! outcome. Nothing in this file logs captured text, and no command persists
//! anything, because running an action must never create durable content.

use tauri::{AppHandle, Manager};

use super::capture::CaptureOutcome;
use super::overlay;

/// Read the current selection from the focused app.
///
/// Invoked from the global-shortcut handler and, for the in-app "다시 읽기"
/// control, from the overlay itself. Never on a timer.
#[tauri::command]
pub fn capture_foreground_selection() -> CaptureOutcome {
    #[cfg(windows)]
    {
        super::capture_windows::capture_selection()
    }
    #[cfg(not(windows))]
    {
        // No adapter compiled for this platform. Reported honestly so the
        // overlay opens on direct input instead of claiming a failure.
        super::capture::unsupported_outcome()
    }
}

/// The explicit copy-on-invoke fallback, only reachable from a user gesture.
#[tauri::command]
pub fn capture_selection_via_clipboard() -> CaptureOutcome {
    #[cfg(windows)]
    {
        super::clipboard_windows::capture_via_clipboard()
    }
    #[cfg(not(windows))]
    {
        super::capture::unsupported_outcome()
    }
}

/// Whether a native capture adapter exists on this build. The settings surface
/// uses this to describe the global shortcut honestly rather than offering a
/// control that cannot work.
#[tauri::command]
pub fn language_capture_supported() -> bool {
    cfg!(windows)
}

/// Hide the overlay and return focus to the app the user came from.
#[tauri::command]
pub fn close_language_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(overlay::OVERLAY_LABEL) {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Open the overlay from inside Mori, using the same path the shortcut uses.
/// Exists so the in-app command palette and the global chord cannot drift.
#[tauri::command]
pub fn open_language_overlay(app: AppHandle) -> Result<(), String> {
    let outcome = capture_foreground_selection();
    let anchor = anchor_of(&outcome);
    overlay::present(&app, outcome, anchor).map_err(|error| error.to_string())
}

/// The anchor an outcome observed, if any.
pub fn anchor_of(outcome: &CaptureOutcome) -> Option<super::capture::AnchorPoint> {
    match outcome {
        CaptureOutcome::Selection { anchor, .. } | CaptureOutcome::NoSelection { anchor, .. } => {
            *anchor
        }
        _ => None,
    }
}
