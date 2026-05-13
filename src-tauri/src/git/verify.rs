use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRepositoryRequest {
    pub repo_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryVerificationResult {
    pub repo_path: String,
    pub git_root: String,
    pub current_branch: Option<String>,
    pub head_commit: String,
    pub short_head_commit: String,
    pub is_dirty: bool,
    pub verified_at: String,
    pub command_duration_ms: u64,
}

#[tauri::command]
pub fn verify_repository_path(
    request: VerifyRepositoryRequest,
) -> Result<RepositoryVerificationResult, String> {
    verify(&request, &RealGitRunner)
}

fn verify<R: GitRunner>(
    request: &VerifyRepositoryRequest,
    runner: &R,
) -> Result<RepositoryVerificationResult, String> {
    let path = validate_repo_path(&request.repo_path)?;

    let started = Instant::now();

    let toplevel = runner
        .git(&path, &["rev-parse", "--show-toplevel"])?
        .require_success("git rev-parse --show-toplevel")?;
    let git_root = String::from_utf8_lossy(&toplevel.stdout).trim().to_string();
    if git_root.is_empty() {
        return Err("Path is not inside a Git work tree.".to_string());
    }

    let head = runner
        .git(&path, &["rev-parse", "HEAD"])?
        .require_success("git rev-parse HEAD")?;
    let head_commit = String::from_utf8_lossy(&head.stdout).trim().to_string();
    if head_commit.is_empty() {
        return Err("Repository has no HEAD commit yet.".to_string());
    }
    let short_head_commit = head_commit.chars().take(7).collect::<String>();

    // `branch --show-current` prints an empty line on detached HEAD; we
    // surface that as `None` rather than an empty string.
    let branch_output = runner
        .git(&path, &["branch", "--show-current"])?
        .require_success("git branch --show-current")?;
    let raw_branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();
    let current_branch = if raw_branch.is_empty() {
        None
    } else {
        Some(raw_branch)
    };

    let status_output = runner
        .git(&path, &["status", "--porcelain"])?
        .require_success("git status --porcelain")?;
    let is_dirty = !String::from_utf8_lossy(&status_output.stdout).trim().is_empty();

    let command_duration_ms = started.elapsed().as_millis() as u64;
    let verified_at = now_iso();

    Ok(RepositoryVerificationResult {
        repo_path: path.to_string_lossy().to_string(),
        git_root,
        current_branch,
        head_commit,
        short_head_commit,
        is_dirty,
        verified_at,
        command_duration_ms,
    })
}

fn validate_repo_path(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Repository path is required.".to_string());
    }
    let path = PathBuf::from(trimmed);
    if !path.exists() {
        return Err(format!("Repository path does not exist: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!(
            "Repository path is not a directory: {}",
            path.display()
        ));
    }
    Ok(path)
}

fn now_iso() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("epoch:{seconds}")
}

trait GitRunner {
    fn git(&self, repo: &Path, args: &[&str]) -> Result<RunnerOutput, String>;
}

struct RunnerOutput {
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    exit_code: i32,
}

impl RunnerOutput {
    fn from_process(output: Output) -> Self {
        Self {
            stdout: output.stdout,
            stderr: output.stderr,
            exit_code: output.status.code().unwrap_or(-1),
        }
    }

    fn require_success(self, command_label: &str) -> Result<Self, String> {
        if self.exit_code != 0 {
            let stderr = String::from_utf8_lossy(&self.stderr).trim().to_string();
            return Err(format!(
                "{command_label} failed with exit code {}: {}",
                self.exit_code,
                if stderr.is_empty() { "no stderr output".to_string() } else { stderr }
            ));
        }
        Ok(self)
    }
}

struct RealGitRunner;

impl GitRunner for RealGitRunner {
    fn git(&self, repo: &Path, args: &[&str]) -> Result<RunnerOutput, String> {
        let mut command = Command::new("git");
        command.arg("-C").arg(repo);
        for arg in args {
            command.arg(arg);
        }
        let output = command.output().map_err(|error| {
            if matches!(error.kind(), std::io::ErrorKind::NotFound) {
                "`git` executable not found on PATH. Install Git or add it to PATH.".to_string()
            } else {
                format!("Failed to launch git: {error}")
            }
        })?;
        Ok(RunnerOutput::from_process(output))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn make_output(stdout: &str, stderr: &str, code: i32) -> RunnerOutput {
        RunnerOutput {
            stdout: stdout.as_bytes().to_vec(),
            stderr: stderr.as_bytes().to_vec(),
            exit_code: code,
        }
    }

    struct FakeGitRunner {
        responses: RefCell<Vec<(String, Result<RunnerOutput, String>)>>,
        captured: RefCell<Vec<(PathBuf, Vec<String>)>>,
    }

    impl FakeGitRunner {
        fn new(responses: Vec<(&'static str, Result<RunnerOutput, String>)>) -> Self {
            Self {
                responses: RefCell::new(
                    responses
                        .into_iter()
                        .map(|(label, result)| (label.to_string(), result))
                        .collect(),
                ),
                captured: RefCell::new(Vec::new()),
            }
        }
    }

    impl GitRunner for FakeGitRunner {
        fn git(&self, repo: &Path, args: &[&str]) -> Result<RunnerOutput, String> {
            self.captured
                .borrow_mut()
                .push((repo.to_path_buf(), args.iter().map(|arg| arg.to_string()).collect()));
            let mut responses = self.responses.borrow_mut();
            if responses.is_empty() {
                return Err("FakeGitRunner ran out of programmed responses".to_string());
            }
            let (_label, result) = responses.remove(0);
            result
        }
    }

    #[test]
    fn rejects_missing_directory() {
        let request = VerifyRepositoryRequest {
            repo_path: "C:/this-path/does-not-exist/__mori__".to_string(),
        };
        let runner = FakeGitRunner::new(Vec::new());
        let error = verify(&request, &runner).unwrap_err();
        assert!(error.contains("does not exist"));
    }

    #[test]
    fn rejects_when_toplevel_call_fails() {
        let runner = FakeGitRunner::new(vec![(
            "rev-parse --show-toplevel",
            Ok(make_output("", "fatal: not a git repository", 128)),
        )]);
        let request = VerifyRepositoryRequest {
            repo_path: std::env::temp_dir().to_string_lossy().to_string(),
        };
        let error = verify(&request, &runner).unwrap_err();
        assert!(error.contains("rev-parse --show-toplevel failed"));
        assert!(error.contains("exit code 128"));
        assert!(error.contains("not a git repository"));
    }

    #[test]
    fn returns_structured_metadata_for_a_dirty_branch() {
        let runner = FakeGitRunner::new(vec![
            (
                "rev-parse --show-toplevel",
                Ok(make_output("/tmp/repo\n", "", 0)),
            ),
            ("rev-parse HEAD", Ok(make_output("0123456789abcdef0123456789abcdef01234567\n", "", 0))),
            ("branch --show-current", Ok(make_output("main\n", "", 0))),
            ("status --porcelain", Ok(make_output(" M src/lib.rs\n?? new.txt\n", "", 0))),
        ]);
        let request = VerifyRepositoryRequest {
            repo_path: std::env::temp_dir().to_string_lossy().to_string(),
        };
        let result = verify(&request, &runner).expect("verify");
        assert_eq!(result.git_root, "/tmp/repo");
        assert_eq!(result.head_commit, "0123456789abcdef0123456789abcdef01234567");
        assert_eq!(result.short_head_commit, "0123456");
        assert_eq!(result.current_branch.as_deref(), Some("main"));
        assert!(result.is_dirty);
    }

    #[test]
    fn detached_head_is_reported_as_no_branch() {
        let runner = FakeGitRunner::new(vec![
            ("rev-parse --show-toplevel", Ok(make_output("/tmp/repo\n", "", 0))),
            ("rev-parse HEAD", Ok(make_output("abcdef0123\n", "", 0))),
            ("branch --show-current", Ok(make_output("\n", "", 0))),
            ("status --porcelain", Ok(make_output("", "", 0))),
        ]);
        let request = VerifyRepositoryRequest {
            repo_path: std::env::temp_dir().to_string_lossy().to_string(),
        };
        let result = verify(&request, &runner).expect("verify");
        assert!(result.current_branch.is_none());
        assert!(!result.is_dirty);
    }

    #[test]
    fn passes_explicit_args_and_no_shell() {
        let runner = FakeGitRunner::new(vec![
            ("rev-parse --show-toplevel", Ok(make_output("/tmp/repo\n", "", 0))),
            ("rev-parse HEAD", Ok(make_output("abc\n", "", 0))),
            ("branch --show-current", Ok(make_output("main\n", "", 0))),
            ("status --porcelain", Ok(make_output("", "", 0))),
        ]);
        let request = VerifyRepositoryRequest {
            repo_path: std::env::temp_dir().to_string_lossy().to_string(),
        };
        verify(&request, &runner).expect("verify");
        let captured = runner.captured.borrow();
        assert_eq!(captured.len(), 4);
        assert_eq!(captured[0].1, vec!["rev-parse", "--show-toplevel"]);
        assert_eq!(captured[1].1, vec!["rev-parse", "HEAD"]);
        assert_eq!(captured[2].1, vec!["branch", "--show-current"]);
        assert_eq!(captured[3].1, vec!["status", "--porcelain"]);
    }
}
