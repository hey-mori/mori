# Mori connection long-term plan

This is the execution plan for turning the current 연동 surface into a durable,
extensible local connector system. It is intentionally long-horizon, but every
phase has a small acceptance test so work keeps shipping instead of becoming a
wishlist.

Read with:

- [connection-surface.md](./connection-surface.md), the current UX contract.
- [connection-architecture.md](./connection-architecture.md), the capture
  models and privacy boundary.
- [capture-surface-matrix.md](./capture-surface-matrix.md), the honest status
  matrix.
- [connector-event-format.md](./connector-event-format.md), the JSONL schema
  all explicit connectors emit.

## North star

Mori should become the local memory layer for AI work across agents, editors,
terminal work, and project evidence. The connector system succeeds when a user
can:

1. see every supported tool in 연동 with an honest status;
2. connect or import through an explicit user action;
3. preview what Mori read and what it refused to read;
4. pass every captured event through Import Review;
5. later resume with source-linked memory that still knows where each fact came
   from.

The long-term shape is **explicit emitters into one review pipeline**, not
OAuth integrations, hidden app scraping, or background watchers.

## Guardrails

- **Explicit trigger only.** A click, paste, file pick, wrapper command, or
  extension command starts capture.
- **Local-first.** No cloud dependency, no account token, no API-key connector.
- **Review-before-apply.** Connector output becomes pending review, never
  durable memory directly.
- **Summary by default.** Templates capture summaries and metadata unless a
  surface explicitly declares retained raw data.
- **Registry-driven extension.** Adding a connector should be a registry entry,
  detection branch, setup-guide entry, template, and tests. It should not
  require reworking the 연동 UI.
- **One narrow Cursor exception.** Cursor composer chat can read
  `state.vscdb` read-only for `composerData:*` rows only; no arbitrary Cursor
  app data.

## Phase 0. Surface honesty foundation

**Status:** shipped.

Shipped pieces:

- provider grid + inspector;
- in-app setup guides for docs-template methods;
- live connection status for all seven anchor agents;
- in-place Claude hook connect / disconnect;
- seven-anchor desktop detection;
- documented Cursor composer-chat boundary.

Acceptance tests / checks:

- `sourceConnectStatus` mapping tests;
- connector installer TS tests;
- Rust installer tests;
- Cursor read-only invariant test.

## Phase 1. Connector bridge hardening

**Status:** shipped.

Goal: make the shipped template and sample JSONL bridge boringly reliable.
Users can run a template, import the JSONL, and trust the review gate.

Shipped / now covered:

- Claude Code hook sample parses and normalizes;
- Codex CLI wrapper sample parses and normalizes;
- OpenCode CLI wrapper sample parses and normalizes;
- local-capture sample parses and normalizes;
- MCP sample parses and normalizes;
- template samples now round-trip through ingest and merge into an Import
  Review draft.
- `mori-local-capture.py` generated-output smoke test runs against synthetic
  temp transcript / note / git inputs and reaches the Import Review draft.
- `connectors/terminal-helper/` is classified and tested as a launcher for
  local-capture, not a separate `terminalShell` event emitter.
- POSIX Claude / Codex / OpenCode wrappers are smoke-tested with synthetic
  inputs / stub binaries, including quoted Korean text, and their generated
  JSONL reaches an Import Review draft.

Acceptance:

- `npm test -- src/lib/connectors/*Fixture*.test.ts`
- `npm test -- src/lib/connectors/*Smoke*.test.ts`
- generated samples are schema-valid Connector JSONL;
- every normalized TimelineEvent has `connectorEventId`;
- every review draft keeps both the merged source id and original bucket
  source id in `sourceRefs`.

## Phase 2. Mori CLI wrapper

**Status:** shipped.

Goal: ship a `mori` command that produces canonical Connector JSONL without
asking users to hand-copy wrapper scripts.

First build shipped:

1. `mori capture note "..."`
2. `mori capture transcript <path-or-stdin>`
3. `mori capture git --repo ...`
4. `mori capture commit [ref] --repo ...`

The current scaffold lives at
[`../../connectors/mori-cli/mori.py`](../../connectors/mori-cli/mori.py). It
delegates to `mori-local-capture.py`, so it emits the same Connector JSONL
schema and inherits the same Import Review path. Generated-output smoke tests
cover note / transcript / git / commit commands through the review-draft
boundary.

Additional scaffold shipped:

- `mori run --connector codex -- <command...>`
- `mori run --connector opencode -- <command...>`

Both delegate to the hardened POSIX wrappers, keep stdout/stderr flowing to the
terminal without retaining output bodies, and are covered by generated-output
smoke tests with stub binaries and quoted Korean text.

The in-app setup guides now prefer the Mori CLI commands for Codex, OpenCode,
and local capture, while retaining raw scripts as fallback.

Desktop staging shipped:

- Tauri command `stage_mori_cli` embeds and stages `mori.py`,
  `mori-local-capture.py`, and the Codex / OpenCode POSIX wrappers under
  `~/.mori/`.
- The setup guide exposes a desktop-only **Mori CLI 준비** action and a copyable
  `ln -sf ... ~/.local/bin/mori` command.

Remaining:

1. Package-manager style install is still manual: Mori stages files, but does
   not edit shell rc files or create PATH entries automatically.

Design constraints:

- writes only under `~/.mori/connectors/<family>/`;
- no daemon;
- no shell history;
- no subprocess wrapping until plain capture commands are tested;
- output is exactly the existing `ConnectorEvent` JSONL schema.

Acceptance:

- CLI fixture tests compare emitted JSONL to schema;
- temp-dir tests prove no path escapes;
- docs explain install / uninstall;
- 연동 inspector points wrapper methods at the CLI once shipped.

## Phase 3. Desktop connector inbox polish

**Status:** in progress.

Goal: make imported connector files feel first-class without adding a watcher.

Slices:

1. **Shipped:** show recent inbox files per connector family in the 연동
   inspector.
2. **Shipped:** add "last imported" and "new events" hints from the connector
   identity history.
3. **Shipped:** add a manual Refresh button scoped to the selected provider.

Shipped detail:

- `~/.mori/connectors/local-capture/` is now a first-class inbox family, matching
  the Mori CLI and local-capture bridge output path.
- The 연동 inspector shows a compact "최근 수신" block for providers that emit
  Connector JSONL: Claude, Codex, OpenCode, terminal/local-capture, Git,
  note/local-capture, IDE/local-capture, MCP, and the universal Connector JSONL
  provider.
- The block reads metadata only, after an explicit Refresh click, and routes the
  user to the existing Connector JSONL import/review flow instead of reading or
  importing files directly.
- A per-file **새 이벤트 확인** action reads only the selected file, overlays
  the existing history-aware Connector JSONL preview, and shows 새 이벤트 /
  이미 가져온 이벤트 counts plus saved-session attribution when available.

Hard boundary:

- no automatic polling;
- no background tray;
- no import without review.

Acceptance:

- browser mode remains honest desktop-only;
- Tauri file access stays restricted to `~/.mori/connectors/`;
- duplicate summary still matches Import Review meta.

## Phase 4. IDE and terminal explicit emitters

**Status:** in progress.

Goal: let editors and terminals send explicit summaries to the same JSONL
pipeline.

Slices:

1. **Shipped template + desktop staging:** Terminal helper: explicit command
   capture, no scrollback read.
2. **Shipped task template + desktop staging:** VS Code task template. A real
   extension remains planned.
3. Cursor extension: explicit "send to Mori" action for workspace events,
   separate from Cursor composer session discovery.

Shipped detail:

- Tauri command `stage_explicit_emitters` stages
  `mori-local-capture.py`, `mori-capture.sh`, and `mori-tasks.json` under
  `~/.mori/`.
- Staging rewrites terminal / VS Code templates to point at the staged
  local-capture bridge, so packaged builds do not depend on a repo checkout
  path.
- The local-capture setup guide exposes a desktop-only **터미널 / VS Code 준비**
  action. Mori still does not edit shell rc files or project
  `.vscode/tasks.json`; the user copies the source command or task template
  path explicitly.

Acceptance:

- no buffer polling;
- no keylogging;
- no always-on process;
- emitted JSONL passes the same Phase 1 review-draft tests.

## Phase 5. Agent import quality

**Status:** in progress.

Goal: improve the quality of session-discovery imports from anchor agents.

Targets:

- **In progress:** richer OpenCode transcript assembly while still avoiding
  `opencode.db`;
- Antigravity partial-format resilience;
- Cline task metadata;
- **In progress:** Cursor title / timestamp / bubble-text fallbacks;
- Continue session detail fidelity.

Shipped detail:

- OpenCode session reads now prefer the canonical `part/<messageID>/` text
  tree, but fall back to inline `content`, `text`, or `parts[]` on the message
  JSON when part files are absent. Tool / non-text parts remain excluded.
- Cursor composer reads now prefer `text`, but fall back to `richText`,
  `content`, and text-only `parts[]` / content arrays. Tool / thinking bubbles
  remain excluded, and the database is still opened read-only.

Acceptance:

- fixture tests per agent format;
- every parser tolerates unknown fields and corrupt rows;
- UI labels partial captures honestly.

## Phase 6. Packaging and operational trust

**Status:** planned.

Goal: make connectors reliable outside the repo.

Slices:

1. Package templates / CLI / MCP server with the desktop app.
2. Add version stamping to generated connector events.
3. Add a connector diagnostics panel: paths checked, files found, last error.
4. Add exportable diagnostics text for support without secrets.

Acceptance:

- packaged app can stage all shipped templates;
- diagnostics never include raw transcript text, secrets, or full file contents;
- support output is snapshot-only and user-triggered.

## What not to build

These stay out unless the product direction is explicitly reprioritized:

- Slack / Notion / Jira / Linear / Figma OAuth importers;
- Claude Desktop SQLite or ChatGPT browser storage readers;
- arbitrary Cursor database readers beyond composer chat;
- filesystem watchers or editor-buffer polling;
- automatic memory writes;
- cloud sync by default.

## Current next action

The next smallest valuable action is:

**IDE and terminal emitters.** Move to Phase 4: make the explicit terminal /
editor emitters easier to install and verify against the same Connector JSONL
review pipeline. Terminal / VS Code task staging is shipped; next is richer
fixture coverage and, later, a real explicit VS Code / Cursor extension.
