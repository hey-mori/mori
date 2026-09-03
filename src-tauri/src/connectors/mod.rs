//! Connector inbox commands.
//!
//! The Mori connector inbox is a single, explicit local directory:
//!
//!   - macOS / Linux: `$HOME/.mori/connectors/`
//!   - Windows: `%USERPROFILE%\.mori\connectors\`
//!
//! Underneath the inbox root, Mori only inspects a fixed set of known
//! connector subfolders (`claude-code`, `codex-cli`, `opencode-cli`,
//! `local-capture`, `mcp`, `terminal`, `git`, `lens`, `other`). It never recurses into
//! arbitrary user directories, and it
//! does **not** watch the inbox for changes. Listing only happens when
//! the user clicks Refresh in the Evidence Hub. Reading only happens when
//! the user selects a file from that list.
//!
//! Path safety:
//!   - The inbox root is resolved exactly once per call from
//!     `$HOME`/`$USERPROFILE`.
//!   - Every requested file path is canonicalised and rejected unless it
//!     is contained under the canonicalised inbox root.
//!   - Symlinks outside the inbox are rejected by the canonicalisation
//!     check.
//!   - Files larger than `MAX_FILE_BYTES` are rejected with an explicit
//!     "too large" error.
//!   - Only `.jsonl`, `.ndjson`, `.log`, `.txt` extensions are allowed —
//!     the user is expected to use one of those.
//!
//! The Rust side never parses or normalises JSONL content. That happens
//! in TypeScript through `buildConnectorJsonlPreview` /
//! `normalizeConnectorEventBatch`. We only deliver bytes and metadata.

pub mod cli_setup;
pub mod inbox;
pub mod installer;
pub mod lens;
pub mod mcp_setup;
