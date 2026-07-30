//! Explicit copy-on-invoke fallback for apps with no UI Automation Text pattern.
//!
//! This path is never automatic. UI Automation runs first; only when it returns
//! nothing does the overlay offer a button, and only pressing that button gets
//! here. The reason for the friction is that this fallback is strictly more
//! invasive than reading a selection: it synthesises Ctrl+C into whatever is
//! focused and briefly takes over the clipboard.
//!
//! The three rules that make it acceptable:
//!  1. Secure input is re-checked immediately before the keystroke, because
//!     focus can move between the first capture and the user's retry.
//!  2. The user's existing clipboard is captured before and restored after, so
//!     using Mori never costs someone the thing they had copied.
//!  3. The result reports `clipboard-on-invoke`, so the panel always shows that
//!     this path was used rather than presenting it as a clean read.

use std::thread::sleep;
use std::time::Duration;

use windows::Win32::Foundation::{HANDLE, HGLOBAL, HWND};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber, OpenClipboard,
    SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    VIRTUAL_KEY, VK_C, VK_CONTROL,
};
use windows::Win32::System::Ole::CF_UNICODETEXT;

use super::capture::{acquired_by, CaptureOutcome, RawCapture};

/// How long to wait for the focused app to answer a synthetic Ctrl+C. Polled in
/// short steps rather than slept through, so a fast app returns immediately and
/// a slow one still gets its chance.
const COPY_TIMEOUT: Duration = Duration::from_millis(400);
const COPY_POLL_STEP: Duration = Duration::from_millis(20);

/// Open the clipboard, retrying briefly: another process can hold it open for a
/// few milliseconds, and failing the whole fallback for that would be flaky.
fn open_clipboard() -> bool {
    for _ in 0..10 {
        // SAFETY: a null owner window is documented and valid here.
        if unsafe { OpenClipboard(Some(HWND::default())) }.is_ok() {
            return true;
        }
        sleep(Duration::from_millis(10));
    }
    false
}

/// Read the clipboard's Unicode text, if it currently holds any.
///
/// # Safety
/// The clipboard must already be open on this thread.
unsafe fn read_unicode_text() -> Option<String> {
    let handle = GetClipboardData(CF_UNICODETEXT.0 as u32).ok()?;
    if handle.0.is_null() {
        return None;
    }
    let global = HGLOBAL(handle.0);
    let pointer = GlobalLock(global) as *const u16;
    if pointer.is_null() {
        return None;
    }
    // GlobalSize is a byte count; the buffer is UTF-16 and NUL terminated.
    let capacity = GlobalSize(global) / 2;
    let mut length = 0usize;
    while length < capacity && *pointer.add(length) != 0 {
        length += 1;
    }
    let text = String::from_utf16_lossy(std::slice::from_raw_parts(pointer, length));
    let _ = GlobalUnlock(global);
    Some(text)
}

/// Put Unicode text back on the clipboard.
///
/// # Safety
/// The clipboard must already be open on this thread. Ownership of the
/// allocation transfers to the system on success, so it must not be freed here.
unsafe fn write_unicode_text(text: &str) -> bool {
    let mut utf16: Vec<u16> = text.encode_utf16().collect();
    utf16.push(0);
    let bytes = utf16.len() * 2;

    let Ok(global) = GlobalAlloc(GMEM_MOVEABLE, bytes) else {
        return false;
    };
    let pointer = GlobalLock(global) as *mut u16;
    if pointer.is_null() {
        return false;
    }
    std::ptr::copy_nonoverlapping(utf16.as_ptr(), pointer, utf16.len());
    let _ = GlobalUnlock(global);

    if EmptyClipboard().is_err() {
        return false;
    }
    // On success the system owns `global`; on failure we leak one small buffer
    // rather than risk freeing memory the clipboard may already have taken.
    SetClipboardData(CF_UNICODETEXT.0 as u32, Some(HANDLE(global.0))).is_ok()
}

/// Send Ctrl+C to the focused window.
fn send_copy_chord() -> bool {
    fn key(code: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: code,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    let inputs = [
        key(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
        key(VK_C, KEYBD_EVENT_FLAGS(0)),
        key(VK_C, KEYEVENTF_KEYUP),
        key(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    // SAFETY: a well-formed INPUT array with the documented struct size.
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    sent as usize == inputs.len()
}

/// Run the explicit clipboard fallback.
///
/// Returns `None` when the caller must not proceed (secure input) or when the
/// focused app produced nothing, so the overlay can keep showing the honest
/// direct-input composer instead of a fabricated result.
pub fn capture_via_clipboard() -> CaptureOutcome {
    let (context, anchor) = super::capture_windows::observe_context_and_anchor();

    // Re-checked here, not inherited from the earlier capture: focus may have
    // moved, and a synthetic Ctrl+C into a password field must be impossible.
    if super::capture_windows::focused_element_is_secure() {
        return CaptureOutcome::SecureInput { context };
    }

    if !open_clipboard() {
        return CaptureOutcome::NoSelection { context, anchor };
    }
    // SAFETY: the clipboard is open for the duration of this block.
    let previous = unsafe { read_unicode_text() };
    // SAFETY: balanced with the successful `open_clipboard` above.
    let _ = unsafe { CloseClipboard() };

    // SAFETY: no arguments; returns a monotonically increasing counter.
    let before = unsafe { GetClipboardSequenceNumber() };

    if !send_copy_chord() {
        return CaptureOutcome::NoSelection { context, anchor };
    }

    // Wait for the app to answer, detected by the clipboard changing rather than
    // by a fixed sleep, so a fast app is not made to feel slow.
    let mut waited = Duration::ZERO;
    let mut changed = false;
    while waited < COPY_TIMEOUT {
        sleep(COPY_POLL_STEP);
        waited += COPY_POLL_STEP;
        // SAFETY: same counter read as above.
        if unsafe { GetClipboardSequenceNumber() } != before {
            changed = true;
            break;
        }
    }

    let copied = if changed && open_clipboard() {
        // SAFETY: the clipboard is open for the duration of this block.
        let value = unsafe { read_unicode_text() };
        let _ = unsafe { CloseClipboard() };
        value
    } else {
        None
    };

    // Restore whatever the user had, whether or not the copy worked. Skipped
    // only when nothing changed, so an untouched clipboard is left alone.
    if changed {
        if let Some(original) = previous {
            if open_clipboard() {
                // SAFETY: the clipboard is open for the duration of this block.
                unsafe { write_unicode_text(&original) };
                let _ = unsafe { CloseClipboard() };
            }
        }
    }

    super::capture::classify(RawCapture {
        text: copied,
        context,
        anchor,
        acquired_by: acquired_by::CLIPBOARD_ON_INVOKE,
        ..Default::default()
    })
}
