# Mori agent connection architecture

Canonical, honest overview of **how Mori connects to AI coding agents** and
turns their work into reviewable evidence. Read this before changing the
capture layer. It is the architectural companion to:

- [capture-surface-matrix.md](./capture-surface-matrix.md), the per-surface
  status table (what works today, surface by surface).
- [connector-event-format.md](./connector-event-format.md), the
  `ConnectorEvent` JSONL schema.
- [claude-code-hook.md](./claude-code-hook.md) /
  [codex-cli-wrapper.md](./codex-cli-wrapper.md), per-tool setup.

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
   - Claude Code discovery, `~/.claude/projects/<encoded>/<session>.jsonl`.
   - Codex discovery, `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.

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
logs" and "scraping a third-party app's private store", the latter is a
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
`originator: "Codex Desktop"`), so discovery covers the desktop app too, a
wrapper is not required for Codex to be captured.

## 4. Connection-detection layer

A small adapter layer reports, per connector, whether the tool is present and
whether capture is wired up. It exists so the Connections hub can show an
honest status and (later) offer one-click install, and so adding a new agent
is a registry entry, not a fan-out.

- **Pure adapter**, [`src/lib/connectors/installers/connectorInstaller.ts`](../../src/lib/connectors/installers/connectorInstaller.ts):
  a registry of connectors with a `captureModel` (`config-hook` /
  `session-discovery`), plus `buildConnectorStatusViewModels` mapping raw
  detection facts to the product-state availability vocabulary. Browser mode
  reports `desktopOnly` rather than inventing a connected state.
- **Desktop detection**, [`src-tauri/src/connectors/installer.rs`](../../src-tauri/src/connectors/installer.rs),
  command `detect_connector_status`: read-only, env-injected for tests. For a
  config-hook connector it checks the tool dir and scans `settings.json`
  hooks for the `mori-claude-hook` reference; for a session-discovery
  connector it counts the sessions Mori can read back from the tool's local
  store. All seven anchor agents are detected: Claude Code (config-hook) plus
  Codex, OpenCode, Antigravity, Continue, Cline, and Cursor
  (session-discovery). OpenCode counts `storage/session` files, Cline counts
  task directories holding `ui_messages.json`, and Cursor counts
  `composerData:*` rows in the read-only `state.vscdb`. The TS bridge is
  [`connectorInstallerTauri.ts`](../../src/lib/connectors/installers/connectorInstallerTauri.ts).

Adding a connector: add a registry entry + a `captureModel` branch in the
adapter, and a detection branch in the Rust command. No UI fan-out.

**One-click connect (turnkey install).** For the one config-hook connector
(Claude), `install_claude_hook` / `uninstall_claude_hook`
([`installer.rs`](../../src-tauri/src/connectors/installer.rs)) safely merge or
remove the hook in `settings.json`: existing settings and non-Mori hooks are
preserved, install is idempotent, a malformed file is never overwritten, and
uninstall removes only Mori entries. The TS side computes the OS-aware command
(`buildClaudeHookCommand`) from the bundled hook-script path (`connectClaudeHook`
resolves it via Tauri resources). The **Connect modal** (소스 → 연결 설정,
[`ConnectorInstallModal.tsx`](../../src/features/sources/ConnectorInstallModal.tsx))
detects each agent and drives connect / disconnect; session-discovery agents
(Codex, Antigravity) show their auto-detected status with no action. Desktop
only; browser mode shows the honest desktop-only state.

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
- **Atomic append.** Each hook event is written with a single `O_APPEND`
  `os.write`, not a buffered text write, so concurrent hook processes within
  one session (parallel tool calls) cannot interleave a partial line. POSIX
  gives small-append atomicity on its own; the single-syscall write makes it
  hold on Windows too.
- **BOM-free, ASCII-safe wrappers.** The Codex/OpenCode PowerShell wrappers
  write UTF-8 **without** a BOM (PS 5.1 `Add-Content -Encoding utf8` adds
  one, corrupting line 1 for strict readers) and build the `·` separator from
  its code point (a literal `·` in a BOM-less `.ps1` is mis-read as cp949).
  The git-summary step is guarded so a benign git stderr warning does not
  crash the run under `ErrorActionPreference=Stop`.

## 6. Decisions: OpenCode and Antigravity

Both agents store sessions locally, but both push on the §2 boundary, so the
approach is deliberate, not symmetric with Codex.

### OpenCode: keep the wrapper path; defer native discovery

OpenCode stores file-based session data under
`~/.local/share/opencode/storage/` (`session/`, `message/<sid>/`, `part/`)
**and** a large `opencode.db` SQLite store. Decision:

- **Do not read `opencode.db`** (internal SQLite, §2 non-goal).
- **Defer file-JSON discovery.** Reconstructing a transcript needs
  multi-file assembly (`message` + `part`), and as of v1.2.27 the authoritative
  store appears to be migrating to `opencode.db`, so the JSON files risk
  being incomplete. Shipping a parser that silently captures partial data
  conflicts with "evidence is the source of truth" and "honest status".
- **OpenCode is already captured** via the shipped wrapper + connector inbox
  (`opencode-cli/`). That path is explicit, complete for what it records, and
  mission-aligned. Revisit native discovery only if OpenCode's file store is
  confirmed authoritative and stable.

### Antigravity: add discovery, honestly partial

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

## 7. Extensibility and robustness

Formats, names, OS conventions, and filesystem layouts change. The capture
layer is built to bend, not break, when they do. There is no off-the-shelf
library for "tolerate an unknown agent's format drift"; the answer is two
disciplines we apply ourselves.

**Env-aware path resolution.** [`agent_paths.rs`](../../src-tauri/src/agent_paths.rs)
resolves every agent's data root in one place: it honors the env override each
tool supports (Codex `CODEX_HOME`, Claude `CLAUDE_CONFIG_DIR`), falls back to
the conventional `~/.X` path, and uses a USERPROFILE-first home so the reader
and the Python hook writer agree on Windows when `HOME` and `USERPROFILE`
differ. Discovery, the connector inbox, and the installer (both detection and
the install target) resolve through it, so a relocated or renamed root is a
one-line change, not a hunt across modules. These agents do not use XDG /
Known Folder conventions, so a generic dirs crate would point at the wrong
place; the literal-path + env resolver is deliberate.

**Tolerant reader (Postel's law).** Parsers are liberal in what they accept:
fields are read by name with fallbacks (never positional), an unparseable line
is skipped rather than failing the whole file, and missing fields default. The
connector schema is an *open* model, so an event `kind` this version does not
recognize is preserved as a generic note event rather than rejected, and a
newer connector script does not lose events against an older Mori. The Codex
and Antigravity transcript parsers are `serde_json::Value`-based and
skip-on-error for the same reason.

**No silent truncation.** A session file we cannot read (over the 8 MB cap, or
IO/parse failure) is surfaced as a placeholder meta (`⚠ 읽을 수 없는 세션 ·
{reason}`, zero messages, real file path) rather than silently dropped, so the
Connections feed shows that something is there and import surfaces the
underlying error on click. Honesty over neatness.

## 8. Shipped this pass (changelog pointer)

- Claude hook UTF-8 + per-session-file fixes; Codex wrapper BOM/`·`/git
  fixes (`fix: harden windows connector capture for korean and concurrency`).
- Connector installer adapter layer + `detect_connector_status` command and
  bridge (`feat: add connector installer status adapter layer`,
  `feat: add detect_connector_status desktop command and bridge`).
- Antigravity session discovery + agent tile (`feat: add antigravity session
  discovery (partial, read-only)`, `feat: surface antigravity sessions in
  agent work discovery`, `feat: list antigravity as an agent and tidy
  connection status`).
- OS-aware in-app Claude hook setup guide (`fix: make the claude hook setup
  guide os-aware`).
- Safe `install_claude_hook` / `uninstall_claude_hook` engine + TS bridge +
  the one-click Connect modal (`feat: add safe claude hook install/uninstall
  commands`, `feat: expose claude hook install/uninstall to typescript`,
  `feat: add one-click agent connect modal on the sources page`).
- The standalone connection-status panel was tried then retired (`refactor:
  retire the connector status panel from the sources page`); the detection
  adapter it used is kept and now backs the Connect modal.
- Atomic single-syscall hook append (`fix: append claude hook events
  atomically to avoid line corruption`).
- Centralized env-aware path resolution and detection/install honoring the
  same overrides (`feat: centralize env-aware agent path resolution`,
  `feat: make claude detection and install honor CLAUDE_CONFIG_DIR`).
- Tolerant-reader handling of unknown connector event kinds (`feat: tolerate
  unknown connector event kinds for forward compatibility`).
- Unreadable discovery sessions surfaced as honest placeholders instead of
  dropped (`feat: surface unreadable discovery sessions as honest
  placeholders`).
- Ignore python bytecode from the connector scripts (`chore: ignore python
  bytecode from the connector scripts`).

Validation status: TS suite green (connector suite 211 tests) and `tsc` clean
across the repo; the Rust side is green (115 tests) covering the path
resolver, install/uninstall safe-merge, and the discovery parsers. The one
unverified path is the desktop runtime end-to-end (the modal's real
`settings.json` write + resource-path resolve, and discovery reading
`~/.codex` / `~/.gemini` through the running Tauri app), which needs a
`tauri dev` run to confirm.

Keep the autonomous-loop backlog ([mori-autonomous-loop.md](../mori-autonomous-loop.md)
§7) in sync when these capabilities change.
