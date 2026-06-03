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

**Status:** next large product milestone.

Goal: ship a `mori` command that produces canonical Connector JSONL without
asking users to hand-copy wrapper scripts.

First build should be small:

1. `mori capture note --text ...`
2. `mori capture transcript --file ...`
3. `mori capture git --repo ...`
4. `mori run --connector codex -- <command...>` as a later step, once the
   capture commands are stable.

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

**Status:** planned.

Goal: make imported connector files feel first-class without adding a watcher.

Slices:

1. Show recent inbox files per connector family in the 연동 inspector.
2. Add "last imported" and "new events" hints from the connector identity
   history.
3. Add a manual Refresh button scoped to the selected provider.

Hard boundary:

- no automatic polling;
- no background tray;
- no import without review.

Acceptance:

- browser mode remains honest desktop-only;
- Tauri file access stays restricted to `~/.mori/connectors/`;
- duplicate summary still matches Import Review meta.

## Phase 4. IDE and terminal explicit emitters

**Status:** planned.

Goal: let editors and terminals send explicit summaries to the same JSONL
pipeline.

Slices:

1. Terminal helper: explicit command capture, no scrollback read.
2. VS Code task / extension: "send summary to Mori" command.
3. Cursor extension: explicit "send to Mori" action for workspace events,
   separate from Cursor composer session discovery.

Acceptance:

- no buffer polling;
- no keylogging;
- no always-on process;
- emitted JSONL passes the same Phase 1 review-draft tests.

## Phase 5. Agent import quality

**Status:** planned.

Goal: improve the quality of session-discovery imports from anchor agents.

Targets:

- richer OpenCode transcript assembly while still avoiding `opencode.db`;
- Antigravity partial-format resilience;
- Cline task metadata;
- Cursor title / timestamp fallbacks;
- Continue session detail fidelity.

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

**Mori CLI wrapper scaffold.** Start Phase 2 with the smallest useful `mori`
command: `mori capture note`, `mori capture transcript`, and
`mori capture git`, all emitting the existing Connector JSONL schema into a
chosen output directory. Do not wrap real agent binaries until those capture
commands are tested.
