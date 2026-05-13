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
- Automatic `git diff` execution from a configured repo. The next milestone
  candidate is a Tauri/Rust command that runs `git diff <range>` against a
  selected repository so the user does not need to paste manually.
- A semantic interpreter that says "this diff added auth logic" — Mori
  intentionally only reports verified evidence. Quick Pass still applies its
  heuristic keyword scan to the summary text, and a future local-LLM Quick
  Pass run can read the same source/event.

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
