//! The global mini overlay window.
//!
//! A thin native shell only. Everything the user reads is the same React tree
//! Mori renders in-app (`LanguageResultView` / `LanguageComposer`); this file
//! decides where a borderless always-on-top window goes and when it appears.
//!
//! Placement is a pure function ([`place_overlay`]) so multi-monitor and
//! screen-edge behaviour is unit-tested rather than eyeballed once and hoped
//! about, which is the failure mode for a window that opens next to a cursor.

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewUrl,
    WebviewWindowBuilder,
};

use super::capture::{AnchorPoint, CaptureOutcome};

/// Window label. Also how the frontend entry point knows to render the overlay
/// app instead of the full Mori shell.
pub const OVERLAY_LABEL: &str = "language-overlay";

/// Event carrying one capture into the overlay webview.
pub const CAPTURE_EVENT: &str = "language://capture";

/// Logical size the overlay opens at the first time. Small on purpose: this
/// floats over someone else's document and must read as an annotation, not an
/// application. After that the user's own size wins, because a window they
/// resized and then found reset is worse than one that opened slightly wrong.
const OVERLAY_WIDTH: f64 = 420.0;
const OVERLAY_HEIGHT: f64 = 560.0;

/// Below this the result sections stop being readable at all.
const OVERLAY_MIN_WIDTH: f64 = 320.0;
const OVERLAY_MIN_HEIGHT: f64 = 220.0;

/// Whether the user has pinned the overlay in place.
///
/// Pinning exists because the two useful behaviours genuinely conflict: opening
/// next to the selection is right when you are reading around a page, and
/// staying exactly where you put it is right when you are working through a
/// document. Rather than guess, the header offers the choice and remembers it.
#[derive(Default)]
pub struct OverlayPlacement {
    pinned: std::sync::atomic::AtomicBool,
}

impl OverlayPlacement {
    pub fn is_pinned(&self) -> bool {
        self.pinned.load(std::sync::atomic::Ordering::Relaxed)
    }

    pub fn set_pinned(&self, value: bool) {
        self.pinned.store(value, std::sync::atomic::Ordering::Relaxed);
    }
}

/// Gap between the pointer and the overlay corner, so the window never opens
/// underneath the cursor and swallows the click that follows.
const ANCHOR_GAP: i32 = 14;

/// A monitor's usable bounds in physical pixels.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ScreenBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// Choose the top-left corner for an overlay of `size` anchored at `anchor`.
///
/// Rules, in order:
///  - Prefer below-right of the anchor, the direction a reader's eye is already
///    travelling after a left-to-right selection.
///  - Flip to the other side of the anchor when that would overflow, rather than
///    sliding, so the overlay never covers the text it is explaining.
///  - Clamp last, so a window larger than the remaining space is still fully
///    on-screen instead of half past the edge.
///
/// `screen` is the monitor the anchor is on, which is what makes this correct on
/// a multi-monitor desk: bounds are absolute, and a negative-origin monitor to
/// the left of the primary works out of the box.
pub fn place_overlay(
    anchor: AnchorPoint,
    size: (i32, i32),
    screen: ScreenBounds,
) -> (i32, i32) {
    let (width, height) = size;

    let mut x = anchor.x + ANCHOR_GAP;
    if x + width > screen.x + screen.width {
        x = anchor.x - ANCHOR_GAP - width;
    }

    let mut y = anchor.y + ANCHOR_GAP;
    if y + height > screen.y + screen.height {
        y = anchor.y - ANCHOR_GAP - height;
    }

    // Clamp with `max` applied last so the top-left edge always wins: a window
    // taller than the monitor is cut off at the bottom, never at the title.
    let x = x
        .min(screen.x + screen.width - width)
        .max(screen.x);
    let y = y
        .min(screen.y + screen.height - height)
        .max(screen.y);

    (x, y)
}

/// The payload the overlay webview receives. Carries the capture plus the
/// platform, so the panel can explain an unsupported platform accurately.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayPayload {
    pub outcome: CaptureOutcome,
    /// Whether an explicit clipboard retry is possible on this platform and for
    /// this outcome. The overlay never shows the button when this is false.
    pub clipboard_fallback_available: bool,
    /// Whether the window is pinned in place, so the header's toggle shows the
    /// real state instead of a local guess that can drift from the window.
    pub pinned: bool,
}

/// Create the overlay window if it does not exist yet.
///
/// Built hidden and reused across invocations: creating a webview costs enough
/// that doing it per keypress would make the feature feel slow. The webview is
/// remounted on every capture instead (see the frontend entry), which is what
/// guarantees a previous selection cannot reappear.
fn ensure_window(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        return Ok(window);
    }
    WebviewWindowBuilder::new(
        app,
        OVERLAY_LABEL,
        WebviewUrl::App("index.html?surface=language-overlay".into()),
    )
    .title("Mori 언어")
    .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
    .min_inner_size(OVERLAY_MIN_WIDTH, OVERLAY_MIN_HEIGHT)
    .decorations(false)
    .transparent(false)
    .always_on_top(true)
    .skip_taskbar(true)
    // Resizable: a long paragraph and a single word want very different heights,
    // and a fixed 560px window forces one of them to scroll for no reason.
    .resizable(true)
    .minimizable(false)
    .maximizable(false)
    .visible(false)
    .focused(false)
    .build()
}

/// Show the overlay near `anchor` and hand it one capture.
pub fn present(
    app: &AppHandle,
    outcome: CaptureOutcome,
    anchor: Option<AnchorPoint>,
) -> tauri::Result<()> {
    let window = ensure_window(app)?;

    // The window's CURRENT size, not the default: whatever the user resized it
    // to is carried across invocations for free by simply not overriding it.
    let scale = window.scale_factor().unwrap_or(1.0);
    let physical: PhysicalSize<i32> = window.inner_size().map(|size| PhysicalSize::new(size.width as i32, size.height as i32)).unwrap_or_else(|_| {
        let fallback = LogicalSize::new(OVERLAY_WIDTH, OVERLAY_HEIGHT).to_physical::<i32>(scale);
        PhysicalSize::new(fallback.width, fallback.height)
    });

    // A pinned overlay stays exactly where the user put it.
    let pinned = app
        .try_state::<OverlayPlacement>()
        .map(|state| state.is_pinned())
        .unwrap_or(false);

    if let Some(anchor) = anchor.filter(|_| !pinned) {
        // The monitor under the pointer, not the primary one: on a multi-monitor
        // desk the selection is usually not on the primary display.
        let monitor = window
            .monitor_from_point(anchor.x as f64, anchor.y as f64)
            .ok()
            .flatten()
            .or_else(|| window.primary_monitor().ok().flatten());

        if let Some(monitor) = monitor {
            let position = monitor.position();
            let size = monitor.size();
            let (x, y) = place_overlay(
                anchor,
                (physical.width, physical.height),
                ScreenBounds {
                    x: position.x,
                    y: position.y,
                    width: size.width as i32,
                    height: size.height as i32,
                },
            );
            let _ = window.set_position(PhysicalPosition::new(x, y));
        }
    } else if !pinned && anchor.is_none() {
        // No observed position and not pinned. Centre rather than guess a corner.
        let _ = window.center();
    }

    // The payload is emitted BEFORE the window is shown so the first paint
    // already has the capture, instead of flashing an empty panel.
    window.emit(
        CAPTURE_EVENT,
        OverlayPayload {
            clipboard_fallback_available: cfg!(windows)
                && super::capture::allows_clipboard_fallback(&outcome),
            pinned,
            outcome,
        },
    )?;

    window.show()?;
    window.set_focus()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: ScreenBounds = ScreenBounds {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
    };
    const SIZE: (i32, i32) = (400, 520);

    #[test]
    fn opens_below_right_of_the_anchor_when_there_is_room() {
        let (x, y) = place_overlay(AnchorPoint { x: 300, y: 200 }, SIZE, SCREEN);
        assert_eq!((x, y), (314, 214));
    }

    #[test]
    fn flips_left_instead_of_covering_the_right_edge() {
        let (x, _) = place_overlay(AnchorPoint { x: 1900, y: 200 }, SIZE, SCREEN);
        assert!(x + SIZE.0 <= SCREEN.width, "overlay ran off the right edge");
        assert_eq!(x, 1900 - ANCHOR_GAP - SIZE.0);
    }

    #[test]
    fn flips_above_instead_of_covering_the_bottom_edge() {
        let (_, y) = place_overlay(AnchorPoint { x: 300, y: 1050 }, SIZE, SCREEN);
        assert!(y + SIZE.1 <= SCREEN.height, "overlay ran off the bottom");
        assert_eq!(y, 1050 - ANCHOR_GAP - SIZE.1);
    }

    #[test]
    fn stays_on_a_secondary_monitor_left_of_the_primary() {
        // A monitor at a negative origin is the classic multi-display bug: a
        // naive clamp to zero would yank the overlay onto the primary screen.
        let left = ScreenBounds {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1080,
        };
        let (x, y) = place_overlay(AnchorPoint { x: -1800, y: 300 }, SIZE, left);
        assert!(x >= left.x && x + SIZE.0 <= left.x + left.width);
        assert!(y >= left.y && y + SIZE.1 <= left.y + left.height);
    }

    #[test]
    fn a_corner_anchor_is_clamped_fully_on_screen() {
        for anchor in [
            AnchorPoint { x: 0, y: 0 },
            AnchorPoint { x: 1919, y: 1079 },
            AnchorPoint { x: 1919, y: 0 },
            AnchorPoint { x: 0, y: 1079 },
        ] {
            let (x, y) = place_overlay(anchor, SIZE, SCREEN);
            assert!(x >= SCREEN.x, "{anchor:?} pushed the overlay off the left");
            assert!(y >= SCREEN.y, "{anchor:?} pushed the overlay off the top");
            assert!(x + SIZE.0 <= SCREEN.x + SCREEN.width, "{anchor:?} overflowed right");
            assert!(y + SIZE.1 <= SCREEN.y + SCREEN.height, "{anchor:?} overflowed bottom");
        }
    }

    #[test]
    fn an_overlay_taller_than_the_screen_is_cut_at_the_bottom_not_the_top() {
        let tiny = ScreenBounds {
            x: 0,
            y: 0,
            width: 800,
            height: 400,
        };
        let (x, y) = place_overlay(AnchorPoint { x: 400, y: 200 }, SIZE, tiny);
        assert_eq!((x, y), (0, 0));
    }
}
