//! Session outcome evidence: the Git facts an agent's own log records about a
//! session, read structurally and never from prose.
//!
//! Each item means only "this session's source contains this":
//!
//! - a PR observation is a PR the source links to (Claude `pr-link` records). It
//!   does not say the session created the PR, that it merged, or that it worked;
//! - a branch observation is a branch name seen in the session's Git context
//!   (Claude records' `gitBranch`, Codex `session_meta.git.branch`). It does not
//!   say the branch is current or holds the session's changes. A long session
//!   can see several, so they are kept as observations, not one "active branch".
//!
//! Coverage is explicit: `complete` is true only when every byte of the source
//! has been inspected. A long transcript is scanned incrementally under a
//! per-call budget, so until the scan reaches the end the evidence is partial and
//! must not be presented as exhaustive.

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// One PR the source links to, deduplicated by repository and number.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrObservation {
    /// `owner/name` as the source wrote it.
    pub repository: String,
    pub number: u64,
    pub url: String,
    /// Timestamp of the first record that linked it, "" when it had none.
    pub first_observed_at: String,
    /// 1-based record (line) number of that first link in the segment.
    pub first_line: u64,
    /// How many records linked it. The agent repeats the link, so this is not a
    /// count of distinct events.
    pub observations: u64,
}

/// One branch name seen in the session's Git context.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchObservation {
    pub name: String,
    /// `record` when read from a timestamped transcript record, `session-meta`
    /// when the source states it once for the whole session (Codex, at start).
    pub basis: String,
    pub first_observed_at: String,
    pub last_observed_at: String,
    /// 1-based record number of the first observation, 0 for `session-meta`.
    pub first_line: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEvidence {
    pub prs: Vec<PrObservation>,
    /// In order of first observation.
    pub branches: Vec<BranchObservation>,
    /// Repositories named by the source (PR repositories, a Codex remote).
    pub repositories: Vec<String>,
    /// The session this transcript continues in (Claude `continued-in`), "" when
    /// none was seen. Links physical segments of one logical session; it is not
    /// Git evidence.
    pub continued_in_session_id: String,
    /// The checkout a Claude-created worktree came from and the worktree path,
    /// as the session recorded them (`worktree-state`). Repository identity,
    /// not Git outcome evidence; never written to a record or a pack.
    #[serde(skip)]
    pub worktree_origin: Option<(String, String)>,
    /// True only when the whole source was inspected.
    pub complete: bool,
    pub scanned_bytes: u64,
}

impl SessionEvidence {
    fn note_repository(&mut self, repository: &str) {
        if !repository.is_empty() && !self.repositories.iter().any(|known| known == repository) {
            self.repositories.push(repository.to_string());
        }
    }

    fn observe_pr(&mut self, repository: &str, number: u64, url: &str, at: &str, line: u64) {
        let key = repository.to_ascii_lowercase();
        if let Some(known) = self
            .prs
            .iter_mut()
            .find(|pr| pr.number == number && pr.repository.to_ascii_lowercase() == key)
        {
            known.observations += 1;
            return;
        }
        self.prs.push(PrObservation {
            repository: repository.to_string(),
            number,
            url: url.to_string(),
            first_observed_at: at.to_string(),
            first_line: line,
            observations: 1,
        });
        self.note_repository(repository);
    }

    fn observe_branch(&mut self, name: &str, basis: &str, at: &str, line: u64) {
        if let Some(known) = self.branches.iter_mut().find(|branch| branch.name == name) {
            if !at.is_empty() {
                known.last_observed_at = at.to_string();
            }
            return;
        }
        self.branches.push(BranchObservation {
            name: name.to_string(),
            basis: basis.to_string(),
            first_observed_at: at.to_string(),
            last_observed_at: at.to_string(),
            first_line: line,
        });
    }
}

/// A Git branch name worth recording. `HEAD` is the detached-head marker, not a
/// branch, so it says nothing about which branch the work was on.
fn is_branch_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty() && trimmed != "HEAD"
}

/// `owner/name` for a GitHub-style remote (`git@host:owner/name.git`,
/// `https://host/owner/name`), or "" when the remote has no such shape. Nothing
/// is guessed beyond stripping the transport and `.git`.
pub fn repository_from_remote(remote: &str) -> String {
    let trimmed = remote.trim().trim_end_matches('/');
    let path = if let Some((_, rest)) = trimmed.split_once("://") {
        rest.split_once('/').map(|(_, path)| path).unwrap_or("")
    } else if let Some((_, rest)) = trimmed.split_once(':') {
        rest
    } else {
        ""
    };
    let path = path.trim_end_matches(".git");
    let parts: Vec<&str> = path.split('/').filter(|part| !part.is_empty()).collect();
    if parts.len() == 2 {
        format!("{}/{}", parts[0], parts[1])
    } else {
        String::new()
    }
}

/// Codex states the session's Git context once, at its start.
pub fn codex_evidence(branch: &str, remote: &str, started_at: &str) -> SessionEvidence {
    let mut evidence = SessionEvidence { complete: true, ..SessionEvidence::default() };
    evidence.note_repository(&repository_from_remote(remote));
    if is_branch_name(branch) {
        evidence.observe_branch(branch.trim(), "session-meta", started_at, 0);
    }
    evidence
}

/// The fields of a Claude record this scan reads. Everything else is skipped by
/// the deserializer without being kept.
#[derive(Deserialize)]
struct ClaudeEvidenceRecord {
    #[serde(rename = "type")]
    kind: Option<String>,
    #[serde(rename = "gitBranch")]
    git_branch: Option<String>,
    timestamp: Option<String>,
    #[serde(rename = "prNumber")]
    pr_number: Option<serde_json::Value>,
    #[serde(rename = "prRepository")]
    pr_repository: Option<String>,
    #[serde(rename = "prUrl")]
    pr_url: Option<String>,
    #[serde(rename = "continuedInSessionId")]
    continued_in_session_id: Option<String>,
    #[serde(rename = "worktreeSession")]
    worktree_session: Option<WorktreeSession>,
}

#[derive(Deserialize)]
struct WorktreeSession {
    #[serde(rename = "originalCwd")]
    original_cwd: Option<String>,
    #[serde(rename = "worktreePath")]
    worktree_path: Option<String>,
}

fn pr_number(value: &serde_json::Value) -> Option<u64> {
    match value {
        serde_json::Value::Number(number) => number.as_u64(),
        serde_json::Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
}

/// Bytes one call may scan per transcript. A huge history completes over a few
/// polls instead of stalling one; until then its evidence is marked partial.
pub const CLAUDE_SCAN_BUDGET: u64 = 32 * 1024 * 1024;
/// How much of the file's start identifies it, so a replaced or truncated file
/// is rescanned from the beginning rather than resumed at a stale offset.
const HEAD_PROBE: usize = 4096;

#[derive(Clone)]
struct ScanState {
    /// Offset just past the last complete line consumed.
    offset: u64,
    lines: u64,
    head: Vec<u8>,
    evidence: SessionEvidence,
}

/// Scan progress per transcript, kept for the life of the process. Restarting
/// the app rescans from the start; the result is the same, only slower once.
static CLAUDE_SCANS: Mutex<Option<HashMap<PathBuf, ScanState>>> = Mutex::new(None);

fn read_head(path: &Path) -> Option<Vec<u8>> {
    let mut file = File::open(path).ok()?;
    let mut head = vec![0u8; HEAD_PROBE];
    let mut filled = 0;
    while filled < HEAD_PROBE {
        let read = file.read(&mut head[filled..]).ok()?;
        if read == 0 {
            break;
        }
        filled += read;
    }
    head.truncate(filled);
    Some(head)
}

/// Evidence from a Claude transcript, resuming where the previous call stopped
/// when the file only grew since. `None` when the file cannot be read: an
/// unread source is unknown, not empty.
pub fn claude_evidence(path: &Path) -> Option<SessionEvidence> {
    claude_evidence_with_budget(path, CLAUDE_SCAN_BUDGET)
}

pub fn claude_evidence_with_budget(path: &Path, budget: u64) -> Option<SessionEvidence> {
    let len = std::fs::metadata(path).ok()?.len();
    let head = read_head(path)?;
    let previous = {
        let guard = CLAUDE_SCANS.lock().ok()?;
        guard.as_ref().and_then(|scans| scans.get(path).cloned())
    };
    // Resume only a file that still starts the same and has not shrunk; the
    // stored head may be shorter than today's when the file was tiny then.
    let resumable = previous.filter(|state| {
        state.offset <= len && head.len() >= state.head.len() && head[..state.head.len()] == state.head[..]
    });
    let mut state = resumable.unwrap_or(ScanState {
        offset: 0,
        lines: 0,
        head: Vec::new(),
        evidence: SessionEvidence::default(),
    });
    if state.offset < len {
        scan_from(path, &mut state, budget)?;
    }
    state.head = head;
    state.evidence.scanned_bytes = state.offset;
    state.evidence.complete = state.offset >= len;
    let evidence = state.evidence.clone();
    if let Ok(mut guard) = CLAUDE_SCANS.lock() {
        guard.get_or_insert_with(HashMap::new).insert(path.to_path_buf(), state);
    }
    Some(evidence)
}

fn scan_from(path: &Path, state: &mut ScanState, budget: u64) -> Option<()> {
    let mut file = File::open(path).ok()?;
    file.seek(SeekFrom::Start(state.offset)).ok()?;
    let mut reader = BufReader::new(file);
    let mut consumed = 0u64;
    let mut buffer = Vec::new();
    while consumed < budget {
        buffer.clear();
        let read = reader.read_until(b'\n', &mut buffer).ok()?;
        if read == 0 {
            break;
        }
        // A last line without its newline may still be being written: leave it
        // for the next call rather than read half a record.
        if buffer.last() != Some(&b'\n') {
            break;
        }
        consumed += read as u64;
        state.offset += read as u64;
        state.lines += 1;
        observe_claude_line(&buffer, state.lines, &mut state.evidence);
    }
    Some(())
}

fn observe_claude_line(bytes: &[u8], line: u64, evidence: &mut SessionEvidence) {
    // Cheap byte test first: only records naming a branch or a PR are parsed.
    let interesting = contains(bytes, b"\"gitBranch\"")
        || contains(bytes, b"\"pr-link\"")
        || contains(bytes, b"\"continued-in\"")
        || contains(bytes, b"\"worktree-state\"");
    if !interesting {
        return;
    }
    let Ok(record) = serde_json::from_slice::<ClaudeEvidenceRecord>(bytes) else {
        return;
    };
    let at = record.timestamp.unwrap_or_default();
    if record.kind.as_deref() == Some("pr-link") {
        let repository = record.pr_repository.unwrap_or_default();
        let number = record.pr_number.as_ref().and_then(pr_number);
        if let (false, Some(number)) = (repository.trim().is_empty(), number) {
            evidence.observe_pr(repository.trim(), number, record.pr_url.as_deref().unwrap_or(""), &at, line);
        }
    }
    if record.kind.as_deref() == Some("worktree-state") {
        // The first record that names both wins: a session enters one worktree.
        if let Some(session) = record.worktree_session {
            let origin = session.original_cwd.unwrap_or_default();
            let path = session.worktree_path.unwrap_or_default();
            if evidence.worktree_origin.is_none() && !origin.trim().is_empty() && !path.trim().is_empty() {
                evidence.worktree_origin = Some((origin.trim().to_string(), path.trim().to_string()));
            }
        }
    }
    if record.kind.as_deref() == Some("continued-in") {
        if let Some(next) = record.continued_in_session_id.filter(|id| !id.trim().is_empty()) {
            evidence.continued_in_session_id = next.trim().to_string();
        }
    }
    if let Some(branch) = record.git_branch {
        if is_branch_name(&branch) {
            evidence.observe_branch(branch.trim(), "record", &at, line);
        }
    }
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn record(kind: &str, branch: &str, at: &str) -> String {
        format!("{{\"type\":\"{kind}\",\"gitBranch\":\"{branch}\",\"timestamp\":\"{at}\",\"message\":{{\"content\":\"x\"}}}}\n")
    }

    fn pr(repo: &str, number: u64, at: &str) -> String {
        format!("{{\"type\":\"pr-link\",\"sessionId\":\"s\",\"prNumber\":{number},\"prUrl\":\"https://github.com/{repo}/pull/{number}\",\"prRepository\":\"{repo}\",\"timestamp\":\"{at}\"}}\n")
    }

    fn write(dir: &TempDir, name: &str, body: &str) -> PathBuf {
        let path = dir.path().join(name);
        std::fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn reads_pr_links_and_branches_with_their_locations() {
        let dir = TempDir::new().unwrap();
        let body = [
            record("user", "main", "2026-10-07T14:00:00Z"),
            record("assistant", "fix/a", "2026-10-07T14:05:00Z"),
            pr("acme/app", 7, "2026-10-07T14:06:00Z"),
            pr("acme/app", 7, "2026-10-07T14:07:00Z"),
            record("user", "fix/a", "2026-10-07T14:08:00Z"),
            record("user", "main", "2026-10-07T15:00:00Z"),
        ]
        .concat();
        let evidence = claude_evidence(&write(&dir, "s.jsonl", &body)).unwrap();
        assert!(evidence.complete);
        assert_eq!(evidence.prs.len(), 1);
        assert_eq!(evidence.prs[0].repository, "acme/app");
        assert_eq!(evidence.prs[0].number, 7);
        assert_eq!(evidence.prs[0].first_line, 3);
        assert_eq!(evidence.prs[0].first_observed_at, "2026-10-07T14:06:00Z");
        assert_eq!(evidence.prs[0].observations, 2);
        assert_eq!(evidence.repositories, vec!["acme/app"]);
        // Both branches are kept as observations in first-seen order; returning
        // to main updates its last sighting, it is not a third branch.
        let names: Vec<&str> = evidence.branches.iter().map(|b| b.name.as_str()).collect();
        assert_eq!(names, vec!["main", "fix/a"]);
        assert_eq!(evidence.branches[0].last_observed_at, "2026-10-07T15:00:00Z");
        assert_eq!(evidence.branches[1].first_line, 2);
        assert_eq!(evidence.branches[1].basis, "record");
    }

    #[test]
    fn keeps_the_same_number_in_two_repositories_apart() {
        let dir = TempDir::new().unwrap();
        let body = [pr("acme/infra", 12, "2026-10-07T14:00:00Z"), pr("acme/home", 12, "2026-10-07T14:01:00Z")].concat();
        let evidence = claude_evidence(&write(&dir, "s.jsonl", &body)).unwrap();
        assert_eq!(evidence.prs.len(), 2);
        assert_eq!(evidence.repositories, vec!["acme/infra", "acme/home"]);
    }

    #[test]
    fn ignores_detached_head_malformed_records_and_prose_that_mentions_a_pr() {
        let dir = TempDir::new().unwrap();
        let body = [
            record("user", "HEAD", "2026-10-07T14:00:00Z"),
            "{\"type\":\"pr-link\",\"prNumber\":\"x\",\"prRepository\":\"acme/app\"}\n".to_string(),
            "{\"type\":\"pr-link\",\"prNumber\":3}\n".to_string(),
            "{not json \"gitBranch\" \"pr-link\"\n".to_string(),
            "{\"type\":\"assistant\",\"message\":{\"content\":\"opened https://github.com/acme/app/pull/9 \\\"pr-link\\\"\"}}\n".to_string(),
        ]
        .concat();
        let evidence = claude_evidence(&write(&dir, "s.jsonl", &body)).unwrap();
        assert!(evidence.prs.is_empty());
        assert!(evidence.branches.is_empty());
        assert!(evidence.complete);
    }

    #[test]
    fn a_budget_cut_is_partial_and_the_next_call_resumes_to_complete() {
        let dir = TempDir::new().unwrap();
        let mut body = String::new();
        for minute in 0..50 {
            body.push_str(&record("user", "main", &format!("2026-10-07T14:{minute:02}:00Z")));
        }
        body.push_str(&pr("acme/app", 41, "2026-10-07T15:00:00Z"));
        let path = write(&dir, "s.jsonl", &body);
        let first = claude_evidence_with_budget(&path, 1_000).unwrap();
        assert!(!first.complete);
        assert!(first.prs.is_empty(), "the PR lies past the first budget");
        let mut evidence = first;
        for _ in 0..100 {
            if evidence.complete {
                break;
            }
            evidence = claude_evidence_with_budget(&path, 1_000).unwrap();
        }
        assert!(evidence.complete);
        assert_eq!(evidence.prs.len(), 1);
        assert_eq!(evidence.prs[0].first_line, 51);
        // Repeated polling of an unchanged file returns the same evidence.
        assert_eq!(claude_evidence_with_budget(&path, 1_000).unwrap(), evidence);
    }

    #[test]
    fn growth_is_read_incrementally_and_a_half_written_line_waits() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "s.jsonl", &record("user", "main", "2026-10-07T14:00:00Z"));
        assert!(claude_evidence(&path).unwrap().prs.is_empty());
        let mut file = std::fs::OpenOptions::new().append(true).open(&path).unwrap();
        let line = pr("acme/app", 5, "2026-10-07T14:10:00Z");
        let (head, tail) = line.split_at(30);
        file.write_all(head.as_bytes()).unwrap();
        let mid = claude_evidence(&path).unwrap();
        assert!(mid.prs.is_empty());
        assert!(!mid.complete, "an unfinished last line is not inspected yet");
        file.write_all(tail.as_bytes()).unwrap();
        let done = claude_evidence(&path).unwrap();
        assert!(done.complete);
        assert_eq!(done.prs.len(), 1);
        assert_eq!(done.prs[0].first_line, 2);
    }

    #[test]
    fn a_replaced_file_is_rescanned_from_the_start() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "s.jsonl", &[record("user", "a", "2026-10-07T14:00:00Z"), pr("acme/app", 1, "2026-10-07T14:01:00Z")].concat());
        assert_eq!(claude_evidence(&path).unwrap().prs.len(), 1);
        std::fs::write(&path, [record("user", "b", "2026-10-08T09:00:00Z"), pr("acme/app", 2, "2026-10-08T09:01:00Z"), record("user", "b", "2026-10-08T09:02:00Z")].concat()).unwrap();
        let evidence = claude_evidence(&path).unwrap();
        assert_eq!(evidence.prs.iter().map(|p| p.number).collect::<Vec<_>>(), vec![2]);
        assert_eq!(evidence.branches.iter().map(|b| b.name.as_str()).collect::<Vec<_>>(), vec!["b"]);
    }

    #[test]
    fn records_the_segment_a_transcript_continues_in() {
        let dir = TempDir::new().unwrap();
        let body = [
            record("user", "main", "2026-09-30T04:21:00Z"),
            "{\"type\":\"continued-in\",\"timestamp\":\"2026-09-30T04:22:00Z\",\"sessionId\":\"a\",\"continuedInSessionId\":\"b\"}\n".to_string(),
        ]
        .concat();
        let evidence = claude_evidence(&write(&dir, "a.jsonl", &body)).unwrap();
        assert_eq!(evidence.continued_in_session_id, "b");
    }

    #[test]
    fn records_the_checkout_a_claude_worktree_came_from() {
        let dir = TempDir::new().unwrap();
        let body = [
            record("user", "main", "2026-09-16T06:15:31Z"),
            "{\"type\":\"worktree-state\",\"worktreeSession\":{\"originalCwd\":\"/home/u/dev/infra\",\"worktreePath\":\"/home/u/dev/infra/.claude/worktrees/storage\",\"worktreeName\":\"storage\"},\"sessionId\":\"s\"}\n".to_string(),
            "{\"type\":\"worktree-state\",\"worktreeSession\":null,\"sessionId\":\"s\"}\n".to_string(),
        ]
        .concat();
        let evidence = claude_evidence(&write(&dir, "s.jsonl", &body)).unwrap();
        assert_eq!(
            evidence.worktree_origin,
            Some(("/home/u/dev/infra".to_string(), "/home/u/dev/infra/.claude/worktrees/storage".to_string()))
        );
        // It is identity, not outcome evidence: it never serializes.
        assert!(!serde_json::to_string(&evidence).unwrap().contains("infra"));
    }

    #[test]
    fn an_unreadable_source_is_unknown_not_empty() {
        let dir = TempDir::new().unwrap();
        assert_eq!(claude_evidence(&dir.path().join("missing.jsonl")), None);
    }

    #[test]
    fn codex_states_its_branch_and_remote_once() {
        let evidence = codex_evidence("feat/x", "git@github.com:acme/infra.git", "2026-09-02T12:13:57Z");
        assert!(evidence.complete);
        assert_eq!(evidence.repositories, vec!["acme/infra"]);
        assert_eq!(evidence.branches[0].basis, "session-meta");
        assert_eq!(evidence.branches[0].first_line, 0);
        assert!(evidence.prs.is_empty());
        assert_eq!(repository_from_remote("https://github.com/acme/infra"), "acme/infra");
        assert_eq!(repository_from_remote("/srv/repo"), "");
        assert!(codex_evidence("", "", "").branches.is_empty());
    }
}
