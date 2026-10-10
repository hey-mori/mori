//! Automatic pre-migration backups and restore.
//!
//! Before a schema migration runs against an existing database, Mori writes a
//! consistent snapshot into a `backups/` folder beside the live database, so a
//! migration that fails (a checksum mismatch or a bad `apply`) has a restore
//! point instead of a dead end. Snapshots use `VACUUM INTO`, which writes a
//! single self-contained file from the live connection (no WAL/SHM sidecars to
//! copy), and the folder is pruned to the most recent `MAX_BACKUPS`.
//!
//! The pure functions take an explicit backups directory so they are testable
//! against a tempdir; the command layer resolves the real `backups_dir()`.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use serde::Serialize;

use crate::package::default_storage_dir;

/// How many pre-migration snapshots to keep. Older ones are pruned after each
/// new backup so the folder never grows without bound.
const MAX_BACKUPS: usize = 5;

/// The automatic-backup directory, under the active storage dir.
pub fn backups_dir() -> Result<PathBuf, String> {
    Ok(default_storage_dir()?.join("backups"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    /// Filesystem modified time in Unix milliseconds (0 if unavailable).
    pub modified_ms: u128,
}

/// Write a consistent snapshot of `conn` into `dir`, labelled for context, then
/// prune old snapshots. Returns the created file path. On any failure the caller
/// should abort the migration so the database is never changed without a
/// restore point.
pub fn backup_database(conn: &Connection, dir: &Path, label: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir)
        .map_err(|error| format!("Failed to create backups dir: {error}"))?;
    let safe = sanitize(label);
    // One snapshot per distinct pre-migration state. `ensure_migrated` runs on
    // every command and migrations are not atomic across versions, so a batch
    // that partially applies then fails would otherwise re-snapshot the same
    // state on every retry, spamming full-DB VACUUMs and pruning the genuine
    // earlier restore point away. If a backup for this label already exists,
    // reuse it instead of writing another, but only a readable database: a
    // file an older build left half-written when it was killed is set aside,
    // never taken for the restore point.
    if let Some(existing) = find_backup_for_label(dir, &safe) {
        if is_readable_snapshot(&existing) {
            return Ok(existing);
        }
        set_aside(&existing);
    }
    clear_partials(dir, &safe);
    let file = dir.join(format!("mori-{}-{}.sqlite", safe, unix_millis()));
    // Written under a `.partial` name and renamed when complete, so a process
    // killed mid-write never leaves a file under a snapshot's name. VACUUM INTO
    // fails if the target exists; the millisecond stamp keeps it unique.
    // Escape any single quote in the path for the SQL string literal.
    let partial = with_suffix(&file, PARTIAL_SUFFIX);
    let target = partial.to_string_lossy().replace('\'', "''");
    conn.execute_batch(&format!("VACUUM INTO '{target}'"))
        .map_err(|error| format!("Failed to write pre-migration backup: {error}"))?;
    std::fs::rename(&partial, &file)
        .map_err(|error| format!("Failed to finish pre-migration backup: {error}"))?;
    prune_backups(dir);
    Ok(file)
}

/// The suffix a snapshot carries while it is being written.
const PARTIAL_SUFFIX: &str = ".partial";
/// The suffix a snapshot that cannot be read is set aside under.
const INVALID_SUFFIX: &str = ".invalid";

/// A complete SQLite database that passes `quick_check`. Opened read-only, so
/// checking never changes the snapshot.
fn is_readable_snapshot(path: &Path) -> bool {
    use rusqlite::OpenFlags;
    let Ok(conn) = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX) else {
        return false;
    };
    conn.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
        .map(|answer| answer == "ok")
        .unwrap_or(false)
}

/// Move an unreadable snapshot out of the names Mori lists and restores.
fn set_aside(path: &Path) {
    let _ = std::fs::rename(path, with_suffix(path, INVALID_SUFFIX));
    let _ = std::fs::remove_file(sidecar(path, "-journal"));
}

/// Remove what a killed write left for this label: `.partial` files and their
/// rollback journals. They were never a snapshot. A set-aside `.invalid` file
/// stays, so what happened can still be seen; permanent deletion removes it.
fn clear_partials(dir: &Path, safe_label: &str) {
    let prefix = format!("mori-{safe_label}-");
    let Ok(read) = std::fs::read_dir(dir) else { return };
    for path in read.flatten().map(|entry| entry.path()) {
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else { continue };
        if name.starts_with(&prefix) && name.contains(PARTIAL_SUFFIX) && is_leftover_name(name) {
            let _ = std::fs::remove_file(&path);
        }
    }
}

/// A file Mori's own snapshot writing can leave behind: a half-written
/// `.partial`, an unreadable snapshot set aside, or a rollback journal of one.
fn is_leftover_name(name: &str) -> bool {
    let base = name.strip_suffix("-journal").unwrap_or(name);
    let snapshot = base
        .strip_suffix(PARTIAL_SUFFIX)
        .or_else(|| base.strip_suffix(INVALID_SUFFIX))
        .unwrap_or(base);
    snapshot != name && is_backup_name(snapshot)
}

/// Find an existing snapshot for a label (`mori-<label>-<stamp>.sqlite`).
fn find_backup_for_label(dir: &Path, safe_label: &str) -> Option<PathBuf> {
    let prefix = format!("mori-{safe_label}-");
    let read = std::fs::read_dir(dir).ok()?;
    read.filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with(&prefix) && name.ends_with(".sqlite"))
                .unwrap_or(false)
        })
}

/// List the snapshots in `dir`, newest first.
pub fn list_backups_in(dir: &Path) -> Result<Vec<BackupInfo>, String> {
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !is_backup_file(&path) {
            continue;
        }
        let meta = entry.metadata().map_err(|error| error.to_string())?;
        out.push(BackupInfo {
            path: path.to_string_lossy().to_string(),
            file_name: file_name_of(&path),
            size_bytes: meta.len(),
            modified_ms: modified_ms(&meta),
        });
    }
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(out)
}

/// Restore `backup_path` over `target_db`, replacing the live database and
/// dropping its stale WAL/SHM sidecars. `backup_path` must resolve to a file
/// inside `dir`, so a caller cannot restore an arbitrary path. The caller must
/// drop the cached connection first so the file is unlocked.
pub fn restore_backup(backup_path: &Path, dir: &Path, target_db: &Path) -> Result<(), String> {
    let canon_dir = std::fs::canonicalize(dir)
        .map_err(|error| format!("Backups dir unavailable: {error}"))?;
    let canon_backup = std::fs::canonicalize(backup_path)
        .map_err(|error| format!("Backup not found: {error}"))?;
    if !canon_backup.starts_with(&canon_dir) {
        return Err("Refusing to restore a file outside the backups directory.".to_string());
    }
    // A file that is not a readable database would replace the live one with
    // nothing usable: refuse before anything is touched.
    if !is_readable_snapshot(&canon_backup) {
        return Err("Refusing to restore a backup that is not a readable database.".to_string());
    }
    if let Some(parent) = target_db.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    // The database being replaced is kept first (its WAL folded in), so a
    // restore is never the end of the state it replaced.
    if target_db.exists() {
        let keep = canon_dir.join(format!("mori-pre-restore-{}.sqlite", unix_millis()));
        let live = Connection::open(target_db).map_err(|error| format!("Failed to open the live database: {error}"))?;
        let partial = with_suffix(&keep, PARTIAL_SUFFIX);
        let quoted = partial.to_string_lossy().replace('\'', "''");
        live.execute_batch(&format!("VACUUM INTO '{quoted}'"))
            .map_err(|error| format!("Failed to keep the current database before restoring: {error}"))?;
        drop(live);
        std::fs::rename(&partial, &keep).map_err(|error| format!("Failed to keep the current database: {error}"))?;
    }
    // Copied beside the target and renamed over it: a copy cut short never
    // leaves a half-written live database.
    let incoming = with_suffix(target_db, ".restoring");
    std::fs::copy(&canon_backup, &incoming)
        .map_err(|error| format!("Failed to restore backup: {error}"))?;
    for suffix in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(sidecar(target_db, suffix));
    }
    std::fs::rename(&incoming, target_db).map_err(|error| format!("Failed to restore backup: {error}"))?;
    Ok(())
}

/// Permanent deletion of all Mori data (decision B of the recovery program):
/// the pre-migration snapshots hold records and saved passages, so they go
/// too. Only snapshot files Mori names (`mori-*.sqlite`) directly inside the
/// managed folder; never through a symlinked folder, never a symlinked entry,
/// never anything else. Returns how many went and how many are still there,
/// so the caller can say a deletion was incomplete.
///
/// The recovery "start fresh" deliberately does not call this: its snapshots
/// are the way back.
pub fn remove_all_backups_in(dir: &Path) -> (usize, usize) {
    match std::fs::symlink_metadata(dir) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return (0, 0),
        Err(_) => return (0, 1),
        // A symlinked folder could point anywhere: refuse, and count it as left.
        Ok(meta) if !meta.is_dir() => return (0, 1),
        Ok(_) => {}
    }
    let Ok(read) = std::fs::read_dir(dir) else { return (0, 1) };
    let (mut removed, mut left) = (0, 0);
    for entry in read.flatten() {
        let path = entry.path();
        let leftover = path.file_name().and_then(|name| name.to_str()).is_some_and(is_leftover_name);
        if !is_backup_file(&path) && !leftover {
            continue;
        }
        if !entry.file_type().map(|kind| kind.is_file()).unwrap_or(false) {
            continue;
        }
        if std::fs::remove_file(&path).is_ok() {
            removed += 1;
        } else {
            left += 1;
        }
    }
    (removed, left)
}

fn prune_backups(dir: &Path) {
    let read = match std::fs::read_dir(dir) {
        Ok(read) => read,
        Err(_) => return,
    };
    let mut entries: Vec<(u128, PathBuf)> = read
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| is_backup_file(path))
        .filter_map(|path| {
            let meta = path.metadata().ok()?;
            Some((modified_ms(&meta), path))
        })
        .collect();
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in entries.into_iter().skip(MAX_BACKUPS) {
        let _ = std::fs::remove_file(path);
    }
}

/// Exactly the names Mori writes: `mori-pre-v<N>-<millis>.sqlite` before a
/// migration, `mori-pre-restore-<millis>.sqlite` before a restore. Narrow on
/// purpose: prune and permanent deletion remove only these, never a copy a
/// user saved beside them under a Mori-like name.
fn is_backup_file(path: &Path) -> bool {
    path.file_name().and_then(|name| name.to_str()).is_some_and(is_backup_name)
}

fn is_backup_name(name: &str) -> bool {
    let digits = |part: Option<&str>| part.is_some_and(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()));
    if let Some(stamp) = name.strip_prefix("mori-pre-restore-").and_then(|rest| rest.strip_suffix(".sqlite")) {
        return digits(Some(stamp));
    }
    let Some(rest) = name.strip_prefix("mori-pre-v").and_then(|rest| rest.strip_suffix(".sqlite")) else {
        return false;
    };
    let mut parts = rest.split('-');
    digits(parts.next()) && digits(parts.next()) && parts.next().is_none()
}

/// Move Mori's snapshots with a relocated storage folder, so they stay listed,
/// restorable, and inside what a permanent deletion removes. Copy, sync, then
/// remove the originals; an existing file of the same name is kept.
pub fn move_backups(from: &Path, to: &Path) -> Result<usize, String> {
    if from == to {
        return Ok(0);
    }
    let Ok(read) = std::fs::read_dir(from) else { return Ok(0) };
    let names: Vec<PathBuf> = read
        .flatten()
        .filter(|entry| entry.file_type().map(|kind| kind.is_file()).unwrap_or(false))
        .map(|entry| entry.path())
        .filter(|path| is_backup_file(path))
        .collect();
    if names.is_empty() {
        return Ok(0);
    }
    std::fs::create_dir_all(to).map_err(|error| format!("Failed to create backups dir: {error}"))?;
    for path in &names {
        let target = to.join(file_name_of(path));
        if !target.exists() {
            std::fs::copy(path, &target).map_err(|error| format!("Failed to move a backup: {error}"))?;
        }
    }
    for path in &names {
        let _ = std::fs::remove_file(path);
    }
    Ok(names.len())
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn modified_ms(meta: &std::fs::Metadata) -> u128 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|delta| delta.as_millis())
        .unwrap_or(0)
}

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|delta| delta.as_millis())
        .unwrap_or(0)
}

/// Keep the label filesystem-safe (labels are internal, e.g. "pre-v7").
fn sanitize(label: &str) -> String {
    label
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect()
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    sidecar(path, suffix)
}

fn sidecar(db: &Path, suffix: &str) -> PathBuf {
    let mut name = db.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn seed_db(path: &Path) -> Connection {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE note (id INTEGER PRIMARY KEY, body TEXT);\
             INSERT INTO note (body) VALUES ('hello'), ('world');",
        )
        .unwrap();
        conn
    }

    #[test]
    fn backs_up_into_a_valid_readable_snapshot() {
        let temp = TempDir::new().unwrap();
        let db = temp.path().join("mori.sqlite");
        let conn = seed_db(&db);
        let backups = temp.path().join("backups");

        let file = backup_database(&conn, &backups, "pre-v7").unwrap();
        assert!(file.exists());
        assert!(file_name_of(&file).starts_with("mori-pre-v7-"));

        // The snapshot is a real database carrying the same rows.
        let restored = Connection::open(&file).unwrap();
        let count: i64 = restored
            .query_row("SELECT COUNT(*) FROM note", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn a_snapshot_cut_short_by_a_kill_is_never_taken_for_the_restore_point() {
        let temp = TempDir::new().unwrap();
        let db = temp.path().join("mori.sqlite");
        let conn = seed_db(&db);
        let backups = temp.path().join("backups");
        std::fs::create_dir_all(&backups).unwrap();
        // What an older build left when killed mid VACUUM INTO: the final name,
        // a fraction of the bytes, and a rollback journal.
        let cut = backups.join("mori-pre-v7-1000.sqlite");
        std::fs::write(&cut, b"SQLite format 3\0 then nothing").unwrap();
        std::fs::write(sidecar(&cut, "-journal"), b"j").unwrap();

        let file = backup_database(&conn, &backups, "pre-v7").unwrap();
        assert_ne!(file, cut);
        assert!(is_readable_snapshot(&file));
        assert!(!cut.exists());
        assert!(with_suffix(&cut, INVALID_SUFFIX).exists());
        assert!(!sidecar(&cut, "-journal").exists());
        let listed: Vec<String> = list_backups_in(&backups).unwrap().into_iter().map(|b| b.file_name).collect();
        assert_eq!(listed, vec![file_name_of(&file)]);
    }

    #[test]
    fn a_snapshot_is_written_under_a_partial_name_and_renamed_when_complete() {
        let temp = TempDir::new().unwrap();
        let db = temp.path().join("mori.sqlite");
        let conn = seed_db(&db);
        let backups = temp.path().join("backups");
        std::fs::create_dir_all(&backups).unwrap();
        let stale = backups.join("mori-pre-v7-999.sqlite.partial");
        std::fs::write(&stale, b"half").unwrap();

        let file = backup_database(&conn, &backups, "pre-v7").unwrap();
        assert!(is_readable_snapshot(&file));
        let names: Vec<String> = std::fs::read_dir(&backups).unwrap().flatten().map(|e| file_name_of(&e.path())).collect();
        assert_eq!(names, vec![file_name_of(&file)], "no partial left behind");
    }

    #[test]
    fn restore_refuses_a_backup_that_is_not_a_database_and_leaves_the_live_one() {
        let temp = TempDir::new().unwrap();
        let db = temp.path().join("mori.sqlite");
        drop(seed_db(&db));
        let backups = temp.path().join("backups");
        std::fs::create_dir_all(&backups).unwrap();
        let broken = backups.join("mori-pre-v7-1000.sqlite");
        std::fs::write(&broken, b"not a database").unwrap();
        let before = std::fs::read(&db).unwrap();

        assert!(restore_backup(&broken, &backups, &db).is_err());
        assert_eq!(std::fs::read(&db).unwrap(), before);
        assert_eq!(std::fs::read_dir(&backups).unwrap().count(), 1, "nothing kept, nothing written");
    }

    #[test]
    fn restore_keeps_the_database_it_replaces() {
        let temp = TempDir::new().unwrap();
        let db = temp.path().join("mori.sqlite");
        let conn = seed_db(&db);
        let backups = temp.path().join("backups");
        let snapshot = backup_database(&conn, &backups, "pre-v7").unwrap();
        conn.execute_batch("INSERT INTO note (body) VALUES ('after the snapshot');").unwrap();
        drop(conn);

        restore_backup(&snapshot, &backups, &db).unwrap();
        let count = |path: &Path| -> i64 {
            Connection::open(path).unwrap().query_row("SELECT COUNT(*) FROM note", [], |row| row.get(0)).unwrap()
        };
        assert_eq!(count(&db), 2);
        let kept = list_backups_in(&backups).unwrap().into_iter().find(|b| b.file_name.starts_with("mori-pre-restore-")).expect("kept");
        assert_eq!(count(Path::new(&kept.path)), 3);
        assert!(!with_suffix(&db, ".restoring").exists());
    }

    #[test]
    fn permanent_deletion_also_removes_what_a_killed_snapshot_left() {
        let temp = TempDir::new().unwrap();
        let dir = temp.path().join("backups");
        std::fs::create_dir_all(&dir).unwrap();
        for name in [
            "mori-pre-v7-1.sqlite.partial",
            "mori-pre-v7-1.sqlite.partial-journal",
            "mori-pre-v7-2.sqlite.invalid",
            "mori-pre-v7-3.sqlite-journal",
            "mori-pre-restore-4.sqlite",
        ] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        std::fs::write(dir.join("my-notes.sqlite.partial"), b"mine").unwrap();
        let (removed, left) = remove_all_backups_in(&dir);
        assert_eq!((removed, left), (5, 0));
        assert!(dir.join("my-notes.sqlite.partial").exists());
    }

    #[test]
    fn reuses_an_existing_snapshot_for_the_same_label() {
        let temp = TempDir::new().unwrap();
        let db = temp.path().join("mori.sqlite");
        let conn = seed_db(&db);
        let backups = temp.path().join("backups");

        let first = backup_database(&conn, &backups, "pre-v7").unwrap();
        // A second call for the same label must not write another file: a
        // partially-applied, retrying migration would otherwise re-snapshot the
        // same state on every command.
        let second = backup_database(&conn, &backups, "pre-v7").unwrap();
        assert_eq!(first, second);
        assert_eq!(list_backups_in(&backups).unwrap().len(), 1);

        // A distinct label (a further-applied state) does get its own snapshot.
        backup_database(&conn, &backups, "pre-v9").unwrap();
        assert_eq!(list_backups_in(&backups).unwrap().len(), 2);
    }

    #[test]
    fn prunes_to_the_most_recent_backups() {
        let temp = TempDir::new().unwrap();
        let backups = temp.path().join("backups");
        std::fs::create_dir_all(&backups).unwrap();
        // Pre-seed more than the cap with distinct modified times.
        for i in 0..(MAX_BACKUPS + 3) {
            let path = backups.join(format!("mori-pre-v{}-{i}.sqlite", 100 + i));
            std::fs::write(&path, b"x").unwrap();
        }
        let db = temp.path().join("mori.sqlite");
        let conn = seed_db(&db);
        backup_database(&conn, &backups, "pre-v7").unwrap();

        let listed = list_backups_in(&backups).unwrap();
        assert_eq!(listed.len(), MAX_BACKUPS);
    }

    #[test]
    fn restores_a_backup_over_the_live_db() {
        let temp = TempDir::new().unwrap();
        let db = temp.path().join("mori.sqlite");
        let conn = seed_db(&db);
        let backups = temp.path().join("backups");
        let snapshot = backup_database(&conn, &backups, "pre-v7").unwrap();

        // Mutate the live DB after the snapshot, then restore.
        conn.execute("DELETE FROM note", []).unwrap();
        drop(conn);
        restore_backup(&snapshot, &backups, &db).unwrap();

        let conn = Connection::open(&db).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM note", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn refuses_to_restore_outside_the_backups_dir() {
        let temp = TempDir::new().unwrap();
        let backups = temp.path().join("backups");
        std::fs::create_dir_all(&backups).unwrap();
        let outside = temp.path().join("evil.sqlite");
        std::fs::write(&outside, b"x").unwrap();
        let db = temp.path().join("mori.sqlite");

        let result = restore_backup(&outside, &backups, &db);
        assert!(result.is_err());
    }

    #[test]
    fn permanent_deletion_removes_only_mori_snapshots() {
        let dir = TempDir::new().unwrap();
        let backups = dir.path().join("backups");
        std::fs::create_dir_all(&backups).unwrap();
        std::fs::write(backups.join("mori-pre-v13-1791558670015.sqlite"), "a").unwrap();
        std::fs::write(backups.join("mori-pre-v8-2.sqlite"), "b").unwrap();
        std::fs::write(backups.join("my-own-copy.sqlite"), "keep").unwrap();
        std::fs::write(backups.join("mori-export.sqlite"), "keep").unwrap();
        std::fs::write(backups.join("mori-pre-v13-keep.sqlite"), "keep").unwrap();
        std::fs::write(backups.join("notes.txt"), "keep").unwrap();
        assert_eq!(remove_all_backups_in(&backups), (2, 0));
        let mut left: Vec<String> = std::fs::read_dir(&backups).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        left.sort();
        assert_eq!(
            left,
            vec!["mori-export.sqlite", "mori-pre-v13-keep.sqlite", "my-own-copy.sqlite", "notes.txt"]
                .into_iter()
                .map(String::from)
                .collect::<Vec<_>>()
        );
        assert_eq!(remove_all_backups_in(&dir.path().join("absent")), (0, 0));
    }

    #[cfg(unix)]
    #[test]
    fn permanent_deletion_refuses_a_symlinked_snapshot_folder() {
        let dir = TempDir::new().unwrap();
        let elsewhere = dir.path().join("elsewhere");
        std::fs::create_dir_all(&elsewhere).unwrap();
        std::fs::write(elsewhere.join("mori-pre-v1-1.sqlite"), "someone else's").unwrap();
        let link = dir.path().join("backups");
        std::os::unix::fs::symlink(&elsewhere, &link).unwrap();
        assert_eq!(remove_all_backups_in(&link), (0, 1));
        assert!(elsewhere.join("mori-pre-v1-1.sqlite").exists());
    }

    #[test]
    fn snapshots_move_with_a_relocated_storage_folder() {
        let dir = TempDir::new().unwrap();
        let old = dir.path().join("old/backups");
        let new = dir.path().join("new/backups");
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("mori-pre-v12-1.sqlite"), "snap").unwrap();
        std::fs::write(old.join("mine.sqlite"), "user").unwrap();
        assert_eq!(move_backups(&old, &new).unwrap(), 1);
        assert!(new.join("mori-pre-v12-1.sqlite").exists());
        assert!(!old.join("mori-pre-v12-1.sqlite").exists());
        assert!(old.join("mine.sqlite").exists());
    }
}
