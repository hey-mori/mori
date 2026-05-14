# Mori · Codex CLI wrapper template

A small wrapper that runs a Codex CLI session, captures the prompt, exit
code, duration, and an optional git diff summary, and appends one JSONL
event per stage to a Mori connector inbox.

> Mori does **not** install this wrapper for you. It is an explicit
> opt-in template — read the script, edit the path, run it yourself.

## What this wrapper does

- Records when a Codex CLI invocation **starts** and **finishes**
- Captures the task description (first argument to the wrapper)
- Records the exit code and duration
- Optionally captures a `git diff --shortstat` summary of the working
  tree changes after the run, gated behind the `--git` flag
- Writes one JSON line per event to a user-controlled JSONL file under
  `~/.mori/connectors/codex-cli/<date>.jsonl`

## What this wrapper never does

- It does **not** upload anything to a network host
- It does **not** capture Codex credentials, API keys, or session tokens
- It does **not** scan files outside the current working directory
- It does **not** capture `git diff` content unless you pass `--git`
- It does **not** record environment variables or system metadata
  beyond `pwd` (current working directory) and tool name/version
- It does **not** auto-start; you invoke it like any other CLI

## Files

- [`mori-codex-wrapper.sh`](./mori-codex-wrapper.sh) — POSIX shell
  wrapper.
- [`mori-codex-wrapper.ps1`](./mori-codex-wrapper.ps1) — PowerShell
  variant.
- [`sample-event.jsonl`](./sample-event.jsonl) — three sample events.

## Usage

```bash
# Wrap any Codex CLI invocation. Replace `codex` with your binary name.
mori-codex-wrapper.sh -- codex run "Upgrade outdated dependencies"
# Same call but also capture a git diff --shortstat after the run.
mori-codex-wrapper.sh --git -- codex run "Upgrade outdated dependencies"
```

After running, open Mori → Evidence → Import (AI 대화 or future
"Connector JSONL") and paste the contents of today's JSONL file.

## Uninstall

Delete the wrapper script. Delete the JSONL files under
`~/.mori/connectors/codex-cli/`. Mori never writes back into the
directory.

## Troubleshooting

- **The wrapper exits with the same code as Codex** — yes, that's
  intentional so it composes with CI / Make tasks.
- **No JSONL file appears** — check the `--out` flag (defaults to
  `~/.mori/connectors/codex-cli/<date>.jsonl`) and that the parent
  directory is writable.
- **A line looks like it contains a secret** — Mori's import path
  applies a redaction pass before persisting. Edit the file manually
  if you want to scrub it before import.

See also: [`docs/connectors/codex-cli-wrapper.md`](../../docs/connectors/codex-cli-wrapper.md).
