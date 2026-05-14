# Mori · Claude Code hook template

This folder contains a **setup template** for exporting Claude Code session
events into Mori. The template runs entirely on your local machine and is
strictly opt-in.

> Mori does **not** install or auto-run this hook. You install it explicitly
> on your own machine. You can remove it at any time.

## What this template does

- Subscribes to Claude Code's hook system on your machine
- For each hook event (prompt submitted, tool started/finished, file
  changed, session finished) writes one JSON object as a line to a local
  JSONL file under `~/.mori/connectors/claude-code/<date>.jsonl`
- Annotates every event with `privacy.captureMethod: "local_hook"` and a
  default `privacy.rawDataPolicy: "summary_only"`
- Truncates raw prompt / response bodies to ~2 KB so secrets are less
  likely to land in the log accidentally
- Lets you delete the JSONL file at any time

## What this template never does

- It does **not** send anything to a network host, Anthropic, or Mori cloud
- It does **not** read other apps, browser tabs, or files outside Claude
  Code's own event payload
- It does **not** capture Claude Code authentication tokens
- It does **not** keep raw bodies that look like secrets (a best-effort
  redaction strips obvious API keys / bearer tokens / `.env` style
  assignments before writing the JSONL line)
- It does **not** run automatically when Claude Code is closed
- It does **not** require an account, OAuth, or login

## Files

- [`mori-claude-hook.example.json`](./mori-claude-hook.example.json) —
  paste into Claude Code's hook settings.
- [`mori-claude-hook.sh`](./mori-claude-hook.sh) — POSIX shell hook script
  used by the example settings.
- [`mori-claude-hook.ps1`](./mori-claude-hook.ps1) — PowerShell variant for
  Windows.
- [`sample-event.jsonl`](./sample-event.jsonl) — three sample events.

## Setup

1. Pick a target file path on your local disk, e.g.
   `~/.mori/connectors/claude-code/$(date +%F).jsonl` (macOS / Linux) or
   `$env:USERPROFILE\.mori\connectors\claude-code\$(Get-Date -Format yyyy-MM-dd).jsonl`
   (Windows).
2. Copy `mori-claude-hook.example.json` into your Claude Code hooks config.
3. Make `mori-claude-hook.sh` (or `.ps1`) executable and place it on your
   PATH.
4. Run any Claude Code session you want recorded. The script appends one
   JSON line per hook event.
5. In Mori, open Evidence → Import → AI 대화 (or the future "Connector
   JSONL" import) and paste the JSONL contents. Mori will normalize the
   events through Import Review before they reach the session memory.

## Uninstall

- Remove the hook entry from Claude Code's settings file.
- Delete the script.
- Delete the JSONL files under `~/.mori/connectors/claude-code/`.

Mori will never write back into the directory.

## Troubleshooting

- **The script is not firing** — confirm Claude Code's hook system is
  enabled and the JSON in the example file matches your Claude Code
  version.
- **The JSONL contains broken lines** — Mori's import path skips
  malformed lines and reports them by line number; the rest of the
  events still import.
- **A line looks like it contains a secret** — Mori's import path applies
  a second redaction pass before persisting; the original JSONL on disk
  is unchanged. Edit the file manually if you want to scrub it before
  import.

See also: [`docs/connectors/claude-code-hook.md`](../../docs/connectors/claude-code-hook.md).
