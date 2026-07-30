//! Windows selection capture via UI Automation.
//!
//! Everything platform-specific about reading another app's selection lives
//! here. It produces a [`RawCapture`] and hands it to `capture::classify`, so
//! the product rules (secure input wins, no text degrades to direct input) stay
//! in one tested place instead of being re-decided inside COM code.
//!
//! Threading: UI Automation is COM, and a Tauri command runs on a worker thread
//! whose apartment we do not own. Every entry point therefore initialises COM
//! for the duration of the call and tolerates `RPC_E_CHANGED_MODE`, which means
//! the thread was already in a usable apartment.
//!
//! This module is invoked ONLY from the global-shortcut handler. There is no
//! timer, no focus subscription, and no UI Automation event handler registered
//! anywhere: Mori reads a selection when the user asks and at no other time.

use windows::core::{Interface, BSTR, PWSTR};
use windows::Win32::Foundation::{
    CloseHandle, HANDLE, HWND, LPARAM, MAX_PATH, POINT, WPARAM,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTextPattern, UIA_TextPatternId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    SendMessageTimeoutW, OBJID_CLIENT, SMTO_ABORTIFHUNG, WM_GETOBJECT,
};

use super::capture::{acquired_by, AnchorPoint, CaptureOutcome, ObservedContext, RawCapture};

/// Initialise COM for this call and undo it on drop, so an early `?` can never
/// leave the worker thread in an apartment Mori created.
struct ComScope {
    owned: bool,
}

impl ComScope {
    fn enter() -> Self {
        // SAFETY: matched by `CoUninitialize` in `Drop`, and only when this call
        // is the one that initialised the apartment.
        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        // S_FALSE means COM was already initialised on this thread and our
        // uninitialise is still required. RPC_E_CHANGED_MODE means someone else
        // owns a different apartment: usable, but not ours to tear down.
        ComScope {
            owned: hr.is_ok() || hr == windows::Win32::Foundation::S_FALSE,
        }
    }
}

impl Drop for ComScope {
    fn drop(&mut self) {
        if self.owned {
            // SAFETY: balances the successful `CoInitializeEx` above.
            unsafe { CoUninitialize() };
        }
    }
}

/// Read the foreground window's title and owning executable.
///
/// Only what the OS actually reports is returned. A window with no title yields
/// `None` rather than a placeholder, because the panel prints this as the source
/// and an invented source is exactly what the product forbids.
fn observe_foreground_context() -> ObservedContext {
    // SAFETY: all three calls are read-only queries on a window handle that is
    // allowed to be null; each is checked before its result is used.
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return ObservedContext::default();
        }

        let mut title_buffer = [0u16; 512];
        let title_len = GetWindowTextW(hwnd, &mut title_buffer);
        let window_title = if title_len > 0 {
            let text = String::from_utf16_lossy(&title_buffer[..title_len as usize]);
            let trimmed = text.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        } else {
            None
        };

        let process_name = executable_name(hwnd);

        ObservedContext {
            // The executable stem is the closest thing to an app name we can
            // observe without reading version resources; it is a fact, not a guess.
            app_name: process_name.clone(),
            process_name,
            window_title,
        }
    }
}

/// The foreground window's executable file stem, e.g. `chrome`.
///
/// # Safety
/// `hwnd` must be a valid window handle.
unsafe fn executable_name(hwnd: HWND) -> Option<String> {
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 {
        return None;
    }

    // LIMITED_INFORMATION is the least privilege that still resolves a path, so
    // Mori never opens another process with more rights than it needs.
    let handle: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
    let mut buffer = [0u16; MAX_PATH as usize];
    let mut size = buffer.len() as u32;
    let query = QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_WIN32,
        PWSTR(buffer.as_mut_ptr()),
        &mut size,
    );
    let _ = CloseHandle(handle);
    query.ok()?;

    let path = String::from_utf16_lossy(&buffer[..size as usize]);
    std::path::Path::new(&path)
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .filter(|stem| !stem.is_empty())
}

/// Where to anchor the overlay. The pointer is where the user just finished
/// selecting, which is a real observed position; when even that is unavailable
/// the caller centres on the active monitor instead of inventing coordinates.
fn observe_anchor() -> Option<AnchorPoint> {
    let mut point = POINT::default();
    // SAFETY: `GetCursorPos` only writes into the provided POINT.
    unsafe { GetCursorPos(&mut point).ok()? };
    Some(AnchorPoint {
        x: point.x,
        y: point.y,
    })
}

/// Whether the focused element is a password or otherwise secure field.
///
/// Errors are treated as "not secure" only because `IsPassword` is unsupported
/// on many providers; the caller still refuses to send anything it could not
/// read, so an unreadable secure field degrades to `NoSelection`, not to a leak.
fn is_secure_element(element: &IUIAutomationElement) -> bool {
    // SAFETY: reading a documented property off a live automation element.
    unsafe { element.CurrentIsPassword() }
        .map(|value| value.as_bool())
        .unwrap_or(false)
}

/// How far the selection read got. Reported by [`probe`] so a failure can be
/// attributed to the right step instead of collapsing into "no text".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectionReadStep {
    /// The focused provider does not implement the Text pattern at all.
    NoTextPattern,
    /// `GetSelection` succeeded and reported zero ranges: nothing is selected.
    PatternWithoutSelection,
    /// A range was read and yielded only whitespace.
    EmptySelection,
    /// A range was read and yielded text.
    TextRead,
}

/// The selected text of a focused element, plus how far the read got.
fn read_selection(element: &IUIAutomationElement) -> (SelectionReadStep, Option<String>) {
    // SAFETY: each COM call is checked; a provider that does not implement the
    // Text pattern returns an error rather than a null we could dereference.
    unsafe {
        let Ok(pattern) = element.GetCurrentPattern(UIA_TextPatternId) else {
            return (SelectionReadStep::NoTextPattern, None);
        };
        let Ok(text_pattern) = pattern.cast::<IUIAutomationTextPattern>() else {
            return (SelectionReadStep::NoTextPattern, None);
        };
        // A provider can implement the pattern and still refuse `GetSelection`
        // (a read-only view with selection disabled); that is not a selection.
        let Ok(ranges) = text_pattern.GetSelection() else {
            return (SelectionReadStep::PatternWithoutSelection, None);
        };
        if ranges.Length().unwrap_or(0) < 1 {
            return (SelectionReadStep::PatternWithoutSelection, None);
        }
        let Ok(range) = ranges.GetElement(0) else {
            return (SelectionReadStep::PatternWithoutSelection, None);
        };
        // The cap is applied by the provider itself, so an accidental
        // select-all in a large document never allocates the whole buffer.
        let Ok(text) = range.GetText(super::capture::MAX_CAPTURE_LENGTH as i32) else {
            return (SelectionReadStep::PatternWithoutSelection, None);
        };
        let text: String = BSTR::to_string(&text);
        if text.trim().is_empty() {
            return (SelectionReadStep::EmptySelection, None);
        }
        (SelectionReadStep::TextRead, Some(text))
    }
}

/// The selected text of a focused element that supports the Text pattern.
fn selected_text(element: &IUIAutomationElement) -> Option<String> {
    read_selection(element).1
}

/// Ask a Chromium-family window to turn its accessibility tree on.
///
/// Chromium, and therefore Electron, every Chromium browser, VS Code, Slack and
/// Claude Code, builds no accessibility tree until it believes an assistive
/// client is present. A cold `GetFocusedElement` on such a window returns a
/// stub with no Text pattern, which is exactly the "선택한 텍스트를 읽지
/// 못했습니다" case: not a bug in the read, but a tree that does not exist yet.
///
/// The documented trigger is a `WM_GETOBJECT` for `OBJID_CLIENT`. Sending it
/// makes Chromium enable accessibility, after which a second read succeeds.
///
/// Sent with a timeout and `SMTO_ABORTIFHUNG` because this is a synchronous
/// message into a foreign, possibly wedged, UI thread; Mori's shortcut must not
/// hang because the app under the cursor is busy.
fn wake_accessibility(hwnd: HWND) {
    if hwnd.is_invalid() {
        return;
    }
    // SAFETY: a documented message send to a valid window, bounded by a timeout.
    unsafe {
        let _ = SendMessageTimeoutW(
            hwnd,
            WM_GETOBJECT,
            WPARAM(0),
            LPARAM(OBJID_CLIENT.0 as isize),
            SMTO_ABORTIFHUNG,
            ACCESSIBILITY_WAKE_TIMEOUT_MS,
            None,
        );
    }
}

/// How long to wait for a foreign window to answer the wake message.
const ACCESSIBILITY_WAKE_TIMEOUT_MS: u32 = 200;
/// How long to give Chromium to build its tree after being woken. Short enough
/// to stay imperceptible, long enough for the renderer to answer in practice.
const ACCESSIBILITY_WAKE_SETTLE_MS: u64 = 140;

/// Read the current selection from whichever app has focus.
///
/// Called only from the global-shortcut handler.
pub fn capture_selection() -> CaptureOutcome {
    let _com = ComScope::enter();
    let context = observe_foreground_context();
    let anchor = observe_anchor();

    // SAFETY: creating the documented UI Automation co-class in-process.
    let automation: IUIAutomation =
        match unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) } {
            Ok(automation) => automation,
            // The accessibility layer itself is unreachable. That is a
            // permission / policy problem and gets its own explained state.
            Err(_) => {
                return super::capture::classify(RawCapture {
                    context,
                    accessibility_unavailable: true,
                    anchor,
                    ..Default::default()
                })
            }
        };

    // SAFETY: `GetFocusedElement` returns an owned interface or an error.
    let focused = match unsafe { automation.GetFocusedElement() } {
        Ok(element) => element,
        Err(_) => {
            return super::capture::classify(RawCapture {
                context,
                accessibility_unavailable: true,
                anchor,
                ..Default::default()
            })
        }
    };

    // Checked before the text is read, not after, so a password field's content
    // is never even materialised into a Rust string.
    if is_secure_element(&focused) {
        return super::capture::classify(RawCapture {
            context,
            is_secure_input: true,
            ..Default::default()
        });
    }

    let mut text = selected_text(&focused);

    // A cold Chromium window has no accessibility tree, so the first read comes
    // back empty even though there IS a selection. Wake it and read once more.
    // Only on failure, so the common case pays nothing for this.
    if text.is_none() {
        // SAFETY: read-only query for the window to wake.
        wake_accessibility(unsafe { GetForegroundWindow() });
        std::thread::sleep(std::time::Duration::from_millis(
            ACCESSIBILITY_WAKE_SETTLE_MS,
        ));
        // Re-fetch the element: the provider that answers after activation is a
        // different object from the stub that answered before it.
        // SAFETY: same documented call as above.
        if let Ok(rewoken) = unsafe { automation.GetFocusedElement() } {
            // The secure check is repeated because this is a new element, and a
            // password field must never be read even on the second attempt.
            if is_secure_element(&rewoken) {
                return super::capture::classify(RawCapture {
                    context,
                    is_secure_input: true,
                    ..Default::default()
                });
            }
            text = selected_text(&rewoken);
        }
    }

    super::capture::classify(RawCapture {
        text,
        context,
        anchor,
        acquired_by: acquired_by::UI_AUTOMATION,
        ..Default::default()
    })
}

/// Whether the currently focused element is a secure field, checked on its own.
///
/// The clipboard retry re-runs this immediately before synthesising a keystroke:
/// focus can move between the first capture and the user pressing "retry", and a
/// synthetic Ctrl+C into a password field must be impossible even in that gap.
pub fn focused_element_is_secure() -> bool {
    let _com = ComScope::enter();
    // SAFETY: same documented co-class and property read as above.
    unsafe {
        let Ok(automation) = CoCreateInstance::<_, IUIAutomation>(
            &CUIAutomation,
            None,
            CLSCTX_INPROC_SERVER,
        ) else {
            // Unreadable means unprovable, and an unprovable secure field is
            // treated as secure: the retry is refused rather than risked.
            return true;
        };
        match automation.GetFocusedElement() {
            Ok(element) => is_secure_element(&element),
            Err(_) => true,
        }
    }
}

/// Context and anchor for a clipboard retry, so the outcome still reports where
/// the text came from even though the accessibility layer gave us nothing.
pub fn observe_context_and_anchor() -> (ObservedContext, Option<AnchorPoint>) {
    let _com = ComScope::enter();
    (observe_foreground_context(), observe_anchor())
}

/// What the COM chain reported, WITHOUT any document text.
///
/// Deliberately cannot carry a selection: this exists to prove the plumbing on a
/// real desktop, and a diagnostic that printed whatever the user had highlighted
/// would be a worse privacy problem than the feature it is checking.
///
/// Test-only: it exists to prove the chain on a real desktop and has no product
/// caller. Every field is read through `Debug` by the harness, which the
/// dead-code lint does not count as a use.
#[cfg(test)]
#[derive(Debug)]
#[allow(dead_code)]
pub struct CaptureProbe {
    pub automation_created: bool,
    pub focused_element_found: bool,
    /// Which step the selection read reached on the FIRST, cold attempt.
    /// Distinguishes "this provider has no Text pattern" from "the read worked
    /// and nothing was selected", which is the difference between an untested
    /// path and a tested one.
    pub selection_step: SelectionReadStep,
    /// The same, after the accessibility wake. On a Chromium window this is
    /// expected to improve on `selection_step`, which is the whole point of the
    /// wake; on a native window the two are identical.
    pub selection_step_after_wake: SelectionReadStep,
    pub is_secure_input: bool,
    /// Length only. Never the text.
    pub selected_char_count: usize,
    /// UIA control type of the focused element, for attributing a
    /// `NoTextPattern` result to the provider rather than to our code.
    pub focused_control_type: i32,
    pub context: ObservedContext,
    pub anchor: Option<AnchorPoint>,
}

/// Exercise every step of the capture chain and report which ones worked.
///
/// Used by the ignored `probe_reads_the_live_desktop` test as a manual harness,
/// because the UI Automation path cannot be asserted from a unit test: it needs
/// a real desktop with a real focused window.
#[cfg(test)]
pub fn probe() -> CaptureProbe {
    let _com = ComScope::enter();
    let context = observe_foreground_context();
    let anchor = observe_anchor();

    // SAFETY: same documented co-class as `capture_selection`.
    let automation: Option<IUIAutomation> =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }.ok();
    let Some(automation) = automation else {
        return CaptureProbe {
            automation_created: false,
            focused_element_found: false,
            selection_step: SelectionReadStep::NoTextPattern,
            selection_step_after_wake: SelectionReadStep::NoTextPattern,
            is_secure_input: false,
            selected_char_count: 0,
            focused_control_type: 0,
            context,
            anchor,
        };
    };

    // SAFETY: returns an owned interface or an error.
    let focused = unsafe { automation.GetFocusedElement() }.ok();
    let is_secure_input = focused.as_ref().map(is_secure_element).unwrap_or(false);
    // The text is measured and immediately dropped; only its length escapes.
    let (selection_step, selected) = match focused.as_ref().filter(|_| !is_secure_input) {
        Some(element) => read_selection(element),
        None => (SelectionReadStep::NoTextPattern, None),
    };

    // Measure the wake's effect: a cold Chromium window should go from
    // NoTextPattern to at least PatternWithoutSelection once its tree exists.
    // SAFETY: read-only query for the window to wake.
    wake_accessibility(unsafe { GetForegroundWindow() });
    std::thread::sleep(std::time::Duration::from_millis(
        ACCESSIBILITY_WAKE_SETTLE_MS,
    ));
    let (selection_step_after_wake, selected_after_wake) = match unsafe {
        automation.GetFocusedElement()
    } {
        Ok(element) if !is_secure_element(&element) => read_selection(&element),
        _ => (selection_step, None),
    };

    // SAFETY: reading a documented property off a live automation element.
    let focused_control_type = focused
        .as_ref()
        .and_then(|element| unsafe { element.CurrentControlType() }.ok())
        .map(|control| control.0)
        .unwrap_or(0);

    CaptureProbe {
        automation_created: true,
        focused_element_found: focused.is_some(),
        selection_step,
        selection_step_after_wake,
        is_secure_input,
        selected_char_count: selected
            .or(selected_after_wake)
            .map(|text| text.chars().count())
            .unwrap_or(0),
        focused_control_type,
        context,
        anchor,
    }
}

#[cfg(test)]
mod tests {
    /// Manual harness, not part of the normal suite.
    ///
    /// UI Automation cannot be asserted headlessly: it needs a real desktop with
    /// a real focused window, so this is `#[ignore]`d and run on demand with
    /// `cargo test -- --ignored probe_reads_the_live_desktop --nocapture`.
    /// It prints which steps of the chain succeeded and never prints selected text.
    #[test]
    #[ignore = "requires a live desktop session; run manually"]
    fn probe_reads_the_live_desktop() {
        let probe = super::probe();
        println!("{probe:#?}");
        assert!(
            probe.automation_created,
            "UI Automation could not be created: the accessibility layer is unreachable",
        );
        assert!(
            probe.focused_element_found,
            "no focused element; the desktop session may be locked",
        );
        assert!(
            probe.anchor.is_some(),
            "no cursor position observed, so the overlay would have to centre",
        );
    }
}
