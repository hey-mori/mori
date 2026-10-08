//! Observed repository identity: which Git checkout a session's work belongs
//! to, and how that is known. Read-only filesystem inspection, no `git`
//! subprocess, no network.
//!
//! This answers only "which repository does this source appear to belong to".
//! It does not decide which Mori project the session belongs to (a user's
//! organisational choice), and it says nothing about what the session did.
//!
//! Two kinds of evidence, kept apart because they describe different times:
//!
//! - `session-record`: the agent wrote it during the session (Claude's
//!   `worktree-state` names the checkout a worktree was created from). It is a
//!   historical observation and stays true after the worktree is deleted.
//! - `git-worktree` / `git-checkout`: what the directory's Git metadata says
//!   now. A linked worktree's `.git` file points at the main repository's
//!   common directory; a plain checkout is its own root. A deleted or reused
//!   directory makes this unknown or wrong, so it never overrides the record.
//!
//! When both exist and disagree, no identity is reported: a contradiction is
//! not resolved by picking one.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryObservation {
    /// The checkout root, "" when the evidence contradicts itself.
    pub root: String,
    /// `session-record`, `git-worktree`, or `git-checkout`; "" on conflict.
    pub basis: String,
    /// The linked worktree the work happened in, when there was one.
    pub worktree_path: String,
    /// The session record and the current Git metadata name different roots.
    pub conflict: bool,
}

/// What a directory's Git metadata says now: the checkout root and whether the
/// directory is a linked worktree of it. `None` outside any repository, for a
/// bare repository, or when the metadata cannot be read.
pub fn git_checkout_root(dir: &Path) -> Option<(PathBuf, bool)> {
    let mut current = Some(dir);
    for _ in 0..64 {
        let here = current?;
        let dot_git = here.join(".git");
        if dot_git.is_dir() {
            return Some((here.to_path_buf(), false));
        }
        if dot_git.is_file() {
            return linked_worktree_root(here, &dot_git).map(|root| (root, true));
        }
        current = here.parent();
    }
    None
}

/// A linked worktree's `.git` file reads `gitdir: <repo>/.git/worktrees/<name>`,
/// and that directory's `commondir` names the shared `.git`. The main checkout
/// is the directory holding that `.git`.
fn linked_worktree_root(worktree: &Path, dot_git_file: &Path) -> Option<PathBuf> {
    let text = fs::read_to_string(dot_git_file).ok()?;
    let gitdir = text.lines().find_map(|line| line.strip_prefix("gitdir:"))?.trim();
    let gitdir = resolve(worktree, gitdir);
    let common = fs::read_to_string(gitdir.join("commondir")).ok()?;
    let common = normalize(&resolve(&gitdir, common.trim()));
    if common.file_name()? != ".git" {
        // A bare repository has no working checkout to name.
        return None;
    }
    common.parent().map(Path::to_path_buf)
}

fn resolve(base: &Path, path: &str) -> PathBuf {
    let candidate = Path::new(path);
    if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        base.join(candidate)
    }
}

/// Lexically fold `.` and `..` so `<gitdir>/../..` compares as a plain path.
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn same_path(a: &str, b: &str) -> bool {
    a.trim_end_matches('/') == b.trim_end_matches('/')
}

/// Combine the session's own record (a worktree's origin checkout and path)
/// with what Git metadata says now about where the session worked.
pub fn observe_repository(
    cwd: &str,
    recorded_origin: Option<(&str, &str)>,
) -> Option<RepositoryObservation> {
    let worktree_path = recorded_origin.map(|(_, path)| path).unwrap_or("");
    let probe = if worktree_path.is_empty() { cwd } else { worktree_path };
    let now = if probe.trim().is_empty() {
        None
    } else {
        git_checkout_root(Path::new(probe))
    };

    match (recorded_origin, now) {
        (Some((origin, path)), Some((root, _))) => {
            let root = root.to_string_lossy().to_string();
            if same_path(origin, &root) {
                Some(observation(origin, "session-record", path))
            } else {
                Some(RepositoryObservation {
                    root: String::new(),
                    basis: String::new(),
                    worktree_path: path.to_string(),
                    conflict: true,
                })
            }
        }
        (Some((origin, path)), None) => Some(observation(origin, "session-record", path)),
        (None, Some((root, linked))) => {
            let root = root.to_string_lossy().to_string();
            if linked {
                Some(observation(&root, "git-worktree", probe))
            } else {
                Some(observation(&root, "git-checkout", ""))
            }
        }
        (None, None) => None,
    }
}

fn observation(root: &str, basis: &str, worktree_path: &str) -> RepositoryObservation {
    RepositoryObservation {
        root: root.trim_end_matches('/').to_string(),
        basis: basis.to_string(),
        worktree_path: worktree_path.to_string(),
        conflict: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// A main checkout at `<tmp>/<name>` with linked worktrees, laid out the way
    /// `git worktree add` writes them.
    fn repo(dir: &TempDir, name: &str) -> PathBuf {
        let root = dir.path().join(name);
        fs::create_dir_all(root.join(".git").join("worktrees")).unwrap();
        root
    }

    fn worktree(repo: &Path, at: &Path, name: &str) {
        let admin = repo.join(".git").join("worktrees").join(name);
        fs::create_dir_all(&admin).unwrap();
        fs::write(admin.join("commondir"), "../..\n").unwrap();
        fs::create_dir_all(at).unwrap();
        fs::write(at.join(".git"), format!("gitdir: {}\n", admin.display())).unwrap();
    }

    fn text(path: &Path) -> String {
        path.to_string_lossy().to_string()
    }

    #[test]
    fn a_plain_checkout_is_its_own_root_even_from_a_subdirectory() {
        let dir = TempDir::new().unwrap();
        let root = repo(&dir, "infra");
        fs::create_dir_all(root.join("src").join("deep")).unwrap();
        let seen = observe_repository(&text(&root.join("src").join("deep")), None).unwrap();
        assert_eq!(seen.root, text(&root));
        assert_eq!(seen.basis, "git-checkout");
        assert!(!seen.conflict);
    }

    #[test]
    fn a_linked_worktree_resolves_to_its_main_checkout() {
        let dir = TempDir::new().unwrap();
        let root = repo(&dir, "mori");
        let wt = dir.path().join("mori-wt-exp");
        worktree(&root, &wt, "mori-wt-exp");
        let seen = observe_repository(&text(&wt), None).unwrap();
        assert_eq!(seen.root, text(&root));
        assert_eq!(seen.basis, "git-worktree");
        assert_eq!(seen.worktree_path, text(&wt));
    }

    #[test]
    fn two_worktrees_of_one_repository_share_its_root() {
        let dir = TempDir::new().unwrap();
        let root = repo(&dir, "infra");
        let a = root.join(".claude").join("worktrees").join("a");
        let b = dir.path().join("infra-ci-plants");
        worktree(&root, &a, "a");
        worktree(&root, &b, "b");
        assert_eq!(observe_repository(&text(&a), None).unwrap().root, text(&root));
        assert_eq!(observe_repository(&text(&b), None).unwrap().root, text(&root));
    }

    #[test]
    fn two_repositories_with_the_same_name_stay_apart() {
        let dir = TempDir::new().unwrap();
        let work = repo(&dir, "work/api");
        let play = repo(&dir, "play/api");
        let a = observe_repository(&text(&work), None).unwrap();
        let b = observe_repository(&text(&play), None).unwrap();
        assert_ne!(a.root, b.root);
    }

    #[test]
    fn the_session_record_survives_a_deleted_worktree() {
        // The worktree is gone, so Git can say nothing now; the record still
        // names the checkout it came from.
        let seen = observe_repository("/home/u/dev", Some(("/home/u/dev/infra", "/home/u/dev/infra/.claude/worktrees/gone"))).unwrap();
        assert_eq!(seen.root, "/home/u/dev/infra");
        assert_eq!(seen.basis, "session-record");
    }

    #[test]
    fn the_session_record_and_git_agree_for_a_live_claude_worktree() {
        let dir = TempDir::new().unwrap();
        let root = repo(&dir, "infra");
        let wt = root.join(".claude").join("worktrees").join("storage");
        worktree(&root, &wt, "storage");
        let seen = observe_repository(&text(dir.path()), Some((&text(&root), &text(&wt)))).unwrap();
        assert_eq!(seen.root, text(&root));
        assert_eq!(seen.basis, "session-record");
        assert!(!seen.conflict);
    }

    #[test]
    fn a_reused_path_that_now_belongs_elsewhere_is_a_conflict_not_a_guess() {
        // The record says the worktree came from `infra`; the same path is now a
        // worktree of `other`. Neither wins.
        let dir = TempDir::new().unwrap();
        let other = repo(&dir, "other");
        let wt = dir.path().join("reused");
        worktree(&other, &wt, "reused");
        let seen = observe_repository("/x", Some(("/home/u/dev/infra", &text(&wt)))).unwrap();
        assert!(seen.conflict);
        assert_eq!(seen.root, "");
    }

    #[test]
    fn no_repository_and_no_record_is_unknown() {
        let dir = TempDir::new().unwrap();
        assert_eq!(observe_repository(&text(dir.path()), None), None);
        assert_eq!(observe_repository("", None), None);
    }

    #[test]
    fn a_bare_repository_names_no_checkout() {
        let dir = TempDir::new().unwrap();
        let bare = dir.path().join("srv.git");
        let admin = bare.join("worktrees").join("w");
        fs::create_dir_all(&admin).unwrap();
        fs::write(admin.join("commondir"), "../..\n").unwrap();
        let wt = dir.path().join("w");
        fs::create_dir_all(&wt).unwrap();
        fs::write(wt.join(".git"), format!("gitdir: {}\n", admin.display())).unwrap();
        assert_eq!(observe_repository(&text(&wt), None), None);
    }
}
