# Local connector capture bridge

The **Local Connector Capture Bridge** is Mori's first real bridge from
actual Claude / Codex / Git work into the app. It is a small, explicit
command-line tool — `connectors/local-capture/mori-local-capture.py` —
that turns local inputs into Mori Connector JSONL.

It is the practical answer to "how do I stop developing Mori only with
mock data?" without crossing any of Mori's local-first lines: there is no
watcher, no daemon, no account scraping, no app-database scraping, no
browser scraping, no clipboard capture, and no automatic import.

> The bridge **generates evidence**. It never imports it. Every event it
> writes still has to pass through Preview and Import Review before it
> reaches a Mori session.

## Where it sits in the product loop

```
   Claude / Codex / ChatGPT / CLI / Git / terminal work
                          │
                          ▼
      mori-local-capture.py  (--transcript / --note / --git-repo)
                          │  writes JSONL to the connector inbox
                          ▼
   Evidence Hub → Connector JSONL → Preview
                          │
                          ▼
                   Import Review
                          │
                          ▼
            Timeline / Evidence Hub
                          │
                          ▼
                  Project Memory → Consolidation Review →
                  Accepted Memory → Resume Prompt / Reports
```

The bridge owns only the first hop. Everything from Preview onward is the
existing Connector JSONL pipeline documented in
[`connector-event-format.md`](./connector-event-format.md).

## The three inputs

A single run can pass any combination of the three flags. All events from
one run share one `local-<timestamp>` session id (override with
`--session`).

### `--transcript <path>`

Reads a transcript text file the user explicitly provides — for example a
Claude or Codex conversation the user saved or exported themselves.

- Mori records a one-line `summary` (file name, line count, first line)
  and the file's modification time as `occurredAt`.
- The **full transcript text is not stored** in the event
  (`rawDataPolicy: summary_only`, no `rawText`). This matches the existing
  AI-transcript paste path, which also keeps summary metadata only.
- Emitted as `connectorId: desktopTranscriptImport`, `kind:
  transcript_imported` → `aiConversation` timeline event.

Pass `-` instead of a path to read the transcript from **stdin**, so a
live Claude / Codex CLI session can be captured by piping it explicitly:

```sh
claude -p "review this module" | mori-local-capture.py --transcript -
```

This is the explicit, local CLI capture path — the user runs the pipe;
nothing watches a terminal or process in the background. A stdin capture
uses `Transcript: stdin` as the source title and the capture time as
`occurredAt` (stdin has no modification time); empty stdin is rejected.
The `--connector <id>` flag overrides the connector id (default
`desktopTranscriptImport`).

### `--note <text>`

Records a manual note the user types on the command line.

- The note text becomes the event `summary` (collapsed to a single line,
  truncated to ~240 characters).
- Emitted as `connectorId: manual`, `kind: session_finished` → a
  `documentNote` timeline event under a `manualNote` source. The connector
  schema has no dedicated note kind; `session_finished` is the kind Mori
  maps to `documentNote`, so the bridge reuses it rather than changing the
  schema.

### `--git-repo <path>`

Captures **safe Git snapshot metadata only** for a repo the user
explicitly points at. The bridge runs read-only `git` commands with
explicit arguments (no shell interpolation):

- `git -C <repo> rev-parse --is-inside-work-tree` — refuse non-Git paths.
- `git -C <repo> rev-parse --show-toplevel` — resolve the repo root (only
  the directory **name** is kept, never the absolute path).
- `git -C <repo> rev-parse HEAD` — current commit SHA.
- `git -C <repo> branch --show-current` — branch name (empty on detached
  HEAD).
- `git -C <repo> status --porcelain` — changed file paths + dirty state.
- `git -C <repo> diff HEAD --shortstat` / `--numstat` — additions /
  deletions counts.

What the Git event contains: `branch`, `headCommit`, `shortHeadCommit`,
`isDirty`, total `additions` / `deletions`, and a `files[]` list of
**relative** paths with change types and per-file add/delete counts.

A **clean repository** (no uncommitted changes) still produces a
`git_diff_captured` event — `isDirty: false`, an empty `files[]`, and
zero `additions` / `deletions`. It parses and normalizes through the
connector pipeline exactly like a dirty-repo snapshot.

What it deliberately does **not** contain:

- No full diff (`git diff` content is never captured).
- No file contents.
- No absolute repository path — `git.repoPath` is omitted; the repo
  directory name appears only in the human-readable `sourceTitle`.

Emitted as `connectorId: gitCommand`, `kind: git_diff_captured` → a
`fileCode` timeline event under a `gitDiff` source.

### `--git-commit <ref>`

Captures **safe metadata for one named commit** — the natural "I just
committed, record what changed" capture. It uses `--git-repo` as the
repo, or the current directory. The bridge runs read-only `git`
commands with explicit arguments:

- `git -C <repo> rev-parse --verify <ref>^{commit}` — resolve and
  verify the commit; refuse an unknown ref.
- `git -C <repo> show -s --format=%s%n%aI <commit>` — the commit
  **subject line** and author date only (no body, no author name).
- `git -C <repo> show --name-status --format= <commit>` — changed
  file paths + change types.
- `git -C <repo> show --numstat --format= <commit>` — per-file
  additions / deletions.

The Git event reuses the `git_diff_captured` shape: `headCommit` /
`shortHeadCommit` hold the captured commit, `isDirty` is always
`false` (a commit is a fixed snapshot), and `files[]` carries the
commit's relative paths with change types and add/delete counts. No
patch text, no file contents, no absolute path — the same boundaries
as `--git-repo`. The commit subject appears only in the
human-readable `summary` / `sourceTitle`.

Emitted as `connectorId: gitCommand`, `kind: git_diff_captured` → a
`fileCode` timeline event under a `gitDiff` source.

## Event-kind mapping reference

| Input | `connectorId` | `kind` | Source kind | TimelineEvent type | Trust |
|---|---|---|---|---|---|
| `--transcript` | `desktopTranscriptImport` | `transcript_imported` | `aiConversation` | `aiConversation` | `observed` |
| `--note` | `manual` | `session_finished` | `manualNote` | `documentNote` | `observed` |
| `--git-repo` | `gitCommand` | `git_diff_captured` | `gitDiff` | `fileCode` | `observed` |
| `--git-commit` | `gitCommand` | `git_diff_captured` | `gitDiff` | `fileCode` | `observed` |

Every event carries `privacy.captureMethod: local_cli_wrapper` and
`privacy.rawDataPolicy: summary_only`. On import, Mori re-runs its
best-effort secret redaction over the summaries — the same pass every
connector import gets.

## Output location

By default the bridge appends to:

```
~/.mori/connectors/local-capture/<date>.jsonl
```

This is inside the connector inbox root. On the Tauri desktop build,
Evidence Hub → Connector JSONL → **Refresh inbox** lists files under
`~/.mori/connectors/<family>/`, so `local-capture` files appear there for
explicit selection. In browser mode, paste the file contents into the
Connector JSONL textarea instead. `--out <dir>` overrides the directory.

## Worked example

```bash
cd connectors/local-capture

# After a Claude Code session, you saved the transcript yourself:
python3 mori-local-capture.py \
  --transcript ~/notes/claude-2026-05-15.txt \
  --note "Finished the timeline collision fix; check:full green" \
  --git-repo ~/work/mori
```

The script prints the output path and event count, then:

1. Open Mori → **Evidence Hub → Connector JSONL**.
2. Load `~/.mori/connectors/local-capture/2026-05-15.jsonl` (paste or
   inbox pick).
3. Click **Parse / Preview** — the preview shows three valid events and a
   source-level import summary.
4. Click **Import to Review** and walk the events through Import Review.
5. Apply. The transcript, note, and Git snapshot now appear on the
   Timeline and in Evidence Hub, and feed Project Memory like any other
   imported evidence.

## Non-goals

Consistent with [`docs/mori-project-goal.md`](../mori-project-goal.md),
this bridge intentionally does **not**:

- watch the filesystem, run a daemon, or run on a schedule;
- read accounts, app databases (Claude Desktop, Cursor, etc.), browser
  history / tabs, or the clipboard;
- capture full diffs, file contents, or full transcript text;
- send anything over the network;
- import anything automatically — Import Review is always explicit;
- spawn, wrap, or silently observe the `claude` / `codex` CLIs. The
  `--transcript -` stdin path captures only what the user explicitly
  pipes in; it never starts a subprocess or reads terminal scrollback.

## Code and test references

- Script: [`connectors/local-capture/mori-local-capture.py`](../../connectors/local-capture/mori-local-capture.py)
- Sample JSONL: [`connectors/local-capture/sample-event.jsonl`](../../connectors/local-capture/sample-event.jsonl)
- Folder README: [`connectors/local-capture/README.md`](../../connectors/local-capture/README.md)
- Pipeline-compatibility test:
  `src/lib/connectors/connectorLocalCaptureFixture.test.ts`
- Connector schema: [`connector-event-format.md`](./connector-event-format.md)

## Related docs

- [Real capture walkthrough](../real-capture-walkthrough.md) — capture
  real Claude / Codex / Git work through the full Mori loop
- [Connector event format](./connector-event-format.md)
- [Capture surface matrix](./capture-surface-matrix.md)
- [Imports](../imports.md)
- [Mori project goal](../mori-project-goal.md)
