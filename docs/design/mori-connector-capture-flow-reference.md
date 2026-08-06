# Mori Connector / Capture Flow · Design Reference

Eight UI concept images (saved under
[`docs/assets/screenshots/connector-capture-flow/`](../assets/screenshots/connector-capture-flow/))
explore a connector-centric capture workflow and a more data-dense,
table-first visual language than Mori ships today. They are **direction
references, not final screens**. This document records what each image is,
what is worth taking, what to avoid, and how it reshapes the session model
and information architecture.

The deeper purpose of this pass: the current "one manually started session"
model is wrong. These references help reframe Mori around **many sessions,
mostly reconstructed from imported evidence**, with a connector/capture
pipeline feeding them.

## 1. The eight references

| # | File | Represents |
|---|------|-----------|
| 1 | `connector-setup-wizard-reference.png` | Step wizard to add a connector (Claude Code / Codex / VS Code / Terminal), pick scope, confirm what Mori can / cannot access |
| 2 | `live-session-overview-reference.png` | A dashboard: large stat tiles, activity chart, recent sessions list, live capture stream |
| 3 | `source-to-timeline-mapping-reference.png` | Multi-column flow: source event → Evidence → Timeline → Review/Memory, with the transform path made explicit |
| 4 | `connector-health-diagnostics-reference.png` | Connector list + health stats + a terminal-style diagnostic log panel |
| 5 | `data-intake-inspector-reference.png` | One captured item with raw / normalized / extracted tabs and an output-candidate inspector |
| 6 | `capture-review-queue-reference.png` | A **dense table** of captured events with checkboxes + a selected-item inspector with approve / edit / reject |
| 7 | `connector-rules-filters-reference.png` | Settings-style rules / filters with toggles and a JSON preview |
| 8 | `privacy-local-data-center-reference.png` | Storage stats, per-connector data toggles, retention settings, a red danger zone |

## 2. What is worth taking

- **Table / dense-list first for operational data.** The review queue (6),
  diagnostics (4), and rules (7) are tables, not card stacks. Mori's
  current card-heavy surfaces (Connections, Evidence) should move dense
  operational data into lists with a selected-row inspector.
- **A real intake pipeline is visible.** Setup → live/intake → review queue
  → intake inspector → mapping → apply. Today Mori jumps Connections →
  Import Review with no sense of a queue or a pipeline.
- **Provenance / transform made explicit** (3, 5). Source → Evidence →
  Timeline → Review → Memory as columns is a strong way to teach the model
  without paragraphs of copy.
- **Privacy as a dedicated surface** (8), not scattered reassurance text.
- **Status tiles summarise, then a list drills in** (2, 6) · summary up top,
  operational detail below.

## 3. What NOT to copy blindly

- **The big live dashboard (2) implies always-on recording.** Mori is
  explicit-import, local-first · not a monitor. A "live session overview"
  with running counters risks selling surveillance Mori does not do. Keep a
  *current work context* indicator; do not build a stock-ticker dashboard.
- **Eight new top-level screens would shatter the IA.** The references are a
  superset. Building all of them produces disconnected panels · exactly the
  "screen full of disconnected panels" the product must avoid.
- **The running stopwatch** in the lower-left (every image) is the current
  model's mistake repeated. An imported session has a *span*, not a live
  clock. Only a genuinely live connector stream warrants a live indicator.
- **JSON / diagnostic log panels (4, 7)** are powerful but developer-facing.
  Keep them behind a disclosure / "advanced" affordance, not on the primary
  surface.
- **Density everywhere.** Some surfaces (summaries, single-conversation
  reading) are better calm. Match pattern to data, per surface.

## 4. Fit with Mori's product direction

Strong fit (build toward):
- Capture Review Queue (6) · a real review-before-apply gate as a dense list.
- Data Intake Inspector (5) · raw / normalized / extracted is honest provenance.
- Source-to-Timeline Mapping (3) · teaches "evidence is the source of truth".
- Privacy & Local Data Center (8) · consolidates `rawRetention`, secret
  detection, storage, retention into one honest surface.

Conditional fit (only when a live connector exists):
- Connector Setup Wizard (1), Connector Health / Diagnostics (4),
  Connector Rules / Filters (7) · these assume a running connector pipeline.
  Mori's connectors are explicit template scripts today; a full control
  center is premature. Keep planned, honest.

Weak fit (resist):
- Live Session Overview (2) as a primary dashboard. Fold its *useful* parts
  (recent sessions, current context) into the Sessions/Work-Context surface;
  drop the always-on-monitor framing.

## 5. Session model audit · the core problem

### Current model (as shipped)
- One **active session** in memory; the lower-left widget shows it with a
  running timer and "진행중인 세션".
- The user **manually starts** (`StartSessionView`) and ends a session.
- `Session.status` is `recording | analyzing | complete`.
- Everything historically imported *into* the active session.

### Why it is wrong
1. **Mori does not record.** A live timer implies an always-on recorder.
   Mori reconstructs work from explicitly imported evidence.
2. **A session is usually reconstructed, not started.** The dominant path is
   "import a past Claude conversation", which has its own start/end in the
   past · not "press Start now".
3. **There are many sessions, across time and projects.** The single-active
   widget hides this. The user must be able to see, group, switch, merge,
   split, rename, and archive sessions.
4. **"recording" status is fiction** for imported sessions.

### Proposed model

A **Session** is *a bounded unit of reconstructed work*, identified by a
`kind` and a lifecycle `state`, belonging to a **Project**.

- `kind`:
  - `imported` · reconstructed from external evidence (Claude Code/Desktop,
    Codex, transcript, git). **The dominant case.**
  - `manual` · a blank session the user started inside Mori.
  - `live` · a connector stream Mori is actively receiving (future; rare).
- `state` (lifecycle): `draft` → `reviewing` → `active` → `reviewed` →
  `archived`, plus `merged` (folded into another).
- A **Project** owns many sessions over a long-running stream of work.
- A **live capture stream** is *not* a session · it is a source that can
  produce one or more candidate sessions, each still reviewed before apply.

### Distinctions to keep straight
| Concept | What it is | Lifetime |
|---------|-----------|----------|
| Live capture stream | A connector emitting events now | While the connector runs |
| Work session | A bounded unit of reconstructed work | Fixed once reconstructed |
| Review batch | Captured items awaiting review-before-apply | Until applied / discarded |
| Project memory timeline | Durable cross-session accepted memory | Persistent, project-level |

### The lower-left widget
Keep a persistent indicator · but it is **Current Work Context**, not an
ongoing recording:
- Shows the **project** and the **session currently in focus**, with a
  state chip (`가져옴` / `검토 중` / `초안` / `라이브`).
- Duration is the session's **actual span** (from evidence timestamps), not
  a stopwatch. A genuinely `live` session may show a live indicator.
- Click → switch work context (project / session), not "end recording".

## 6. Information architecture moves

- **Sessions becomes first-class.** A Sessions surface (evolve Workspace)
  lists sessions grouped by project, filterable by `kind` / `state`, with
  rename / merge / split / archive. This replaces "Start Session" as the
  primary entry.
- **Start Session is demoted** to "새 작업 세션" · a secondary action, not the
  app's front door. Importing (Connections) is the real front door.
- **Project Memory is project-level**, aggregating across that project's
  sessions (already mostly true; make the framing explicit).
- **Connector / capture surfaces stay planned** behind honest states until a
  real live connector exists. The Capture Review Queue and Data Intake
  Inspector are the first capture surfaces worth building when that lands.

## 7. Layout & copy findings (to fix in a shared-shell pass)

- Page shells differ per screen; headers, action rows, and right rails
  shift height / width with content. Needs shared `PageShell` / `PageHeader`
  / `ActionBar` / `InspectorPanel` primitives with fixed rhythm.
- Card-everywhere reads like a mockup. Move dense operational data to lists;
  reserve cards for summaries and inspector sections.
- Explanatory copy is heavy and reads AI-authored. Move detail into
  disclosures / tooltips / a help drawer; let layout + status carry meaning.
- Too many competing primary buttons; inconsistent empty / loading / error
  states. Standardise.

## 8. Phased roadmap (highest-impact first)

1. **Work Context + honest session model** (this pass): add `kind` to
   sessions, derive a `WorkContext` view-model, replace the lower-left
   recording widget with an honest current-context widget, make duration
   truthful. Tests for the derivation. *No fake recording.*
2. **Sessions as a first-class surface**: evolve Workspace into a
   project → sessions browser with kind/state filters and lifecycle actions.
3. **Shared layout primitives**: `PageShell` / `PageHeader` / `ActionBar` /
   `InspectorPanel` / `EmptyState`; apply to 2–3 high-traffic screens.
4. **Capture Review Queue + Intake Inspector**: a dense review-before-apply
   list with raw/normalized/extracted inspection · the first capture surface.
5. **Copy diet + progressive disclosure**: compact primary surfaces, detail
   behind disclosures.
6. **Notification / alert routing**: connector-stale, privacy-risk,
   review-growing, handoff-ready · routed through Companion + a center.
7. **Privacy & Local Data Center**: consolidate retention / secret / storage.
8. **Connector control center / wizard / diagnostics**: only when a live
   connector pipeline exists. Planned, honest, until then.

Out of scope until explicitly approved: team/cloud collaboration, always-on
capture, account scraping. Architecture and naming should not *block* future
collaboration, but no collaboration backend ships now.
