use std::fs::{self, Metadata};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Maximum size (bytes) a connector JSONL file is allowed to be. Connector
/// hooks emit one event per line; even a long session is comfortably under a
/// few hundred KB. We cap at 8 MB to keep the UI responsive and to prevent
/// the user from accidentally pointing Mori at a giant log.
pub const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;

/// Known connector subfolders. The Rust side does not invent new ones; if a
/// user creates `~/.mori/connectors/foo/` that directory is still listed
/// under the `other` family so the UI can surface it without misclassifying
/// it as Claude / Codex / etc.
const KNOWN_FAMILIES: &[&str] = &[
    "claude-code",
    "codex-cli",
    "opencode-cli",
    "terminal",
    "git",
    "other",
];

/// Allowed file extensions. We accept JSONL plus the two ambiguous-but-common
/// extensions hook scripts tend to use. Anything else is rejected; users with
/// a custom extension should rename the file or copy/paste the contents.
const ALLOWED_EXTENSIONS: &[&str] = &["jsonl", "ndjson", "log", "txt"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorInboxListing {
    pub root_path: String,
    pub root_exists: bool,
    pub files: Vec<ConnectorInboxFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorInboxFile {
    pub path: String,
    pub display_name: String,
    /// One of `claude-code`, `codex-cli`, `terminal`, `git`, `other`.
    pub connector_family: String,
    pub size_bytes: u64,
    pub modified_at: String,
    /// Path relative to the inbox root, e.g. `claude-code/2026-05-14.jsonl`.
    pub relative_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadConnectorJsonlInput {
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorJsonlFile {
    pub path: String,
    pub text: String,
    pub size_bytes: u64,
    pub modified_at: String,
}

/// List every `.jsonl` (and a few sibling extensions) file under the Mori
/// connector inbox. Never throws when the inbox doesn't exist yet — returns
/// `root_exists: false` so the UI can render a helpful empty state.
#[tauri::command]
pub fn list_connector_jsonl_inbox() -> Result<ConnectorInboxListing, String> {
    let root = resolve_inbox_root()?;
    list_inbox_at(&root)
}

/// Read a single file from the connector inbox. The path must already live
/// underneath the inbox root after canonicalisation; otherwise this fails
/// with an explicit security error. Files larger than `MAX_FILE_BYTES` are
/// rejected. We never recurse, never write, and never modify the file.
#[tauri::command]
pub fn read_connector_jsonl_file(
    input: ReadConnectorJsonlInput,
) -> Result<ConnectorJsonlFile, String> {
    let root = resolve_inbox_root()?;
    read_file_at(&root, &input.path)
}

// ─── pure helpers (tested independently) ───────────────────────────────────

fn resolve_inbox_root() -> Result<PathBuf, String> {
    // Resolve via the shared, USERPROFILE-first home logic so the reader and
    // the Python hook writer (which uses USERPROFILE on Windows) never look at
    // different homes when HOME and USERPROFILE diverge (e.g. under git-bash).
    crate::agent_paths::require(crate::agent_paths::mori_inbox_dir(), "Mori connector inbox")
}

pub(crate) fn list_inbox_at(root: &Path) -> Result<ConnectorInboxListing, String> {
    let root_path_str = root.to_string_lossy().to_string();
    if !root.exists() {
        return Ok(ConnectorInboxListing {
            root_path: root_path_str,
            root_exists: false,
            files: Vec::new(),
        });
    }

    let mut files: Vec<ConnectorInboxFile> = Vec::new();
    // Walk only the known family folders plus the inbox root itself for
    // loose files. We never descend into arbitrary user-named subdirectories.
    push_files_from(root, root, "other", &mut files)?;
    for family in KNOWN_FAMILIES {
        let family_dir = root.join(family);
        if !family_dir.exists() {
            continue;
        }
        push_files_from(&family_dir, root, family, &mut files)?;
    }

    files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    Ok(ConnectorInboxListing {
        root_path: root_path_str,
        root_exists: true,
        files,
    })
}

fn push_files_from(
    dir: &Path,
    inbox_root: &Path,
    family: &str,
    files: &mut Vec<ConnectorInboxFile>,
) -> Result<(), String> {
    let entries = match fs::read_dir(dir) {
        Ok(iter) => iter,
        Err(error) => return Err(format!("Failed to read {}: {}", dir.display(), error)),
    };

    for entry in entries.flatten() {
        let metadata = match entry.metadata() {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        if !metadata.is_file() {
            continue;
        }
        let path = entry.path();
        if !has_allowed_extension(&path) {
            continue;
        }

        let relative = path
            .strip_prefix(inbox_root)
            .map(|relative| relative.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| path.to_string_lossy().to_string());
        let display_name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string());

        files.push(ConnectorInboxFile {
            path: path.to_string_lossy().to_string(),
            display_name,
            connector_family: family.to_string(),
            size_bytes: metadata.len(),
            modified_at: format_modified(&metadata),
            relative_path: relative,
        });
    }

    Ok(())
}

pub(crate) fn read_file_at(inbox_root: &Path, requested: &str) -> Result<ConnectorJsonlFile, String> {
    let trimmed = requested.trim();
    if trimmed.is_empty() {
        return Err("Connector inbox path is required.".to_string());
    }

    let requested_path = PathBuf::from(trimmed);

    // We require the inbox root to exist before we touch any file under it —
    // this is the cheapest place to confirm `~/.mori/connectors` was set up.
    if !inbox_root.exists() {
        return Err(format!(
            "Mori connector inbox is missing: {}",
            inbox_root.display()
        ));
    }

    // Canonicalise BOTH paths so any symlink / .. is normalised before we
    // compare them. If the requested path doesn't exist we cannot
    // canonicalise it — that's the right "missing file" failure mode.
    let canonical_root = canonicalise(inbox_root)?;
    let canonical_file = canonicalise(&requested_path)?;

    if !canonical_file.starts_with(&canonical_root) {
        return Err("Refused: path is outside the Mori connector inbox.".to_string());
    }
    if canonical_file == canonical_root {
        return Err("Refused: connector path points at the inbox directory itself.".to_string());
    }

    let metadata = fs::metadata(&canonical_file).map_err(|error| {
        format!("Failed to stat connector file {}: {}", canonical_file.display(), error)
    })?;
    if metadata.is_dir() {
        return Err("Refused: connector path is a directory.".to_string());
    }
    if !has_allowed_extension(&canonical_file) {
        return Err(format!(
            "Refused: connector file extension is not one of {:?}.",
            ALLOWED_EXTENSIONS
        ));
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err(format!(
            "Connector file is too large ({} bytes > {} byte cap).",
            metadata.len(),
            MAX_FILE_BYTES
        ));
    }

    let text = fs::read_to_string(&canonical_file).map_err(|error| {
        format!(
            "Failed to read connector file {}: {}",
            canonical_file.display(),
            error
        )
    })?;

    Ok(ConnectorJsonlFile {
        path: canonical_file.to_string_lossy().to_string(),
        text,
        size_bytes: metadata.len(),
        modified_at: format_modified(&metadata),
    })
}

fn canonicalise(path: &Path) -> Result<PathBuf, String> {
    fs::canonicalize(path)
        .map_err(|error| format!("Failed to resolve {}: {}", path.display(), error))
}

fn has_allowed_extension(path: &Path) -> bool {
    let Some(ext) = path
        .extension()
        .and_then(|raw| raw.to_str())
        .map(|s| s.to_ascii_lowercase())
    else {
        return false;
    };
    ALLOWED_EXTENSIONS.iter().any(|allowed| *allowed == ext)
}

fn format_modified(metadata: &Metadata) -> String {
    let modified = metadata
        .modified()
        .or_else(|_| metadata.created())
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let duration = modified
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    let nanos = duration.subsec_nanos();
    // RFC3339-ish without the time zone offset — sufficient for the UI's
    // `new Date(...).toLocaleString()` round-trip; the frontend doesn't
    // rely on sub-second precision.
    format!("{}.{:09}Z", iso_seconds(secs), nanos)
}

fn iso_seconds(secs: u64) -> String {
    // Manually format a UNIX timestamp as `YYYY-MM-DDTHH:MM:SS` without
    // pulling chrono. Mori only uses this in the UI; precision-down-to-the-
    // second is fine for an inbox listing.
    const SECONDS_PER_DAY: u64 = 86_400;
    let total_days = secs / SECONDS_PER_DAY;
    let secs_in_day = secs % SECONDS_PER_DAY;
    let hour = secs_in_day / 3600;
    let minute = (secs_in_day % 3600) / 60;
    let second = secs_in_day % 60;

    // Days since 1970-01-01 → calendar date (proleptic Gregorian).
    let mut year = 1970_i64;
    let mut day_of_year = total_days as i64;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if day_of_year < days_in_year {
            break;
        }
        day_of_year -= days_in_year;
        year += 1;
    }
    let (month, day) = month_day(day_of_year as u32, is_leap(year));

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
        year, month, day, hour, minute, second
    )
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn month_day(day_of_year: u32, leap: bool) -> (u32, u32) {
    let days = if leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut remaining = day_of_year;
    for (index, length) in days.iter().enumerate() {
        if remaining < *length {
            return ((index as u32) + 1, remaining + 1);
        }
        remaining -= length;
    }
    (12, 31)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::TempDir;

    fn write_file(dir: &Path, name: &str, body: &str) -> PathBuf {
        std::fs::create_dir_all(dir).expect("create_dir_all");
        let path = dir.join(name);
        let mut file = File::create(&path).expect("create file");
        file.write_all(body.as_bytes()).expect("write file");
        path
    }

    #[test]
    fn list_returns_root_exists_false_when_missing() {
        let temp = TempDir::new().unwrap();
        let inbox = temp.path().join("nope");
        let listing = list_inbox_at(&inbox).unwrap();
        assert!(!listing.root_exists);
        assert!(listing.files.is_empty());
        assert!(listing.root_path.contains("nope"));
    }

    #[test]
    fn list_returns_empty_files_when_root_exists_but_empty() {
        let temp = TempDir::new().unwrap();
        let inbox = temp.path().to_path_buf();
        let listing = list_inbox_at(&inbox).unwrap();
        assert!(listing.root_exists);
        assert!(listing.files.is_empty());
    }

    #[test]
    fn list_picks_up_known_family_files_and_skips_unknown_extensions() {
        let temp = TempDir::new().unwrap();
        let inbox = temp.path().to_path_buf();
        write_file(&inbox.join("claude-code"), "2026-05-14.jsonl", "{}\n");
        write_file(&inbox.join("codex-cli"), "session-001.ndjson", "{}\n");
        write_file(&inbox.join("opencode-cli"), "session-002.jsonl", "{}\n");
        write_file(&inbox.join("terminal"), "events.log", "{}\n");
        // Should be skipped — wrong extension under a known family.
        write_file(&inbox.join("claude-code"), "notes.md", "irrelevant");

        let listing = list_inbox_at(&inbox).unwrap();
        assert!(listing.root_exists);
        assert_eq!(listing.files.len(), 4);
        let families: Vec<&str> = listing
            .files
            .iter()
            .map(|file| file.connector_family.as_str())
            .collect();
        assert!(families.contains(&"claude-code"));
        assert!(families.contains(&"codex-cli"));
        assert!(families.contains(&"opencode-cli"));
        assert!(families.contains(&"terminal"));
    }

    #[test]
    fn list_loose_files_at_inbox_root_count_as_other() {
        let temp = TempDir::new().unwrap();
        let inbox = temp.path().to_path_buf();
        write_file(&inbox, "shared.jsonl", "{}\n");
        let listing = list_inbox_at(&inbox).unwrap();
        let row = &listing.files[0];
        assert_eq!(row.connector_family, "other");
        assert_eq!(row.relative_path, "shared.jsonl");
    }

    #[test]
    fn read_returns_file_text_when_inside_inbox() {
        let temp = TempDir::new().unwrap();
        let inbox = temp.path().to_path_buf();
        let file = write_file(&inbox.join("claude-code"), "2026-05-14.jsonl", "{\"x\":1}\n");
        let result = read_file_at(&inbox, file.to_string_lossy().as_ref()).unwrap();
        assert!(result.text.contains("\"x\":1"));
        assert!(result.size_bytes > 0);
    }

    #[test]
    fn read_rejects_path_outside_inbox() {
        let temp = TempDir::new().unwrap();
        let inbox = temp.path().join("connectors");
        std::fs::create_dir_all(&inbox).unwrap();
        let outside = temp.path().join("outside.jsonl");
        std::fs::write(&outside, "{}\n").unwrap();
        let error = read_file_at(&inbox, outside.to_string_lossy().as_ref()).unwrap_err();
        assert!(error.contains("outside"), "error message: {}", error);
    }

    #[test]
    fn read_rejects_empty_path() {
        let temp = TempDir::new().unwrap();
        let error = read_file_at(temp.path(), "").unwrap_err();
        assert!(error.contains("required"), "error: {}", error);
    }

    #[test]
    fn read_rejects_missing_inbox_root() {
        let temp = TempDir::new().unwrap();
        let missing = temp.path().join("nope");
        let error = read_file_at(&missing, "anything.jsonl").unwrap_err();
        assert!(error.contains("missing"), "error: {}", error);
    }

    #[test]
    fn read_rejects_directory_path() {
        let temp = TempDir::new().unwrap();
        let inbox = temp.path().to_path_buf();
        let dir = inbox.join("claude-code");
        std::fs::create_dir_all(&dir).unwrap();
        let error = read_file_at(&inbox, dir.to_string_lossy().as_ref()).unwrap_err();
        assert!(error.to_lowercase().contains("director") || error.contains("extension"), "error: {}", error);
    }

    #[test]
    fn read_rejects_disallowed_extension() {
        let temp = TempDir::new().unwrap();
        let inbox = temp.path().to_path_buf();
        let path = write_file(&inbox, "readme.md", "hi");
        let error = read_file_at(&inbox, path.to_string_lossy().as_ref()).unwrap_err();
        assert!(error.contains("extension"), "error: {}", error);
    }

    #[test]
    fn read_rejects_files_above_size_cap() {
        let temp = TempDir::new().unwrap();
        let inbox = temp.path().to_path_buf();
        let path = inbox.join("huge.jsonl");
        std::fs::create_dir_all(&inbox).unwrap();
        let mut file = File::create(&path).unwrap();
        let chunk = vec![b'a'; 64 * 1024];
        // Write slightly over the cap (8 MB + 1 chunk).
        let chunks_required = (MAX_FILE_BYTES / chunk.len() as u64) + 1;
        for _ in 0..chunks_required {
            file.write_all(&chunk).unwrap();
        }
        drop(file);
        let error = read_file_at(&inbox, path.to_string_lossy().as_ref()).unwrap_err();
        assert!(error.contains("too large"), "error: {}", error);
    }

    #[test]
    fn read_rejects_path_traversal_attempt() {
        let temp = TempDir::new().unwrap();
        let inbox = temp.path().join("connectors");
        std::fs::create_dir_all(&inbox).unwrap();
        let outside = temp.path().join("escape.jsonl");
        std::fs::write(&outside, "{}\n").unwrap();
        // Build a path like `<inbox>/../escape.jsonl` and pass it raw.
        let traversal = inbox.join("..").join("escape.jsonl");
        let error = read_file_at(&inbox, traversal.to_string_lossy().as_ref()).unwrap_err();
        // The canonicalised parent + traversal resolves to a file outside
        // the inbox root, so the security check rejects it.
        assert!(error.contains("outside"), "error: {}", error);
    }
}
