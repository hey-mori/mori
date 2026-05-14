# Mori connector event format

Mori connector events are how external tools (Claude Code hooks, Codex CLI
wrappers, terminal hooks, git post-commit scripts) hand local work
captures to Mori in a structured way.

> The connector event format is the **safe, explicit, local** answer to
> "how does Mori see what Claude Code / Codex did?" It is not a live API,
> it is not a daemon, and it does not phone home. External tools write
> JSONL files to a local path; Mori imports the file when the user clicks
> Import.

## File format

- UTF-8 text
- One JSON object per line (JSONL / NDJSON)
- Blank lines are ignored
- Lines beginning with `#` are treated as comments and ignored
- Malformed JSON lines are reported by line number on import; the rest of
  the file still imports

## Event shape

```jsonc
{
  "id": "evt-1",
  "connectorId": "claudeCodeHook",
  "kind": "prompt_submitted",
  "occurredAt": "2026-05-14T10:00:00Z",
  "receivedAt": "2026-05-14T10:00:01Z",
  "projectPath": "/Users/me/work/mori",
  "sessionId": "claude-session-abc",
  "sourceTitle": "Mori timeline refactor",
  "summary": "Refactor the timeline collision layout",
  "rawText": "<optional, only retained when privacy.rawDataPolicy = retained>",
  "command": "<optional, command_started / command_finished / terminal>",
  "filePath": "<optional, file_changed>",
  "git": {
    "repoPath": "/Users/me/work/mori",
    "branch": "main",
    "headCommit": "abcdef…",
    "shortHeadCommit": "abcdef1",
    "isDirty": true,
    "additions": 28,
    "deletions": 6,
    "files": [{ "path": "src/foo.ts", "changeType": "modified" }]
  },
  "tool": {
    "name": "Edit",
    "input": "<optional>",
    "output": "<optional>",
    "exitCode": 0,
    "durationMs": 312
  },
  "privacy": {
    "captureMethod": "local_hook",
    "rawDataPolicy": "summary_only",
    "redacted": false,
    "note": "Local JSONL only. No network."
  },
  "provenance": {
    "toolName": "mori-claude-hook.sh",
    "toolVersion": "0.1.0",
    "host": "macbook-pro"
  }
}
```

### Required fields

| Field | Notes |
|---|---|
| `id` | Stable id, unique within the JSONL file |
| `connectorId` | See "Connector ids" below |
| `kind` | See "Event kinds" below |
| `occurredAt` | ISO 8601 timestamp |
| `summary` | Short, single-line human label |
| `privacy.captureMethod` | One of `manual_paste` · `local_hook` · `local_cli_wrapper` · `local_desktop_command` · `planned_extension` |
| `privacy.rawDataPolicy` | One of `summary_only` · `retained` · `redacted` · `reference_only` |
| `provenance.toolName` | Free-form identifier of the tool that wrote the line |

### Connector ids

The five known ids are:

- `claudeCodeHook`
- `codexCliWrapper`
- `terminal`
- `git`
- `manual`

Unknown ids are accepted and routed through the generic `manualNote`
source kind so a custom connector can ship before its registry entry
exists.

### Event kinds

| Kind | Required clusters | Mapped to |
|---|---|---|
| `session_started` | — | becomes the `SourceRef` summary, no TimelineEvent |
| `prompt_submitted` | — | TimelineEvent (`aiConversation`) |
| `assistant_message` | — | TimelineEvent (`aiConversation`, trust = `inferred`) |
| `tool_started` | `tool.name` | TimelineEvent (`aiConversation`) |
| `tool_finished` | `tool.name` | TimelineEvent (`aiConversation`) |
| `file_changed` | `filePath` or `git.files[]` | TimelineEvent (`fileCode`) |
| `command_started` | `command` | TimelineEvent (`fileCode`) |
| `command_finished` | `command` | TimelineEvent (`fileCode`) |
| `git_diff_captured` | — | TimelineEvent (`fileCode`) |
| `commit_created` | — | TimelineEvent (`fileCode`) |
| `session_finished` | — | TimelineEvent (`documentNote`) |

Multiple events that share the same `(connectorId, sessionId)` tuple are
grouped into a single `SourceRef` so Project Memory shows them as one
session.

### Privacy fields

- **captureMethod** describes how the event reached Mori. There is no
  cloud `captureMethod`.
- **rawDataPolicy** is enforced both by the writer (the connector
  template) and by Mori on the way in.
- **redacted** can be set to `true` by the writer; Mori re-runs a
  best-effort redaction pass on import and may flip it to `true` on its
  own. `false` simply means "no redaction has happened yet" — Mori may
  still redact during import.
- **note** is shown to the user verbatim in Import Review.

## Examples

### Claude Code · prompt submitted

```json
{"id":"claude-001","connectorId":"claudeCodeHook","kind":"prompt_submitted","occurredAt":"2026-05-14T10:01:12Z","sessionId":"claude-2026-05-14","summary":"Make the Issue Garden responsive at <=1180px","privacy":{"captureMethod":"local_hook","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-claude-hook.sh","toolVersion":"0.1.0"}}
```

### Claude Code · tool finished

```json
{"id":"claude-002","connectorId":"claudeCodeHook","kind":"tool_finished","occurredAt":"2026-05-14T10:01:45Z","sessionId":"claude-2026-05-14","summary":"Edited src/styles.css","tool":{"name":"Edit","exitCode":0,"durationMs":312},"privacy":{"captureMethod":"local_hook","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-claude-hook.sh","toolVersion":"0.1.0"}}
```

### Codex CLI · command finished

```json
{"id":"codex-001","connectorId":"codexCliWrapper","kind":"command_finished","occurredAt":"2026-05-14T11:07:42Z","sessionId":"codex-task-001","command":"codex (Upgrade outdated dependencies)","summary":"Codex run · exit 0 · 462000ms","privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-codex-wrapper.sh","toolVersion":"0.1.0"}}
```

### Git · diff captured

```json
{"id":"git-001","connectorId":"git","kind":"git_diff_captured","occurredAt":"2026-05-14T11:08:00Z","sessionId":"codex-task-001","summary":"git diff --shortstat: 3 files changed, 28 insertions(+), 6 deletions(-)","git":{"repoPath":"/Users/me/work/mori","additions":28,"deletions":6,"files":[{"path":"package.json"}]},"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-codex-wrapper.sh","toolVersion":"0.1.0"}}
```

### Session finished

```json
{"id":"session-end-001","connectorId":"claudeCodeHook","kind":"session_finished","occurredAt":"2026-05-14T10:18:02Z","sessionId":"claude-2026-05-14","summary":"Session ended · 17m · 4 tool calls","privacy":{"captureMethod":"local_hook","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-claude-hook.sh","toolVersion":"0.1.0"}}
```

## Code reference

The pure parser / validator / normalizer lives in
[`src/lib/connectors/`](../../src/lib/connectors/). Notable entries:

- `parseConnectorJsonl(text)` — parse + validate a JSONL string
- `validateConnectorEventBatch(events)` — validate an in-memory array
- `normalizeConnectorEventBatch(input)` — convert validated events into
  Mori `NormalizedImportCandidate`s
- `ingestConnectorJsonl({text, projectId, sessionId})` — full pipeline,
  ready to feed Import Review

## Sample files

- [`connectors/claude-code/sample-event.jsonl`](../../connectors/claude-code/sample-event.jsonl)
- [`connectors/codex-cli/sample-event.jsonl`](../../connectors/codex-cli/sample-event.jsonl)

## Related docs

- [Capture surface matrix](./capture-surface-matrix.md) — every capture
  path with honest status.
- [Desktop / web capture boundaries](./desktop-web-capture.md) — what
  Mori never does for Claude / ChatGPT / Codex Desktop and Web.
- [GitHub PR import (planning)](./github-pr-import.md) — manual-paste
  path today + Planned `githubPrImport` design.

## Extended connector ids (this milestone)

The schema now includes additional connector ids alongside the original
five so the type matches the capture surface matrix:

| Connector id | Status |
|---|---|
| `claudeCodeHook` | Docs-template-only |
| `codexCliWrapper` | Docs-template-only |
| `terminalShell` | Planned |
| `terminal` | Planned (legacy alias) |
| `gitCommand` | Planned |
| `git` | Planned (legacy alias) |
| `desktopTranscriptImport` | Manual-only today |
| `githubPrImport` | Planned |
| `manual` | Manual-only |

The new `transcript_imported` event kind sits alongside the existing
session / prompt / tool / command / git / commit / file kinds. It maps
to the `aiConversation` TimelineEvent type, so pasted Claude Desktop /
Codex Desktop transcripts and future GitHub PR imports flow through the
same downstream traceability helpers as a paste through the AI 대화 tab.
