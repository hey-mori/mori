# Roadmap

> **Historical / partially superseded (2026-07-13).** The personal-memory-era
> execution plan and the current navigation live in
> [`design/mori-memory-roadmap.md`](design/mori-memory-roadmap.md) (the canonical
> execution roadmap) and [`design/mori-product-shell-ia.md`](design/mori-product-shell-ia.md).
> In particular the four-tab nav (홈 · 소스 · 대시보드 · 워크벤치) described below
> is superseded by the shipped shell (홈 · 라이브 · 연동 · 프로젝트 · 메모리 ·
> 대시보드 · 워크벤치). This document is kept for its phase history and
> screen-by-screen mapping; do not treat its sequencing as current.

This roadmap is a practical development sequence. Each phase should produce something usable without pretending later capabilities already exist.

The intended product surface, screen by screen, is catalogued in the
[Product Screen Reference](product-screen-reference.md) · every reference image
is tagged Implemented / Partial / Planned / Reference only so the roadmap below
can map cleanly to a specific screen without overclaiming. Original design
prompts are preserved in [Product Screen Prompts](product-screen-prompts.md).

The engineering boundaries that back this roadmap are documented in
[Modular Architecture](modular-architecture.md), the product loop is in
[Product Flow](product-flow.md), and the typed data flow is in
[Data Pipeline](data-pipeline.md). All Planned items below are also rows
in the feature-status registry at `src/app/featureStatus.ts`, so the
codebase keeps an honest single source of truth for which capabilities
exist. The policy for that registry lives in
[Feature Status](feature-status.md).

Related directional notes:

- [Top-Level Surface Direction Note](design/home-dashboard-workbench-direction.md)
  records a non-binding direction for the standing navigation: a four-tab model
  (홈 · 소스 · 대시보드 · 워크벤치) organized by axis rather than data type, with
  the single-project page demoted to a drill-through and one consistent rule
  for right-side inspector panels.
- [Live Project Intelligence](live-project-intelligence.md) records the
  planning contract for opt-in connected-project awareness. It extends the
  existing session-scoped Live Follow boundary into project Summary / Signal
  surfaces without adding a background watcher or bypassing Import Review.

## Phase 0: UI Prototype

Goal: establish the product experience and visual model.

Key tasks:

- Build Start Mori / Session Setup prototype
- Build Narrative Timeline prototype
- Build Flow Focus / Trace View prototype
- Build Issue Garden and Decision Log prototype
- Build Sources / Evidence prototype
- Build Resume / Report prototype
- Define domain types and realistic mock data

Expected output:

- A believable frontend prototype that communicates the product shape
- Initial typed domain model
- UX reference screenshots

Not included yet:

- Desktop shell
- Real capture/import
- SQLite persistence
- Local LLM analysis
- `.mori` package IO

## Phase 1: Desktop Shell

Goal: turn the prototype into a local desktop application boundary.

Key tasks:

- Scaffold Tauri v2
- Connect React/Vite frontend to Tauri
- Define typed command contracts
- Add project/session command stubs
- Add local app settings surface

Expected output:

- Mori launches as a desktop app
- Frontend talks to Rust through narrow command boundaries

Not included yet:

- Full import pipeline
- Local LLM analysis
- Browser extension
- PDF/HTML export

## Phase 2: Import MVP

Goal: allow users to bring selected work evidence into Mori without broad monitoring.

Key tasks:

- AI conversation text/transcript import
- Manual note import
- Git diff import
- Browser URL/manual source add
- File/project folder source references
- Source retention and redaction metadata

Expected output:

- A user can create a session from explicit imported sources
- Imported sources become normalized Mori records

Not included yet:

- Always-on recording
- Automatic browser history scraping
- Full terminal capture
- Browser extension

## Phase 3: Local LLM Integration

Goal: generate useful summaries and structured records from local sources.

Key tasks:

- Add Ollama provider first
- Add LM Studio provider
- Add OpenAI-compatible local endpoint provider
- Define prompt templates
- Add analysis job queue
- Store generated events, issues, decisions, relationships, summaries

Expected output:

- Mori can run a local analysis pass over imported sources
- AI outputs are inspectable, editable, marked with trust/confidence, and
  user-corrected issue / decision text carries explicit edit metadata

Not included yet:

- Cloud API default behavior
- Fully autonomous editing
- Unbounded background analysis

## Phase 4: Timeline + Flow Focus

Goal: make the reconstructed work session navigable and correctable.

Key tasks:

- Productionize lane-based timeline rendering
- Add event inspector editing
- Add relationship extraction and traversal
- Add Flow Focus hover/click states
- Add Trace panel with causes and results
- Add split/merge correction basics

Expected output:

- A user can understand how a session unfolded
- A user can inspect evidence and correct AI-generated structure

Not included yet:

- Large-scale timeline virtualization unless needed
- General graph explorer as the primary UI

## Phase 5: Browser Extension

Goal: let users explicitly add browser context to a Mori session.

Key tasks:

- Add current tab to Mori
- Add selected text to Mori
- Add selected tabs to Mori
- Bridge extension data into desktop app
- Preserve source URL, title, timestamp, and user action metadata

Expected output:

- Browser context can be intentionally captured without broad history scraping

Not included yet:

- Silent browser monitoring
- Reading every page automatically

## Phase 6: Vibe Coding Mode

Goal: make Mori especially useful for AI-assisted coding sessions.

Key tasks:

- Claude Code transcript import
- Codex transcript import
- Cursor/source activity import strategy
- Git diff and changed file correlation
- Code-related issue extraction
- Standup report generation

Expected output:

- A developer can reconstruct an AI coding session into timeline, decisions, issues, files, and resume prompt

Not included yet:

- Acting as an autonomous coding agent
- Automatically changing source files

## Live Project Intelligence Track (Planning)

Goal: make connected AI work understandable while preserving Mori's explicit
local capture and review-before-apply model.

This track is intentionally ordered from session-scoped evidence to project
summary. Project-level intelligence should not ship before the narrower Live
Follow shell is honest and end-to-end verified.

This section is a planning track, not a claim that the corresponding UI
capabilities are already present in the feature-status registry. Add registry
rows when a slice becomes a rendered planned control or a shipped capability.

Key slices:

1. **Live Follow desktop shell.** Wire the existing pure follow controller and
   poll orchestration into a foreground desktop loop: start / pause / stop,
   read one followed session's connector file, import genuinely new pending
   events, trigger incremental analysis, and produce one low-noise feed update.
2. **Project connection mapping.** Add a user-confirmed mapping from Mori
   project to external project key / repository identity / connector family,
   rather than trusting raw paths or `sourceLabel` alone.
3. **External session status.** Track discovered / following / paused /
   needs-review / analyzing / blocked / completed / error states for external
   agent sessions associated with the project.
4. **Project current-state strip.** Add a project Summary surface that reports
   active sessions, waiting items, blocked sessions, and the latest meaningful
   update from accepted and clearly labelled pending evidence.
5. **Signal promotion policy.** Promote only decision-needed, completed, and
   blocked notifications first; keep risk/conflict as in-app candidates until
   evidence, ranking, and mute controls are mature.
6. **Local LLM insight candidates.** Run local/deterministic analysis over
   compact event digests, emit inferred candidates with supporting event ids,
   and require review/adoption before durable Project Memory.

Expected output:

- A user can follow a still-running AI session while Mori is open.
- A project page can explain what is currently active, waiting, or blocked.
- A notification points to evidence and never fires for raw trace noise.
- Local LLM output is useful but visibly inferred and correctable.

Not included yet:

- Always-on machine monitoring.
- Applying connector events directly to durable memory without review.
- Reading agent private databases, browser stores, account data, or opaque
  internal formats.
- Cross-agent orchestration or automatic source-code changes.
- OS-level notifications for every risk or file change.

## Memory Orchestrator Roadmap

A cross-cutting view of Mori's memory layers, framed against the
external always-on-memory reference analysed in
[`docs/references/memory-orchestrator-reference.md`](references/memory-orchestrator-reference.md)
and reconciled with the broader Mori research synthesis at
[`docs/references/manus-research-synthesis.md`](references/manus-research-synthesis.md).
Each capability preserves the honesty contract documented in
[`docs/memory-architecture.md`](memory-architecture.md): explicit
ingestion, review-before-apply, provenance over prose, local-only.

### Capability buckets

Durable architecture should be described by capability, not by
phase number. The buckets below are the stable structure; the
phase-numbered sub-headings that follow are historical milestone
notes kept for traceability, not new architecture labels.

| Capability bucket | Goal | Status |
| ----------------- | ---- | ------ |
| Import and Evidence Foundation | Make explicit import reliable, auditable, evidence-linked. | ✅ landed |
| Timeline and Review Experience | Make AI-derived reconstruction reviewable per item. | ✅ landed |
| Project Memory Consolidation | Turn reviewed sessions into durable project memory through review-before-apply. | ✅ landed · full review surface, accepted-memory persistence (browser + SQLite V003), audit trail + revert, stale / contradiction review |
| Resume and Report Outputs | Generate continuation prompts and shareable reports from accepted memory only. | ✅ landed · accepted-memory integration in Resume Prompt and Reports, real `.mori` zip export / import |
| Optional Local Automation | Reduce friction while preserving explicit consent. | ✅ landed · opt-in background inbox watcher (off by default, review gate unchanged); see Phase 3 below |
| Queryable Memory | Local cited search over accepted memory + evidence. | ✅ landed · accepted-memory + timeline / evidence / review-action search (helper + Memory Search card) |
| Team / Shared Memory | Explicit `.mori v0` export/import only; no default cloud sync. | partially landed · `.mori` zip export / import, client-safe filter + export UI, handoff workflow spec; live collaboration is a non-goal |

Sub-capabilities within Project Memory Consolidation (mirroring
the design in
[`docs/project-memory-consolidation.md`](project-memory-consolidation.md)):
Consolidation Proposal Preview ✅, Consolidation State ✅,
Consolidation Review Surface ✅,
Accepted Memory Persistence ✅ (browser localStorage), SQLite
Accepted Memory Storage ✅ (desktop tables + commands + bridge +
runtime-aware repository routing), Memory Audit Trail ✅
(append-only review actions + audit log UI on the Memory page;
Undo / revert still planned), Resume and Report Memory Integration
✅ (Resume Prompt + Reports + `.mori v0` slice + review-on-import
paste panel), Stale Memory Review ✅ (`buildStaleMemoryProposals` ·
supersession / retirement, reviewer-note, and next-session time
signals), Contradiction Review ✅ (`buildContradictionProposals` ·
same-title conflicting accepted decisions), Accepted Memory
Lifecycle Status ✅ (`stale` / `contradicted` statuses; accepting a
lifecycle proposal transitions the referenced memory).

### Phase 0 · Explicit import memory loop (Implemented)

The canonical paste → review → apply → timeline → evidence loop is
in place for AI Transcript, Connector JSONL (paste + desktop inbox),
Git Diff, Manual Note, and URL sources. A scripted walkthrough lives
at [`docs/e2e-smoke-flow.md`](e2e-smoke-flow.md) and is guarded by a
fixture test (`src/lib/connectors/connectorSampleFixture.test.ts`).

### Phase 1 · Project Memory consolidation (Implemented)

Cross-session aggregation produces key decisions, recurring issues,
key evidence, unresolved risks, recommended next session, and the
connector re-import rollup. The Memory page exposes a typed
`dataBasis` flag so it can never misrepresent the reach of the
aggregation. The Resume Prompt is built from this same view-model,
audience- and privacy-aware, no LLM call.

### Phase 2 · Controlled consolidation pass (Design + Phase 2.0 prototype landed)

A **user-triggered** consolidation pass over Project Memory. Goals:

- Merge near-duplicate decisions across sessions (with the user
  reviewing each proposed merge).
- Promote recurring issues to project-level entities that survive
  even after their source sessions are pruned.
- Detect contradictions between decisions across sessions and
  surface them as review candidates.
- Track a richer memory lifecycle than "consolidated yes/no":
  `proposed → reviewed → promoted → stale → retired`.
- Persist consolidation results with citations back to the source
  sessions (mirroring the reference's `consolidations` table, but
  always reviewed before applying).

Non-goals for this phase: any LLM-driven consolidation that lands
without user review, any cross-account/cloud sync, any background
trigger.

Design and sub-phase plan live at
[`docs/project-memory-consolidation.md`](project-memory-consolidation.md).
Sub-phase status:

| Capability | Scope | Status |
| ---------- | ----- | ------ |
| Consolidation Proposal Preview | Pure proposal helper (`buildProjectMemoryConsolidationPreview`) + tests | ✅ landed |
| Consolidation State | Typed `ProjectMemoryConsolidationState` derived in the Memory page; preview card | ✅ landed |
| Consolidation Review Surface | Full-page review with local-draft accept / edit / discard / keep-watching / defer per proposal | ✅ landed |
| Accepted Memory Persistence (Browser) | `StoredAcceptedProjectMemory` + repository methods; accepted memories survive reload via browser localStorage | ✅ landed |
| Memory Audit Trail (minimal) | `StoredMemoryReviewAction` append-only log; one row per accept / edit / watch / defer / discard / apply | ✅ landed |
| Memory Audit Trail UI | `buildMemoryAuditTrailViewModel` + `MemoryAuditTrailCard`; sorted, date-grouped, filterable audit log with per-row status transitions | ✅ landed (Undo / revert still planned) |
| SQLite Accepted Memory Storage | `consolidated_memories` + `consolidated_memory_audit` tables, Rust migration + commands, TS bridge, runtime-aware repository routing | ✅ landed |
| Resume and Report Memory Integration | Promoted memories outrank live aggregation rows; `.mori v0` carries the slice | Resume Prompt + Reports ✅ landed; `.mori v0` slice ✅ landed; review-on-import ✅ landed (paste panel) |
| Stale Memory Review | Scan accepted memories for staleness signals; emit `staleMemory` proposals (`buildStaleMemoryProposals`) | ✅ landed |
| Contradiction Review | Detect conflicting accepted decisions; emit `contradiction` proposals (`buildContradictionProposals`) | ✅ landed |
| Accepted Memory Lifecycle Status | Explicit `stale` / `contradicted` statuses; accepting a lifecycle proposal transitions the referenced memory via `targetMemoryIds` | ✅ landed |
| Queryable Memory | Local structured search over accepted memories + timeline / evidence / review-action references (`searchAcceptedMemories` / `searchProjectMemoryReferences` + Memory Search card); deterministic, evidence-ref cited, no embeddings | ✅ landed |

### Phase 3 · Optional local daemon / watched inbox (✅ Shipped, opt-in)

Shipped as the opt-in background inbox watcher (`src/lib/background-watch/`,
설정 → 분석 엔진 → "백그라운드 감지"): while the app is open it watches
`~/.mori/connectors/`, surfaces new or grown files into the notification
feed, and can run a headless Quick Pass whose result lands in the
Evidence Hub for review. The user still walks each item through Import
Review before it reaches Project Memory.

Hard constraints:
- Opt-in via Settings, off by default.
- Local-only; no network access; no account scanning.
- Bound to the existing connector inbox path the user has already
  consented to.
- Review-before-apply preserved.

### Phase 4 · Local natural-language memory query (Research)

A small local query helper that answers "what did we decide about
X?" by reading `ProjectMemoryViewModel` + saved-session bodies and
returning a cited answer. Constraints:

- Same data-basis honesty as the Resume Prompt.
- Same privacy modes (`normal / summaryOnly / clientSafe`).
- Citations into Mori sessions only (no embeddings, no vector
  retrieval, no external endpoints).
- Pure local pure code path first; LLM-assisted synthesis only as an
  optional layer that runs against the user's chosen local LLM
  (Ollama or compatible).

Non-goals: external multimodal ingestion, scheduled background
queries, cross-device sync.

### Explicit non-goals for the Memory Orchestrator track

- Always-on background capture by default.
- Auto-merging memories without user review.
- Cloud sync of memories or insights.
- Reading external accounts or arbitrary files.
- Pretending a live Claude / Codex sync exists.
- A Vertex AI / Gemini / cloud-LLM hard dependency.

## Connector re-import awareness (Implemented)

The Evidence Hub now closes the user-facing re-import loop. Every
Connector JSONL preview derives a typed
`ConnectorSourceImportSummary` (status: `new` / `partialReimport` /
`duplicateOnly` / `historyUnavailable` / `invalidOnly`) that the
preview card, the Import Review meta strip, and the imported-source
row + detail panel all consume. Matched saved sessions are surfaced
by name. The status precedence is honest · a fresh-looking preview
that ran without saved-session history is downgraded to
`historyUnavailable` rather than claiming "new across all sessions".
The summary can optionally ride along on `StoredSessionImport` so the
Evidence Hub row keeps its re-import badge after reload.

## End-to-end smoke flow (Implemented)

A documented, scripted walkthrough at
[`docs/e2e-smoke-flow.md`](e2e-smoke-flow.md) drives Mori through the
full import / review / timeline / evidence / memory / resume-prompt
loop using the canonical synthetic fixture at
[`docs/fixtures/connector-sample-mori-session.jsonl`](fixtures/connector-sample-mori-session.jsonl).
A vitest suite at
`src/lib/connectors/connectorSampleFixture.test.ts` guards the fixture
so the docs and product stay aligned · parse, preview, normalize, and
duplicate-detection paths all run against the same file.

Import Review now shows a richer post-Apply banner: applied count,
source title, skipped-duplicate count, and four next-step buttons
(Timeline / Evidence Hub / Project Memory / Quick Pass-in-Reports if
no analysis exists). The Memory page's Resume prompt section carries
an explicit honesty note about local-only generation.

Out of scope this milestone (still planned):

- No new capture mechanisms · paste / desktop inbox stays the entry
  surface.
- No live Claude / Codex sync.
- No Playwright / screenshot tests.
- No "Load sample" UI button · the doc-driven paste path was preferred
  to avoid the risk of looking like a real connector.

## Cross-session resume prompt (Implemented)

The Memory page's resume / follow-up prompt is now built from
`ProjectMemoryViewModel` rather than the legacy active-session-only
helper. The prompt carries cross-session decisions, recurring issues,
key evidence, pending next actions, recent sessions, re-import
activity, and explicit data-basis limitations. Audience selectors
(`self` / `claude` / `codex` / `chatgpt` / `handoff`) tailor the
preamble + closing; privacy modes (`normal` / `summaryOnly` /
`clientSafe`) sanitise local paths, URLs, connector identity triplets,
and detailed decision text. The legacy `buildFollowUpPrompt` helper
remains exported for backward compatibility.

Out of scope this milestone:

- Reports page is unchanged · it keeps its own `reportBuilder.ts`
  surface.
- No LLM-generated continuation prompt · output is purely derived
  from local data.

## Browser session memory body persistence (Implemented)

Browser-saved Mori sessions now persist a durable
`StoredSessionMemoryBody` snapshot (issues / decisions / next-actions /
optional summary snapshot) at
`mori.sessionMemory.<sessionId>`. The body is written after Quick Pass
succeeds and via a one-shot forward migration during hydrate (any
saved analysis without a body gets one). Project Memory's browser
loader reads the body first and falls back to the analysis result for
legacy records · so browser-saved sessions now contribute decisions /
issues / next-actions / risks / recommendations to cross-session
aggregation, on par with desktop SQLite sessions.

Out of scope this milestone (still planned):

- SQLite-side `importSummary` mirror for the re-import rollup.
- Cross-device project memory (still explicit `.mori v0` import).
- Loading saved sessions that pre-date connector identity stamping.

## Project Memory saved-session body loading (Implemented)

Project Memory now safely loads saved Mori session bodies so the cross-
session view aggregates real content, not just metadata:

- A pure loader (`src/lib/project-memory/loadProjectMemorySessions.ts`)
  pulls bodies from desktop SQLite (non-mutating, parallelized) and
  browser localStorage (imports + analysis).
- Cross-session helpers
  (`src/lib/project-memory/crossSessionAggregation.ts`) derive key
  decisions, recurring issues, key evidence, and unresolved risks
  across all loaded bodies. Recurring issues are detected by normalized
  title and marked `crossSession: true` when they appear in multiple
  sessions.
- The Memory page renders a `partialSavedSessionLoad` data-basis state
  and per-session `loadStatus` badges so partial / failed loads are
  surfaced honestly.
- Body loading is capped at 20 recent saved sessions. The cap is
  documented; raising it is a deliberate change.

Out of scope this milestone (documented as planned):

- Persisting runtime issues / decisions / next-actions for browser-saved
  sessions (today only desktop SQLite contributes those fields after a
  load).
- Persisting `importSummary` into SQLite.
- Background watchers / cloud sync (deferred / not planned).

## Project Memory multi-session aggregation (Implemented)

Project Memory now aggregates across saved Mori sessions where local
data is available. The Memory page reads:

- the active session view,
- browser-draft saved-session metadata and persisted connector imports,
- desktop SQLite saved-session metadata,
- stored `.mori v0` packages,

and composes a typed `ProjectMemoryViewModel` (see
[docs/project-memory.md](project-memory.md)). The page renders a
data-basis badge (active-only / active + saved / metadata-only /
unavailable) so users can see what's actually accumulated.

A dedicated "이번 프로젝트 재import" card rolls connector
`ConnectorSourceImportSummary` records up across saved sessions ·
counting `new` / `partialReimport` / `duplicateOnly` /
`historyUnavailable` / `invalidOnly` separately and surfacing matched
saved sessions.

Out of scope this milestone (documented as planned):

- Loading saved-session bodies to aggregate decisions / issues /
  next-actions across sessions.
- Persisting `importSummary` into SQLite so desktop-saved sessions can
  also contribute to the re-import rollup.
- Visual Session Canvas / Workroom (still deferred · see below).

## Session Canvas (deferred, future visualisation)

A Session Canvas / Workroom visualisation is a promising future view: a
zoomable canvas that lays out the active session's `TimelineEvent`s,
`SourceRef`s, `Review` drafts, and connector-import-history overlay as
spatial work areas (Claude / Codex / Terminal / Browser / Files /
Communication / Git lanes), so the user can scan what's happening at a
glance.

This is **intentionally deferred** until the core import + persistence
flow is stable. The current priority is the data underneath: reliable
connector imports, durable persistence, cross-session import history,
clean Project Memory aggregation, accurate source/evidence tracking,
and safe local-first behaviour. When Session Canvas eventually lands it
should:

- read the exact same `TimelineEvent` / `SourceRef` / `Review` /
  `connectorEventId` data the rest of Mori already uses,
- never invent new auto-capture surfaces (paste / hook / inbox stays
  the only entry path),
- stay local-only, with no background watchers, no live sync, and no
  cloud component.

No UI is shipped today. The canvas concept is a planning artifact, not
a feature.

## Phase 7: Freelancer Mode

Goal: turn selected sessions into client-safe work reports.

Key tasks:

- Client report template
- Scope change detection
- Billing work log
- Customer email draft
- Privacy-safe report filters
- Optional `.mori` package attachment rules

Expected output:

- A freelancer can share clear work progress without exposing private raw session details

Not included yet:

- Invoicing system
- Client portal
- Team permission model
