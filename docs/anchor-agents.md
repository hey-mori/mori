# Anchor agents (multi-agent session discovery)

A Mori *session* is anchored on one AI-agent work conversation (the spine).
This doc is the map for the **AI Trace source**: how Mori discovers and
loads sessions from each supported agent, and how to add another one. For the
broader Trace boundary see [trace-architecture.md](trace-architecture.md);
for the source / evidence model see [source-integrations.md](source-integrations.md);
for the MCP / connector capture path (evidence, not an anchor) see
[connectors/connector-event-format.md](connectors/connector-event-format.md).

## Supported agents

Eight anchor agents ship today, all read by **direct, read-only, explicit**
discovery (no watcher, no daemon · listing happens only on a user action):

| Agent | Store type | Location | Reader |
|---|---|---|---|
| Claude (Code) | JSONL | `~/.claude/projects/<proj>/<session>.jsonl` | `src-tauri/src/claude/code.rs` |
| Claude (Desktop) | SQLite | app data dir | `src-tauri/src/claude/desktop.rs` |
| Codex | JSONL | `~/.codex/sessions/Y/M/D/*.jsonl` (+ connector) | `src-tauri/src/codex/sessions.rs` |
| Antigravity | JSONL | `~/.gemini/antigravity/brain/.../transcript.jsonl` | `src-tauri/src/antigravity/sessions.rs` |
| OpenCode | JSON tree | `~/.local/share/opencode/storage/{session,message,part}` (+ connector) | `src-tauri/src/opencode/sessions.rs` |
| Continue | JSON | `~/.continue/sessions` (index + per-session) | `src-tauri/src/continue_agent/sessions.rs` |
| Cline | JSON | VS Code globalStorage `saoudrizwan.claude-dev/tasks/<id>/` | `src-tauri/src/cline/sessions.rs` |
| Cursor | SQLite KV | `state.vscdb` `cursorDiskKV` (`composerData:` / `bubbleId:`) | `src-tauri/src/cursor/sessions.rs` |

Three on-disk shapes are handled: per-file JSONL, multi-file JSON trees, and
SQLite key-value. Every reader is bounded (8 MB/file cap), opens databases
read-only, rejects path-escape, and surfaces an unreadable **placeholder**
rather than silently dropping a session it cannot parse.

## Long Claude Code transcripts

A Claude Code transcript over the 8 MB cap is not imported. It opens as a
read-only window of its recent conversation instead (#163).

- **Why they used to open empty.**
  - `get_claude_code_session` refused the file, after the metadata placeholder was already active.
  - The shared resolver then reported success, so the session showed "세션에 가져온 소스 없음".
  - Reopening it was skipped as "already active", so a failed read could never be retried.
- **The reader.** `get_claude_code_session_window` reads at most 1 MiB, either from the end of the file or before a cursor.
  - Opening costs one window whatever the file size: about 9 ms on a 143 MB transcript, the same as on 9 and 64 MB files.
  - A trailing line still being written is not read.
  - A single record larger than a window is skipped and counted (`omittedRecords`), so earlier history stays reachable.
  - Records without a `uuid` are named by byte offset, so an id is the same in every window.
- **The cursor.** It is the previous window's start offset, plus two fingerprints that are refused (`SOURCE_CHANGED`, `INVALID_CURSOR`) when they no longer match, so a cursor is never read at a stale offset:
  - `sourceId`: the transcript's first line, so appending keeps it valid;
  - `startAnchor`: the record at the cursor.
  - The projects-root, symlink and JSONL checks are the same as for the detailed reader.
- **The view.** `sessionWindow` in the session store is transient.
  - It is never imported, persisted or analysed. The tabs (analysis, report, sources) are hidden while it shows, because they would treat a part of the session as the whole.
  - The coverage line counts the loaded part only: "최근 대화 일부 표시 중 · 원본의 1% 미만". "이전 대화 더 보기" prepends the window before the loaded part and keeps the message being read in place.
- **Failures.** A read that fails shows why, never an empty session:
  - missing, changed, refused or unreadable sources show their reason with "다시 시도";
  - reopening the session also retries.
  - Recovery when a source cannot be read: check that the file still exists under the Claude projects folder, then reopen. A transcript replaced while open reads again from its end.
- **Races.** Every open takes a sequence token. A read that finishes after a newer open has started changes nothing; before this, a slow read could be imported into whichever session was active.
- **Other agents.** Codex, Antigravity, Cline and the rest still have only the 8 MB detailed reader.
  - An oversized transcript from them shows "아직 열 수 없는 긴 대화입니다", with no retry.
  - A window reader for them is not built. No local Codex transcript over the cap existed to test one against.

## The four layers

```
on-disk format
   │  (per agent: agent_paths.rs resolves the root, env-overridable)
   ▼
Rust / Tauri discovery        src-tauri/src/<agent>/sessions.rs
   │  discover_<agent>_sessions / get_<agent>_session commands
   ▼
TypeScript normalize          src/lib/trace/sources/ai/workSessions.ts
   │  AiSessionObservation / Detail, dispatch, source-local parsing
   ▼
Import adapter                src/lib/import/agentWorkSessionImport.ts
   │  Import Review candidate creation
   ▼
UI enumerate                  StartSessionView · ConnectionsView · SourcesView
```

## The central registry

[`src/lib/trace/sources/ai/agentRegistry.ts`](../src/lib/trace/sources/ai/agentRegistry.ts) is the
single source of truth for "what an anchor agent is": `agentId`, `agentName`,
UI `detail`, glyph `iconKey`, paste `platform`, `detect`, and the optional
connector binding. It is pure data (no React, no Tauri) so every layer derives
from it:

- `StartSessionView` builds the 새 세션 agent picker from `AGENT_REGISTRY`.
- `listAllAgentWorkSessions` iterates `listAgentIds()`.
- `sourceProviderGroups` derives `ANCHOR_AGENT_IDS` + `AGENT_ORDER` from it.
- `buildImportCandidatesFromAgentWorkSession` in `src/lib/import/` reads the
  paste `platform` from the descriptor (one branch covers every native agent).
- `normalizeAiTranscript` maps a platform to its source kind by convention
  (`<platform>Transcript`, with `other` → `aiConversation`).

This derivation is why a missing surface can't silently drop an agent (the bug
that once hid Antigravity from the picker). The source registry test keeps
registry shape pure; the import-layer test asserts every descriptor's
`platform` resolves to a registered `sourceRegistry` transcript kind, so a
half-wired import path fails fast without making the AI source depend on import
policy.

## Adding an agent

1. **Rust reader** · `src-tauri/src/<agent>/sessions.rs` with
   `discover_<agent>_sessions` / `get_<agent>_session`, plus a root resolver in
   `agent_paths.rs` (env-overridable). Register both in `main.rs`. Validate the
   parser against a real local store where possible (the OpenCode / Continue /
   Cline pattern: a temporary `#[ignore]` smoke pointing at the real store, then
   remove it); otherwise cover it with in-memory fixtures (the Cursor pattern).
2. **TS bridge + types** · `src/lib/<agent>/types.ts` + `<agent>Tauri.ts`, and
   the command entries in `src/lib/desktop/tauriCommands.ts`.
3. **Registry entry** · one entry in `AGENT_REGISTRY` (id, name, detail,
   iconKey, platform, detect).
4. **workSessions wiring** · add the `<agent>-session` importKind, a discovery
   branch in `listAgentWorkSessions`, a `get` branch, and a `map<Agent>Meta`.
5. **Import adapter** · only edit `src/lib/import/agentWorkSessionImport.ts`
   if the new agent cannot use the registry-driven native transcript path.
6. **Platform + provenance** · add the platform to `AgentTranscriptPlatform`
   and `AiTranscriptPlatform`, a
   `<platform>Transcript` entry in `sourceRegistry.ts` (hub-hidden in
   `integrationGroups.ts`), a `DISCOVERY_AGENT_SPECS` entry in
   `sourceWorkspace.ts`, and a provider spec/method in `sourceProviderGroups.ts`.
7. **Icons** · map the `iconKey` glyph in `StartSessionView` `AGENT_ICON` and
   the agent id in `SourcesView` `PROVIDER_ICON`.

The `getIntegrationId` convention and the build-dispatch dedup removed what used
to be separate normalizer + build edits; the guard test catches anything left
unwired.

## What this layer never does

Reading another tool's local session store is **not** background capture: it is
read-only, explicit (a user action lists / reads), bounded, and summary-only ·
Mori keeps a summary + metadata, never the full raw transcript. It never writes
to the agent's store, never watches it, and never reads account / API / network
state. See the product principles in
[mori-project-goal.md](mori-project-goal.md).
