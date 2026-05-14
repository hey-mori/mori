# Mori · Codex CLI wrapper setup

This document describes how to wrap a Codex CLI session so its prompt,
exit code, duration, and optionally a `git diff --shortstat` summary
end up in Mori as a local connector event batch.

> The wrapper is **explicit opt-in**. You install the script on your
> machine, you invoke it explicitly, and you can delete it at any time.
> Mori never auto-installs or auto-runs it.

## What this wrapper captures

Each invocation appends these events to a local JSONL file:

1. `session_started` — start time, working directory, short task label
2. `command_finished` — exit code + total duration
3. *(optional)* `git_diff_captured` — `git diff --shortstat` summary
   (no diff content) when the wrapper is run with `--git`

The wrapper truncates the task label to **280 characters** before
writing. The captured summary fields go through Mori's redaction pass
on import.

## What this wrapper never does

- **No network calls.** The wrapper writes a single local JSONL file.
- **No content of `git diff`.** With `--git` it only captures the
  `--shortstat` line (files changed / insertions / deletions). The
  actual file contents are not read.
- **No environment variables.** The wrapper does not log `$ENV` to
  prevent accidental capture of `OPENAI_API_KEY` etc.
- **No credential capture.** The wrapper never reads `~/.codex/`,
  cookies, keychains, or browser sessions.
- **No background daemon.** The wrapper exits with the same code as
  Codex; nothing keeps running.
- **No automatic scanning** of files outside the current working
  directory.

## Setup

1. Install `mori-codex-wrapper.sh` (or `.ps1`) somewhere on your PATH.
   Template path: [`connectors/codex-cli/`](../../connectors/codex-cli/).
2. Pick a target inbox directory:
   - macOS / Linux: `~/.mori/connectors/codex-cli/`
   - Windows: `%USERPROFILE%\.mori\connectors\codex-cli\`
3. Wrap any Codex command:

   ```bash
   mori-codex-wrapper.sh -- codex run "Upgrade outdated dependencies"
   # …or, also capture a git shortstat after the run:
   mori-codex-wrapper.sh --git -- codex run "Upgrade outdated dependencies"
   ```

4. After Codex exits, open Mori → Evidence → 소스 추가 → **Connector
   JSONL** tab. Paste the JSONL contents (file picker is the next
   step), click **Parse / Preview**, then **Import to Review**.
5. Walk through Import Review. Apply only the events you want.

## Uninstall

- Delete the wrapper script.
- Delete the JSONL files under `~/.mori/connectors/codex-cli/`.

## Security checklist

- [x] The wrapper is small enough to read in one screen — read it
  before installing.
- [x] It does not open network sockets.
- [x] It does not call any tool outside `git diff --shortstat` (and
  only when `--git` is passed).
- [x] It does not log raw stdout / stderr from Codex.
- [x] The JSONL file is plain text — you can inspect, edit, or delete
  it with any text editor.
- [x] On import, Mori applies a best-effort redaction pass before
  persistence (API keys, bearer tokens, AWS access keys, `.env` style
  assignments).

## Troubleshooting

- **The wrapper exits 64** — you forgot the `--` separator between
  wrapper flags and the Codex command.
- **No JSONL file appears** — check the `--out` flag (defaults to
  `~/.mori/connectors/codex-cli/`) and that the parent directory is
  writable.
- **The exit code differs from Codex** — it should not; the wrapper
  forwards Codex's exit code verbatim. If it differs, the wrapper itself
  crashed before reaching the forward — open the script and inspect the
  set -e early exit.

## Next steps (planned)

- A native file picker in the **Connector JSONL** tab so users can
  select a `.jsonl` file directly instead of opening and pasting it.
- An optional `--diff full` mode that captures the diff *content* (not
  just shortstat) into a `git_diff_captured.rawText` field. Disabled by
  default; it would require the user to flip `rawDataPolicy` to
  `retained` explicitly.
- A Tauri-side ingest command that reads JSONL files from the inbox on
  explicit "Refresh" clicks.

The **Connector JSONL** paste import path is implemented today — the
schema, parser, normaliser, redaction, wrapper templates, and Evidence
Hub UI all ship. Live Codex sync, desktop/web capture, and account
integration remain explicitly out of scope.
