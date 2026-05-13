# Imports

Mori imports are the only path real session data enters the app. Each import
runs through a pure normalizer in [src/lib/import/](../src/lib/import/) that
produces a `NormalizedImportCandidate` (one `SourceRef` + one or more
`TimelineEvent`s). Components and the session store route imports through
`useMoriSessionStore.addImport`, which persists them per session through the
browser draft repository today and through SQLite when running in Tauri mode.

## Supported import kinds

| Kind | Source kind | Event type | Trust | Notes |
| ---- | ----------- | ---------- | ----- | ----- |
| Manual note | `manualNote` | `documentNote` | verified | Free-form text, optional title |
| URL / page excerpt | `browser` | `webResearch` | verified | URL must parse; optional excerpt |
| AI conversation | `aiConversation` | `aiConversation` | verified | Splits on blank lines to count messages |
| **Git diff** | `gitDiff` | `fileCode` | **verified** | Pasted unified diff; parsed structurally |

All imports are stored as-is in localStorage today. In Tauri mode the active
session can be saved to SQLite from Settings; that path covers Git diff
imports the same way it covers any other source.

## Git diff import

Paste a unified diff into the **Sources / Evidence → 소스 가져오기 → Git diff**
tab. Mori parses the diff in
[src/lib/import/parseGitDiff.ts](../src/lib/import/parseGitDiff.ts) and
normalizes it in
[src/lib/import/normalizeGitDiff.ts](../src/lib/import/normalizeGitDiff.ts).

### What is supported

- Standard `diff --git a/<path> b/<path>` headers.
- `new file mode` and `deleted file mode` → `changeType: "added" | "deleted"`.
- `rename from` / `rename to` → `changeType: "renamed"` with both paths.
- `@@` hunk headers counted as hunks.
- Per-file additions (`+`) and deletions (`-`) totals.
- File language inference from extension (`.ts`, `.rs`, `.md`, `.toml`, ...).
- File category labels (`code`, `test`, `docs`, `config`, `other`) for the
  source detail line.
- Optional origin label (e.g. `HEAD~1..HEAD` or a PR URL) recorded as
  `SourceRef.uri`.
- Invalid input rejected up front via `isLikelyGitDiff` and
  `GitDiffParseError` with a clear message — no fake source or event is
  created.

The generated event:

- `type: "fileCode"`, `trustLevel: "verified"`, `confidence: 0.97`.
- Title defaults to `Updated <path>`, `Added <path>`, etc. for single-file
  diffs, or `Git diff: N files` for multi-file diffs. Caller can override.
- Summary includes total counts plus the top 4 files by churn, so Quick Pass
  has meaningful text to scan.

### What is not supported yet

- Per-line text retention (Mori keeps the summary, not raw hunks).
- Binary files are noted in the header detection but otherwise ignored.
- Merge conflict markers and three-way diffs.
- Submodule diffs.
- A semantic interpreter that says "this diff added auth logic" — Mori
  intentionally only reports verified evidence. Quick Pass still applies its
  heuristic keyword scan to the summary text, and a future local-LLM Quick
  Pass run can read the same source/event.

### Tauri Git diff capture

When Mori runs inside the Tauri desktop app, the Git diff tab also exposes a
**리포지토리에서 가져오기** card that runs `git diff` against an explicitly
provided repository path. The implementation lives in
[src-tauri/src/git/diff.rs](../src-tauri/src/git/diff.rs) and is exposed as the
Tauri command `run_git_diff`. The frontend uses
[`runGitDiff` in src/lib/desktop/gitCommands.ts](../src/lib/desktop/gitCommands.ts)
— React components never invoke Tauri directly.

Supported range examples:

- `HEAD` — unstaged working-tree changes (the default).
- `HEAD~1..HEAD` — last commit.
- `main..feature-branch` — branch diff.
- Empty range with **`--staged`** toggle — index vs HEAD.

Safety constraints, all in `src-tauri/src/git/diff.rs`:

- The repo path is required and must already exist as a directory; no
  auto-discovery, no filesystem scan.
- Mori runs `git -C <repo_path> rev-parse --show-toplevel` first to refuse
  non-Git directories.
- The actual diff call uses `std::process::Command::new("git").arg(...)` with
  explicit args — never shell interpolation, never string concatenation.
- Output is capped at ~2 MB. Larger diffs are returned with `truncated: true`
  so the UI can show that detection without exploding the renderer.
- Errors are returned as `Result<_, String>` with the exit code and stderr,
  including the friendly `git` not found case.

The user flow is intentionally three-step:

1. Click **Fetch Git Diff** with the repo path / range.
2. Mori populates the unified-diff textarea and an origin label like
   `C:\dev\mori HEAD~1..HEAD`. The user can edit either before importing.
3. Click **세션에 추가**. The text flows through the existing
   `normalizeGitDiff` → `addImport` path, just like a pasted diff. Browser
   mode shows a "Tauri 데스크톱 앱에서만 사용할 수 있습니다." message and the
   Fetch button stays disabled.

Limitations called out elsewhere in this doc still apply:

- No file watching, no automatic repo scan, no background capture.
- No multiple-repo configuration store yet — the path is typed each time.
- No binary diff parsing.
- No submodule handling.

### Quick Pass interaction

Quick Pass receives the diff event the same way it receives any other event.
The deterministic provider's keyword scan covers the file paths and summary
text, so a `TODO`, `fix`, `error`, or `risk` mention inside the summary
surfaces as an issue candidate. The provider never invents per-line
explanations. Run Quick Pass with an Ollama provider for richer
interpretation.

## Where imports live

- Pure normalizers: [src/lib/import/](../src/lib/import/)
- UI: [src/features/import/ImportPanel.tsx](../src/features/import/ImportPanel.tsx)
- Per-session storage: `BrowserDraftRepository.addSessionImport` in
  [src/lib/storage/localStorageAdapter.ts](../src/lib/storage/localStorageAdapter.ts)
- Tauri SQLite persistence path:
  [docs/sqlite-persistence.md](sqlite-persistence.md)
