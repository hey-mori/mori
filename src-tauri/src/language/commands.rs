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

/// Pin or unpin the overlay's position.
///
/// Pinned, it stays where the user dragged it; unpinned, each capture re-anchors
/// it next to the selection. Both are right in different workflows, so this is a
/// choice rather than a guess.
#[tauri::command]
pub fn set_language_overlay_pinned(app: AppHandle, pinned: bool) {
    if let Some(state) = app.try_state::<overlay::OverlayPlacement>() {
        state.set_pinned(pinned);
    }
}

/// Re-read the selection while the overlay is already open.
///
/// The overlay takes focus when it appears, so this deliberately does NOT read
/// the focused element: it would read the overlay itself. The caller hides the
/// window first, which returns focus to the app underneath, and only then reads.
#[tauri::command]
pub fn recapture_language_selection(app: AppHandle) -> Result<CaptureOutcome, String> {
    let window = app
        .get_webview_window(overlay::OVERLAY_LABEL)
        .ok_or_else(|| "overlay window is not open".to_string())?;

    window.hide().map_err(|error| error.to_string())?;
    // Give the OS a moment to move focus back before asking what is focused.
    std::thread::sleep(std::time::Duration::from_millis(120));

    let outcome = capture_foreground_selection();
    let anchor = anchor_of(&outcome);
    overlay::present(&app, outcome.clone(), anchor).map_err(|error| error.to_string())?;
    Ok(outcome)
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
