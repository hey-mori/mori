# Mori Trace Architecture

Trace is Mori's evidence layer. It answers "what happened?" by collecting and
normalizing observable activity over time. Core answers "what did it mean?" by
forming records, flows, episodes, memories, and recall surfaces from reviewed
evidence.

This split is intentionally modest: AI session discovery lives under
`src/lib/trace/sources/ai/`, while Mori-side import, session-registration, and
record-kernel adapters live outside Trace.

The follow-up source-neutrality audit is recorded in
`docs/trace-source-neutrality-audit.md`.

## Existing AI Session Tracking

Before this refactor, AI session tracking lived under `src/lib/agents/`:

- `agentRegistry.ts` described Claude, Codex, OpenCode, Antigravity, Continue,
  Cline, Cursor, and Manus.
- `workSessions.ts` dispatched to read-only Tauri readers and connector JSONL
  readers, then previously also normalized selected sessions into import
  candidates.
- `autoImportSessions.ts`, `autoImportMetaStore.ts`, and
  `autoImportSettings.ts` registered metadata-only drafts so discovered sessions
  appeared in the session workspace.
- `agentSessionKernel.ts` dual-wrote each discovered session as a thin
  `agent-session` kernel record (created `active` since 2026-10-07).

The Rust readers remain source-specific adapters under `src-tauri/src/<agent>/`.
They are still explicit, read-only discovery commands rather than daemons.

## Responsibility Split

Trace responsibilities:

- discover AI work sessions from local, bounded sources;
- keep source/provider identity and observed timestamps;
- project AI sessions into source-neutral `TraceEvent` / `TraceSpan` values;
- keep source-specific fields inside metadata.

Core responsibilities:

- store durable records and revisions in the record kernel;
- turn reviewed evidence into issues, decisions, relationships, reports, and
  accepted memories;
- interpret multiple trace facts as a flow, episode, or memory.

Lens responsibilities:

- accept deliberate user selections or transfers into Mori;
- keep user-initiated capture separate from ambient discovery.

Mori-side adapters kept deliberately thin:

- `src/lib/session/autoImportSessions.ts` still writes metadata-only session
  drafts for today's UI;
- `src/lib/import/agentWorkSessionImport.ts` adapts loaded AI observations to
  existing Import Review candidates;
- `agentSessionRecordAdapter` bridges AI trace metadata into active kernel
  records without moving record semantics into Trace;
- legacy `src/lib/agents/*` files re-export the new modules for compatibility.

## Public Trace Contract

The minimal source-neutral contract is in `src/lib/trace/core/traceTypes.ts`:

- `TraceSourceDescriptor`: source family, provider, label, optional scope.
- `TraceEvent`: one observed fact at a time.
- `TraceSpan`: an activity interval backed by event ids.
- `TraceMetadata`: source-specific structured data.

The common contract has no URL, tab id, browser profile, account, or agent-only
fields. Browser, desktop, development-tool, and future sources should keep their
own details in metadata and source-specific modules.

## AI Trace Source

AI is now the first concrete Trace source:

```text
src/lib/trace/
  core/
  sources/
    ai/
      agentRegistry.ts
      workSessions.ts
      sessionTrace.ts
```

`workSessions.ts` discovers and loads source-local `AiSessionObservation`
metadata/details. `sessionTrace.ts` adds metadata-only projections from those to
generic trace events/spans. It does not generate summaries, issues, decisions,
flows, episodes, or memories.

## Terminal Trace Source

Terminal is the second concrete Trace source boundary, but not a new collector.
It adapts already-existing connector command events from `terminalShell` and
`terminal` into `TraceEvent` values. It creates `TraceSpan` values only when a
connector observed a positive command duration.

Connector JSONL, background inbox watch, and Live Follow remain infrastructure:
they move or analyze evidence, but they are not source identities on their own.

## Browser Readiness

The former Yusid direction is absorbed as Mori Browser architecture, not kept as
a separate product boundary.

Detailed Browser Context decisions are recorded in
[`docs/design/browser-context-adr.md`](design/browser-context-adr.md).

Browser work should separate:

- Browser Context: identity, account, profile, workspace, device, window, tab.
- Browser Trace: tab opened, tab focused, navigation, window switched, tab
  closed, profile or workspace changed.

The first Browser source-local MVP is under `src/lib/trace/sources/browser/`.
It models runtime/window/tab/resource context observations and projects tab
activation plus navigation committed observations into `TraceEvent` metadata.

The Chromium runtime shell lives in the separate `swarea/mori-browser-extension`
repository. It owns browser APIs, permissions, explicit opt-in, browser-side
privacy filtering, extension lifecycle, debug state, and a future transport
client. Mori owns the v1 Browser observation ingress contract and converts those
messages into Browser Context snapshots or Browser Trace events.

The cross-repository wire shape is a versioned Browser observation envelope, not
Mori's internal `TraceEvent`. The current fixtures live under
`src/lib/trace/sources/browser/fixtures/`.

Mori's Browser ingress is transport-neutral: it accepts an already-decoded v1
Browser observation envelope, validates `version`, `source`, `kind`,
`observedAt`, required payload fields, and URL privacy invariants, then routes
`context_snapshot` to Browser Context and `tab_activated`,
`navigation_committed`, and `history_state_updated` to Browser Trace.

Native Messaging transport types and framing live under
`src/lib/trace/transports/native-messaging/`. The packaged Rust host forwards
validated extension observations to Mori's loopback relay. Browser-local
application code persists accepted evidence, maintains current Context, and
exposes a snapshot-stable paginated history. These layers do not move Browser
fields into Trace core or give transport code ownership of interpretation.

Current implementation and verification details are recorded in
[`docs/design/browser-live-source-v1.md`](design/browser-live-source-v1.md) and
[`docs/design/browser-evidence-history.md`](design/browser-evidence-history.md).
Same-document History API evidence is documented in
[`docs/design/browser-history-state-evidence.md`](design/browser-history-state-evidence.md).

This split still does not implement cross-device sync, durable account
identity, page content capture, Flow, Episode, or Memory.

## Vision Boundary

Vision remains future-only. No Vision package, dependency, interface, or module
is introduced here. The intended boundary is:

- Vision: perception of screen, image, video, camera, or visual observations.
- Trace: temporal activity evidence.
- Core: interpretation and memory.
