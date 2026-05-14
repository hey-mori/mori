# Mori · Claude Code hook setup

This document describes how to wire a Claude Code session into Mori as a
local connector. **The hook is explicit opt-in** — you install it on your
own machine, you control the file path, you can uninstall it any time.

Mori's repository ships a setup *template* under
[`connectors/claude-code/`](../../connectors/claude-code/). It is not
auto-installed.

## What this hook captures

When you configure Claude Code to call the Mori hook script for an event,
the script writes one Mori `ConnectorEvent` JSON line to a local file.
The events that make sense to enable today are:

- `session_started` — the recording boundary; Mori's Source title comes
  from here
- `prompt_submitted` — your prompt summary
- `tool_started` / `tool_finished` — Claude tool invocations + exit codes
- `file_changed` — file paths Claude edited (path only, not contents)
- `session_finished` — the close-out event

Each event includes:
- A short `summary` line (no full prompts/responses by default)
- An `occurredAt` ISO timestamp
- A `privacy.captureMethod: "local_hook"` tag
- A `privacy.rawDataPolicy: "summary_only"` tag

The script truncates the captured payload to **2 KB** before writing.

## What this hook never does

- **No network calls.** The script writes to a local JSONL file. Mori
  imports the file when you click Import in the app.
- **No raw prompt / response bodies by default.** The script writes a
  summary line. If you change `rawDataPolicy` to `retained`, the body is
  still capped at 2 KB and runs through Mori's redaction pass on import.
- **No Anthropic / cloud transmission.** Mori never reads your Anthropic
  account.
- **No file-system scan.** The hook only writes what Claude Code's own
  event payload contained.
- **No background daemon.** The script runs exactly once per hook event,
  inside the same process tree as Claude Code.

## Setup

1. Install `mori-claude-hook.sh` (or `.ps1` on Windows) somewhere on your
   PATH. The template lives in [`connectors/claude-code/`](../../connectors/claude-code/).
2. Pick a target directory you control:
   - macOS / Linux: `~/.mori/connectors/claude-code/`
   - Windows: `%USERPROFILE%\.mori\connectors\claude-code\`
3. Copy the contents of `mori-claude-hook.example.json` into your
   Claude Code hooks settings. Adjust the `command` path so it points
   at the script you installed.
4. Run Claude Code as usual. After each event, the hook script appends
   one JSON line to `<target>/YYYY-MM-DD.jsonl`.
5. In Mori, open Evidence → Import. Today the import path lives behind
   the existing **AI 대화** tab — paste the JSONL contents into the
   transcript field. A dedicated "Connector JSONL" import path is
   tracked under the [next step](#next-steps) section below.
6. Walk through Import Review. Accept the events you want; discard the
   rest. Mori never persists anything until you click **Apply**.

## Uninstall

- Remove the hook entry from your Claude Code settings.
- Delete the script.
- Delete the JSONL files under `~/.mori/connectors/claude-code/`.

Mori never writes back into that directory. There is nothing for the app
to clean up.

## Security checklist

- [x] The script is small enough to read in one screen — read it before
  installing.
- [x] The script never opens a network socket.
- [x] The script never reads environment variables beyond the ones it
  echoes back through `provenance.host` / `provenance.toolName`.
- [x] The script never calls `git` / `npm` / any other tool.
- [x] The JSONL file is plain text under your home directory; you can
  inspect, edit, or delete it with any text editor.
- [x] On import, Mori applies a best-effort redaction pass that masks
  obvious-looking API keys, bearer tokens, AWS keys, and `.env`-style
  assignments before persisting.

## Troubleshooting

- **The script does not fire** — confirm Claude Code's hook system is
  enabled and the `command` path resolves on your machine.
- **The JSONL file has weird control characters** — make sure your
  shell wrote UTF-8. The Mori parser tolerates Windows-style `\r\n`.
- **A line refuses to import** — Mori reports the offending line number
  in Import Review. The rest of the file still imports. Edit the bad
  line by hand.
- **A line looks like it leaked a secret** — Mori's redaction pass runs
  before persistence, but the JSONL file itself is unchanged on disk.
  Scrub it manually if you need to share it.

## Next steps (planned)

- A dedicated **Connector JSONL** import tab inside the Evidence Hub so
  you can pick a `.jsonl` file directly instead of pasting through the
  AI 대화 tab.
- A Tauri-side ingest command that reads JSONL files from a watched
  inbox directory after the user clicks an explicit "Refresh" button
  (still no background polling).
- A Mori-specific Claude Code hook plugin that ships richer event data
  (with the same `summary_only` default).

These remain Planned — the milestone that landed today added the schema,
parser, normaliser, redaction, and templates; the UI file picker is the
next product surface.
