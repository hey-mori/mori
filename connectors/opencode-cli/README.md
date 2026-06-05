# Mori · OpenCode CLI wrapper template

A small wrapper that runs an OpenCode CLI session, captures the prompt,
exit code, duration, and an optional git diff summary, and appends one
JSONL event per stage to a Mori connector inbox.

> Mori does **not** install this wrapper for you. It is an explicit
> opt-in template — read the script, edit the path, run it yourself.

## What this wrapper does

- Records when an OpenCode CLI invocation **starts** and **finishes**
- Captures the task description (the prompt passed to OpenCode)
- Records the exit code and duration
- Optionally captures a `git diff --shortstat` summary of the working
  tree changes after the run, gated behind the `--git` flag
- Writes one JSON line per event to a user-controlled JSONL file under
  `~/.mori/connectors/opencode-cli/<date>.jsonl`

## What this wrapper never does

- It does **not** upload anything to a network host
- It does **not** capture OpenCode credentials, API keys, or tokens
- It does **not** scan files outside the current working directory
- It does **not** capture `git diff` content unless you pass `--git`
- It does **not** record the OpenCode output body, environment variables,
  or system metadata beyond `pwd` and the tool name/version
- It does **not** auto-start; you invoke it like any other CLI

## Files

- [`mori-opencode-wrapper.sh`](./mori-opencode-wrapper.sh) — POSIX shell
  wrapper.
- [`mori-opencode-wrapper.ps1`](./mori-opencode-wrapper.ps1) — PowerShell
  variant.
- [`sample-event.jsonl`](./sample-event.jsonl) — five sample events
  (session start → prompt → command finished → git diff → session
  finished).

## Usage

```bash
# Wrap any OpenCode CLI invocation. Replace `opencode` with your binary name.
mori-opencode-wrapper.sh -- opencode run "Add retry to the upload client"
# Same call but also capture a git diff --shortstat after the run.
mori-opencode-wrapper.sh --git -- opencode run "Add retry to the upload client"
```

```powershell
# Windows PowerShell variant. The command starts after the wrapper options.
.\mori-opencode-wrapper.ps1 opencode run "Add retry to the upload client"
.\mori-opencode-wrapper.ps1 -Git opencode run "Add retry to the upload client"
```

After running, open Mori → 연결 → Source Control Center → OpenCode →
"Connector JSONL 가져오기", then paste or pick today's JSONL file. Every
event flows through Import Review before anything is applied.

## Uninstall

Delete the wrapper script. Delete the JSONL files under
`~/.mori/connectors/opencode-cli/`. Mori never writes back into the
directory.

## Troubleshooting

- **The wrapper exits with the same code as OpenCode** — yes, that's
  intentional so it composes with CI / Make tasks.
- **No JSONL file appears** — check the `--out` flag (defaults to
  `~/.mori/connectors/opencode-cli/<date>.jsonl`) and that the parent
  directory is writable.
- **A line looks like it contains a secret** — Mori's import path applies
  a redaction pass before persisting. Edit the file manually if you want
  to scrub it before import.
