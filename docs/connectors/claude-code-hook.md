# Mori · Claude Code hook setup

This document describes how to wire a Claude Code session into Mori as a
local connector. **The hook is explicit opt-in** — you install it on your
own machine, you control the file path, you can uninstall it any time.

Mori's repository ships a setup *template* under
[`connectors/claude-code/`](../../connectors/claude-code/). It is not
auto-installed.

## What this hook captures

The launcher forwards each Claude Code hook payload (on stdin) to
`mori-claude-hook.py` (Python 3 required), which classifies it and writes
one **typed** Mori `ConnectorEvent` JSON line to a local file:

| Claude Code hook | Mori connector kind | Captured field |
|---|---|---|
| `SessionStart` | `session_started` | repo name (from `cwd`); Mori's Source title comes from here |
| `UserPromptSubmit` | `prompt_submitted` | first line of the prompt |
| `PostToolUse` · Edit/Write/MultiEdit/NotebookEdit | `file_changed` | edited file path (path only, not contents) |
| `PostToolUse` · Bash | `command_finished` | the command line |
| `PostToolUse` · other tools | `tool_finished` | tool name |
| `SessionEnd` | `session_finished` | end reason |

`Stop` is intentionally not mapped (it fires on every assistant turn);
only `SessionEnd` marks a real session boundary.

Each event includes:
- A short `summary` line (never the full prompt / tool body)
- An `occurredAt` ISO timestamp
- A `privacy.captureMethod: "local_hook"` tag
- A `privacy.rawDataPolicy: "summary_only"` tag

## What this hook never does

- **No network calls.** The script writes to a local JSONL file. Mori
  imports the file when you click Import in the app.
- **No raw prompt / response bodies.** The mapper writes a one-line
  summary per event and never stores the prompt text, tool input, or tool
  output. Summaries still run through Mori's redaction pass on import.
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
5. In Mori, open Evidence → 소스 추가 → **Connector JSONL** tab.
   - **Tauri desktop**: click **Refresh inbox**, pick a file from the
     `claude-code` row, and Mori loads the contents into the textarea
     and auto-runs Parse / Preview.
   - **Browser**: paste the contents of the JSONL file the hook
     produced into the textarea and click **Parse / Preview**.
   The preview card shows valid event count, invalid lines with line
   numbers, connector ids, event kinds, and the time range Mori
   detected.
6. Click **Import to Review** to send the normalized events into Import
   Review. Accept the events you want; discard the rest. Mori never
   persists anything until you click **Apply** on the Review screen.

## Uninstall

- Remove the hook entry from your Claude Code settings.
- Delete the script.
- Delete the JSONL files under `~/.mori/connectors/claude-code/`.

Mori never writes back into that directory. There is nothing for the app
to clean up.

## Security checklist

- [x] The launcher and `mori-claude-hook.py` are short enough to read
  before installing — do read them.
- [x] The script never opens a network socket.
- [x] The script reads only the home directory (to resolve the default
  output path) and the hostname (echoed back as `provenance.host`).
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

- A Mori-specific Claude Code hook plugin that ships richer event data
  (with the same `summary_only` default).
- Optional duplicate-event detection across repeated inbox refreshes so
  users can re-import the same JSONL without paying for duplicate
  Review items.

The **Connector JSONL** paste import path is implemented today — the
schema, parser, normaliser, redaction, and Evidence Hub UI all ship.
Live Claude sync, account integration, OAuth, and background polling
remain explicitly out of scope.
