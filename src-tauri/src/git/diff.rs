use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::Instant;

use serde::{Deserialize, Serialize};

/// Maximum diff size returned to the frontend. Anything larger than ~2 MB is
/// almost certainly a binary blob, a generated file, or a misconfigured range
/// and should not be normalized into a Mori event.
const MAX_DIFF_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffRequest {
    pub repo_path: String,
    pub range: Option<String>,
    pub staged: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    pub repo_path: String,
    pub range: Option<String>,
    pub staged: bool,
    pub diff_text: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
    pub file_count_hint: usize,
    pub truncated: bool,
}

#[tauri::command]
pub fn run_git_diff(request: GitDiffRequest) -> Result<GitDiffResult, String> {
    capture_git_diff(&request, &RealGitRunner)
}

/// Pure function that drives the safety checks and command construction. The
/// runner indirection lets unit tests assert behavior without invoking `git`.
fn capture_git_diff<R: GitRunner>(request: &GitDiffRequest, runner: &R) -> Result<GitDiffResult, String> {
    let repo_path = validate_repo_path(&request.repo_path)?;
    let toplevel = runner.rev_parse_toplevel(&repo_path)?;
    let resolved_repo = toplevel.unwrap_or_else(|| repo_path.clone());

    let args = build_diff_args(request.range.as_deref(), request.staged.unwrap_or(false));

    let started_at = Instant::now();
    let output = runner.run_git(&resolved_repo, &args)?;
    let duration_ms = started_at.elapsed().as_millis() as u64;

    let stdout_bytes = output.stdout.len();
    let truncated = stdout_bytes > MAX_DIFF_BYTES;
    let diff_bytes = if truncated {
        &output.stdout[..MAX_DIFF_BYTES]
    } else {
        &output.stdout[..]
    };
    let diff_text = String::from_utf8_lossy(diff_bytes).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).trim_end().to_string();
    let exit_code = output.status.code().unwrap_or(-1);

    if exit_code != 0 {
        return Err(format!(
            "git diff failed with exit code {exit_code}: {}",
            if stderr.is_empty() { "no stderr output".to_string() } else { stderr }
        ));
    }

    Ok(GitDiffResult {
        repo_path: resolved_repo.to_string_lossy().to_string(),
        range: request.range.clone(),
        staged: request.staged.unwrap_or(false),
        file_count_hint: count_file_headers(&diff_text),
        diff_text,
        stderr,
        exit_code,
        duration_ms,
        truncated,
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

fn build_diff_args(range: Option<&str>, staged: bool) -> Vec<String> {
    // Always pair every diff with --no-color so output is parseable, and with
    // --no-pager so git does not try to launch less.
    let mut args = vec![
        "--no-pager".to_string(),
        "diff".to_string(),
        "--no-color".to_string(),
    ];
    if staged {
        args.push("--staged".to_string());
    }
    if let Some(range_value) = range {
        let trimmed = range_value.trim();
        if !trimmed.is_empty() {
            // `--` would terminate option parsing; we already control the args
            // explicitly so we just push the range as a single argument.
            args.push(trimmed.to_string());
        }
    }
    args
}

fn count_file_headers(diff_text: &str) -> usize {
    diff_text
        .lines()
        .filter(|line| line.starts_with("diff --git "))
        .count()
}

trait GitRunner {
    fn run_git(&self, repo: &Path, args: &[String]) -> Result<Output, String>;
    fn rev_parse_toplevel(&self, repo: &Path) -> Result<Option<PathBuf>, String>;
}

struct RealGitRunner;

impl GitRunner for RealGitRunner {
    fn run_git(&self, repo: &Path, args: &[String]) -> Result<Output, String> {
        let mut command = Command::new("git");
        command.arg("-C").arg(repo);
        for arg in args {
            command.arg(arg);
        }
        command.output().map_err(|error| {
            if matches!(error.kind(), std::io::ErrorKind::NotFound) {
                "`git` executable not found on PATH. Install Git or add it to PATH.".to_string()
            } else {
                format!("Failed to launch git: {error}")
            }
        })
    }

    fn rev_parse_toplevel(&self, repo: &Path) -> Result<Option<PathBuf>, String> {
        let output = Command::new("git")
            .arg("-C")
            .arg(repo)
            .arg("rev-parse")
            .arg("--show-toplevel")
            .output()
            .map_err(|error| {
                if matches!(error.kind(), std::io::ErrorKind::NotFound) {
                    "`git` executable not found on PATH. Install Git or add it to PATH.".to_string()
                } else {
                    format!("Failed to launch git: {error}")
                }
            })?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "Path is not inside a Git work tree: {}",
                stderr.trim_end()
            ));
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return Ok(None);
        }
        Ok(Some(PathBuf::from(stdout)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::path::PathBuf;
    use std::process::{ExitStatus, Output};

    fn temp_existing_dir() -> PathBuf {
        std::env::temp_dir()
    }

    fn make_output(stdout: &str, stderr: &str, code: i32) -> Output {
        #[cfg(unix)]
        let status: ExitStatus = std::os::unix::process::ExitStatusExt::from_raw((code as i32) << 8);
        #[cfg(windows)]
        let status: ExitStatus = std::os::windows::process::ExitStatusExt::from_raw(code as u32);
        Output {
            status,
            stdout: stdout.as_bytes().to_vec(),
            stderr: stderr.as_bytes().to_vec(),
        }
    }

    struct FakeGitRunner {
        toplevel: Result<Option<PathBuf>, String>,
        diff_output: Result<Output, String>,
        captured_args: RefCell<Vec<String>>,
        captured_repo: RefCell<Option<PathBuf>>,
    }

    impl FakeGitRunner {
        fn successful_diff(stdout: &str) -> Self {
            Self {
                toplevel: Ok(Some(PathBuf::from("/tmp/repo"))),
                diff_output: Ok(make_output(stdout, "", 0)),
                captured_args: RefCell::new(Vec::new()),
                captured_repo: RefCell::new(None),
            }
        }

        fn failing_toplevel(message: &str) -> Self {
            Self {
                toplevel: Err(message.to_string()),
                diff_output: Err("toplevel-not-reached".to_string()),
                captured_args: RefCell::new(Vec::new()),
                captured_repo: RefCell::new(None),
            }
        }

        fn failing_diff(stderr: &str, code: i32) -> Self {
            Self {
                toplevel: Ok(Some(PathBuf::from("/tmp/repo"))),
                diff_output: Ok(make_output("", stderr, code)),
                captured_args: RefCell::new(Vec::new()),
                captured_repo: RefCell::new(None),
            }
        }
    }

    impl GitRunner for FakeGitRunner {
        fn run_git(&self, repo: &std::path::Path, args: &[String]) -> Result<Output, String> {
            *self.captured_repo.borrow_mut() = Some(repo.to_path_buf());
            *self.captured_args.borrow_mut() = args.to_vec();
            self.diff_output.clone()
        }

        fn rev_parse_toplevel(&self, _repo: &std::path::Path) -> Result<Option<PathBuf>, String> {
            self.toplevel.clone()
        }
    }

    #[test]
    fn build_diff_args_uses_explicit_flags_and_no_shell() {
        let args = build_diff_args(None, false);
        assert_eq!(args, vec!["--no-pager", "diff", "--no-color"]);
        let staged = build_diff_args(Some("HEAD~1..HEAD"), true);
        assert_eq!(
            staged,
            vec!["--no-pager", "diff", "--no-color", "--staged", "HEAD~1..HEAD"]
        );
    }

    #[test]
    fn validate_repo_path_rejects_missing_directory() {
        let error = validate_repo_path("C:/this-path/does-not-exist/__mori__").unwrap_err();
        assert!(error.contains("does not exist"));
    }

    #[test]
    fn capture_returns_structured_result_on_success() {
        let diff = "diff --git a/foo.txt b/foo.txt\n@@ -1 +1 @@\n-old\n+new\n";
        let runner = FakeGitRunner::successful_diff(diff);
        let request = GitDiffRequest {
            repo_path: temp_existing_dir().to_string_lossy().to_string(),
            range: Some("HEAD~1..HEAD".to_string()),
            staged: Some(false),
        };
        let result = capture_git_diff(&request, &runner).expect("capture");
        assert_eq!(result.exit_code, 0);
        assert_eq!(result.file_count_hint, 1);
        assert!(result.diff_text.contains("diff --git"));
        assert_eq!(result.range.as_deref(), Some("HEAD~1..HEAD"));
        assert_eq!(
            *runner.captured_args.borrow(),
            vec!["--no-pager", "diff", "--no-color", "HEAD~1..HEAD"]
        );
    }

    #[test]
    fn capture_propagates_toplevel_failure() {
        let runner = FakeGitRunner::failing_toplevel("not a git repository");
        let request = GitDiffRequest {
            repo_path: temp_existing_dir().to_string_lossy().to_string(),
            range: None,
            staged: None,
        };
        let error = capture_git_diff(&request, &runner).unwrap_err();
        assert!(error.contains("not a git repository"));
    }

    #[test]
    fn capture_reports_non_zero_exit() {
        let runner = FakeGitRunner::failing_diff("fatal: bad revision", 128);
        let request = GitDiffRequest {
            repo_path: temp_existing_dir().to_string_lossy().to_string(),
            range: Some("does-not-exist".to_string()),
            staged: None,
        };
        let error = capture_git_diff(&request, &runner).unwrap_err();
        assert!(error.contains("exit code 128"));
        assert!(error.contains("fatal: bad revision"));
    }

    #[test]
    fn count_file_headers_handles_multiple_files() {
        let diff = "diff --git a/a b/a\ncontent\ndiff --git a/b b/b\nmore\n";
        assert_eq!(count_file_headers(diff), 2);
    }
}
