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
- Repository settings with explicit user-added paths, optional
  on-demand `verify_repository_path` Tauri command, and verification
  freshness labels (no background re-verification).
- `SourceRef` with typed `trustLevel`, `redactionStatus`,
  `rawRetention`, and `relatedEventIds`.
- Stable `connectorEventId` (`<connectorId>::<externalSession>::<eventId>`)
  for identity-based deduplication.
- Source-level re-import summary
  (`ConnectorSourceImportSummary`) surfaced in the Connector JSONL
  preview, the Import Review meta strip, and the Evidence Hub row +
  detail panel.
- Pure connector dedupe across the current session, saved sessions,
  and the incoming batch.
- Secret-pattern detection (`containsLikelySecret`) at import time.

**Timeline and Review Experience**

- Import Review with per-event accept / discard / edit and an
  explicit Apply to Timeline button.
- Timeline view with lanes, Flow Focus relationships, and a Trace
  panel.
- Event Inspector with trust / confidence / evidence / related items.
- Quick Pass analysis: deterministic heuristic provider (always
  available) and an optional Ollama provider with deterministic
  fallback. Settings persist provider configuration (`provider`,
  `ollamaEndpoint`, `ollamaModel`, `ollamaTimeoutMs`,
  `fallbackToDeterministic`).

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

**Storage**

- `BrowserDraftRepository` for current-session drafts, session
  imports, analysis results, memory bodies, repository settings,
  Quick Pass settings, `.mori v0` package drafts, and accepted
  consolidated memory + audit rows.
- Desktop SQLite via `rusqlite` with migrations `V001` (initial
  schema) and `V002` (connector identity column on `events`). Real
  save / load of projects, sessions, sources, events, issues,
  decisions, relationships, artifacts, next actions, and summaries.
- `SessionPersistenceService` routes between browser localStorage
  and the Tauri SQLite bridge. Desktop mode prefers SQLite as the
  source of truth for active session hydration; Load actions for
  saved SQLite sessions are wired through
  `useMoriSessionStore.loadDesktopSession`.

**Resume and Report Outputs**

- `.mori v0` JSON serialization / deserialization plus Tauri
  save / open commands.
- Reports page with Markdown report builder and `.mori v0` export.
- End-to-end smoke flow documented and guarded by a fixture test
  (`src/lib/connectors/connectorSampleFixture.test.ts`).

If something in this list does not match repo reality, treat the
mismatch as a documentation bug and update this section rather than
silently relying on memory.

## 5. Current Gaps

These capabilities are designed but not yet implemented. Verified
against the repository.

- **Local Connector Capture from real Claude / Codex / Git work.**
  Connector JSONL templates exist under `connectors/`, but a tested,
  reliable bridge that captures live Claude Code / Codex CLI / Git
  activity into `~/.mori/connectors/` for a real workflow is not
  shipped. The user must still run the template scripts manually.
- **Resume and Report Memory Integration.** The Resume Prompt and
  Reports builders consume live `ProjectMemoryViewModel` only.
  Accepted memories do not yet outrank live aggregation rows, and
  the `.mori v0` package does not yet carry a `consolidatedMemories`
  slice.
- **SQLite Accepted Memory Storage.** `consolidated_memories` and
  `consolidated_memory_audit` tables, the Rust migration, and the
  load / store command surface are designed but not implemented. No
  rows exist in `src-tauri/migrations/` or
  `src-tauri/src/db/` for accepted memory today.
- **`.mori` Package Accepted Memory Export / Import.** Designed; not
  implemented.
- **Memory Audit Trail UI.** Append-only review actions are
  persisted in localStorage today, but there is no filterable audit
  log surface. A minimal "Memory로 돌아가기" success banner is the
  only post-Apply feedback.
- **Undo / revert from the audit log.** Designed (a new
  `ReviewAction` row with `actionType: "revert"`) but not
  implemented.
- **Stale Memory Review.** `staleMemory` is reserved on the proposal
  kind union but the Consolidation Proposal Preview helper does not
  emit it yet.
- **Contradiction Review.** `contradiction` is reserved on the
  proposal kind union but the helper does not emit it yet.
- **Queryable Memory.** No local natural-language query over
  accepted memory + evidence. Resume Prompt is the only synthesis
  surface today.
- **IDE / terminal / browser extension integrations.** Listed as
  Planned in `source-integrations.md`; no extension code exists.
- **Optional watched inbox.** Refresh-only desktop inbox is shipped;
  an opt-in background watcher that loads new files into a "pending
  review" tray is not implemented.
- **Team / shared memory.** No surface beyond the explicit `.mori v0`
  package round trip.
- **SQLite-side `importSummary` mirror.** Browser-saved sessions
  contribute to the re-import rollup; desktop SQLite-saved sessions
  cannot, and the Memory page surfaces this honestly as a warning.
- **Native file picker for `.mori v0`.** Save uses Mori's default
  storage directory; an Open / Save As picker for `.mori v0`
  files is not wired up.
- **`.mori` zip-like packaging.** Today exports are JSON, not zipped.

## 6. Product Principles

Non-negotiable. These hold across every feature in every milestone. If
a feature would violate one of them, it does not ship as-is — it goes
back to design first.

- **Local-first.** No cloud sync by default, no OAuth, no external
  account reading, no remote authority over the user's memory.
- **Explicit import / capture.** Every artifact enters Mori through a
  user action — paste, click, or explicit file pick. No background
  watcher, no daemon, no scheduled job.
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
  always-on daemon, no app-database scraping, no browser-history
  reading, no automatic external account reading.

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
(Claude Desktop SQLite, ChatGPT browser storage, Cursor internal DB),
global background monitoring, screen capture, keylogging, automatic
cloud sync, scheduled consolidation jobs.

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
/ defer / apply / undo produces a `ReviewAction`. A future UI will
expose a filterable audit log; Undo Apply will create a new audit row
with `actionType: "revert"` (history preserved, never deleted).

**Stale / contradiction review (planned).** The proposal helper will
detect pruned-source references and conflicting accepted decisions
and emit `staleMemory` / `contradiction` proposals. The Consolidation
Review Surface presents the detection as a review task, not as an AI
verdict.

**Resume / Reports integration (planned).** The Resume Prompt and
Reports builders will consume `AcceptedProjectMemory[]` under a
conservative inclusion policy: only `accepted` (and not stale /
contradicted / superseded / retired), `resumeEligible: true`,
sensitivity-compatible memories appear as current guidance. Stale /
contradicted memories appear only under a clearly labelled
"Limitations / unresolved memory" section.

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
- **No game-like UI for core work surfaces.** No streaks, no badges
  for usage frequency, no notifications competing for attention.
- **Korean-first copy** in user-facing strings where the existing
  surfaces are Korean; new surfaces should match the surrounding
  copy.

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

1. **Local Connector Capture Bridge.** Make the Claude Code hook,
   Codex CLI wrapper, terminal connector, and Git connector
   templates reliable on a real user workflow. Document setup,
   verify JSONL output round-trips through Import Review, and add
   fixture tests so regressions surface.
2. **Resume and Report Memory Integration.** Wire
   `StoredAcceptedProjectMemory` into the Resume Prompt builder
   (`projectMemoryResumePrompt.ts`) and the Reports builder under
   the inclusion policy: only `accepted` / current /
   sensitivity-compatible memories appear as guidance; stale and
   contradicted memories surface only under a clearly labelled
   limitations section.
3. **SQLite Accepted Memory Storage.** Add a migration
   (`V003__consolidated_memories.sql`) for
   `consolidated_memories` + `consolidated_memory_audit`, add the
   Rust command surface, and update `SessionPersistenceService` to
   prefer SQLite-backed accepted memory in desktop mode.
4. **Memory Audit Trail UI.** Filterable audit log surface (action /
   actor / timestamp / target memory / proposal) reachable from the
   Memory page. Add an Undo Apply action that writes a new
   `ReviewAction` with `actionType: "revert"`.
5. **Stale Memory Review.** Extend the Consolidation Proposal
   Preview helper to emit `staleMemory` proposals from pruned-source
   references, expired `reevaluationTriggers`, and status
   transitions detected by the cross-session aggregator.
6. **Contradiction Review.** Extend the helper to emit
   `contradiction` proposals when two accepted decisions disagree on
   a normalised title. Surface them as review tasks in the
   Consolidation Review Surface.
7. **.mori Package Accepted Memory Export.** Add a
   `consolidatedMemories[]` + `auditTrail[]` slice to `MoriPackageV0`
   with a schema bump. Import path re-enters memories as `proposed`
   so they pass through review again.
8. **CLI Wrapper for Claude / Codex workflows.** A small `mori` CLI
   that wraps `claude` / `codex` invocations and writes canonical
   Connector JSONL, removing the need to install template scripts
   manually.
9. **IDE / Terminal Integration.** VS Code / Cursor extension
   sending workspace events to a local Mori endpoint with explicit
   opt-in and scoping. Terminal integration: a shell-history
   connector with redaction.
10. **Queryable Memory.** Local natural-language query over accepted
    memory + evidence, with citations into Mori sessions. Pure local
    derivation first; optional LLM-assisted synthesis only against a
    user-chosen local endpoint.

Before starting any milestone, the agent must verify the bucket is
still the smallest valuable next step and get user approval.

## 14. Explicit Non-Goals

The following must not be built or promised until the user
explicitly reprioritises them:

- Background surveillance (filesystem watchers, daemons, screen
  recording, keylogging).
- Account scraping (OAuth, API-key access to Claude / ChatGPT /
  Codex / external services).
- Cloud sync by default. Cross-device memory is `.mori v0`
  export / import only.
- Automatic external account reading.
- Reading Claude Desktop SQLite, ChatGPT browser storage, Cursor
  internal databases, or any third-party app's private storage.
- Unreviewed memory writes. AI proposes; user disposes.
- Autonomous agent daemon ("Mori figures it out for you in the
  background").
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
