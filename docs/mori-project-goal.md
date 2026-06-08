# Mori Project Goal

Canonical project goal and working guide for Mori. Future AI coding
sessions should read this file first, then inspect the current repo,
then propose the smallest next milestone. This document is durable
guidance — it intentionally uses capability-based names instead of
phase numbers, and it is honest about what is implemented today versus
what is still designed or planned.

Companion docs (read these before changing code):

- [memory-architecture.md](memory-architecture.md) — layer-by-layer
  memory map (capture → evidence → review → timeline → project memory
  → query / output → storage).
- [project-memory.md](project-memory.md) — Project Memory live
  aggregation contract and data-basis honesty flag.
- [project-memory-consolidation.md](project-memory-consolidation.md) —
  Consolidation lifecycle, ADR-style decision memory, Review Surface
  spec, Accepted Memory + Audit Trail data model.
- [imports.md](imports.md) — every import surface and its review gate.
- [source-integrations.md](source-integrations.md) — source registry,
  trust levels, raw-data policy.
- [connectors/connection-surface.md](connectors/connection-surface.md) covers
  the 연동 surface contract (provider grid + inspector, setup guides, live
  connection status) and the remaining connector roadmap.
- [connectors/connection-long-term-plan.md](connectors/connection-long-term-plan.md)
  is the phased connector execution plan from hardening to CLI / IDE emitters.
- [persistence.md](persistence.md) — storage adapters, schema
  versions, fallback behaviour.
- [roadmap.md](roadmap.md) — capability buckets and historical phase
  notes.
- [e2e-smoke-flow.md](e2e-smoke-flow.md) — scripted walkthrough of the
  full loop using the canonical fixture.
- [references/memory-orchestrator-reference.md](references/memory-orchestrator-reference.md)
  and
  [references/manus-research-synthesis.md](references/manus-research-synthesis.md)
  — external references reconciled against Mori.

---

## 1. Product Identity

Mori is a **local-first AI work memory app for evidence-based session
reconstruction and continuation.** The durable unit of value is not a
memory snippet — it is a reviewed, source-linked understanding of
*what happened*, *why it mattered*, *what evidence supports it*, *what
was decided*, *what remains unresolved*, and *what should be carried
into the next session*. Mori is not a note app, not a task manager,
not a wiki, not an autonomous coding agent, and not a surveillance
tool. It is a quiet, local-only memory layer that lets the user
explicitly import work evidence from Claude / Codex / ChatGPT / CLI /
Git / notes / URLs, review every AI interpretation, accumulate durable
project memory, and produce a continuation prompt or report when it is
time to resume.

**The session unit — an AI-agent work session.** A Mori *session* is one
**AI-agent work session**, not a free-floating bundle of unrelated
sources. It has a single **spine**: one AI coding conversation in one
agent — Claude *or* Codex *or* OpenCode. Around that spine attach the
**ribs**: the Git diffs, terminal runs, files, notes, and URLs produced
during *that same piece of work*. So "one Claude conversation = one Mori
session" and "a session is a unit of work" are the same statement — the
conversation is the anchor, the surrounding evidence hangs off it. This
resolves an earlier ambiguity where importing a conversation produced a
per-conversation session while the Work Bundle implied a session was an
arbitrary merge of many sources. Consequences that follow from this
definition:

- **Agents anchor; everything else is evidence.** Claude / Codex /
  OpenCode are session anchors. Git, terminal, documents, notes, URLs,
  IDE, and browser sources are evidence you attach to a session — never
  a session of their own. The source hub presents this split (agent
  families first, evidence families second).
- **The canonical way to start a session is to import / continue an AI
  conversation.** A hand-made empty session is a secondary container.
- **Attaching surrounding evidence is auto-*association*, never
  auto-*capture*.** Mori may group already-captured evidence (hook JSONL
  from the same window, a Git diff the user fetched) onto a session's
  spine, but it never captures new evidence in the background or watches
  the machine. Association is automatic; capture stays explicit
  (Product Principle: explicit import / capture, no hidden capture).
- **The Work Bundle is the manual fallback, not the model.** Hand-pasting
  several sources into one bundle is the rare path for when no
  auto-detected conversation exists; the composite preview / per-source
  provenance engine is unchanged, but it is no longer presented as the
  primary way to form a session.

## 2. Core User Problem

Users work across Claude, Codex, ChatGPT, CLI tools, Git, terminal,
documents, notes, and browsers. The work becomes fragmented across
tools and sessions. Hours or days later, the same user — or another
collaborator — needs to remember:

- *what happened* during the last session,
- *why* decisions were made (rationale, alternatives, trade-offs,
  consequences),
- *what evidence* supports each claim (transcripts, diffs, notes),
- *what remains unresolved* (open issues, risks, in-progress work),
- *what to do next* (concrete actions, blocked items, follow-ups),
- *how to continue* — what prompt or context belongs in the next AI
  session, the next CLI run, the next pairing call.

Existing tools either lose this context (chat history scrolls away,
terminal scrollback is wiped, AI tools do not share memory across
products) or try to capture it autonomously (always-on watchers,
account scraping, cloud sync) at the cost of trust. Mori takes the
middle path: explicit user-driven capture, evidence-linked memory,
review-before-apply gates, and durable but reviewable project memory.

## 3. Target Product Loop

```
   Claude / Codex / ChatGPT / CLI / Git / terminal work
                          │
                          ▼
                Capture / Import (explicit)
                          │
                          ▼
                     Preview
                          │
                          ▼
                  Import Review
                          │
                          ▼
              Timeline / Evidence Hub
                          │
                          ▼
                  Project Memory
                          │
                          ▼
              Consolidation Review
                          │
                          ▼
                 Accepted Memory
                          │
                          ▼
           Resume Prompt / Reports
                          │
                          ▼
                   continue work
```

Step meanings:

- **Capture / Import.** The user explicitly pastes or selects work
  evidence: an AI transcript, a Connector JSONL file, a Git diff, a
  manual note, a URL. Mori does not watch folders, scrape accounts, or
  monitor processes.
- **Preview.** The relevant import pane parses the input, surfaces a
  source-level re-import summary (`new` / `partialReimport` /
  `duplicateOnly` / `historyUnavailable` / `invalidOnly`), shows
  duplicate counts, and flags suspected secrets. Nothing is persisted
  yet.
- **Import Review.** Every captured event lands in Import Review as a
  candidate — accept, discard, or edit per event. Apply requires an
  explicit click; raw text never reaches the session store on its own.
- **Timeline / Evidence Hub.** Applied events become a navigable
  Timeline and a per-source Evidence Hub. Each row carries trust
  level, redaction status, raw-data retention policy, and connector
  provenance.
- **Project Memory.** A live cross-session aggregation
  (`ProjectMemoryViewModel`) of key decisions, recurring issues, key
  evidence, unresolved risks, re-import history, and a recommended
  next session. Carries a typed `dataBasis` flag so the page never
  overclaims its reach.
- **Consolidation Review.** A user-triggered surface that turns live
  aggregation rows into typed `MemoryProposal[]`. The user reviews
  each proposal — accept / edit / discard / keep-watching / defer —
  and clicks Apply.
- **Accepted Memory.** Approved proposals persist as durable
  `StoredAcceptedProjectMemory` rows with an append-only audit trail.
  Today this lives in browser localStorage; SQLite mirroring and
  `.mori v0` export are designed but not implemented.
- **Resume Prompt / Reports.** A continuation prompt (audience- and
  privacy-aware) and Markdown / `.mori v0` reports are generated from
  the active session today and from accepted memory once the Resume
  and Report Memory Integration capability lands.
- **continue work.** The user pastes the prompt into Claude / Codex /
  ChatGPT, hands the report to a teammate, or starts the next CLI
  run. The loop repeats.

## 4. Implemented Capabilities

This section is verified against the repository at the time of writing
and reflects what is real today. Where the implementation is partial,
that is called out.

**Import and Evidence Foundation**

- Connector JSONL import (paste + desktop inbox at
  `~/.mori/connectors/` in Tauri mode).
- AI Transcript import (Claude / ChatGPT / Codex / other).
- Git Diff import (pasted unified diff, plus Tauri-side `git diff`
  capture against an explicitly added repo path).
- Manual Note import.
- URL import (URL + optional excerpt; no automatic fetch).
- Session creation flow (새 세션) that realizes "one AI-agent conversation =
  one session". An agent-first screen with the roster derived from the central
  `src/lib/agents/agentRegistry.ts` (currently seven anchor agents: Claude /
  Codex / OpenCode / Antigravity / Continue / Cline / Cursor), where the
  conversation enters by one of three methods: 기록에서 불러오기 (a desktop-only
  auto-detected work-record browse modal with a content preview) — each agent has
  a read-only Rust discovery reader over that tool's own local store (Claude Code
  JSONL + Claude Desktop SQLite, Codex `~/.codex`, OpenCode
  `~/.local/share/opencode/storage`, Antigravity generated-transcript logs,
  Continue `~/.continue/sessions`, Cline VS Code globalStorage tasks, Cursor
  `state.vscdb` `cursorDiskKV`); Codex and OpenCode also accept the connector
  inbox as a fallback. See `src/lib/agents/workSessions.ts` and
  `src-tauri/src/{claude,codex,antigravity,opencode,continue_agent,cline,cursor}/`.
  The other two methods are 붙여넣기 (paste a transcript, platform follows the
  agent), or 빈 세션으로 시작 (anchor first, since Mori never starts or drives
  the agent). Retention is one unified rule (summary + metadata only, no
  per-session toggle). Detected / pasted imports that create a **new** session
  now materialize immediately (`importAndOpenAsNewSession`): the deterministic
  parse is applied at once and the session opens populated, with no Import
  Review gate in front of evidence display. Import Review remains the gate for
  adding evidence to an existing session and for other evidence families; the
  durable-memory gate (consolidation) is unchanged. See
  `docs/design/import-into-evidence-tab.md`. Owned by `src/features/start-session/`
  (`StartSessionView` + `DetectedConversationsModal`).
- Repository settings with explicit user-added paths, optional
  on-demand `verify_repository_path` Tauri command, and verification
  freshness labels (no background re-verification).
- `SourceRef` with typed `trustLevel`, `redactionStatus`,
  `rawRetention`, and `relatedEventIds`.
- File provenance from agent tool calls. The Claude Code reader preserves
  structured `tool_use` file payloads as `ClaudeFileTouch` /
  `SourceRef.fileTouches` (`src-tauri/src/claude/code.rs`,
  `src/domain/types.ts`) instead of flattening them to rendered text, carried
  through import (`src/lib/claude/claudeImport.ts`). Pure rollup + filesystem
  reconciliation helpers (`src/lib/file-provenance/fileProvenance.ts`), Tauri
  `resolve_file_locations` (present / moved / missing, move detected by bounded
  basename search) + `reveal_path_in_os` (`src-tauri/src/files.rs`), per-file
  `+N / -M` line counts correlated from each tool call's
  `toolUseResult.structuredPatch`, and the "이 세션이 만진 파일" panel in Session
  개요 (`src/features/session/SessionFilesPanel.tsx`). Desktop + real-data
  gated; timeline glyphs (per-turn attribution) are a follow-up. See
  `docs/design/agent-work-visibility-vision.md`.
- Stable `connectorEventId` (`<connectorId>::<externalSession>::<eventId>`)
  for identity-based deduplication.
- Source-level re-import summary
  (`ConnectorSourceImportSummary`) surfaced in the Connector JSONL
  preview, the Import Review meta strip, and the Evidence Hub row +
  detail panel.
- Pure connector dedupe across the current session, saved sessions,
  and the incoming batch.
- Secret-pattern detection (`containsLikelySecret`) at import time.
- Work Bundle import (`buildWorkBundlePreview` + `addImportBatch` +
  `WorkBundlePanel`). Assembles several normalized candidates from one work
  session (transcript / Codex / OpenCode / git diff / terminal log / note)
  into a single composite preview — detected source families, work-context
  hint, proposed title, event / source / file counts, cross-source dedup,
  trust + capture-fidelity summary, redaction / secret flags, span, and a
  "what will be created" summary — then applies each source as its own
  session import so per-source provenance survives into the Evidence Hub and
  Timeline. The preview is the review-before-apply gate; no durable-memory
  gate is bypassed. See [work-bundle-import.md](work-bundle-import.md). As of
  the source-hub IA pass this is the **manual fallback** for assembling a
  session by hand; the canonical way to form a session is to import / continue
  an AI conversation (the spine), with other sources attached as evidence. The
  `WorkBundlePanel` is demoted to an advanced disclosure in the Connections
  hub.

**Connections Surface (연동)**

- 연동 page (`SourcesView`) is a calm provider grid (agents · evidence ·
  planned chips) with a right inspector, backed by the pure
  `buildSourceWorkspace` → `buildSourceProviderGroups` derivation. Anchor
  agents (Claude / Codex / OpenCode / Antigravity / Continue / Cline / Cursor)
  carry the 기록에서 불러오기 way-in; everything else attaches as evidence.
- The inspector surfaces each method's 읽는 것 / 읽지 않는 것 / 지원 형식 and
  its import action. For the docs-template methods (Code 훅 · CLI 래퍼 ·
  OpenCode · 터미널 브릿지 · MCP) it renders an inline **연결하기** block of
  copyable setup steps from `getConnectorSetupGuide`, plus an MCP
  server-staging affordance, so a method is never a dead end.
- Each anchor agent shows a live **연동 상태** block derived from
  `detect_connector_status` via the pure `sourceConnectStatus` mapping; the
  Claude config-hook offers in-place 연결 / 연결 해제 driven by the safe
  installer engine. Browser mode reports an honest desktop-only state.
- `detect_connector_status` covers all seven anchor agents: Claude Code
  (config-hook, hook present in `settings.json`?) and Codex / OpenCode /
  Antigravity / Continue / Cline / Cursor (session-discovery, how many
  sessions can Mori read back?). See
  [connectors/connection-surface.md](connectors/connection-surface.md) for the
  surface contract and the remaining roadmap.

**Timeline and Review Experience**

- Import Review with per-event accept / discard / edit and an
  explicit Apply to Timeline button.
- Timeline view with lanes, Flow Focus relationships, and a Trace
  panel.
- Event Inspector with trust / confidence / evidence / related items.
- Quick Pass analysis: three providers behind one settings → config
  mapping (`buildProviderConfigFromSettings` / `resolveQuickPassProvider`)
  — a deterministic rule-based provider (always available), an optional
  Ollama provider, and an OpenAI-compatible provider — each with optional
  deterministic fallback honestly labeled in the result. Settings persist
  the full provider configuration (`provider`, `ollamaEndpoint`,
  `ollamaModel`, `ollamaTimeoutMs`, `openAiBaseUrl`, `openAiModel`,
  `openAiApiKey`, `openAiTimeoutMs`, `fallbackToDeterministic`,
  `requestAbstractionModel`).
- AI engine settings console (`LocalAiCard`): a purpose-first engine
  picker, a per-engine config panel, a reachability probe, and a
  **capability check** (`checkQuickPassCapability`) that runs a fixed
  synthetic sample (never the user's data) through the real `analyze()`
  path and grades whether the engine returns Mori-shaped JSON
  (`ready` / `reachableNoStructure` / `failed`) with an actionable hint.
  A diagnostics strip, a folded recent-runs history, and device-local
  **engine presets** (`enginePresets.ts`, saved in localStorage) round
  out the surface.

**Reconstruction Lab (재구성)**

- A second, read-only timeline (the 재구성 tab in Session Detail) that
  reprojects a reviewed session into shapes the eye can read, leaving the
  흐름 swimlane untouched. Every lens is a pure derivation from the reviewed
  `MockSession` (`src/lib/timeline-lab/`, `src/features/timeline-lab/`).
- Five lenses: 서사 (a single narrative spine with the causal reason threaded
  between moments, pivotal moments led and routine runs folded), 국면 (the work
  arc read as time-ordered chapters, a stage may recur so a back-and-forth
  shows), 인과 (a cause → effect map laid out by causal depth), 계보 (the
  decisions as ADR-style cards: rationale, rejected alternatives, impact, and a
  예상 vs 실제 block when there is real downstream), and 맥동 (the session
  as vital signs: counts, phase mix, trust mix, issue resolution, activity
  momentum, and a carry-forward with a one-tap resume copy).
- A cross-lens filter (`filterSession`) that narrows the session once,
  upstream of whichever lens is active, with referential pruning so no lens
  is handed a dangling reference, plus a 맥동 → 서사 drill-down.
- The 인과 lens surfaces the causal backbone (the longest cause → effect
  chain), marks roots and outcomes, types and weights edges by relationship
  and confidence, flags contradictions as tension, and offers a 핵심 경로
  isolate toggle, all deferring to hover/pin chain tracing.
- The forward plan (a 계보 decision-lineage lens, a temporal 국면, 서사
  readability, a shared peek primitive, and more) is specified under
  `docs/design/` (start at `design/improvement-program-overview.md`). The
  lab's controls are not yet registered in `featureStatus.ts`; that is a known
  follow-up.

**Project Memory Consolidation**

- Live Project Memory aggregation
  (`buildProjectMemoryViewModel`) across active + saved sessions with
  a typed `dataBasis` flag and a warnings strip.
- Saved-session body loading from browser localStorage and (in Tauri)
  desktop SQLite via `loadProjectMemorySessions` —
  parallelised, non-mutating, capped at 20 sessions.
- Browser session memory body persistence
  (`StoredSessionMemoryBody`) with schema versioning and a one-time
  forward migration from saved analysis records.
- Cross-session aggregation: key decisions, recurring issues, key
  evidence, unresolved risks, recommended next session, re-import
  rollup.
- Project Memory resume prompt
  (`buildProjectMemoryResumePrompt`) with audience selector
  (`self / claude / codex / chatgpt / handoff`) and privacy modes
  (`normal / summaryOnly / clientSafe`). Pure local derivation, no
  LLM call.
- Consolidation Proposal Preview helper
  (`buildProjectMemoryConsolidationPreview`) producing typed
  `MemoryProposal[]` from `ProjectMemoryViewModel`.
- Consolidation State layer
  (`buildProjectMemoryConsolidationState`) consumed by the Memory
  page (counts, top kinds, data-basis badge, empty/partial reasons).
- Consolidation Review Surface (`ConsolidationReviewView`) — full
  review UI, grouped proposal cards, evidence inspector, per-proposal
  accept / edit / discard / keep-watching / defer / reset actions, and
  an Apply footer.
- Accepted Memory Persistence in browser localStorage
  (`StoredAcceptedProjectMemory` rows + `StoredMemoryReviewAction`
  audit rows via `BrowserDraftRepository.saveAcceptedProjectMemories`
  / `appendMemoryReviewAction` / `listMemoryReviewActions`).
- Accepted Memories card on the Memory page reading from the
  persisted store.
- Resume Prompt accepted-memory integration: the
  `buildProjectMemoryResumePrompt` builder consumes accepted
  memories under the `isResumeGuidanceMemory` inclusion policy.
  Eligible records (`accepted` / `edited`, `resumeEligible`,
  sensitivity-compatible) surface as a reviewed "Accepted project
  memory" guidance section that outranks the live aggregation;
  stale / contradicted / watching records surface only under
  Limitations.
- Reports accepted-memory integration: the `buildReportMarkdown`
  builder exposes a toggleable `consolidatedMemory` section gated by
  `isReportGuidanceMemory`, which combines the lifecycle gate with an
  audience-tier check (a memory's `reportEligibility` rank must meet
  the report type's personal / team / client tier).
- `.mori v0` accepted-memory slice: `MoriPackageV0` carries an
  optional, additive `consolidatedMemories` field. The Reports
  `.mori v0` export populates it from the project's accepted
  memories; it round-trips through serialize / deserialize and
  validation. Packages exported before the field existed load it as
  empty (`getPackageConsolidatedMemories`).
- `.mori v0` audit-trail slice: `MoriPackageV0` also carries an
  optional, additive `auditTrail` field. The Reports `.mori v0`
  export populates it from the project's `StoredMemoryReviewAction`
  log; it round-trips through serialize / deserialize and validation.
  Packages exported before the field existed load it as empty
  (`getPackageAuditTrail`). These rows are review history — importing
  a package never replays them.
- Memory Audit Trail UI: the Project Memory page renders the
  append-only `StoredMemoryReviewAction` log via the pure
  `buildMemoryAuditTrailViewModel` helper and `MemoryAuditTrailCard`
  — sorted newest-first, grouped by UTC date, filterable by action
  type. The surface never renders the `before` / `after` snapshots,
  so no raw evidence content is exposed.
- Reviewed revert flow: a revertible audit row carries a
  confirm-gated **Revert** affordance. `planMemoryReviewRevert` gates
  eligibility, `buildMemoryRevertProposal` produces a reviewable
  `MemoryRevertProposal`, and `applyMemoryRevertProposal` restores
  the memory's status and writes a `revert` `StoredMemoryReviewAction`
  — a revert is itself a reviewed action recorded in the same trail.

**Storage**

- `BrowserDraftRepository` for current-session drafts, session
  imports, analysis results, memory bodies, repository settings,
  Quick Pass settings, `.mori v0` package drafts, and accepted
  consolidated memory + audit rows.
- Desktop SQLite via `rusqlite` with migrations `V001` (initial
  schema), `V002` (connector identity column on `events`), `V003`
  (`consolidated_memories` + `consolidated_memory_audit` tables), and
  `V004` (`session_imports` table). Real save / load of projects,
  sessions, sources, events, issues, decisions, relationships,
  artifacts, next actions, and summaries.
- SQLite Accepted Memory Storage: the `consolidated_memories` and
  `consolidated_memory_audit` tables, the Rust persistence layer
  (`src-tauri/src/db/accepted_memory.rs`), four Tauri commands, and
  the TypeScript bridge (`src/lib/sqlite/acceptedMemoryRows.ts`)
  that converts between `StoredAcceptedProjectMemory` /
  `StoredMemoryReviewAction` and the flat SQLite rows.
- Runtime-aware accepted memory routing: `AcceptedMemoryRepository`
  (`src/lib/project-memory/acceptedMemoryRepository.ts`) routes the
  Consolidation Review apply path, the Project Memory page, and the
  Reports accepted-memory section — SQLite in Tauri desktop mode,
  localStorage in browser mode, with an honest, visible localStorage
  fallback when a SQLite call fails.
- SQLite session-import mirror: the `V004 session_imports` table, the
  Rust repository + `persist` / `list` / `list_all` Tauri commands,
  the `sessionImportRows` converters, and the runtime-aware
  `SessionImportRepository`. `loadConnectorImportHistorySavedSessionsAsync`
  feeds the connector preview, so desktop SQLite-saved sessions
  contribute to the connector re-import rollup like browser-saved
  sessions do.
- Stale Memory Review: `buildStaleMemoryProposals`
  (`src/lib/project-memory/staleMemoryReview.ts`) scans accepted
  memories and emits `staleMemory` proposals — supersession /
  retirement (high confidence), an explicit stale / revisit reviewer
  note (medium), or a next-session recommendation older than 30 days
  (low). Proposals only — no durable write. Merged into the
  consolidation preview via `buildProjectMemoryConsolidationState`.
- Contradiction Review: `buildContradictionProposals`
  (`src/lib/project-memory/contradictionReview.ts`) emits
  `contradiction` proposals when two or more current-guidance
  `promotedDecision` memories share a normalised title but record
  different summaries. Conservative deterministic heuristic — no LLM,
  no semantic matching — medium-low confidence, proposals only.
- Accepted memory lifecycle status: `StoredAcceptedProjectMemory`
  carries explicit `stale` and `contradicted` lifecycle statuses.
  Accepting a `staleMemory` / `contradiction` proposal transitions
  the referenced memory (or memories) — via `targetMemoryIds` — to
  that status instead of creating a detached record. Memories are
  never deleted; the transition is an append-only audit row with a
  before/after snapshot. Resume Prompt and Reports exclude stale /
  contradicted memories from guidance; Project Memory still shows
  them as non-current memory.
- `.mori` review-on-import: `buildImportedMemoryProposals` /
  `parseImportedMemoryProposals`
  (`src/lib/project-memory/importedMemoryReview.ts`) convert a
  `.mori v0` package's `consolidatedMemories` into reviewable
  proposals, deduplicated against the project's existing accepted
  memories by `originProposalIds` overlap or shared normalised title.
  The Consolidation Review Surface carries an "Import accepted memory
  from a .mori package" panel — paste the package JSON or pick a
  `.mori` file (a native Open dialog on desktop via
  `pick_mori_package_file`, the browser `File` API otherwise). Picked
  bytes are routed by the `PK` zip magic: a real `.mori` zip is
  unzipped + validated (`parseImportedMemoryProposalsFromZip`),
  anything else is read as JSON. Imported memory is never
  auto-merged; it enters the review list and only becomes durable
  through the normal accept / apply path.
- Queryable Memory: `searchAcceptedMemories`
  (`src/lib/project-memory/queryableMemory.ts`) runs deterministic
  local structured search over accepted memories — text matching on
  title / summary / evidence refs / source session ids, plus
  kind / status / sensitivity / eligibility filters. Title-ranked,
  evidence-ref cited, no embeddings or LLM. Non-current memory
  (`stale` / `contradicted` / `superseded` / `retired` / `watching` /
  `deferred`) is searchable but flagged `isCurrent: false`. The
  **Memory Search** card (`QueryableMemoryCard`) on the Project
  Memory page is the compact search surface, including a "Related
  references" section that searches the active session's timeline
  events, evidence sources, and Memory Audit Trail review-action
  notes via `searchProjectMemoryReferences`.
- `SessionPersistenceService` routes between browser localStorage
  and the Tauri SQLite bridge. Desktop mode prefers SQLite as the
  source of truth for active session hydration; Load actions for
  saved SQLite sessions are wired through
  `useMoriSessionStore.loadDesktopSession`.

**Resume and Report Outputs**

- `.mori v0` JSON serialization / deserialization plus Tauri
  save / open commands.
- Real `.mori` zip package — `fflate`-backed `zipMoriPackage` /
  `unzipMoriPackage` archive the canonical one-file-per-slice layout
  into a real `.mori` zip. The Reports export writes it (desktop
  `save_mori_package_zip_as` Save As dialog or a browser zip blob);
  the Consolidation Review import panel reads it back, routing picked
  bytes by the `PK` zip magic, with validation and review-on-import.
- Reports page with Markdown report builder and `.mori` package
  export — a normal export and a client-safe export
  (`buildClientSafeMoriPackage`, only `clientSafe` / non-sensitive
  memory) for handing a package to a non-teammate.
- End-to-end smoke flow documented and guarded by a fixture test
  (`src/lib/connectors/connectorSampleFixture.test.ts`).

**Companion Layer**

- Companion Signals (`src/lib/companion/companionSignals.ts`) — a
  local, evidence-based assistance layer. `buildCompanionSignals`
  is a pure helper that derives a prioritised, capped set of
  signals from the active session (demo-mode notice, real-session
  import gap, weak-evidence inferred issues, decisions needing
  review, open issues, next actions, important decisions,
  ready-to-report, ready-to-resume). Each signal carries a
  severity, an honest `basis` (verified / inferred / mixed /
  state), linked item ids, evidence refs, and a destination. The
  `CompanionCard` ("Mori 노트") surfaces the top signals on the
  Reports page. The Companion Layer never watches the user, never
  writes memory automatically, and never copies raw source /
  transcript text into a signal. It only re-surfaces data the
  user has already imported and reviewed.
- Notification Center (in-app). A producer-neutral notification
  seam (`src/lib/notifications/`) renders one calm cross-session
  feed in two places: the sidebar bell, which opens a right-side
  drawer anchored to the sidebar edge, and the 알림 page, a
  time-grouped inbox (오늘 / 이번 주 / 이전). `MoriNotification` is
  the shared record and `composeNotifications` merges ordered
  producers (deduplicated by id), so adding a producer is a
  one-line registration rather than a fan-out across consumers.
  Producers today: the Companion adapter
  (`companionSignalToNotification`, active-session triage), the
  cross-session feed (`buildSessionFeedNotifications`, one
  timestamped event per stored session), plus import-finished,
  package-export, and memory-health producers. Read state lives in
  `useNotificationReadStore` (localStorage
  `mori.notifications.read.v1`), so the bell badge is an honest
  unread count capped at `9+` and "모두 읽음" clears it. Every
  notification still obeys the Companion rules: derived from
  already-reviewed data, an honest `basis`, no raw source text, and
  an `evidenceRefs` trace when one exists. OS-native notifications
  (an OS-level ping) remain planned; a chatbot / avatar is a
  non-goal.

**Home and Project Workspace**

- Home overview (`HomeView`) with a contribution heatmap, metric lens
  toggle (세션 / 결정 / 미해결 / 다음 할 일), and an activity stat strip
  (세션 / 프로젝트 / 현재 연속 / 최장 연속 / 최근 활동). Recent sessions
  list and companion signals card.
- Shared `WorkActivityCard` (`src/components/activity/WorkActivityCard.tsx`)
  owns the full activity panel (header, `ContributionHeatmap`, stat
  strip) under the `.home-activity` CSS classes. Both Home and the
  project page render through this component so typography is identical.
  Home passes five metrics + the lens toggle; the project page passes
  four (no 프로젝트) and no toggle.
- Shared `ContributionHeatmap`
  (`src/components/activity/ContributionHeatmap.tsx`) renders the
  heatmap grid from `buildContributionGrid`. Callers differ only in
  timestamps and metric.
- Project Workspace page (`ProjectView`, `ViewKey: "project"`) with a
  hero (project name, full path, description), 2-column layout (left:
  activity card + synthesis section; right: sessions rail), and an
  inline accepted-memory list capped at six rows.
- Project management: user-created projects with create / edit / delete
  via `useMoriProjectStore`. Session-derived projects (discovered from
  `sourceLabel`) support rename + description but not delete.
  `projectDisplayName` resolves the display name from a user override
  or the raw key.
- Project activity stats (`buildProjectActivityStats`) computing
  sessions, currentStreak, longestStreak, lastActive from session
  timestamps. Colocated tests.
- Project synthesis (`buildProjectSynthesis` +
  `useProjectSynthesis` hook) producing a cross-session roll-up of
  decisions, open issues, and pending next actions. The synthesis
  section renders each group as boxed `MoriObjectRow` items in the same
  compact row format as the sessions rail. Per-group counts are inline
  labels, not a separate band or chart.
- Workspace browser (`WorkspaceView`, `ViewKey: "workspace"`) listing
  all projects, session counts, and a "new project" action.
- Primary navigation reduced to 홈 / 소스 / 프로젝트. 메모리 is no longer
  a standing sidebar tab; durable project memory lives on each project
  page. The memory overview and consolidation review remain routable
  through a project's action and the command palette.

If something in this list does not match repo reality, treat the
mismatch as a documentation bug and update this section rather than
silently relying on memory.

## 5. Current Gaps

These capabilities are designed but not yet implemented. Verified
against the repository.

- **Hook / wrapper auto-emit connectors.** The explicit local-capture
  bridge (`mori-local-capture.py` — transcript / stdin / note /
  git-repo / git-commit) is shipped and tested; running it explicitly
  is the intended model. A Claude Code hook or Codex CLI wrapper that
  emits connector JSONL as a side effect of normal use (still
  explicit, no watcher) is template-only, not a turnkey integration.
- **IDE / terminal / browser extension integrations.** The
  explicit-capture design is documented in `source-integrations.md`
  and the first artifacts ship — `connectors/vscode-task/` (a VS Code
  Run Task template) and `connectors/terminal-helper/` (a
  `mori-capture` shell function), both wrapping `mori-local-capture.py`.
  A real editor / browser extension does not exist yet.
- **Optional watched inbox.** Refresh-only desktop inbox is shipped;
  an opt-in background watcher that loads new files into a "pending
  review" tray is not implemented.
- **Team / shared memory.** The design is specified in
  `docs/team-shared-memory.md` (roles, privacy boundaries,
  client-safe export rules, conflict / duplicate review model). No
  code beyond the explicit `.mori` package round trip yet — the
  client-safe filter and handoff workflow are later slices.

## 6. Product Principles

Non-negotiable. These hold across every feature in every milestone. If
a feature would violate one of them, it does not ship as-is — it goes
back to design first.

- **Local-first.** No cloud sync by default, no OAuth, no external
  account reading, no remote authority over the user's memory.
- **Explicit import / capture.** Every artifact enters Mori through a
  user action: paste, click, or explicit file pick. No hidden background
  watcher, no scheduled job. The one narrow exception is the opt-in,
  transparent, review-gated background reader of explicitly-connected
  logs (the "B" surface in the Surveillance line note); it still never
  makes memory durable without review.
- **Review-before-apply.** Import Review and Consolidation Review are
  non-bypassable gates. AI may propose; only the user can make memory
  durable.
- **Evidence is the source of truth.** Imported `SourceRef`s and
  `TimelineEvent`s are ground truth. Everything else (Quick Pass
  issues / decisions, Project Memory aggregations, consolidated
  memories, Resume Prompts) is a reviewable proposal layered on top.
- **AI interpretation is a proposal.** AI output is editable,
  discardable, deferable, and never silently authoritative.
- **Provenance preservation.** Every derived item carries an evidence
  reference back to the originating `sourceEventIds` /
  `relatedSourceIds` / `connectorEventId`.
- **User correction is first-class.** The user can accept, edit,
  discard, defer, keep-watching, mark-stale, supersede, or split /
  merge any AI-derived item.
- **Honest implementation status.** Docs, UI, and code clearly
  distinguish Implemented / Partial / Planned / Unavailable /
  Reference-only. No fake connected states. No fake "AI thinking"
  spinners while nothing runs.
- **Privacy-aware defaults.** Secret-pattern detection at import,
  `rawDataPolicy` per source, redaction-aware Resume Prompt modes,
  and a "what never enters durable memory" list (raw credentials,
  API keys, passwords, private keys, OAuth tokens, session cookies,
  unredacted PII, full raw transcripts without retention policy,
  confidential client details not marked client-safe, AI claims
  without an evidence link).
- **No hidden capture.** No screen recording, no keylogger, no
  app-database scraping, no browser-history reading, no automatic
  external account reading, no reading the screen / filesystem / app
  storage the user never connected.

### Surveillance line: invasive capture (A) vs connected-source reading (B)

"Mori does not watch you" bans **invasive capture**, not all background
work. The earlier principle text collapsed two different things under one
word; this note disambiguates them so future surfaces are judged correctly.

- **A · Invasive capture.** Camera, screen recording, keylogging, scraping
  app databases / browser history / any source the user never connected.
  This touches the user's private space and creates security exposure. It
  is **banned forever, no exceptions.** This is what "no surveillance"
  actually protects.
- **B · Background reading of explicitly-connected agent logs.** While the
  Mori app is **running** (it may be minimized or unfocused), reading the
  Claude / Codex / OpenCode session records the user *already chose to
  connect*, to surface a "work finished" signal. This is **not A** and is
  not categorically forbidden. It is the OS-notification extension of the
  already-decided foreground Live Follow
  (`design/local-llm-understanding-and-live-follow.md` §3.1). A reader that
  runs **while the Mori app is fully closed** (tray-resident, autostart) is
  not B; it stays a separate, identity-changing decision and a non-goal here.

B is permissible only when **all three rails** hold. Absent any one, it
falls back to foreground-only:

1. **Scope.** Reads only sources the user explicitly connected. Never the
   screen, camera, or unconnected apps (A stays banned).
2. **Review-before-apply stays.** Background may *notice and notify*, never
   make data durable memory without the user's review.
3. **Transparency.** Explicit opt-in, an always-visible "watching / off"
   state, and one-tap off. It never hides in the tray.

Status: B is **designed, not built.** Today capture and live-follow are
foreground-only (session-scoped). A transparent, opt-in background reader is
a permissible future surface, not a shipped one.

## 7. Capture Strategy

**Immediate realistic path.** Add a Local Connector Capture Bridge
that turns live Claude / Codex / Git / CLI work into reviewable
evidence without surveillance:

- The user installs a small template script (Claude Code hook,
  Codex CLI wrapper, a terminal connector, a Git connector script)
  on their own machine. Templates live under `connectors/`.
- The script writes structured JSONL events to
  `~/.mori/connectors/<family>/*.jsonl` when the user runs Claude
  Code / Codex / a wrapped command.
- The user clicks **Refresh inbox** (Tauri) or pastes the JSONL
  (browser) inside the Connector JSONL tab. The Rust side restricts
  access to the inbox root and rejects symlink-escape /
  unknown-extension files.
- Parse / Preview runs automatically; Import Review remains an
  explicit click. The summary status tells the user whether the file
  is new, a partial re-import, or already imported.

**Later capture surfaces** (only after explicit opt-in):

- Mori CLI wrapper that produces canonical Connector JSONL for
  Claude / Codex sessions out of the box.
- IDE extensions (VS Code, Cursor) that send workspace events to a
  local Mori endpoint with explicit user consent and explicit scope.
- Terminal integration (shell history connector with redaction).
- Browser extension that explicitly adds the active tab / selected
  text to a session.
- Optional watched inbox: a Tauri-side service loads new
  `~/.mori/connectors/` files into a "pending review" tray. Review
  remains required.

**Avoid (non-goals).** Account scraping, hidden app database reading
(Claude Desktop SQLite, ChatGPT browser storage, arbitrary Cursor app
data outside the explicit composer-chat exception), global background
monitoring, screen capture, keylogging, automatic cloud sync,
scheduled consolidation jobs.

## 8. Memory Strategy

**Quick Pass extracts from a session.** Quick Pass runs against the
active session's imported events and sources, producing
`MoriAnalysisResult` (issues / decisions / relationships / next
actions / summary). Output persists per session as
`StoredSessionAnalysis` plus a durable `StoredSessionMemoryBody`
snapshot. The deterministic provider is always available; the Ollama
provider is opt-in and falls back to the deterministic path on
failure, honestly labeled in the result.

**Project Memory aggregates across sessions.**
`buildProjectMemoryViewModel` produces a typed view model from the
active session, browser-saved session metadata + imports, desktop
SQLite-saved session metadata, loaded saved-session bodies, and
stored `.mori v0` packages. Carries a `dataBasis` flag
(`activeSessionOnly` / `activePlusSavedSessions` /
`savedSessionMetadataOnly` / `partialSavedSessionLoad` /
`unavailable`) so the Memory page never overclaims its reach.

**Consolidation proposes durable project memory.** The
Consolidation Proposal Preview helper turns the view model into
typed `MemoryProposal[]` (`promotedDecision` / `recurringIssue` /
`keyEvidence` / `unresolvedRisk` / `nextSessionRecommendation`; with
`contradiction` and `staleMemory` reserved for the Stale Memory
Review and Contradiction Review capabilities). The Consolidation
Review Surface lets the user accept / edit / discard / keep-watching
/ defer each proposal, then Apply.

**Accepted Memory is reviewed and persisted.** Approved proposals
become `StoredAcceptedProjectMemory` rows with the ten-state lifecycle
(`proposed` → `accepted` → `edited` → `merged` → `discarded` →
`watching` → `stale` → `contradicted` → `superseded` → `retired`),
ADR-style decision fields for `promotedDecision` records, qualitative
confidence labels, and explicit sensitivity tags. An append-only
`StoredMemoryReviewAction` audit row is written for every state
transition.

**Memory Audit Trail.** Every accept / edit / discard / keep-watching
/ defer / apply / undo produces a `ReviewAction`. The filterable audit
log UI is shipped (`MemoryAuditTrailCard`). Revert is shipped:
`planMemoryReviewRevert` gates eligibility, `applyMemoryRevertProposal`
restores status and writes a `revert` `StoredMemoryReviewAction`
(history preserved, never deleted).

**Stale / contradiction review.** `buildStaleMemoryProposals` and
`buildContradictionProposals` emit `staleMemory` / `contradiction`
proposals. The Consolidation Review Surface presents these as review
tasks, not as AI verdicts. Accepting a proposal transitions the
referenced memory to `stale` or `contradicted` status. See Section 4
for implementation details.

**Resume / Reports integration.** The Resume Prompt and Reports
builders consume `AcceptedProjectMemory[]` under a conservative
inclusion policy: only `accepted` (and not stale / contradicted /
superseded / retired), `resumeEligible: true`, sensitivity-compatible
memories appear as current guidance. Stale / contradicted memories
appear only under a clearly labelled "Limitations / unresolved memory"
section. See Section 4 for the `isResumeGuidanceMemory` and
`isReportGuidanceMemory` implementations.

## 9. Data and Storage Strategy

- **Browser localStorage fallback.** The current default storage
  backend for drafts, session imports, analysis results, durable
  memory bodies, repository settings, Quick Pass settings, `.mori v0`
  package drafts, accepted consolidated memories, and the memory
  audit trail. Every record is keyed by a known prefix and
  schema-versioned where applicable.
- **Desktop SQLite (Tauri).** `rusqlite`-backed migrations under
  `src-tauri/migrations/` (currently `V001` and `V002`). Persists the
  active session snapshot (project + session + sources + events +
  issues + decisions + relationships + artifacts + next actions +
  summaries). `SessionPersistenceService` prefers SQLite as the
  source of truth in desktop mode.
- **Connector inbox.** `~/.mori/connectors/` is the only filesystem
  surface Mori reads beyond explicit user paste / file pick. Driven
  by an explicit Refresh button; canonicalised, 8 MB cap, allowed
  extensions only (`.jsonl` / `.ndjson` / `.log` / `.txt`), and
  symlink-escape rejected.
- **`.mori` package future.** Today exports are JSON. Future
  capability: zip-like `.mori v0` package with `consolidatedMemories[]`
  and `auditTrail[]` slices and a native file picker for Save / Open.
- **Schema versioning.** Every durable record carries an explicit
  `schemaVersion` where applicable. Unknown versions load as `null`
  rather than corrupting downstream consumers.
- **Raw data policy.** Per-source `rawRetention` (`retained` /
  `summaryOnly` / `redacted` / `notCaptured`). Per-event
  `rawDataPolicy` from connector events.
- **What must not be stored silently.** Raw connector JSONL beyond
  what the connector event retained, full raw transcripts without a
  retention policy, secret-shaped strings, file paths beyond what
  already exists on the `SourceRef`, AI claims without an evidence
  link, sensitive PII not required for the project, OAuth tokens,
  passwords, API keys.

## 10. UI / UX Direction

Mori is a calm productivity app. The product feel target:

- **Visual tone.** White / soft-gray base, purple accent, generous
  whitespace, subtle dividers. Comparable to Linear, Notion, Figma,
  or Apple's productivity surfaces — never game-like or
  notification-heavy.
- **Layout primitives.** Cards, inspectors, badges, timeline lanes,
  three-pane review surfaces (grouping rail / list / inspector).
- **Information density.** Compact but readable. Hero stats, status
  badges, and warnings strips communicate state at a glance.
- **Honesty surfaces.** Implemented / Partial / Planned / Unavailable
  status is visible wherever a feature is mentioned. Planned
  connector cards never open an import flow — they exist only so the
  user can inspect what each connector will and will not access.
- **No fake connected states.** A connector that needs the desktop
  app shows "requires the Tauri app" and the action stays disabled
  in browser mode.
- **No game-like UI for core work surfaces.** Activity surfaces
  (contribution heatmap, streak stats) are calm, informational context
  for the user's own review, not gamified badges, achievement trophies,
  or attention-seeking notifications. The in-app Notification Center
  stays a quiet glance, one cross-session feed behind the sidebar bell
  and the 알림 page with an honest unread count, never push toasts
  competing for attention.
- **Korean-first copy** in user-facing strings where the existing
  surfaces are Korean; new surfaces should match the surrounding
  copy.
- **Source overview is provider-level.** The 소스 page is a calm provider
  overview (one tile per Claude / Codex / OpenCode anchor agent and per
  ChatGPT / Git / 터미널 / 메모 / URL evidence source), with every import
  method, access detail, and action in the right inspector. It is never a
  flat list or
  table of import methods, and it carries no developer-facing data (file
  paths, backlog ids). See `docs/source-connection-backlog.md` for the full
  presentation contract.

## 11. Engineering Working Rules

Future coding sessions follow these rules. Treat them as durable
guardrails, not preferences.

- **Inspect the repo before changing code.** Read relevant docs,
  read the targeted source files, and verify what is implemented
  today. Do not rely on memory.
- **Write an audit before implementation.** For a non-trivial
  milestone, propose the smallest next change, list the files
  affected, and call out the validation plan. Get alignment with the
  user before writing code.
- **Prefer small milestones.** Each commit should leave Mori in a
  working state — capability buckets, not phase-numbered sweeps.
- **Avoid broad rewrites.** Don't refactor surrounding code unless
  the task requires it. A bug fix doesn't need cleanup.
- **Keep pure helpers tested.** Pure derivations (`buildXyz`,
  normalizers, aggregators) belong in `src/lib/<area>/` with
  colocated `*.test.ts` files. Vitest is the test runner.
- **Avoid brittle screenshot tests.** Mori does not run Playwright
  or pixel-diff tests. Prefer fixture-driven unit tests like
  `connectorSampleFixture.test.ts`.
- **Run targeted tests during iteration.** `npm run test:changed`
  or `npx vitest run <path>` for fast feedback.
- **Run full validation before commit.** `npm run check:full`
  (typecheck + full Vitest suite).
- **Run a build before handoff or milestone close.**
  `npm run check:release` (adds `npm run build`).
- **Use clean commit messages.** Short imperative subject, body that
  explains what changed and why. No emoji, no AI footer, no
  `Co-Authored-By: Claude …` lines unless the user explicitly
  requests them.
- **Do not push unless explicitly asked.** A green commit on `main`
  is not authorization to `git push`.
- **Do not start new milestones without approval.** Propose the
  next step and wait.
- **Concurrent autonomous loop awareness.** The Mori dev loop
  (`docs/mori-autonomous-loop.md`) edits the repo mid-session. HEAD
  moves under you. Stage only your own files by name (`git add
  <path>`), never `git add -A` or `git add .`. Verify
  `git diff --cached --name-status` before committing. If loop-edited
  files fail typecheck, verify your files are clean in isolation and
  commit only yours.
- **Shared CSS conventions.** `styles.css` is loop-hot (the
  autonomous loop edits it frequently). Avoid unnecessary changes
  there. The `.home-activity` class cascade owns activity-panel
  typography for both Home and Project; do not duplicate those rules
  or create per-surface overrides. New presentational components
  should reuse existing design-token classes before adding new ones.
- **Dead code.** `src/lib/project/projectActivity.ts` (the old
  sparkline helper) is dead code, imported only by its own test.
  It can be removed in a cleanup pass.

## 12. Validation Policy

- **During implementation.** Targeted tests
  (`npx vitest run <path>`) or `npm run test:changed` for fast
  feedback. Run `npm run check:quick` (typecheck + changed tests)
  when changing types.
- **Before commit.** Always `npm run check:full`. Both typecheck and
  full Vitest suite must pass.
- **Before handoff.** `npm run build` (covered by
  `npm run check:release`).
- **If `src-tauri/` changes.** Add `cargo check` and `cargo test`
  to the validation set. This environment may not have `cargo`
  available; if so, document the gap honestly rather than skipping
  silently.
- **Before commit.** Run `git diff --check` and `git status --short`
  to catch whitespace damage and accidental tracked-file changes.
- **Documentation-only milestones.** Run `npm run check:full` and
  `npm run build` anyway — both are cheap and catch markdown / link
  damage indirectly when the build pipeline depends on a doc.

## 13. Near-Term Roadmap

Capability-based buckets. Order is suggested; the user has the final
say. Each bucket should be verified against the current repo state
before starting.

**Shipped (verified in Section 4):**

- ~~Resume and Report Memory Integration~~. Shipped.
- ~~SQLite Accepted Memory Storage~~. Shipped (V003, V004).
- ~~Memory Audit Trail UI~~. Shipped (filterable log + revert flow).
- ~~Stale Memory Review~~. Shipped (`buildStaleMemoryProposals`).
- ~~Contradiction Review~~. Shipped (`buildContradictionProposals`).
- ~~.mori Package Accepted Memory Export~~. Shipped
  (`consolidatedMemories` + `auditTrail` slices, zip round-trip,
  review-on-import).
- ~~Queryable Memory~~. Shipped (`searchAcceptedMemories`,
  `QueryableMemoryCard`, related-references search).
- ~~Local Connector Capture Bridge~~. Shipped. In-app setup guides,
  live per-anchor connection status, in-place Claude hook connect /
  disconnect, seven-anchor detection, template-sample Import Review
  draft round-trip tests, generated `mori-local-capture.py` smoke test,
  terminal-helper classification, and POSIX Claude / Codex / OpenCode
  wrapper smoke tests are all in place. See
  [connectors/connection-surface.md](connectors/connection-surface.md)
  and
  [connectors/connection-long-term-plan.md](connectors/connection-long-term-plan.md).

**Remaining:**

1. **CLI Wrapper for Claude / Codex workflows.** A small `mori` CLI
   that wraps `claude` / `codex` invocations and writes canonical
   Connector JSONL, removing the need to install template scripts
   manually.
   - *Progress:* the first `connectors/mori-cli/mori.py` scaffold ships
     `mori capture note`, `mori capture transcript`, and `mori capture git`
     by delegating to `mori-local-capture.py`, with generated-output smoke
     coverage through the Import Review draft boundary. `mori capture commit`
     is covered too, and symlink invocation as `mori` is documented and
     tested. `mori run --connector codex/opencode -- <command...>` delegates
     to the hardened POSIX wrappers and is smoke-tested with stub binaries.
     Setup guides now prefer the Mori CLI commands with raw scripts as
     fallback. Desktop staging (`stage_mori_cli`) embeds the CLI and delegate
     scripts into `~/.mori` and exposes a Mori CLI 준비 action in setup guides.
     Still open: package-manager style PATH install remains a manual user
     step.
2. **IDE / Terminal Integration.** VS Code / Cursor extension
   sending workspace events to a local Mori endpoint with explicit
   opt-in and scoping. Terminal integration: a shell-history
   connector with redaction.

Before starting any milestone, the agent must verify the bucket is
still the smallest valuable next step and get user approval.

## 14. Explicit Non-Goals

The following must not be built or promised until the user
explicitly reprioritises them:

- Invasive background surveillance: screen recording, keylogging,
  camera access, or watching the screen / filesystem / app storage the
  user never connected. (This is the "A" ban in Section 6. It does not,
  by itself, forbid a transparent, opt-in, review-gated background reader
  of explicitly-connected agent logs, the "B" surface; see the
  Surveillance line note.)
- Account scraping (OAuth, API-key access to Claude / ChatGPT /
  Codex / external services).
- Cloud sync by default. Cross-device memory is `.mori v0`
  export / import only.
- Automatic external account reading.
- Reading Claude Desktop SQLite, ChatGPT browser storage, arbitrary
  Cursor app data outside the explicit composer-chat exception, or any
  third-party app's private storage. The Cursor exception is narrow:
  user-invoked, read-only, `composerData:*` chat rows only, and still
  review-before-apply.
- Unreviewed memory writes. AI proposes; user disposes.
- Autonomous agent daemon that makes memory durable or takes action
  without review ("Mori figures it out for you in the background"). A
  background process that only reads explicitly-connected logs and
  surfaces a notification, with review-before-apply intact, is the "B"
  surface in Section 6, not this.
- Full browser extension. Browser context is paste / URL today.
- Team / shared memory beyond explicit `.mori v0` export.
- Embeddings / vector DB as the source of truth. Mori uses
  structured evidence-linked memory. Vector retrieval can return as
  an optional research layer over accepted memory, never as the
  primary store.
- Google ADK / Gemini / cloud-LLM hard dependency. Local LLM
  (Ollama / LM Studio / OpenAI-compatible) is optional.
- Multimodal ingestion (image / audio / video / PDF) as a core
  capability. Text + structured connector events are enough today.
- Session Canvas / Workroom UI, unless explicitly reprioritised.
  The data model would still come from existing `TimelineEvent` /
  `SourceRef` / `Review` / connector-import-history records, but no
  UI ships today.
- Pixel-agent UI / game-like surfaces for core work.
- Always-on memory writes triggered by a timer.

## 15. How Future Sessions Should Use This Document

When a new AI coding session opens against Mori:

1. **Read this document first.** It is the canonical project goal,
   working rules, validation policy, and capability roadmap.
2. **Inspect current repo state.** Run `git status --short`,
   `git log --oneline -10`, and read the docs and source files
   relevant to the proposed task. Verify the Implemented /
   Current Gaps sections above against reality and update them if
   they have drifted.
3. **Propose the smallest next milestone.** Match the proposal to a
   capability bucket in the Near-Term Roadmap or call out why a
   different bucket is more valuable now.
4. **Get user approval before starting.** Do not begin
   implementation, do not refactor, do not write production code
   until the user agrees to the proposed milestone and scope.
5. **Implement in small steps with green validation.** Follow the
   Engineering Working Rules and the Validation Policy. Run targeted
   tests during iteration; run `npm run check:full` before commit;
   run `npm run check:release` (or at least `npm run build`) before
   handoff. If `src-tauri/` changes, add `cargo check` and
   `cargo test`.
6. **Commit with a clean message and do not push** unless the user
   explicitly asks. No AI footer, no `Co-Authored-By`.
7. **Stop after each milestone.** Report what shipped, link any
   contradictions discovered against this doc or the companion
   docs, and wait for the next instruction.

This document is durable. Update it when the implementation status
actually changes — never to record speculative plans.
