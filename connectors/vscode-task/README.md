# Mori · VS Code task template

This folder is a **setup template** for capturing your work into Mori from
inside VS Code. It is the first IDE integration artifact, and it follows the
explicit-capture model in
[`docs/source-integrations.md`](../../docs/source-integrations.md) — see the
"IDE / Terminal integration plan" section.

> Mori does **not** install or auto-run anything. You add a task to your own
> project, and Mori only captures when you explicitly run that task. There is
> no extension, no watcher, no background process.

## What this template does

Each task runs the already-shipped local-capture bridge
([`connectors/local-capture/mori-local-capture.py`](../local-capture/mori-local-capture.py))
with explicit, safe inputs:

- **Mori: capture Git snapshot** — `--git-repo ${workspaceFolder}`: branch,
  HEAD SHA, dirty state, changed file paths, and an additions/deletions
  diff stat for the open workspace.
- **Mori: capture last commit** — `--git-commit HEAD`: the most recent
  commit's SHA, subject, author date, changed files, and diff stat.
- **Mori: capture a note** — `--note`: a manual note you type when the task
  runs (via a VS Code input prompt).

Every task writes one JSONL line to `~/.mori/connectors/local-capture/` and
prints where it landed. Nothing is imported automatically — you open Mori →
Evidence Hub → Connector JSONL and review the events in Import Review.

## What it deliberately does not do

Consistent with Mori's hard non-goals, this template never:

- watches the editor, the filesystem, or the terminal in the background;
- reads editor buffers, scrollback, or any file you did not explicitly
  capture;
- runs a daemon, an extension, or a scheduled job;
- captures keystrokes, screenshots, or the clipboard;
- imports anything without Import Review.

A capture happens only when **you** run a task from
**Terminal → Run Task…**.

## Setup

1. Copy the `tasks` and `inputs` entries from
   [`mori-tasks.json`](mori-tasks.json) into your project's
   `.vscode/tasks.json` (merge them if the file already exists).
2. Fix the `mori-local-capture.py` path in each task's `args` to where you
   cloned Mori. The template assumes `~/Dev/Projects/mori`.
3. Requires Python 3.8+ on `PATH` (and `git` for the Git tasks).

## Usage

- **Terminal → Run Task…** → pick a `Mori:` task.
- For **capture a note**, VS Code prompts for the note text.
- Open Mori → Evidence Hub → **Connector JSONL**, load the file from
  `~/.mori/connectors/local-capture/`, and review the events.

## Event mapping

These tasks reuse the local-capture connector inputs, so they emit the same
events documented in
[`docs/connectors/local-capture.md`](../../docs/connectors/local-capture.md):

| Task | Input | `connectorId` | `kind` | Source kind |
|---|---|---|---|---|
| capture Git snapshot | `--git-repo` | `gitCommand` | `git_diff_captured` | `gitDiff` |
| capture last commit | `--git-commit` | `gitCommand` | `git_diff_captured` | `gitDiff` |
| capture a note | `--note` | `manual` | `session_finished` | `manualNote` |

## Code and test references

- Capture script: [`connectors/local-capture/mori-local-capture.py`](../local-capture/mori-local-capture.py)
- Local-capture guide: [`docs/connectors/local-capture.md`](../../docs/connectors/local-capture.md)
- Integration plan: [`docs/source-integrations.md`](../../docs/source-integrations.md)
  ("IDE / Terminal integration plan")
