# Mori · Claude Code hook template

This folder contains a **setup template** for exporting Claude Code session
events into Mori. The template runs entirely on your local machine and is
strictly opt-in.

> Mori does **not** install or auto-run this hook. You install it explicitly
> on your own machine. You can remove it at any time.

## What this template does

- Subscribes to Claude Code's hook system on your machine.
- Maps each hook event to a **typed** Mori connector event (not an opaque
  blob) and appends one JSON line to `~/.mori/connectors/claude-code/<date>.jsonl`.
- Stores **summary metadata only** (`privacy.rawDataPolicy: "summary_only"`).
  The raw prompt text, tool input, and tool output are never written.

The event mapping:

| Claude Code hook | Mori connector kind | Captured field |
|---|---|---|
| `SessionStart` | `session_started` | repo name (from `cwd`) |
| `UserPromptSubmit` | `prompt_submitted` | first line of the prompt |
| `PostToolUse` · Edit/Write/MultiEdit/NotebookEdit | `file_changed` | edited file path |
| `PostToolUse` · Bash | `command_finished` | the command line |
| `PostToolUse` · other tools | `tool_finished` | tool name |
| `SessionEnd` | `session_finished` | end reason |

`Stop` is intentionally **not** mapped — it fires on every assistant turn,
so only `SessionEnd` marks a real session boundary. `PreToolUse` maps to the
`*_started` variants if you register it, but `PostToolUse` is the recommended
hook.

## What this template never does

- It does **not** send anything to a network host, Anthropic, or a Mori cloud.
- It does **not** read other apps, browser tabs, or files outside Claude
  Code's own event payload.
- It does **not** capture Claude Code authentication tokens.
- It does **not** store raw prompt / tool bodies — only one-line summaries.
- It does **not** run automatically when Claude Code is closed.
- It does **not** require an account, OAuth, or login.

On import, Mori additionally re-runs a best-effort secret redaction over the
summaries.

## Requirements

- **Python 3** on your `PATH`. The `.sh` / `.ps1` launchers forward the hook
  payload on stdin to `mori-claude-hook.py`, which does the mapping.

## Files

- [`mori-claude-hook.py`](./mori-claude-hook.py) — the mapper: reads one hook
  payload on stdin, writes one typed connector JSONL line.
- [`mori-claude-hook.sh`](./mori-claude-hook.sh) — POSIX launcher (macOS / Linux).
- [`mori-claude-hook.ps1`](./mori-claude-hook.ps1) — PowerShell launcher (Windows).
- [`mori-claude-hook.example.json`](./mori-claude-hook.example.json) — the
  `hooks` block to merge into Claude Code's `settings.json`.
- [`sample-event.jsonl`](./sample-event.jsonl) — five sample events covering
  one full session.

## Setup

1. Make `mori-claude-hook.sh` (macOS / Linux) or `mori-claude-hook.ps1`
   (Windows) executable. Keep it next to `mori-claude-hook.py`.
2. Merge the `hooks` object from `mori-claude-hook.example.json` into your
   Claude Code `settings.json` (`~/.claude/settings.json` for all projects, or
   `.claude/settings.json` for one project), replacing `ABSOLUTE_PATH` with the
   real path to the launcher.
3. Run any Claude Code session you want recorded. The hook appends one typed
   JSON line per event to `~/.mori/connectors/claude-code/<date>.jsonl`.
4. In Mori, open **Evidence Hub → Connector JSONL**, click **Refresh inbox**
   (desktop) and pick the file, or paste its contents (browser). Mori
   normalizes the events through Import Review before they reach the session.

Pass `--out <dir>` after the launcher in the `command` string to change the
output directory.

## Uninstall

- Remove the hook entries from Claude Code's settings file.
- Delete the scripts.
- Delete the JSONL files under `~/.mori/connectors/claude-code/`.

Mori will never write back into the directory.

## Troubleshooting

- **The hook is not firing** — confirm the `command` path is absolute and
  executable, that Python 3 is on your `PATH`, and that the hook event names
  match your Claude Code version.
- **The JSONL contains broken lines** — Mori's import path skips malformed
  lines and reports them by line number; the rest still import.
- **A summary looks like it contains a secret** — Mori re-runs a redaction
  pass before persisting; the JSONL on disk is unchanged. Edit it manually to
  scrub before import if needed.

See also: [`docs/connectors/claude-code-hook.md`](../../docs/connectors/claude-code-hook.md).
