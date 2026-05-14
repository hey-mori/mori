# Desktop / web capture boundaries

This document spells out **exactly** how Mori treats Claude Desktop,
Claude Web, ChatGPT Desktop / Web, Codex Desktop, Codex Web, and Codex's
GitHub workflow. The short version: Mori never reads these apps
silently.

> Every path below is either *explicit paste*, *explicit file import*,
> or *Planned*. None of them are "Mori auto-connects to your account".

## Claude Desktop

| Path | Status | What user does |
|---|---|---|
| Manual transcript paste | Implemented | Copy the transcript out of Claude Desktop, paste into Evidence Hub → AI 대화 → Claude. |
| Claude Code hook (local JSONL) | Docs-template-only | Install [`connectors/claude-code/mori-claude-hook.sh`](../../connectors/claude-code/mori-claude-hook.sh), point Claude Code at it, then import the JSONL by paste (today) or via the Connector JSONL tab (planned). |
| Anthropic-provided desktop export | Planned | Mori would consume a stable export format the day Anthropic ships one. |
| Window / memory scraping | **Never** | Mori does not read Claude Desktop's window, accessibility tree, or process memory. There is no plan to add this. |
| OAuth / API key auto-connect | **Never** | Mori does not authenticate against `console.anthropic.com` or `claude.ai`. The user does not paste API keys into Mori. |

## Claude Web (claude.ai)

| Path | Status | What user does |
|---|---|---|
| Manual transcript paste | Implemented | Copy the transcript, paste into AI 대화 → Claude. |
| Anthropic-provided web export | Planned | If Anthropic ships a download / share format, Mori would add a file importer. |
| Browser-tab scraping | **Never** | Mori does not read browser tabs. There is no plan to add automatic tab reading. |
| OAuth cookie reuse | **Never** | Mori does not read `claude.ai` session cookies. |

A future **browser extension** is *Planned*. Even then, the extension
must let the user explicitly click "Add this page to Mori" on a per-page
basis — there will be no background tab reading. See
[`capture-surface-matrix.md`](./capture-surface-matrix.md) row
`browserExtension`.

## ChatGPT Desktop / Web

| Path | Status | What user does |
|---|---|---|
| Manual transcript paste | Implemented | Copy the transcript, paste into AI 대화 → ChatGPT. |
| OpenAI-provided export | Planned | The OpenAI "Export data" zip is intended for archival; once a streamlined per-conversation export ships, Mori can absorb it. |
| Window / browser scraping | **Never** | Same posture as Claude. |
| OAuth | **Never** | Mori does not log into `chatgpt.com`. |

## Codex Desktop

| Path | Status | What user does |
|---|---|---|
| Manual transcript paste | Implemented | Paste the session transcript into AI 대화 → Codex. |
| Codex CLI wrapper | Docs-template-only | Install [`connectors/codex-cli/mori-codex-wrapper.sh`](../../connectors/codex-cli/mori-codex-wrapper.sh), invoke Codex through it, import the JSONL. **Note**: this captures **CLI** runs, not desktop-app conversations. |
| OpenAI-provided desktop export | Planned | Awaits a stable export format. |
| Window / memory scraping | **Never** | – |
| OAuth | **Never** | – |

## Codex Web / Codex on GitHub

| Path | Status | What user does |
|---|---|---|
| Manual transcript / PR paste | Implemented | Paste the conversation summary into AI 대화. Paste PR description / diff into Git diff. |
| GitHub PR import | Planned | See [`github-pr-import.md`](./github-pr-import.md). Will require explicit URL + manual paste of body/diff; no GitHub OAuth in the first version. |
| GitHub OAuth account capture | **Never** until explicitly implemented | Mori does not authenticate against GitHub. A future opt-in path with a clear scope is possible but not in plan. |
| Codex cloud API capture | **Never** | Mori does not connect to OpenAI's API for session capture. |

## What every desktop / web row has in common

1. **No window reading.** Whether Claude Desktop or ChatGPT Desktop or
   Codex Desktop, Mori does not snapshot the running window. There is no
   accessibility-tree reader and there will not be one without a
   separate, explicit, opt-in milestone.
2. **No browser-tab scraping.** Mori does not run a background browser
   process. A future browser extension is Planned; even then it is
   strictly per-click capture.
3. **No OAuth / cookie reuse.** Mori does not authenticate against any
   of these services on the user's behalf.
4. **No background daemon.** Connector capture is "the tool writes a
   local file, the user clicks Import".
5. **Explicit paste is always the safe fallback.** Every desktop / web
   path falls back to "copy out of the app, paste into Mori".

## Tracking these guarantees in code

The boundary list above is also encoded in `src/lib/connectors/captureSurfaces.ts`:

- `claudeDesktopExport`, `claudeWebExport`, `codexDesktopExport`,
  `codexWebGithub` carry `status: "planned"` and explicit
  `whatMoriNeverAccesses` rows that match the table above.
- Unit tests in `captureSurfaces.test.ts` assert that planned surfaces
  do not claim `canEnterImportReview` and do not retain raw data.
