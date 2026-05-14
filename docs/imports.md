# Imports

Mori imports are the only path real session data enters the app. Each import
runs through a pure normalizer in [src/lib/import/](../src/lib/import/) that
produces a `NormalizedImportCandidate` (one `SourceRef` + one or more
`TimelineEvent`s). Components and the session store route imports through
`useMoriSessionStore.addImport`, which persists them per session through the
browser draft repository today and through SQLite when running in Tauri mode.

## Import support matrix

| Kind | Source kind(s) | Event type | Trust | Notes |
| ---- | -------------- | ---------- | ----- | ----- |
| Manual note | `manualNote` | `documentNote` | verified | Free-form text, optional title |
| URL / page excerpt | `browser` | `webResearch` | verified | URL must parse; optional excerpt |
| AI transcript | `claudeTranscript`, `chatgptTranscript`, `codexTranscript`, `aiConversation` | `aiConversation` | verified | Platform-aware paste; turn / code-block / tool-use detection |
| Git diff | `gitDiff` | `fileCode` | verified | Pasted unified diff, or Tauri `git diff` capture |
| Connector JSONL | `claudeTranscript`, `codexTranscript`, `terminal`, `gitDiff`, `manualNote` | per-event (mapped from connector kind) | observed → verified depending on connector | Paste the JSONL produced by the Claude Code hook, Codex CLI wrapper, terminal connector, or Git connector. Routes through Import Review. |

All imports are stored as-is in localStorage today. In Tauri mode the active
session can be saved to SQLite from Settings; that path covers every import
kind the same way.

## AI transcript import

Paste an AI conversation transcript into the **Evidence → 소스 가져오기 → AI
대화** tab. Mori parses the transcript with platform-specific logic in
[src/lib/import/normalizeAiTranscript.ts](../src/lib/import/normalizeAiTranscript.ts).

### User flow

1. Open the Evidence / Import panel.
2. Pick the **AI 대화** tab.
3. Choose a platform from the dropdown:
   - **Claude**
   - **ChatGPT**
   - **Codex**
   - **Other AI Chat**
4. Optionally set a title.
5. Paste the conversation text.
6. Click **세션에 추가**. Mori normalizes the transcript into one `SourceRef`
   and one `TimelineEvent`.

Direct account integration is **not** implemented:

- No OAuth.
- No API-key access to Claude / ChatGPT / Codex services.
- No background browser, tab, or app scanning.
- No automatic capture from any AI-assistant client.

The platform dropdown carries this privacy reminder, also stored alongside
the source record:

> 수동 붙여넣기 전용. Claude/ChatGPT/Codex 직접 연동은 계획 단계입니다.
> 현재 Mori는 브라우저 탭이나 앱을 자동 스캔하지 않습니다.

### Platform mapping

The platform dropdown maps to a stable `SourceKind` so the rest of Mori can
trace provenance.

| Platform | Source kind | Integration label |
| -------- | ----------- | ----------------- |
| `claude` | `claudeTranscript` | Claude Transcript |
| `chatgpt` | `chatgptTranscript` | ChatGPT Transcript |
| `codex` | `codexTranscript` | Codex Transcript |
| `other` | `aiConversation` | AI Conversation (Other) |

### Parser behaviour

`normalizeAiTranscript` splits the pasted text into turns by scanning each
line for a role prefix. Continuation lines without a role prefix are appended
to the previous turn so multi-line responses survive paste.

Detected roles:

- **User**: `User:`, `Human:`, `You:`, `Me:`
- **Assistant**: `Assistant:`, `AI:`, `Claude:`, `ChatGPT:`, `Codex:`, `Bot:`
- **System**: `System:`

Per-turn signals:

- `hasCodeBlocks` — at least one triple-backtick fence in the turn.
- `hasToolUse` — `<function`, `<tool`, or `tool_use` markers in the turn.

Aggregate metadata stored on the resulting `SourceRef`:

- `turnCount` (total), `userTurns`, `assistantTurns`.
- `codeBlockCount` — number of turns containing fenced code.
- `estimatedTokens` — rough character / 4 estimate. Word-based variants are
  similar to a 0.75 words-per-token approximation.

The generated `TimelineEvent`:

- `type: "aiConversation"`, `trustLevel: "verified"`, `confidence: 0.88`.
- `title` defaults to `<Platform> conversation` when no override is given.
- `summary` is the first user message, normalized to a single line and
  truncated to 160 characters (with a trailing `...` when truncated).

`rawRetention` is `summaryOnly` for every AI-transcript source: Mori keeps
the per-turn metadata and summary but does **not** persist the full pasted
transcript.

### Example transcript

The parser only needs role prefixes at the start of lines; any AI assistant
output that follows that pattern works.

```text
User: Mori 가져오기 흐름을 어떻게 설계해야 해?
Assistant: 명시적 붙여넣기로만 시작하고, 출처와 trust level을 유지하세요.
User: 코드 블록도 인식돼?
Assistant: 네, 트리플 백틱 블록을 감지하고 카운트합니다.
```

## Git diff import

Paste a unified diff into the **Evidence → 소스 가져오기 → Git diff** tab.
Mori parses the diff in
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

### Saved repositories

The Git Diff card supports saved repositories so users don't have to retype a
path on every capture. The store lives at
[src/lib/repositories/repositorySettings.ts](../src/lib/repositories/repositorySettings.ts)
and persists through `BrowserDraftRepository.saveRepositorySettings` /
`loadRepositorySettings`. The UI lives in two places:

- **Settings → Repositories** lets the user add a repo by typing a path, or by
  clicking **폴더 선택** (which calls the native Tauri folder picker), label
  it, set the default repo, rename it, or remove it. The section spells out
  the privacy guarantee:

  > Mori는 사용자가 명시적으로 추가한 리포지토리 경로만 기억합니다. 디스크를
  > 자동으로 스캔하거나 백그라운드에서 감시하지 않으며, 저장된 경로는 Git diff
  > 가져오기를 실행할 때만 읽습니다.

- **Sources → Git diff** shows a "저장된 리포지토리" dropdown listing saved
  repos and a **Browse** button (also wired to the native picker) next to the
  manual path field. Selecting a repo fills the path and marks it as the
  default. A successful `runGitDiff` updates the repo's `lastUsedAt`.

The native picker is implemented in
[src-tauri/src/repositories/picker.rs](../src-tauri/src/repositories/picker.rs)
using `tauri-plugin-dialog`. In browser/preview mode the picker bridge throws
the same "requires the Tauri app" error other desktop commands use; the Browse
button stays disabled but manual path entry remains available so the prototype
keeps working.

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
- Saved repositories are explicit user-added paths only. Mori does not walk
  parent or sibling directories, never enumerates drives, and only reads the
  selected path when `runGitDiff` runs.
- No binary diff parsing.
- No submodule handling.
- No branch browser or commit picker yet.

### Repository verification

Saved repositories can also be **verified** on demand. The Verify button in
**Settings → Repositories** runs four small, explicit Git calls against the
saved path through the Tauri command `verify_repository_path`
([src-tauri/src/git/verify.rs](../src-tauri/src/git/verify.rs)):

- `git -C <path> rev-parse --show-toplevel` — confirms the path is inside a
  Git work tree and resolves the repository root.
- `git -C <path> rev-parse HEAD` — captures the current commit SHA.
- `git -C <path> branch --show-current` — current branch name, or `null` on
  detached HEAD.
- `git -C <path> status --porcelain` — used only to determine `isDirty`
  (the porcelain output is not stored, just whether it was empty).

The same safety rules as `run_git_diff` apply: explicit args, no shell
interpolation, no scanning, and a structured `Result<_, String>` returned
to the frontend. The frontend bridge is `verifyRepositoryPath` in
[src/lib/desktop/repositoryCommands.ts](../src/lib/desktop/repositoryCommands.ts);
the store wires it via `useMoriRepositoryStore.verifyRepository(id)`.

Verification metadata persists on each `MoriRepositoryConfig` as:

```ts
verification?: {
  status: "unverified" | "verified" | "failed";
  verifiedAt?: string;
  gitRoot?: string;
  currentBranch?: string;
  headCommit?: string;
  shortHeadCommit?: string;
  isDirty?: boolean;
  error?: string;
};
```

The Settings panel shows a `Verified · <branch> · <sha7>` badge plus a
`dirty` chip when the work tree is modified, or `Verify failed` with the
exact stderr returned by Git. The Git Diff dropdown adds the same summary
inline so users see what is about to be captured before they fetch.

Privacy promises:

- **Mori never verifies a repository automatically.** The Settings copy
  spells this out: "Mori는 사용자가 Verify 버튼을 누르거나 Git 가져오기를
  실행할 때만 리포지토리를 확인합니다."
- App start, store hydrate, focus, and SQLite hydrate never call
  `verify_repository_path`.
- Browser mode disables the Verify button and the bridge throws the
  standard "requires the Tauri app" error — manual repo paths remain
  editable in the prototype.
- Clearing verification metadata is one click and drops everything except
  the saved label/path.

### Verification freshness

Saved verifications get stale. Mori treats anything older than
**24 hours** (`STALE_VERIFICATION_THRESHOLD_MS` in
[src/lib/repositories/verificationFreshness.ts](../src/lib/repositories/verificationFreshness.ts))
as a stale record and flags it in both Settings and the Git Diff dropdown:

- **Verified just now / N hours ago / N days ago** — the green badge plus
  a small grey age label.
- **Stale · `<branch> <sha7>` (N days ago)** — orange badge in both
  places. The Settings button flips from `Verify` to `Re-verify` so the
  intent is obvious.
- **Unverified** / **Verification failed** — unchanged.

The threshold and labels are pure functions and fully covered by tests.
None of them trigger any Git or filesystem activity — they only describe
what is already stored.

### Refresh after explicit Git diff capture

The user is already reading the repository when they click **Fetch Git
Diff**, so Mori uses the same explicit action to refresh verification
metadata. After a successful `runGitDiff`:

1. The fetched diff fills the textarea and the origin label.
2. `markRepositoryUsed(id)` records `lastUsedAt` for the saved repo.
3. `refreshRepositoryMetadataAfterCapture(id)` calls
   `verify_repository_path` once and updates `verifiedAt`, branch, HEAD,
   short SHA, and dirty status.
4. If step 3 fails, the diff stays in the textarea, the status line shows
   "Diff fetched, but repository metadata refresh failed: \<reason\>",
   and any previously verified metadata is **preserved** — a transient
   refresh failure never erases earlier good metadata. Only repos that
   had no prior verified record get a `failed` status written.

Strict boundaries that did not change:

- Manual path entries (paths not associated with a saved repo) trigger no
  refresh.
- The refresh path never runs from app start, hydrate, focus, navigation,
  or import-history rendering.
- Stale verification is purely advisory: it never blocks a fetch.
- Browser mode still rejects with "requires the Tauri app"; the diff
  textarea remains usable for pasted diffs.

Limitations still apply:

- No file watching, no background watcher, no auto re-verify on app start.
- No branch picker, no commit picker yet.
- Stale threshold is a single constant; per-repo tuning is future work.

### Quick Pass interaction

Quick Pass receives the diff event the same way it receives any other event.
The deterministic provider's keyword scan covers the file paths and summary
text, so a `TODO`, `fix`, `error`, or `risk` mention inside the summary
surfaces as an issue candidate. The provider never invents per-line
explanations. Run Quick Pass with an Ollama provider for richer
interpretation.

## Connector capture (local, opt-in)

Mori also supports structured event capture from external tools (Claude
Code hooks, Codex CLI wrappers, git scripts, terminal wrappers). This is
distinct from the manual paste imports above:

- the user installs a small **template** script on their own machine
  ([`connectors/claude-code/`](../connectors/claude-code/),
  [`connectors/codex-cli/`](../connectors/codex-cli/))
- the script writes **JSONL events** to a local file when the user runs
  Claude Code / Codex / a wrapped command
- when the user clicks Import, Mori parses the file through the pure
  pipeline in [`src/lib/connectors/`](../src/lib/connectors/) and the
  events flow through **Import Review** before reaching the session

The format is documented in
[`docs/connectors/connector-event-format.md`](./connectors/connector-event-format.md);
setup guides live in
[`docs/connectors/claude-code-hook.md`](./connectors/claude-code-hook.md)
and
[`docs/connectors/codex-cli-wrapper.md`](./connectors/codex-cli-wrapper.md).

The connector pipeline is local-only:

- no network calls, ever
- no background daemon — events appear in the JSONL file only when the
  external tool runs
- no automatic browser / app / filesystem scanning
- no credentials, no OAuth, no account auto-connect
- best-effort redaction of obvious API keys / bearer tokens / `.env`
  assignments before persistence

The dedicated **Connector JSONL** import tab is live in Evidence Hub
today. The user pastes the JSONL produced by the Claude Code hook, the
Codex CLI wrapper, a terminal connector, or a git connector script into
the tab, clicks **Parse / Preview** to see the connector breakdown
(valid event count, invalid lines with line numbers, connector ids,
event kinds, time range, project paths, warnings for suspected secrets
/ missing session ids / unknown connector ids), then clicks **Import to
Review** to send the normalized events through the same Import Review
flow that AI transcripts + Git diffs use. The preview snapshot is
produced by `buildConnectorJsonlPreview` in
[`src/lib/connectors/jsonlPreview.ts`](../src/lib/connectors/jsonlPreview.ts);
the multi-bucket normalized output is merged into one Review draft via
`mergeConnectorCandidatesForReview` in
[`src/lib/connectors/mergeForReview.ts`](../src/lib/connectors/mergeForReview.ts).

### Connector inbox (desktop)

On the Tauri desktop build, the Connector JSONL tab also exposes a
**Connector inbox** section above the paste textarea. It lists the
`.jsonl` / `.ndjson` / `.log` / `.txt` files Mori finds under
`~/.mori/connectors/` (Windows: `%USERPROFILE%\.mori\connectors\`). The
listing is **driven entirely by the Refresh inbox button** — Mori does
not watch the folder, does not poll it, and does not auto-read files on
startup. The Rust side restricts file access to that single directory:

- Path canonicalisation rejects `..` traversal + symlinks that resolve
  outside the inbox root.
- Only the canonical family folders are recognised: `claude-code`,
  `codex-cli`, `terminal`, `git`, plus an `other` bucket for loose files
  at the inbox root.
- Only `.jsonl`, `.ndjson`, `.log`, `.txt` extensions are read.
- Files above an 8 MB cap are rejected.
- The Rust side never parses or normalises the JSONL content — it only
  returns the file's bytes; the existing TypeScript parser owns the
  parse/preview pass.

When the user clicks a file row, Mori reads the file via
`read_connector_jsonl_file`, drops the contents into the paste
textarea, and auto-runs Parse / Preview. **Import to Review remains an
explicit click.** In browser mode the inbox section renders a help row
instead of a Refresh button, and the paste flow stays fully available.

The full **capture surface matrix** — every paste / hook / CLI /
desktop / web / IDE / browser / GitHub path that Mori does and does not
support today — lives in
[`docs/connectors/capture-surface-matrix.md`](./connectors/capture-surface-matrix.md).
The matching honest boundaries for Claude Desktop, Claude Web, ChatGPT,
Codex Desktop, Codex Web, and Codex's GitHub workflow live in
[`docs/connectors/desktop-web-capture.md`](./connectors/desktop-web-capture.md);
the planned GitHub PR / commit import design lives in
[`docs/connectors/github-pr-import.md`](./connectors/github-pr-import.md).

## Import Review (review-before-apply)

AI Transcript and Git Diff imports do not commit to the session store on
their own. Instead, clicking "세션에 추가" on those flows hands the
`NormalizedImportCandidate` to the **Import Review** screen
(`src/features/review-import/ImportReviewView.tsx`):

1. The candidate becomes an `ImportReviewDraft` in `useMoriReviewStore`.
2. Each extracted timeline event is rendered as a card with `Accept` /
   `Discard` / `Edit` actions and starts in `pending` state.
3. Inline edit covers `title`, `summary`, and `type`. Edited events flip
   `userModified: true` once the apply step runs.
4. The "Apply to Timeline" footer is disabled until at least one event is
   accepted; clicking it calls `useMoriSessionStore.addImport` with a
   filtered candidate (only accepted events, source `relatedEventIds` kept
   in sync).
5. "Cancel" clears the draft without committing anything; the original
   text never reaches the session store.

Manual Note and URL imports skip the review and apply directly today —
each produces exactly one user-typed event, so the review step adds no
real safety. That trade-off is documented in
[product-screen-reference.md#import-review-evidence-mapping](product-screen-reference.md#import-review-evidence-mapping).

The right "Generated items" column on the review screen stays empty by
design. Issues, decisions, and next actions are still produced by Quick
Pass running over the whole session — Import Review does not silently
trigger Quick Pass.

## Evidence Hub entry point

The **Evidence** page is the user-facing way into every import flow. Each
card under "사용 가능한 소스" maps to a single tab in the existing
`ImportPanel`:

| Hub card | Integration ID | Import tab | Pre-selected platform |
| -------- | -------------- | ---------- | --------------------- |
| Claude Transcript | `claudeTranscript` | AI 대화 | `claude` |
| ChatGPT Transcript | `chatgptTranscript` | AI 대화 | `chatgpt` |
| AI Conversation (Other) | `aiConversation` | AI 대화 | `other` |
| Git Diff (Paste) | `gitDiff` | Git diff | – |
| Manual Note | `manualNote` | 메모 | – |
| URL / Browser Page | `url` | URL | – |

The mapping lives in
[`src/lib/sources/integrationGroups.ts`](../src/lib/sources/integrationGroups.ts);
clicking a card opens the `ImportPanel` embedded inside the Hub with
`initialKind` (and `initialAiPlatform` for AI transcripts) set, so the user
never has to find the correct tab manually.

Planned connector cards never open an import flow — they are kept in the Hub
only so the user can inspect what each connector will and will not access
once it lands.

## Where imports live

- Pure normalizers: [src/lib/import/](../src/lib/import/)
- UI: [src/features/import/ImportPanel.tsx](../src/features/import/ImportPanel.tsx) — accepts `initialKind` and `initialAiPlatform` props for Evidence Hub embedding
- Evidence Hub entry point: [src/features/evidence/EvidenceView.tsx](../src/features/evidence/EvidenceView.tsx)
- Integration grouping helper: [src/lib/sources/integrationGroups.ts](../src/lib/sources/integrationGroups.ts)
- Review-before-apply state: [src/lib/review/](../src/lib/review/) + [src/app/reviewStore.ts](../src/app/reviewStore.ts)
- Review UI: [src/features/review-import/ImportReviewView.tsx](../src/features/review-import/ImportReviewView.tsx)
- Per-session storage: `BrowserDraftRepository.addSessionImport` in
  [src/lib/storage/localStorageAdapter.ts](../src/lib/storage/localStorageAdapter.ts)
- Tauri SQLite persistence path:
  [docs/sqlite-persistence.md](sqlite-persistence.md)
