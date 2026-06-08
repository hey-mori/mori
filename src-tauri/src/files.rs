//! File-provenance OS helpers.
//!
//! Two read-only, user-triggered commands that make a session's recorded file
//! touches actionable:
//!
//!  - [`resolve_file_locations`] reconciles each recorded path against the
//!    current filesystem (present / moved / missing), detecting a move by a
//!    bounded basename search under the session's project root.
//!  - [`reveal_path_in_os`] reveals a file in the OS file manager (selecting
//!    it), never executing it.
//!
//! Both operate only on paths Mori already recorded from explicitly connected
//! agent logs. They open nothing on their own and write nothing.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// How a recorded path resolves on the current filesystem.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileLocation {
    /// The recorded path, echoed back so the caller can key results by it.
    pub path: String,
    /// `"present"` | `"moved"` | `"missing"`.
    pub status: String,
    /// Where the file is now, set only when `status` is `"moved"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_path: Option<String>,
}

/// Upper bound on directory entries visited per move search, so a stray search
/// root (a huge tree) can never hang the command. Generous for a project repo.
const MAX_ENTRIES_SCANNED: usize = 40_000;
/// Maximum directory depth descended during a move search.
const MAX_DEPTH: usize = 10;

/// Directory names skipped during a move search: build output and dependency
/// trees that never hold a moved source file and would dominate the scan.
fn is_excluded_dir(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | "target"
            | "dist"
            | "build"
            | "out"
            | "coverage"
            | ".next"
            | ".turbo"
            | ".cache"
            | "vendor"
    )
}

/// Reconcile recorded paths against the current filesystem. A path that no
/// longer exists is searched for by basename under `search_root` (when given):
/// exactly one match is reported as `moved`, zero or an ambiguous many as
/// `missing` (we never guess between candidates).
#[tauri::command]
pub fn resolve_file_locations(
    paths: Vec<String>,
    search_root: Option<String>,
) -> Vec<FileLocation> {
    let root = search_root
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_dir());
    paths
        .into_iter()
        .map(|raw| resolve_one(&raw, root.as_deref()))
        .collect()
}

fn resolve_one(raw: &str, root: Option<&Path>) -> FileLocation {
    let path = raw.trim();
    if path.is_empty() {
        return FileLocation {
            path: raw.to_string(),
            status: "missing".to_string(),
            current_path: None,
        };
    }
    if Path::new(path).exists() {
        return FileLocation {
            path: path.to_string(),
            status: "present".to_string(),
            current_path: None,
        };
    }
    if let Some(root) = root {
        if let Some(basename) = Path::new(path).file_name().and_then(|n| n.to_str()) {
            let matches = find_by_basename(root, basename, path);
            if matches.len() == 1 {
                return FileLocation {
                    path: path.to_string(),
                    status: "moved".to_string(),
                    current_path: Some(matches.into_iter().next().unwrap()),
                };
            }
        }
    }
    FileLocation {
        path: path.to_string(),
        status: "missing".to_string(),
        current_path: None,
    }
}

/// Find files named `basename` under `root`, excluding the original `exclude`
/// path and the build / dependency trees. Returns as soon as a second match is
/// seen (the caller only distinguishes "exactly one" from "not exactly one"),
/// and stops after the scan cap regardless.
fn find_by_basename(root: &Path, basename: &str, exclude: &str) -> Vec<String> {
    let mut found: Vec<String> = Vec::new();
    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];
    let mut scanned = 0usize;
    while let Some((dir, depth)) = stack.pop() {
        if depth > MAX_DEPTH {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            scanned += 1;
            if scanned > MAX_ENTRIES_SCANNED {
                return found;
            }
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let entry_path = entry.path();
            if file_type.is_dir() {
                if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
                    // Skip dotted dirs (.git, .vscode, …) and heavy build trees.
                    if name.starts_with('.') || is_excluded_dir(name) {
                        continue;
                    }
                }
                stack.push((entry_path, depth + 1));
            } else if file_type.is_file() {
                if entry_path.file_name().and_then(|n| n.to_str()) == Some(basename) {
                    let candidate = entry_path.to_string_lossy().to_string();
                    if candidate != exclude && !found.contains(&candidate) {
                        found.push(candidate);
                        if found.len() >= 2 {
                            return found;
                        }
                    }
                }
            }
        }
    }
    found
}

/// Reveal a file in the OS file manager, selecting it where the platform
/// supports it. Read-only: it shows the file in Explorer / Finder / the file
/// manager and never opens or executes it.
#[tauri::command]
pub fn reveal_path_in_os(path: String) -> Result<(), String> {
    let p = path.trim().to_string();
    if p.is_empty() {
        return Err("path is required.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{p}"))
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&p)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        // No universal reveal-and-select on Linux; open the containing folder.
        let dir = Path::new(&p)
            .parent()
            .map(|d| d.to_path_buf())
            .unwrap_or_else(|| PathBuf::from(&p));
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, b"x").unwrap();
    }

    #[test]
    fn resolves_present_when_path_exists() {
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("a.ts");
        touch(&file);
        let out = resolve_file_locations(vec![file.to_string_lossy().to_string()], None);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].status, "present");
        assert!(out[0].current_path.is_none());
    }

    #[test]
    fn reports_missing_when_not_found_and_no_root() {
        let out = resolve_file_locations(vec!["/nowhere/gone.ts".to_string()], None);
        assert_eq!(out[0].status, "missing");
    }

    #[test]
    fn detects_a_moved_file_by_basename_under_root() {
        let temp = TempDir::new().unwrap();
        let moved_to = temp.path().join("src").join("sub").join("widget.ts");
        touch(&moved_to);
        let recorded = temp.path().join("src").join("widget.ts"); // never created
        let out = resolve_file_locations(
            vec![recorded.to_string_lossy().to_string()],
            Some(temp.path().to_string_lossy().to_string()),
        );
        assert_eq!(out[0].status, "moved");
        assert_eq!(out[0].current_path.as_deref(), Some(moved_to.to_string_lossy().as_ref()));
    }

    #[test]
    fn ambiguous_basename_stays_missing_never_guesses() {
        let temp = TempDir::new().unwrap();
        touch(&temp.path().join("a").join("dup.ts"));
        touch(&temp.path().join("b").join("dup.ts"));
        let recorded = temp.path().join("dup.ts"); // never created, two candidates
        let out = resolve_file_locations(
            vec![recorded.to_string_lossy().to_string()],
            Some(temp.path().to_string_lossy().to_string()),
        );
        assert_eq!(out[0].status, "missing");
    }

    #[test]
    fn move_search_skips_excluded_dirs() {
        let temp = TempDir::new().unwrap();
        // The only copy lives inside node_modules, which the search must skip,
        // so the file reads as missing rather than "moved into node_modules".
        touch(&temp.path().join("node_modules").join("pkg").join("buried.ts"));
        let recorded = temp.path().join("src").join("buried.ts");
        let out = resolve_file_locations(
            vec![recorded.to_string_lossy().to_string()],
            Some(temp.path().to_string_lossy().to_string()),
        );
        assert_eq!(out[0].status, "missing");
    }
}
