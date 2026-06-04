# Mori · terminal capture helper

This folder is a **setup template** for capturing your work into Mori from a
terminal. It is the terminal counterpart of
[`connectors/vscode-task/`](../vscode-task/) and follows the explicit-capture
model in [`docs/source-integrations.md`](../../docs/source-integrations.md)
("IDE / Terminal integration plan").

> Mori does **not** install or auto-run anything. You source one file from
> your shell rc, and capture happens only when you type `mori-capture …`
> yourself. There is no prompt hook, no shell-history scraping, no watcher.

## What this template does

[`mori-capture.sh`](mori-capture.sh) (POSIX shells) and
[`mori-capture.ps1`](mori-capture.ps1) (Windows PowerShell) each define one
function, `mori-capture`, that wraps the already-shipped local-capture bridge
([`connectors/local-capture/mori-local-capture.py`](../local-capture/mori-local-capture.py))
with explicit, safe inputs:

| Command | Wraps | Captures |
|---|---|---|
| `mori-capture git` | `--git-repo .` | Git snapshot of the current repo |
| `mori-capture commit [ref]` | `--git-commit` | one commit's metadata (default `HEAD`) |
| `mori-capture note "<text>"` | `--note` | a manual note you type |
| `mori-capture transcript <path>` | `--transcript` | a transcript file, or `-` for stdin |

Each capture writes one JSONL line to `~/.mori/connectors/local-capture/`.
Nothing is imported automatically. Open Mori → Evidence Hub → Connector
JSONL and review the events in Import Review.

## What it deliberately does not do

Consistent with Mori's hard non-goals, this helper never:

- reads `~/.bash_history`, shell scrollback, or any command you did not
  explicitly pass to `mori-capture`;
- installs a prompt hook (`PROMPT_COMMAND` / `precmd`), an alias that runs
  on every command, a watcher, or a daemon;
- captures keystrokes, screenshots, or the clipboard;
- imports anything without Import Review.

## Setup

1. Load the helper from your shell startup file.

   POSIX shells (`~/.bashrc` or `~/.zshrc`):

   ```sh
   source /path/to/mori/connectors/terminal-helper/mori-capture.sh
   ```

   Windows PowerShell (your `$PROFILE`):

   ```powershell
   . C:\path\to\mori\connectors\terminal-helper\mori-capture.ps1
   ```

2. If you cloned Mori somewhere other than `~/Dev/Projects/mori`, point
   `MORI_LOCAL_CAPTURE` at the `mori-local-capture.py` path before loading:

   ```sh
   export MORI_LOCAL_CAPTURE="$HOME/code/mori/connectors/local-capture/mori-local-capture.py"
   ```

   ```powershell
   $env:MORI_LOCAL_CAPTURE = "C:\code\mori\connectors\local-capture\mori-local-capture.py"
   ```

3. Requires Python 3.8+ on `PATH` as `python` or `python3` (and `git` for the
   Git commands).

## Usage

```sh
mori-capture git                    # snapshot the current repo
mori-capture commit                 # capture the HEAD commit
mori-capture commit 1a2b3c4          # capture a specific commit
mori-capture note "wrapped the timeline refactor"
some-command | mori-capture transcript -   # capture piped output
mori-capture help                   # usage
```

## Event mapping

`mori-capture` reuses the local-capture connector inputs, so it emits the
events documented in
[`docs/connectors/local-capture.md`](../../docs/connectors/local-capture.md):

| Command | `connectorId` | `kind` | Source kind |
|---|---|---|---|
| `git` / `commit` | `gitCommand` | `git_diff_captured` | `gitDiff` |
| `note` | `manual` | `session_finished` | `manualNote` |
| `transcript` | `desktopTranscriptImport` | `transcript_imported` | `aiConversation` |

## Code and test references

- Capture script: [`connectors/local-capture/mori-local-capture.py`](../local-capture/mori-local-capture.py)
- Local-capture guide: [`docs/connectors/local-capture.md`](../../docs/connectors/local-capture.md)
- Integration plan: [`docs/source-integrations.md`](../../docs/source-integrations.md)
