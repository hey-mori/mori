//! 보관한 원본 · a user-chosen, point-in-time copy of one Claude Code transcript.
//!
//! The agent deletes its transcripts after `cleanupPeriodDays` (30 by default).
//! When the user explicitly asks Mori to keep one session, Mori copies that
//! session's complete records, as they stand at that moment, into its own
//! storage (`<storage>/archives/claude-code/<sha256>.jsonl`), so the existing
//! bounded readers can still open and search it after the original is gone.
//!
//! Boundaries:
//! - Only a file inside the Claude Code projects directory can be archived,
//!   and never through a symlink. Nothing is ever written into the agent's
//!   directory, and the original is never modified or removed.
//! - The copy is atomic: written to a hidden partial file in the archive
//!   directory, synced, then renamed. A failed copy (disk full, the source
//!   truncated mid-read) removes the partial file and reports the error.
//! - The archive is named by its content hash: archiving the same bytes twice
//!   reuses the existing file and never overwrites a different one.
//! - Readers accept the archive directory as a second trusted root, so an
//!   archive path is read with the same checks as an original, and no other
//!   path becomes readable.
//! - Removal deletes exactly one archive, named by its hash.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use super::code::{claude_code_projects_dir, complete_end, resolve_session_path, source_id_of};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionArchive {
    /// `<sha256>.jsonl`, relative to the archive directory.
    pub file_name: String,
    /// Absolute path of the archive, for reading it now (not for storing).
    pub path: String,
    /// Bytes copied: the original's complete records when it was archived.
    pub bytes: u64,
    pub sha256: String,
    /// The original's content fingerprint (`sourceId`), which the copy shares,
    /// so a passage saved from the original verifies against the archive.
    pub source_id: String,
    /// True when an identical archive already existed and was reused.
    pub reused: bool,
}

/// Where archives live: inside Mori's storage directory. Changing the storage
/// location moves them along with the database (`move_archives`).
pub(crate) fn archive_root() -> Result<PathBuf, String> {
    Ok(crate::package::default_storage_dir()?.join("archives").join("claude-code"))
}

/// The trusted root a reader checks a requested transcript path against:
/// the archive directory when the path is inside it, else the agent's
/// projects directory. Any other path still fails the reader's own check.
pub(crate) fn read_root_for(session_path: &str) -> Result<PathBuf, String> {
    if let (Ok(root), Ok(requested)) = (archive_root(), fs::canonicalize(session_path)) {
        if let Ok(canonical_root) = fs::canonicalize(&root) {
            if requested.starts_with(&canonical_root) {
                return Ok(root);
            }
        }
    }
    claude_code_projects_dir()
}

const COPY_CHUNK: usize = 1 << 20;

pub(crate) fn archive_session_at(projects_root: &Path, archive_dir: &Path, session_path: &str) -> Result<SessionArchive, String> {
    let requested = PathBuf::from(session_path.trim());
    let link = fs::symlink_metadata(&requested)
        .map_err(|error| format!("SOURCE_MISSING: Failed to resolve {}: {error}", requested.display()))?;
    if link.file_type().is_symlink() {
        return Err("Refused: a transcript reached through a symlink is not archived.".to_string());
    }
    let canonical = resolve_session_path(projects_root, session_path.trim())?;
    // Never write into the agent's own directory, even through a storage
    // override that points inside it: its cleanup would delete the copy.
    if let (Ok(root), Ok(archives)) = (fs::canonicalize(projects_root), fs::canonicalize(archive_dir).or_else(|_| Ok::<_, std::io::Error>(archive_dir.to_path_buf()))) {
        if archives.starts_with(&root) {
            return Err("Refused: the archive folder is inside the agent's projects directory.".to_string());
        }
    }
    let mut source = fs::File::open(&canonical)
        .map_err(|error| format!("SOURCE_UNREADABLE: Failed to open {}: {error}", canonical.display()))?;
    let len = source.metadata().map_err(|error| error.to_string())?.len();
    let source_id = source_id_of(&mut source)?;
    // A point in time: the complete records present now. Anything appended
    // while copying is not part of this archive; a partial last line never is.
    let snapshot = complete_end(&mut source, len)?;
    if snapshot == 0 {
        return Err("Refused: the transcript has no complete record to keep yet.".to_string());
    }
    fs::create_dir_all(archive_dir).map_err(|error| format!("ARCHIVE_UNWRITABLE: {error}"))?;
    sweep_stale_partials(archive_dir);
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    let partial = archive_dir.join(format!(".partial-{}-{nonce}", std::process::id()));
    let copied = copy_hashing(&mut source, snapshot, &partial);
    let sha = match copied {
        Ok(sha) => sha,
        Err(error) => {
            let _ = fs::remove_file(&partial);
            return Err(error);
        }
    };
    let file_name = format!("{sha}.jsonl");
    let target = archive_dir.join(&file_name);
    let reused = target.exists();
    if reused {
        // Named by content: the same bytes are already kept. Never overwrite.
        let _ = fs::remove_file(&partial);
        let kept = fs::metadata(&target).map_err(|error| error.to_string())?.len();
        if kept != snapshot {
            return Err("ARCHIVE_CONFLICT: an archive with this name holds different bytes.".to_string());
        }
    } else if let Err(error) = fs::rename(&partial, &target) {
        let _ = fs::remove_file(&partial);
        return Err(format!("ARCHIVE_UNWRITABLE: {error}"));
    } else {
        sync_dir(archive_dir);
    }
    Ok(SessionArchive {
        file_name,
        path: target.to_string_lossy().to_string(),
        bytes: snapshot,
        sha256: sha,
        source_id,
        reused,
    })
}

fn copy_hashing(source: &mut fs::File, bytes: u64, partial: &Path) -> Result<String, String> {
    let mut out = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(partial)
        .map_err(|error| format!("ARCHIVE_UNWRITABLE: {error}"))?;
    source.seek(SeekFrom::Start(0)).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut remaining = bytes;
    let mut buffer = vec![0u8; COPY_CHUNK];
    while remaining > 0 {
        let want = remaining.min(COPY_CHUNK as u64) as usize;
        source
            .read_exact(&mut buffer[..want])
            .map_err(|error| format!("SOURCE_CHANGED: the transcript shrank while it was copied: {error}"))?;
        hasher.update(&buffer[..want]);
        out.write_all(&buffer[..want]).map_err(|error| format!("ARCHIVE_UNWRITABLE: {error}"))?;
        remaining -= want as u64;
    }
    out.sync_all().map_err(|error| format!("ARCHIVE_UNWRITABLE: {error}"))?;
    Ok(hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect())
}

/// A copy interrupted by a crash or a kill leaves its partial file behind; it
/// can hold a whole transcript. Any partial older than an hour is removed.
fn sweep_stale_partials(archive_dir: &Path) {
    let Ok(entries) = fs::read_dir(archive_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        if !name.to_string_lossy().starts_with(".partial-") {
            continue;
        }
        let stale = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|modified| modified.elapsed().ok())
            .map(|age| age.as_secs() > 3600)
            .unwrap_or(false);
        if stale {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Make the rename durable: without it a crash can lose the new name while the
/// kernel already records the archive.
fn sync_dir(dir: &Path) {
    #[cfg(unix)]
    if let Ok(handle) = fs::File::open(dir) {
        let _ = handle.sync_all();
    }
    #[cfg(not(unix))]
    let _ = dir;
}

/// Carry every archive to a new storage location: copy all first, then remove
/// the originals only when every copy succeeded, so a failed move leaves the
/// old folder intact. Only archive-named files are touched.
pub(crate) fn move_archives(from: &Path, to: &Path) -> Result<usize, String> {
    let Ok(entries) = fs::read_dir(from) else {
        return Ok(0);
    };
    let names: Vec<String> = entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .filter(|name| is_archive_name(name))
        .collect();
    if names.is_empty() || from == to {
        return Ok(0);
    }
    fs::create_dir_all(to).map_err(|error| format!("ARCHIVE_UNWRITABLE: {error}"))?;
    for name in &names {
        let target = to.join(name);
        if !target.exists() {
            fs::copy(from.join(name), &target).map_err(|error| format!("ARCHIVE_UNWRITABLE: {error}"))?;
        }
    }
    sync_dir(to);
    for name in &names {
        let _ = fs::remove_file(from.join(name));
    }
    Ok(names.len())
}

fn is_archive_name(name: &str) -> bool {
    name.len() == 70 && name.ends_with(".jsonl") && name[..64].bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// A confirmed "delete all data" also deletes every kept copy: once the
/// kernel's records of them are gone, nothing would name or remove them, and
/// each is a whole transcript in plaintext. Only archive files and partial
/// copies are touched; anything else in the folder is left. A file that
/// cannot be removed is counted as left, so the caller can say so.
pub(crate) fn remove_all_archives(archive_dir: &Path) -> (usize, usize) {
    let Ok(entries) = fs::read_dir(archive_dir) else { return (0, 0) };
    let (mut removed, mut left) = (0, 0);
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !(is_archive_name(&name) || is_partial_name(&name)) {
            continue;
        }
        if !entry.file_type().map(|kind| kind.is_file()).unwrap_or(false) {
            continue;
        }
        if fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        } else {
            left += 1;
        }
    }
    sync_dir(archive_dir);
    (removed, left)
}

/// The name an in-progress copy is written under: `.partial-<pid>-<nanos>`.
fn is_partial_name(name: &str) -> bool {
    let Some(rest) = name.strip_prefix(".partial-") else { return false };
    let mut parts = rest.split('-');
    let digits = |part: Option<&str>| part.is_some_and(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()));
    digits(parts.next()) && digits(parts.next()) && parts.next().is_none()
}

/// Whether a kept copy is still the one Mori recorded: present as a regular
/// file, the recorded size, and hashing to the content name it is stored
/// under. "missing" only when the system says not found; anything that exists
/// but is not that file is "damaged". Hashing reads the whole copy, so callers
/// verify when a copy is about to be read in place of its original, not on
/// every render.
pub(crate) fn verify_archive_at(archive_dir: &Path, file_name: &str, bytes: u64) -> &'static str {
    if !is_archive_name(file_name) {
        return "damaged";
    }
    let path = archive_dir.join(file_name);
    let meta = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return "missing",
        Err(_) => return "damaged",
    };
    if !meta.is_file() || meta.len() != bytes {
        return "damaged";
    }
    let Ok(mut file) = fs::File::open(&path) else { return "damaged" };
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; COPY_CHUNK];
    loop {
        match file.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => hasher.update(&buffer[..read]),
            Err(_) => return "damaged",
        }
    }
    let sha: String = hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect();
    if sha == file_name[..64] { "ok" } else { "damaged" }
}

pub(crate) fn remove_archive_at(archive_dir: &Path, file_name: &str) -> Result<bool, String> {
    if !is_archive_name(file_name) {
        return Err("Refused: not an archive name.".to_string());
    }
    let path = archive_dir.join(file_name);
    match fs::symlink_metadata(&path) {
        Err(_) => Ok(false),
        Ok(meta) if !meta.file_type().is_file() => Err("Refused: not an archive file.".to_string()),
        Ok(_) => fs::remove_file(&path).map(|_| true).map_err(|error| error.to_string()),
    }
}

/// Keep a point-in-time copy of one Claude Code transcript in Mori's storage.
/// Explicitly invoked by the user; see the module doc for the boundaries.
#[tauri::command]
pub async fn archive_claude_code_session(session_path: String) -> Result<SessionArchive, String> {
    let projects = claude_code_projects_dir()?;
    let archives = archive_root()?;
    tauri::async_runtime::spawn_blocking(move || archive_session_at(&projects, &archives, &session_path))
        .await
        .map_err(|error| error.to_string())?
}

/// Delete one archive by its name. The original transcript is not touched.
#[tauri::command]
pub fn remove_claude_code_archive(file_name: String) -> Result<bool, String> {
    remove_archive_at(&archive_root()?, file_name.trim())
}

/// The archive directory, so a stored archive name can be read again.
/// Verify one kept copy before it is read in place of its original.
#[tauri::command]
pub async fn verify_claude_code_archive(file_name: String, bytes: u64) -> Result<String, String> {
    let dir = archive_root()?;
    tauri::async_runtime::spawn_blocking(move || verify_archive_at(&dir, &file_name, bytes).to_string())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn claude_code_archive_dir() -> Result<String, String> {
    Ok(archive_root()?.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn line(index: usize) -> String {
        format!("{{\"type\":\"user\",\"uuid\":\"u{index}\",\"message\":{{\"role\":\"user\",\"content\":\"step {index}\"}},\"timestamp\":\"2026-10-08T00:00:00Z\"}}\n")
    }

    fn setup(body: &str) -> (TempDir, PathBuf, PathBuf, String) {
        let dir = TempDir::new().unwrap();
        let projects = dir.path().join("projects");
        let project = projects.join("-home-u-dev-infra");
        fs::create_dir_all(&project).unwrap();
        let path = project.join("s.jsonl");
        fs::write(&path, body).unwrap();
        let archives = dir.path().join("Records").join("archives").join("claude-code");
        (dir, projects, archives, path.to_string_lossy().to_string())
    }

    #[test]
    fn keeps_the_complete_records_as_they_stand_and_names_them_by_content() {
        let body = format!("{}{}{{\"type\":\"user\",\"partial", line(0), line(1));
        let (_dir, projects, archives, path) = setup(&body);
        let archive = archive_session_at(&projects, &archives, &path).unwrap();
        let complete = format!("{}{}", line(0), line(1));
        assert_eq!(archive.bytes, complete.len() as u64, "a partial last line is not kept");
        assert_eq!(fs::read_to_string(&archive.path).unwrap(), complete);
        let expected: String = Sha256::digest(complete.as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(archive.sha256, expected);
        assert_eq!(archive.file_name, format!("{expected}.jsonl"));
        assert!(!archive.reused);
        // The original is untouched.
        assert_eq!(fs::read_to_string(&path).unwrap(), body);
        // No partial file is left behind.
        let leftovers: Vec<_> = fs::read_dir(&archives).unwrap().filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().starts_with(".partial")).collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn reuses_an_identical_archive_and_never_overwrites_another() {
        let (_dir, projects, archives, path) = setup(&line(0));
        let first = archive_session_at(&projects, &archives, &path).unwrap();
        let again = archive_session_at(&projects, &archives, &path).unwrap();
        assert_eq!(first.file_name, again.file_name);
        assert!(again.reused);
        // A grown transcript is a new point in time: a second archive.
        fs::write(&path, format!("{}{}", line(0), line(1))).unwrap();
        let grown = archive_session_at(&projects, &archives, &path).unwrap();
        assert_ne!(grown.file_name, first.file_name);
        assert!(Path::new(&first.path).exists(), "the earlier archive stays");
    }

    #[test]
    fn refuses_paths_outside_the_projects_directory_and_symlinks() {
        let (dir, projects, archives, path) = setup(&line(0));
        let outside = dir.path().join("elsewhere.jsonl");
        fs::write(&outside, line(0)).unwrap();
        assert!(archive_session_at(&projects, &archives, &outside.to_string_lossy()).unwrap_err().starts_with("Refused"));
        #[cfg(unix)]
        {
            let link = projects.join("-home-u-dev-infra").join("link.jsonl");
            std::os::unix::fs::symlink(&path, &link).unwrap();
            assert!(archive_session_at(&projects, &archives, &link.to_string_lossy()).unwrap_err().contains("symlink"));
        }
        assert!(archive_session_at(&projects, &archives, "/nope/missing.jsonl").unwrap_err().starts_with("SOURCE_MISSING"));
        assert!(!archives.exists() || fs::read_dir(&archives).unwrap().next().is_none(), "nothing written on refusal");
    }

    #[test]
    fn refuses_an_empty_snapshot_and_an_archive_folder_inside_the_agent_directory() {
        let (_dir, projects, archives, path) = setup("{\"type\":\"user\",\"partial");
        assert!(archive_session_at(&projects, &archives, &path).unwrap_err().contains("no complete record"));
        let (_dir2, projects2, _archives2, path2) = setup(&line(0));
        let inside = projects2.join("archives");
        assert!(archive_session_at(&projects2, &inside, &path2).unwrap_err().contains("inside the agent"));
    }

    #[test]
    fn a_full_wipe_removes_every_archive_and_partial_and_nothing_else() {
        let dir = TempDir::new().unwrap();
        let archives = dir.path().join("archives");
        fs::create_dir_all(&archives).unwrap();
        fs::write(archives.join(format!("{}.jsonl", "a".repeat(64))), "x").unwrap();
        fs::write(archives.join(format!("{}.jsonl", "b".repeat(64))), "y").unwrap();
        fs::write(archives.join(".partial-1-2"), "z").unwrap();
        fs::write(archives.join("notes.txt"), "keep").unwrap();
        fs::write(archives.join(".partial-notes"), "keep").unwrap();
        assert_eq!(remove_all_archives(&archives), (3, 0));
        let mut left: Vec<String> = fs::read_dir(&archives).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        left.sort();
        assert_eq!(left, vec![".partial-notes".to_string(), "notes.txt".to_string()]);
        assert_eq!(remove_all_archives(&dir.path().join("absent")), (0, 0));
    }

    #[test]
    fn sweeps_stale_partials_but_not_fresh_ones() {
        let (_dir, projects, archives, path) = setup(&line(0));
        fs::create_dir_all(&archives).unwrap();
        let stale = archives.join(".partial-1-1");
        let fresh = archives.join(".partial-2-2");
        fs::write(&stale, "old").unwrap();
        fs::write(&fresh, "new").unwrap();
        let old = std::time::SystemTime::now() - std::time::Duration::from_secs(7200);
        fs::File::options().write(true).open(&stale).unwrap().set_modified(old).unwrap();
        archive_session_at(&projects, &archives, &path).unwrap();
        assert!(!stale.exists());
        assert!(fresh.exists());
    }

    #[test]
    fn moving_storage_carries_archives_and_only_archives() {
        let (dir, projects, archives, path) = setup(&line(0));
        let archive = archive_session_at(&projects, &archives, &path).unwrap();
        fs::write(archives.join("notes.txt"), "keep").unwrap();
        let moved_to = dir.path().join("Elsewhere").join("archives").join("claude-code");
        assert_eq!(move_archives(&archives, &moved_to).unwrap(), 1);
        assert!(moved_to.join(&archive.file_name).exists());
        assert!(!archives.join(&archive.file_name).exists());
        assert!(archives.join("notes.txt").exists(), "nothing but archives is moved");
        assert_eq!(move_archives(&dir.path().join("none"), &moved_to).unwrap(), 0);
    }

    #[test]
    fn removes_exactly_one_named_archive() {
        let (_dir, projects, archives, path) = setup(&line(0));
        let archive = archive_session_at(&projects, &archives, &path).unwrap();
        assert!(remove_archive_at(&archives, "../s.jsonl").unwrap_err().starts_with("Refused"));
        assert!(remove_archive_at(&archives, "s.jsonl").unwrap_err().starts_with("Refused"));
        assert!(remove_archive_at(&archives, &archive.file_name).unwrap());
        assert!(!Path::new(&archive.path).exists());
        assert!(!remove_archive_at(&archives, &archive.file_name).unwrap(), "already gone");
        assert!(Path::new(&path).exists(), "the original is never touched");
    }

    #[test]
    fn an_archive_reads_back_through_the_bounded_reader_with_the_same_fingerprint() {
        let body: String = (0..4).map(line).collect();
        let (_dir, projects, archives, path) = setup(&body);
        let original = crate::claude::code::read_session_window_with(&projects, &path, None, None, None, None, 1 << 20).unwrap();
        let archive = archive_session_at(&projects, &archives, &path).unwrap();
        let copy = crate::claude::code::read_session_window_with(&archives, &archive.path, None, None, None, None, 1 << 20).unwrap();
        assert_eq!(copy.source_id, original.source_id);
        assert_eq!(copy.events.iter().map(|e| e.content.clone()).collect::<Vec<_>>(), original.events.iter().map(|e| e.content.clone()).collect::<Vec<_>>());
        // An archive is not readable through the projects root, nor an original through the archive root.
        assert!(crate::claude::code::read_session_window_with(&projects, &archive.path, None, None, None, None, 1 << 20).is_err());
        assert!(crate::claude::code::read_session_window_with(&archives, &path, None, None, None, None, 1 << 20).is_err());
    }

    #[test]
    fn a_kept_copy_verifies_only_as_the_file_it_was() {
        let (_dir, projects, archives, path) = setup(&format!("{}{}", line(0), line(1)));
        let archive = archive_session_at(&projects, &archives, &path).unwrap();
        assert_eq!(verify_archive_at(&archives, &archive.file_name, archive.bytes), "ok");
        // Truncated: the size no longer matches.
        let file = archives.join(&archive.file_name);
        let body = fs::read(&file).unwrap();
        fs::write(&file, &body[..body.len() - 3]).unwrap();
        assert_eq!(verify_archive_at(&archives, &archive.file_name, archive.bytes), "damaged");
        // Same size, different bytes: the hash no longer matches its name.
        let mut corrupt = body.clone();
        corrupt[0] ^= 1;
        fs::write(&file, &corrupt).unwrap();
        assert_eq!(verify_archive_at(&archives, &archive.file_name, archive.bytes), "damaged");
        fs::remove_file(&file).unwrap();
        assert_eq!(verify_archive_at(&archives, &archive.file_name, archive.bytes), "missing");
        assert_eq!(verify_archive_at(&archives, "../escape.jsonl", 1), "damaged");
    }
}
