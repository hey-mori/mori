# Mori connection surface (연동)

Canonical, honest overview of the **연동 page** itself: the screen the user
sees when they connect their work to Mori, what each control actually does
today, the direction it follows, and what is left to build. Read this before
changing `SourcesView` or the connector status / setup-guide layer.

It is the **surface / UX** companion to the backend-model docs:

- [connection-architecture.md](./connection-architecture.md), the two capture
  models (config-hook · session-discovery) and the hard privacy boundary.
- [capture-surface-matrix.md](./capture-surface-matrix.md), the per-surface
  status table.
- [connection-long-term-plan.md](./connection-long-term-plan.md), the phased
  execution plan from connector hardening to CLI / IDE emitters.
- [connector-event-format.md](./connector-event-format.md), the
  `ConnectorEvent` JSONL schema.
- [../source-integrations.md](../source-integrations.md), the source registry
  and trust / raw-data policy.

This doc does not repeat those. It explains the screen they surface into and
the smallest valuable steps that remain.

## 1. What the surface is

The 연동 tab renders [`SourcesView`](../../src/features/sources/SourcesView.tsx):
a calm grid of **providers** on the left and a single **inspector** on the
right. It answers "what can I connect" at a glance; every detail (the ways in,
what Mori reads, the action) lives in the inspector for the selected provider,
so the overview never becomes a wall of rows.

```
provider grid (left)                inspector (right, selected provider)
 ├─ 에이전트  Claude · Codex · …      ├─ 연동 상태   (live, anchor agents)
 ├─ 자료      Git · 터미널 · 메모 …    ├─ 최근 수신   (manual inbox refresh)
                                      ├─ 연동 방법   (method picker)
 └─ 예정      Slack · Notion · …      ├─ 읽는 것 / 읽지 않는 것 / 지원 형식
                                      ├─ 연결하기   (setup guide, docs-template)
                                      └─ action     (import / records / connect)
```

The grid is a pure derivation:
[`buildSourceWorkspace`](../../src/lib/sources/sourceWorkspace.ts) →
[`buildSourceProviderGroups`](../../src/lib/sources/sourceProviderGroups.ts).
The single rule that decides agent vs evidence is `ANCHOR_AGENT_IDS`, derived
from the central [`agentRegistry`](../../src/lib/agents/agentRegistry.ts), so
the 연동 page and the 새 세션 picker can never disagree about what anchors a
session.

## 2. Implemented today

Verified against the repo. Honest status, not aspirational.

**Provider grid.** Agents first (the seven anchors), evidence second (Git /
터미널 / Connector JSONL / 메모 / URL / ChatGPT / 문서), fully-planned
providers folded into a quiet chip row so a wall of "예정" never buries the
few that work now.

**Inspector method picker.** Each provider lists its concrete 연동 방법 with an
honest status badge. Anchor agents lead with the 기록에서 불러오기 way-in (a
desktop-only work-record browse), then paste / hook / export methods. Selecting
a method updates the 읽는 것 / 읽지 않는 것 / 지원 형식 blocks and the action.

**In-app setup guides (연결하기).** The docs-template methods (Claude Code 훅,
Codex / OpenCode CLI 래퍼, 터미널 브릿지, MCP 서버) render an inline block of
ordered, copyable setup steps from
[`getConnectorSetupGuide`](../../src/lib/connectors/connectorSetupGuide.ts),
shared via
[`ConnectorSetupGuidePanel`](../../src/features/sources/ConnectorSetupGuide.tsx).
The local-capture guide has desktop-only staging actions for the Mori CLI and
the terminal / VS Code task templates; staging copies files under `~/.mori` and
rewrites template paths, but still never edits shell rc files or project
`.vscode/tasks.json`.
The MCP guide adds a desktop-only "MCP 서버 준비" affordance that stages the
server into `~/.mori` and reveals the host-config snippet to paste; Mori never
edits the host config itself. The closing note points the user at the row's
"Connector JSONL 가져오기" action, so a method is never a dead end.

**Live connection status (연동 상태).** Each anchor agent shows a live status
block derived from `detect_connector_status` through the pure
[`sourceConnectStatus`](../../src/lib/sources/sourceConnectStatus.ts) mapping
(provider id → installer id) and
[`loadConnectorStatus`](../../src/lib/connectors/installers/connectorInstallerTauri.ts).
The Claude config-hook offers in-place 연결 / 연결 해제 driven by the same safe
installer engine the 연동 설정 modal uses, with a re-detect after each change.
In browser mode the adapter reports an honest `desktopOnly` state rather than
inventing a connected one. Evidence providers and any agent with no installer
backing simply omit the block.

**Recent connector inbox hints (최근 수신).** Providers that can emit Connector
JSONL show a compact recent-file block in the inspector, backed by
[`sourceInboxHints`](../../src/lib/sources/sourceInboxHints.ts) and the desktop
`list_connector_jsonl_inbox` command. It is metadata-only and manual-refresh
only: Mori lists `~/.mori/connectors/` after the user clicks Refresh, shows the
latest provider-specific files, and routes the user to the existing Connector
JSONL import/review flow. It does not watch the folder, read file contents from
the inspector, or import anything directly. `local-capture` is a first-class
inbox family because the Mori CLI, terminal helper, VS Code task template, and
git/note capture commands write there. A per-file "새 이벤트 확인" action reads
only the selected file, reuses the same history-aware preview engine as
ImportPanel, and shows 새 이벤트 / 이미 가져온 이벤트 counts plus saved-session
attribution when available.

**Detection coverage.** `detect_connector_status`
([installer.rs](../../src-tauri/src/connectors/installer.rs)) covers all seven
anchor agents:

| Agent | Capture model | What detection reads (read-only) |
|---|---|---|
| Claude Code | config-hook | `~/.claude` present? `settings.json` wires the Mori hook? |
| Codex | session-discovery | `~/.codex/sessions/**/rollout-*.jsonl` count |
| OpenCode | session-discovery | `<data>/storage/session` file count |
| Antigravity | session-discovery | conversations with a generated transcript (partial) |
| Continue | session-discovery | `sessions.json` index count |
| Cline | session-discovery | task dirs holding `ui_messages.json` |
| Cursor | session-discovery | `composerData:*` rows in read-only `state.vscdb` (see §6) |

The TypeScript registry
([`connectorInstaller.ts`](../../src/lib/connectors/installers/connectorInstaller.ts))
mirrors this set; `buildConnectorStatusViewModels` maps raw facts to the
product-state availability vocabulary. There are no `planned` anchors left:
every agent in the registry is detectable.

## 3. Direction this surface follows

These are the non-negotiable principles the surface must keep honoring (full
list in [mori-project-goal.md](../mori-project-goal.md) §6):

- **Explicit import / capture.** Every method is a click, paste, or explicit
  file pick. No watcher, no daemon, no background poll. Detection and discovery
  are read-only and run only on an explicit user action.
- **Review-before-apply.** Every method feeds the same downstream gate:
  parse / preview, then Import Review. No method imports straight into a
  session or makes durable memory on its own.
- **Honest status, no fake connected states.** A planned method shows "예정"
  and stays inert. A desktop-only method is disabled in the browser with an
  honest reason. The status badge and the live 연동 상태 block always tell the
  truth about what is wired.
- **Provider-level overview.** The grid is one tile per provider, never a flat
  table of import methods. Detail lives in the inspector.
- **Korean-first copy.** User-facing strings are Korean.

## 4. Roadmap (the framework)

Capability buckets, ordered by smallest valuable next step. The agent verifies
the bucket is still the smallest valuable step and gets user approval before
starting a new one (project rule, [mori-project-goal.md](../mori-project-goal.md)
§11).

1. **Local Connector Capture Bridge** *(shipped).* In-app setup guides,
   live connection status, in-place Claude connect, full seven-agent detection,
   and template-sample round-trip tests through the Import Review draft boundary
   have shipped. `mori-local-capture.py` also has a generated-output smoke test
   against temp transcript / note / git inputs. `terminal-helper` is classified
   as a local-capture launcher, and POSIX Claude / Codex / OpenCode wrappers are
   smoke-tested with stub inputs through the review-draft boundary. Recent
   connector inbox hints are visible in the 연동 inspector with explicit
   Refresh only.
2. **CLI Wrapper (`mori`).** The first scaffold ships capture commands
   (`note`, `transcript`, `git`, `commit`) plus run wrappers for Codex and
   OpenCode, and the desktop setup guide can stage the CLI under `~/.mori`.
   Remaining work is package-manager style install / PATH automation that still
   avoids editing shell rc files silently.
3. **IDE / Terminal Integration.** Explicit-emit connectors only: a VS Code /
   Cursor "send to Mori" action and a shell helper, each emitting the same
   Connector JSONL into the inbox. Terminal helper and VS Code task templates
   now stage from the desktop setup guide; real extensions remain planned. No
   watcher, no buffer poll, no shell-history scrape (see
   [../source-integrations.md](../source-integrations.md) "IDE / Terminal
   integration plan").

The larger execution plan lives in
[connection-long-term-plan.md](./connection-long-term-plan.md).

## 5. Deliberate non-goals (not "unfinished")

The 예정 chips for these exist only so the user can inspect what each would and
would not access. They are **not** a backlog to clear; building them as
described would violate a product principle. Do not implement without an
explicit reprioritization by the user.

- **Account / OAuth connectors** (Slack, Notion, Figma, Jira, Linear). Mori is
  local-first with no OAuth and no external account reading. These stay
  paste / export only if ever built.
- **App-database / window exports** (Claude Desktop SQLite export, Cursor
  internal DB scraping for app data, ChatGPT browser storage). Reading a
  third-party app's private store is a hard non-goal. The transcript-paste and
  file-export paths cover these cases explicitly.
- **Background watchers / daemons** (file-system watcher, editor-buffer poll,
  optional watched inbox beyond explicit Refresh). Capture stays explicit.

## 6. Cursor `state.vscdb` boundary

Cursor composer session discovery is an approved narrow exception to the
general "do not read app databases" rule. The reason is practical and scoped:
Cursor's current local record for user composer chat sessions lives in
`state.vscdb`, so Mori may open that database **read-only** only when the user
explicitly invokes Cursor discovery / import, and only to read `composerData:*`
chat rows. The UI states this plainly ("로컬 state.vscdb를 읽기 전용으로만
엽니다").

This exception does **not** permit:

- arbitrary Cursor app-data scraping;
- editor-buffer, workspace-state, account, browser-storage, or API-key reads;
- background watchers / polling;
- importing the selected transcript without Import Review.

In other words, Cursor composer discovery is treated like an explicit local
agent transcript import, not like a general Cursor database connector. The
future Cursor extension remains a separate explicit-emit path for workspace
events.

## 7. Extending the surface (scalability)

Adding the next anchor agent is meant to be a registry entry, not a fan-out:

1. Add the agent to [`agentRegistry`](../../src/lib/agents/agentRegistry.ts)
   (classifies it as an anchor everywhere via `ANCHOR_AGENT_IDS`).
2. Map its source ids to a provider in
   [`sourceProviderGroups`](../../src/lib/sources/sourceProviderGroups.ts).
3. Add a `captureModel` entry in
   [`connectorInstaller.ts`](../../src/lib/connectors/installers/connectorInstaller.ts)
   and a `detect_*` branch in
   [installer.rs](../../src-tauri/src/connectors/installer.rs), plus the
   provider → installer entry in
   [`sourceConnectStatus`](../../src/lib/sources/sourceConnectStatus.ts).
4. If it needs a script, add a [`connectorSetupGuide`](../../src/lib/connectors/connectorSetupGuide.ts)
   entry and a `connectors/<family>/` template.

Each step is pure-helper-plus-test sized; no UI rewiring should be required.
