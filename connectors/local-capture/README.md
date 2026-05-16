# Mori · Local connector capture bridge

This folder contains the **local connector capture bridge** — a small,
explicit command-line tool that turns local work inputs into Mori
Connector JSONL. It is the first real bridge from actual Claude / Codex /
Git work into Mori, and it runs entirely on your machine.

> Mori does **not** install or auto-run this script. You run it explicitly,
> with explicit arguments, when you want to capture something. You can
> delete the output JSONL at any time.

## What this bridge does

`mori-local-capture.py` takes three explicit inputs and appends one JSONL
event per input to a local connector inbox file
(`~/.mori/connectors/local-capture/<date>.jsonl` by default):

| Flag | What it captures |
|---|---|
| `--transcript <path>` | Reads a transcript text file you explicitly point at, or `-` to read from stdin (pipe a Claude / Codex CLI session in). Records a one-line summary + line count. The full transcript text is **not** stored in the event. |
| `--note <text>` | Records a manual note you type on the command line. |
| `--git-repo <path>` | Captures **safe Git metadata only** for a repo you explicitly point at: branch, HEAD SHA, dirty state, changed file paths, and an additions/deletions diff stat. |

You can pass any combination of the three in a single run. Each run uses a
fresh `local-<timestamp>` session id unless you override it with
`--session`.

After running the script, open Mori → **Evidence Hub → Connector JSONL**,
load the file (paste, or pick it from the desktop connector inbox), and
review every event in **Import Review** before it reaches a session.
The script never imports anything for you.

## What this bridge never does

- It does **not** make any network call.
- It does **not** watch folders, run as a daemon, or run on a schedule.
- It does **not** read accounts, app databases, browser history/tabs, or
  the clipboard.
- It does **not** capture full diff content or file contents for
  `--git-repo` — only metadata (branch, SHA, dirty flag, changed paths,
  diff stat).
- It does **not** store the full transcript text for `--transcript` —
  only a summary.
- It does **not** include the absolute repository path in the Git event.
- It does **not** auto-import anything into Mori — Import Review is always
  an explicit step.

## Why one Python script (no `.sh` / `.ps1` pair)

Other connector templates in this repo are shell hooks. This bridge
generates structured JSON from file reads and `git` subprocess output,
where hand-rolled shell JSON is fragile and easy to get wrong. A single
Python 3 script keeps one correct implementation that behaves the same on
macOS, Linux, and Windows. The generated JSONL is guarded by a parser /
preview / normalization test (see "Files" below).

## Event-kind mapping

Mori's connector schema has a fixed set of event kinds. The bridge maps
each input to the existing kind whose downstream Timeline type matches:

| Input | `connectorId` | `kind` | Source kind | TimelineEvent type |
|---|---|---|---|---|
| `--transcript` | `desktopTranscriptImport` | `transcript_imported` | `aiConversation` | `aiConversation` |
| `--note` | `manual` | `session_finished` | `manualNote` | `documentNote` |
| `--git-repo` | `gitCommand` | `git_diff_captured` | `gitDiff` | `fileCode` |

A manual note is emitted as a `session_finished` event because that is the
connector event kind Mori maps to a `documentNote` timeline entry. The
schema has no dedicated "note" kind; the bridge reuses an existing kind
rather than changing the connector schema. The `manual` connector id and
`manualNote` source kind keep the note correctly labelled everywhere the
user sees it.

## Requirements

- Python 3.8 or newer.
- `git` on `PATH` (only needed for `--git-repo`).

## Files

- [`mori-local-capture.py`](./mori-local-capture.py) — the capture script.
- [`sample-event.jsonl`](./sample-event.jsonl) — synthetic sample output
  (one event per input). Guarded by
  `src/lib/connectors/connectorLocalCaptureFixture.test.ts`.

## Usage

```bash
# Capture a transcript file you exported / saved yourself
python3 mori-local-capture.py --transcript ~/notes/claude-session.txt

# Capture a live CLI session by piping it in explicitly (stdin)
claude -p "review this module" | python3 mori-local-capture.py --transcript -

# Record a manual note
python3 mori-local-capture.py --note "Decided to keep the import review gate"

# Capture safe Git snapshot metadata for the current repo
python3 mori-local-capture.py --git-repo .

# All three in one run (they share one session id)
python3 mori-local-capture.py \
  --transcript ~/notes/claude-session.txt \
  --note "Wrapped the timeline refactor" \
  --git-repo ~/work/mori

# Override the output directory or session id
python3 mori-local-capture.py --note "..." --out ~/captures --session my-session-id
```

Output goes to `~/.mori/connectors/local-capture/<date>.jsonl` unless
`--out` is given. The script prints where it wrote and how many events.

## Uninstall

- Delete `mori-local-capture.py`.
- Delete the JSONL files under `~/.mori/connectors/local-capture/`.

Mori never writes back into this directory.

See also:
[`docs/connectors/local-capture.md`](../../docs/connectors/local-capture.md)
for the full real-work capture flow, and
[`docs/connectors/connector-event-format.md`](../../docs/connectors/connector-event-format.md)
for the connector JSONL schema.
