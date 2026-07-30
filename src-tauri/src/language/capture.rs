//! Platform-agnostic selection capture · the native half of the Language Loop.
//!
//! This module owns the CONTRACT, never a platform. The Windows UI Automation
//! adapter lives in `capture_windows.rs` behind a `cfg`, and a macOS AX adapter
//! can be added beside it without this file, the Tauri commands, or any part of
//! the frontend learning about it.
//!
//! The invariants encoded here mirror the TypeScript core in
//! `src/lib/language/languageCapture.ts`, because they are product rules and not
//! implementation details:
//!
//!  - Capture happens ONLY on an explicit user invocation. There is no watcher,
//!    no polling, and no "selection changed" subscription anywhere in this crate.
//!  - Only observed context is reported. Every context field is `Option`, so an
//!    adapter that could not read a window title returns `None` rather than a
//!    guess the model would then be handed as fact.
//!  - `acquired_by` is mandatory on any outcome that carries text, so a fallback
//!    path can never be invisible to the user.
//!  - Secure input outranks everything, including an explicit clipboard retry.

use serde::{Deserialize, Serialize};

/// Longest selection worth sending to an engine. Mirrors `MAX_CAPTURE_LENGTH`
/// in the TypeScript core; a whole document is not a reading question, and the
/// cap is applied natively so an oversized selection never crosses the IPC
/// boundary in the first place.
pub const MAX_CAPTURE_LENGTH: usize = 2_000;

/// Shortest selection worth offering an action for. Mirrors `MIN_CAPTURE_LENGTH`.
pub const MIN_CAPTURE_LENGTH: usize = 2;

/// How the text was obtained. A closed set on the Rust side because each value
/// has a matching Korean label in `LanguageResultView`.
pub mod acquired_by {
    pub const UI_AUTOMATION: &str = "ui-automation";
    pub const CLIPBOARD_ON_INVOKE: &str = "clipboard-on-invoke";
}

/// Screen position to anchor the overlay to, in physical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AnchorPoint {
    pub x: i32,
    pub y: i32,
}

/// Context an adapter actually observed. Every field is optional on purpose.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservedContext {
    pub app_name: Option<String>,
    pub process_name: Option<String>,
    pub window_title: Option<String>,
}

/// What a platform adapter physically read, before any product rule is applied.
/// Separating this from [`CaptureOutcome`] is what makes the decision logic pure
/// and unit-testable without a live desktop.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawCapture {
    /// Selected text exactly as the accessibility API returned it.
    pub text: Option<String>,
    pub context: ObservedContext,
    /// The focused element reported itself as a password / secure field.
    pub is_secure_input: bool,
    /// The adapter could not talk to the accessibility layer at all.
    pub accessibility_unavailable: bool,
    pub anchor: Option<AnchorPoint>,
    pub acquired_by: &'static str,
}

/// The result of one explicit capture invocation.
///
/// Every arm is a state the overlay renders differently, which is why this is an
/// enum rather than a struct with a nullable `text`: "no selection" and "blocked
/// by a password field" must never collapse into the same empty panel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CaptureOutcome {
    /// Text was read. `anchor` may still be `None` if no position was observed.
    #[serde(rename_all = "camelCase")]
    Selection {
        text: String,
        context: ObservedContext,
        anchor: Option<AnchorPoint>,
        acquired_by: String,
    },
    /// The focused field is a password or otherwise secure input. No text is
    /// carried, and no fallback may be offered.
    #[serde(rename_all = "camelCase")]
    SecureInput { context: ObservedContext },
    /// Nothing was selected, or the selection was too short to be a question.
    /// The overlay opens on the direct-input composer instead of erroring.
    #[serde(rename_all = "camelCase")]
    NoSelection {
        context: ObservedContext,
        anchor: Option<AnchorPoint>,
    },
    /// The accessibility layer refused or is not permitted. The overlay explains
    /// why the permission is needed and offers the settings deep link.
    #[serde(rename_all = "camelCase")]
    PermissionDenied { context: ObservedContext },
    /// This platform has no adapter yet. Never reported as an error: the overlay
    /// falls back to direct input, which works everywhere.
    #[serde(rename_all = "camelCase")]
    Unsupported { platform: String },
}

/// Trim and clamp a raw selection the way the TypeScript core does, so the same
/// string produces the same capture whichever side measured it.
///
/// Clamping is on `char` boundaries, not bytes: slicing a multi-byte Korean or
/// emoji selection at byte 2000 would panic, and truncating mid-character would
/// hand the engine a corrupted word.
pub fn normalize_text(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.chars().count() <= MAX_CAPTURE_LENGTH {
        return trimmed.to_string();
    }
    trimmed.chars().take(MAX_CAPTURE_LENGTH).collect()
}

/// Whether a normalized selection is worth offering an action for.
pub fn is_actionable(text: &str) -> bool {
    text.chars().count() >= MIN_CAPTURE_LENGTH && text.chars().any(|c| !c.is_whitespace())
}

/// Turn what an adapter physically read into the product outcome.
///
/// Order is the policy and is deliberately explicit:
///  1. Secure input wins over everything, including a present selection. A
///     password field that happens to expose its text must still be refused.
///  2. An unreachable accessibility layer is a permission problem, not an empty
///     selection, because the two need completely different UI.
///  3. Anything else with no usable text degrades to direct input, never an error.
pub fn classify(raw: RawCapture) -> CaptureOutcome {
    if raw.is_secure_input {
        return CaptureOutcome::SecureInput {
            context: raw.context,
        };
    }
    if raw.accessibility_unavailable {
        return CaptureOutcome::PermissionDenied {
            context: raw.context,
        };
    }
    let text = raw.text.as_deref().map(normalize_text).unwrap_or_default();
    if !is_actionable(&text) {
        return CaptureOutcome::NoSelection {
            context: raw.context,
            anchor: raw.anchor,
        };
    }
    CaptureOutcome::Selection {
        text,
        context: raw.context,
        anchor: raw.anchor,
        acquired_by: raw.acquired_by.to_string(),
    }
}

/// The outcome used on a platform with no adapter compiled in.
///
/// Unused on Windows, where an adapter exists; kept compiled everywhere so the
/// non-Windows path cannot rot between builds.
#[cfg_attr(windows, allow(dead_code))]
pub fn unsupported_outcome() -> CaptureOutcome {
    CaptureOutcome::Unsupported {
        platform: std::env::consts::OS.to_string(),
    }
}

/// Whether an outcome permits an explicit clipboard retry.
///
/// Secure input is the hard block the whole feature is judged on: the retry is a
/// synthetic Ctrl+C into whatever is focused, so allowing it after a password
/// field was detected would be strictly worse than the UI Automation path it is
/// meant to back up.
pub fn allows_clipboard_fallback(outcome: &CaptureOutcome) -> bool {
    matches!(
        outcome,
        CaptureOutcome::NoSelection { .. } | CaptureOutcome::PermissionDenied { .. }
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> ObservedContext {
        ObservedContext {
            app_name: Some("chrome".into()),
            process_name: Some("chrome".into()),
            window_title: Some("Docs".into()),
        }
    }

    #[test]
    fn normalize_trims_and_clamps_on_char_boundaries() {
        assert_eq!(normalize_text("  hello  "), "hello");
        // A multi-byte selection must clamp by character, never mid-codepoint.
        let long: String = "한".repeat(MAX_CAPTURE_LENGTH + 500);
        let clamped = normalize_text(&long);
        assert_eq!(clamped.chars().count(), MAX_CAPTURE_LENGTH);
    }

    #[test]
    fn actionable_accepts_a_double_clicked_word_and_rejects_noise() {
        assert!(is_actionable("go"));
        assert!(is_actionable("표현"));
        assert!(!is_actionable("a"));
        assert!(!is_actionable("   "));
        assert!(!is_actionable(""));
    }

    #[test]
    fn secure_input_outranks_a_present_selection() {
        let outcome = classify(RawCapture {
            text: Some("hunter2".into()),
            context: ctx(),
            is_secure_input: true,
            acquired_by: acquired_by::UI_AUTOMATION,
            ..Default::default()
        });
        assert!(matches!(outcome, CaptureOutcome::SecureInput { .. }));
        // The text must not survive anywhere in the serialized outcome.
        let json = serde_json::to_string(&outcome).unwrap();
        assert!(!json.contains("hunter2"));
    }

    #[test]
    fn secure_input_outranks_an_unavailable_accessibility_layer() {
        let outcome = classify(RawCapture {
            is_secure_input: true,
            accessibility_unavailable: true,
            ..Default::default()
        });
        assert!(matches!(outcome, CaptureOutcome::SecureInput { .. }));
    }

    #[test]
    fn unavailable_accessibility_is_a_permission_problem_not_an_empty_selection() {
        let outcome = classify(RawCapture {
            accessibility_unavailable: true,
            context: ctx(),
            ..Default::default()
        });
        assert!(matches!(outcome, CaptureOutcome::PermissionDenied { .. }));
    }

    #[test]
    fn short_or_missing_text_degrades_to_direct_input() {
        for text in [None, Some(String::new()), Some(" ".into()), Some("a".into())] {
            let outcome = classify(RawCapture {
                text,
                context: ctx(),
                acquired_by: acquired_by::UI_AUTOMATION,
                ..Default::default()
            });
            assert!(matches!(outcome, CaptureOutcome::NoSelection { .. }));
        }
    }

    #[test]
    fn a_real_selection_carries_its_acquisition_path() {
        let outcome = classify(RawCapture {
            text: Some("  ephemeral by construction  ".into()),
            context: ctx(),
            anchor: Some(AnchorPoint { x: 100, y: 200 }),
            acquired_by: acquired_by::CLIPBOARD_ON_INVOKE,
            ..Default::default()
        });
        match outcome {
            CaptureOutcome::Selection {
                text, acquired_by, ..
            } => {
                assert_eq!(text, "ephemeral by construction");
                assert_eq!(acquired_by, "clipboard-on-invoke");
            }
            other => panic!("expected a selection, got {other:?}"),
        }
    }

    #[test]
    fn clipboard_fallback_is_refused_after_secure_input() {
        assert!(!allows_clipboard_fallback(&CaptureOutcome::SecureInput {
            context: ctx()
        }));
        assert!(!allows_clipboard_fallback(&CaptureOutcome::Selection {
            text: "already have it".into(),
            context: ctx(),
            anchor: None,
            acquired_by: acquired_by::UI_AUTOMATION.into(),
        }));
        assert!(allows_clipboard_fallback(&CaptureOutcome::NoSelection {
            context: ctx(),
            anchor: None
        }));
    }

    #[test]
    fn outcomes_serialize_with_a_discriminating_tag() {
        let json = serde_json::to_string(&CaptureOutcome::NoSelection {
            context: ObservedContext::default(),
            anchor: None,
        })
        .unwrap();
        assert!(json.contains("\"kind\":\"noSelection\""));
    }
}
