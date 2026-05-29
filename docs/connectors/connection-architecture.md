# Mori agent connection architecture

Canonical, honest overview of **how Mori connects to AI coding agents** and
turns their work into reviewable evidence. Read this before changing the
capture layer. It is the architectural companion to:

- [capture-surface-matrix.md](./capture-surface-matrix.md) — the per-surface
  status table (what works today, surface by surface).
- [connector-event-format.md](./connector-event-format.md) — the
  `ConnectorEvent` JSONL schema.
- [claude-code-hook.md](./claude-code-hook.md) /
  [codex-cli-wrapper.md](./codex-cli-wrapper.md) — per-tool setup.

It does not repeat those; it explains the model they all fit into.

## 1. Two capture models

Every agent reaches Mori through one of two models. Both are **explicit and
local**; neither watches the machine.

1. **config-hook (live emit).** The agent runs a hook/wrapper Mori ships,
   which appends a typed `ConnectorEvent` line to the local connector inbox
   (`~/.mori/connectors/<family>/`) as the user works. Capture is a side
   effect of normal use; nothing is sent anywhere.
   - Claude Code hook (`SessionStart` / `UserPromptSubmit` / `PostToolUse` /
     `SessionEnd`).
   - Codex / OpenCode CLI wrappers (`session_started` / `command_finished` /
     optional `git_diff_captured`).

2. **session-discovery (read history).** The agent already writes its own
   session transcripts to a known local directory; Mori reads them read-only
   when the user opens "기록에서 불러오기". No hook install needed.
   - Claude Code discovery — `~/.claude/projects/<encoded>/<session>.jsonl`.
   - Codex discovery — `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.

Both models feed the **same downstream gate**: parse/preview, then
**Import Review** (explicit per-event accept/apply). No model bypasses review
and none makes durable memory on its own. See
[mori-project-goal.md](../mori-project-goal.md) §6 Product Principles.

```
agent work
  ├─ config-hook ──▶ ~/.mori/connectors/<family>/*.jsonl ─┐
  └─ session-discovery ──▶ agent's own transcript files ──┤
                                                          ▼
                              parse / preview ▶ Import Review ▶ Timeline / Memory
```

## 2. The hard boundary (non-goal compliance)

Mori reads **file-based transcripts the agent itself writes**. It must
**never** read an agent's **internal database** (SQLite / protobuf), browser
storage, or account. This is the line between "the user's own readable work
logs" and "scraping a third-party app's private store" — the latter is a
hard non-goal (see [mori-autonomous-loop.md](../mori-autonomous-loop.md) §4).

Concretely:

- Read: `~/.claude/projects/*.jsonl`, `~/.codex/sessions/*.jsonl`,
  hook/wrapper JSONL under `~/.mori/connectors/`.
- Do **not** read: Claude Desktop SQLite, `opencode.db` (SQLite),
  Antigravity `conversations/*.pb` (protobuf), Cursor internal DBs, browser
  cookies / history.

## 3. Per-agent reality

Verified against a real machine (2026-05). Status is honest, not aspirational.

| Agent | Primary path | Where it reads/writes | Status |
|---|---|---|---|
| **Claude Code** | config-hook (live) + discovery | inbox `claude-code/<date>-<session-id>.jsonl`; `~/.claude/projects` | hook live and hardened; discovery shipped |
| **Codex** | session-discovery | `~/.codex/sessions/**/rollout-*.jsonl` (incl. Codex Desktop) | discovery shipped (Rust parser verified vs 0.115.0); wrapper is the secondary marker path |
| **OpenCode** | config-hook (wrapper) | inbox `opencode-cli/*.jsonl` | wrapper path shipped; native discovery **deferred** (see §6) |
| **Antigravity** | session-discovery | `~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl` | discovery **planned, partial** (see §6) |

"Codex Desktop" sessions also land in `~/.codex/sessions` (observed
`originator: "Codex Desktop"`), so discovery covers the desktop app too — a
wrapper is not required for Codex to be captured.

## 4. Connection-detection layer

A small adapter layer reports, per connector, whether the tool is present and
whether capture is wired up. It exists so the Connections hub can show an
honest status and (later) offer one-click install, and so adding a new agent
is a registry entry, not a fan-out.

- **Pure adapter** — [`src/lib/connectors/installers/connectorInstaller.ts`](../../src/lib/connectors/installers/connectorInstaller.ts):
  a registry of connectors with a `captureModel` (`config-hook` /
  `session-discovery`), plus `buildConnectorStatusViewModels` mapping raw
  detection facts to the product-state availability vocabulary. Browser mode
  reports `desktopOnly` rather than inventing a connected state.
- **Desktop detection** — [`src-tauri/src/connectors/installer.rs`](../../src-tauri/src/connectors/installer.rs),
  command `detect_connector_status`: read-only, env-injected for tests. For a
  config-hook connector it checks the tool dir and scans `settings.json`
  hooks for the `mori-claude-hook` reference; for a session-discovery
  connector it counts transcript files. The TS bridge is
  [`connectorInstallerTauri.ts`](../../src/lib/connectors/installers/connectorInstallerTauri.ts).

Adding a connector: add a registry entry + a `captureModel` branch in the
adapter, and a detection branch in the Rust command. No UI fan-out.

## 5. Hardening notes (cross-OS)

Capture scripts are shared across OS via per-OS launchers; the mapping logic
lives in one place. Real-world fixes that must not regress:

- **UTF-8 stdin.** The Claude hook reads stdin as raw bytes decoded UTF-8
  (`sys.stdin.buffer.read().decode("utf-8")`), not the OS locale codepage.
  Without this, a Korean prompt on a cp949 Windows box silently dropped the
  event (the hook swallows errors and exits 0). Korean-first product: this is
  load-bearing.
- **Per-session output file.** The Claude hook writes
  `<date>-<session-id>.jsonl`, not one shared `<date>.jsonl`. Several Claude
  processes run concurrently (interactive session, the autonomous dev loop,
  other repos); a shared file interleaved appends and corrupted lines. One
  file per session id also matches the "one conversation = one session" model.
- **BOM-free, ASCII-safe wrappers.** The Codex/OpenCode PowerShell wrappers
  write UTF-8 **without** a BOM (PS 5.1 `Add-Content -Encoding utf8` adds
  one, corrupting line 1 for strict readers) and build the `·` separator from
  its code point (a literal `·` in a BOM-less `.ps1` is mis-read as cp949).
  The git-summary step is guarded so a benign git stderr warning does not
  crash the run under `ErrorActionPreference=Stop`.

## 6. Decisions: OpenCode and Antigravity

Both agents store sessions locally, but both push on the §2 boundary, so the
approach is deliberate, not symmetric with Codex.

### OpenCode — keep the wrapper path; defer native discovery

OpenCode stores file-based session data under
`~/.local/share/opencode/storage/` (`session/`, `message/<sid>/`, `part/`)
**and** a large `opencode.db` SQLite store. Decision:

- **Do not read `opencode.db`** (internal SQLite, §2 non-goal).
- **Defer file-JSON discovery.** Reconstructing a transcript needs
  multi-file assembly (`message` + `part`), and as of v1.2.27 the authoritative
  store appears to be migrating to `opencode.db` — so the JSON files risk
  being incomplete. Shipping a parser that silently captures partial data
  conflicts with "evidence is the source of truth" and "honest status".
- **OpenCode is already captured** via the shipped wrapper + connector inbox
  (`opencode-cli/`). That path is explicit, complete for what it records, and
  mission-aligned. Revisit native discovery only if OpenCode's file store is
  confirmed authoritative and stable.

### Antigravity — add discovery, honestly partial

Antigravity (`~/.gemini/antigravity/`) stores authoritative conversations as
`conversations/<id>.pb` (protobuf) and, for **some** sessions, a readable
`brain/<id>/.system_generated/logs/transcript.jsonl`
(`step_index` / `source` / `type` / `content` / `tool_calls`). Decision:

- **Do not read the `.pb`** (internal protobuf, §2 non-goal).
- **Add read-only discovery of `transcript.jsonl`.** It is the only viable
  path (Antigravity is an IDE, not a CLI to wrap, with no hook system) and the
  format is cleanly parseable.
- **Label it partial and experimental.** Only sessions with a generated
  transcript are discoverable; protobuf-only sessions are not read. The
  format is undocumented and has changed across Antigravity upgrades, so the
  parser must skip unparseable lines and never crash, and the UI must say the
  capture is partial.

## 7. Shipped this pass (changelog pointer)

- Claude hook UTF-8 + per-session-file fixes; Codex wrapper BOM/`·`/git
  fixes (`fix: harden windows connector capture for korean and concurrency`).
- Connector installer adapter layer + `detect_connector_status` command and
  bridge (`feat: add connector installer status adapter layer`,
  `feat: add detect_connector_status desktop command and bridge`).

Keep the autonomous-loop backlog ([mori-autonomous-loop.md](../mori-autonomous-loop.md)
§7) in sync when these capabilities change.
