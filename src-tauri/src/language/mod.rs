//! Language Loop · the native half.
//!
//! `capture` owns the platform-agnostic contract and every product rule.
//! `capture_windows` is the first platform adapter. `clipboard_windows` is the
//! explicit, user-invoked fallback for apps that expose no Text pattern.
//! `commands` is the Tauri boundary the frontend calls.

pub mod capture;
pub mod commands;
pub mod overlay;

#[cfg(windows)]
pub mod capture_windows;
#[cfg(windows)]
pub mod clipboard_windows;
