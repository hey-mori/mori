# Mori capture surface matrix

Mori does not have one big "Claude / Codex connector". Each AI agent or
developer tool reaches Mori through a *different* surface, with different
guarantees, different setup steps, and different statuses. This document
is the canonical, honest list of every surface and where each one stands
today.

The same data is exported as typed rows from
[`src/lib/connectors/captureSurfaces.ts`](../../src/lib/connectors/captureSurfaces.ts)
so the UI can derive labels and badges from a single source of truth.

> **What "surface" means here:** the user-visible path that moves
> evidence from a tool into Mori. e.g. "Claude" is not a surface — "AI
> transcript paste", "Claude Code hook", "Claude Desktop export", and
> "Claude Web export" are four different surfaces with four different
> realities.

## Status legend

| Status | What it really means |
|---|---|
| **Implemented** | The path works today. The user can use it without reading any docs. |
| **Partial** | Some of the path works (e.g. the parser) but a piece is missing (usually the UI surface). |
| **Manual-only** | The only way is to paste text by hand. No structured capture. |
| **Docs-template-only** | A pure TypeScript pipeline + a setup template exist; UI to ingest the result is not built yet. |
| **Planned** | Designed in this doc, not built. |
| **Unavailable** | Platform / vendor / privacy constraints block this surface. |

## Tool families

- **manual** — direct user input (note / URL / paste)
- **claude** — anything Anthropic-shaped
- **codex** — anything OpenAI-Codex-shaped
- **git** — git tooling
- **ide** — VS Code / Cursor / JetBrains
- **terminal** — shell hooks
- **browser** — web extension paths
- **document** — Markdown / PDF / text imports
- **analysis** — Mori's own analysis passes

## Matrix

| Surface | Family | Surface kind | Status | Can enter Import Review |
|---|---|---|---|---|
| Manual note | manual | paste | Implemented | – (commits directly) |
| URL / web page excerpt | manual | paste | Implemented | – |
| AI transcript paste (Claude / ChatGPT / Codex / Other) | claude | paste | Implemented | Yes |
| Git diff paste | git | paste | Implemented | Yes |
| Tauri Git diff capture | git | localCommand | Implemented | Yes |
| Repository metadata (Verify) | git | localCommand | Implemented | n/a (no SourceRef) |
| Quick Pass analysis | analysis | analysis | Implemented | n/a |
| Local capture CLI bridge (mori-local-capture) | terminal | localCommand | **Docs-template-only** | Yes (via parser) |
| Claude Code hook (local JSONL) | claude | cli | **Docs-template-only** | Yes (via parser) |
| Claude Desktop export | claude | desktop | Planned | No |
| Claude Web export | claude | web | Planned | No |
| Codex CLI wrapper (local JSONL) | codex | cli | **Docs-template-only** | Yes (via parser) |
| Codex Desktop export | codex | desktop | Planned | No |
| Codex Web · GitHub workflow | codex | web | Planned | No |
| VS Code extension | ide | extension | Planned | No |
| Cursor extension | ide | extension | Planned | No |
| Terminal shell integration | terminal | cli | Planned | No |
| Browser extension | browser | extension | Planned | No |
| GitHub PR / commit import | git | web | Planned | No |
| File / document import | document | localFile | Planned | No |
| MCP server | claude | extension | Planned | No |

## Per-surface honesty notes

### Manual paste surfaces (Implemented)

- **Manual note** · **URL** · **AI transcript paste** · **Git diff paste**:
  the user types or pastes text; Mori validates, normalises, and (for AI
  transcript + Git diff) routes through Import Review.

### Local command surfaces (Implemented)

- **Tauri Git diff capture**: explicit click on "Fetch Git Diff" runs
  `git diff` against an explicitly saved repo path. No filesystem scan.
- **Repository metadata Verify**: explicit click runs `git rev-parse` /
  `branch --show-current` / `status --porcelain` against a saved repo
  path. No file content is read.
- **Quick Pass**: explicit click runs deterministic heuristic or local
  LLM analysis. Cannot reach external APIs without opt-in.

### Docs-template-only surfaces

- **Claude Code hook**: the user installs
  [`connectors/claude-code/mori-claude-hook.sh`](../../connectors/claude-code/mori-claude-hook.sh)
  (or `.ps1`) on their machine and registers it in Claude Code's hook
  config. The hook writes one Mori `ConnectorEvent` line per event to
  `~/.mori/connectors/claude-code/<date>.jsonl`. The pure pipeline in
  `src/lib/connectors/` parses and normalises the file. **What is still
  missing: a UI surface that lets the user pick this file from inside
  Evidence Hub.** Today users paste the file's contents into the AI 대화
  tab.
- **Codex CLI wrapper**: same shape with
  [`connectors/codex-cli/mori-codex-wrapper.sh`](../../connectors/codex-cli/mori-codex-wrapper.sh).
  Same missing UI piece.

### Planned surfaces

Every surface tagged Planned has **no implementation today**. The matrix
row documents what would change once it lands; the goal is to make sure
the UI never accidentally promises one of these is wired.

Specifically:

- **Claude Desktop / Web** — no automatic window reading, no browser
  scraping, no OAuth. Future path is an Anthropic-provided export
  format or an explicit user paste.
- **Codex Desktop / Web / GitHub** — same posture. No GitHub OAuth, no
  cloud session capture. User must paste or import a file the user
  obtained themselves.
- **Local capture CLI bridge** — `connectors/local-capture/mori-local-capture.py`,
  run explicitly by the user (transcript / note / git / commit). The
  shipped explicit-capture path; the VS Code task template and the
  `mori-capture` shell helper are launchers for it.
- **VS Code / Cursor / browser / terminal** — explicit extensions /
  shell hooks remain Planned; the explicit-capture path today is the
  local capture bridge (via the `vscode-task` / `terminal-helper`
  templates). Mori will not auto-discover.
- **GitHub PR / commit import** — see
  [`github-pr-import.md`](./github-pr-import.md).
- **File / document import** — explicit Tauri file picker. No
  directory scanning, no recent-files tracking.
- **MCP server** — Mori would expose a context endpoint that a Claude
  Desktop / etc. host calls explicitly. Still planned.

## Helpers

`src/lib/connectors/captureSurfaces.ts` exports:

- `getAllCaptureSurfaces()` — every row
- `getCaptureSurfacesByFamily(family)` / `getCaptureSurfacesByStatus(status)`
- `getImplementedCaptureSurfaces()` / `getPlannedCaptureSurfaces()`
- `getCaptureSurfaceForIntegration(integrationId)` — map a `SourceIntegration.id`
  from the registry to its capture-surface row
- `describeCaptureSurfaceStatus(row)` — UI-ready `{label, tone, short}`
- `getNextConnectorMilestone()` — the single highest-value next step

All exports are pure and unit-tested in
[`captureSurfaces.test.ts`](../../src/lib/connectors/captureSurfaces.test.ts).

## Related docs

- [Connector event format](./connector-event-format.md)
- [Claude Code hook setup](./claude-code-hook.md)
- [Codex CLI wrapper setup](./codex-cli-wrapper.md)
- [Desktop / web capture boundaries](./desktop-web-capture.md)
- [GitHub PR import (planning)](./github-pr-import.md)
