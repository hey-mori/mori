# Architecture

This document describes Mori's intended engineering architecture and the current frontend plus desktop-shell foundation. It does not claim that unfinished SQLite, capture, import, or LLM pieces are implemented.

The full module-by-module map (boundaries, shared concepts, data flow,
extension paths) lives in [Modular Architecture](modular-architecture.md).
The product loop, feature-status policy, data pipeline contract, and theme
system are documented in:

- [Product Flow](product-flow.md)
- [Feature Status](feature-status.md)
- [Data Pipeline](data-pipeline.md)
- [Theme System](theme-system.md)

## Current Foundation

The current repository is a React + TypeScript + Vite frontend foundation with a Tauri v2 desktop shell and typed domain model.

Current implementation includes:

- React app entry under `src/main.tsx`
- App shell and view state in `src/app/`. Includes the feature-status registry (`featureStatus.ts`) and the unified session lifecycle snapshot (`sessionLifecycle.ts`).
- Reusable layout/UI foundations under `src/components/`
- Domain types, constants, and mock data under `src/domain/`
- Pure helper logic under `src/lib/`
- Tailwind CSS v4 Vite integration plus custom CSS tokens/styles
- Feature views under `src/features/`
- Tauri v2 shell under `src-tauri/`
- Runtime-aware desktop command bridge under `src/lib/desktop/`
- Native `.mori v0 JSON` save/open/list commands
- Rust-native SQLite persistence under `src-tauri/src/db/` (migration runner, connection helper, repository, snapshot records) plus typed Tauri commands in `src-tauri/src/sqlite.rs`
- Frontend SQLite snapshot mapping, validation, repository, and reconstruct helper under `src/lib/sqlite/`, with a dedicated `useMoriSqliteStore` for desktop status

Rust validation runs locally via `cargo check` and `cargo test`. See [SQLite Persistence](sqlite-persistence.md) for the migration strategy, schema, and what still lives in browser localStorage.

## Intended Product Architecture

Mori's target architecture is:

- Tauri v2 desktop shell
- React frontend
- Rust backend
- SQLite local storage
- Local LLM providers
- `.mori` package format
- Browser extension later

The frontend should stay focused on presentation and interaction. Capture, persistence, package IO, import adapters, redaction, LLM calls, and export should live behind typed backend command boundaries.

## Suggested Repository Structure

Current structure:

```text
src/
  app/
  components/
  domain/
  features/
  lib/
  styles/

docs/
  product-spec.md
  ux-reference.md
  architecture.md
  roadmap.md
  domain-model.md
  assets/
```

Future structure:

```text
apps/
  desktop/
  extension/

packages/
  ui/
  timeline/
  core-types/
  prompts/
  mori-format/

crates/
  mori-core/
  mori-db/
  mori-llm/
  mori-capture/
  mori-package/
```

## Data Pipeline

```text
Input Capture
  -> Event Normalization
  -> Local Storage
  -> Redaction
  -> Chunking
  -> Local LLM Summarization
  -> Timeline Generation
  -> Issue / Decision Extraction
  -> Relationship Mapping
  -> Resume Prompt / Report Generation
  -> .mori Package
```

Pipeline notes:

- Capture should be explicit and scoped to the active Mori session.
- Normalization should convert raw inputs into durable domain objects.
- Redaction should happen before long-term retention or report/export workflows.
- Local LLM analysis should produce inspectable, correctable outputs.
- Package export should preserve normalized records and selected evidence without hiding privacy choices.

## Frontend Boundaries

- `app`: app shell, route/view selection, cross-screen state, session-level UI state
- `components`: reusable layout primitives, UI controls, panels, buttons, badges, sidebars, headers
- `domain`: product data types, constants, mock data, event/source/session definitions
- `features`: product screens organized by primary pages:
  - `start-session`: Start Session setup flow
  - `timeline`: Timeline main view and Flow Focus
  - `evidence`: Evidence view (formerly Sources)
  - `review`: Review page with issues and decisions (formerly Issues/Decisions)
  - `reports`: Reports with resume prompts (formerly ResumeReport)
  - `memory`: Project Memory cross-session view (formerly Projects)
  - `settings`: Settings / Privacy / Local AI
  - `import`: Import panel (shared across features)
  - `flow-focus`: Flow Focus components (shared with Timeline)
- `lib`: pure logic such as timeline layout, relationship traversal, trust formatting, resume prompt generation, session status derivation
  - `session/sessionStatus.ts`: centralized helper that derives consistent demo/draft/analysis/persistence status labels and metrics for UI consistency across pages
  - `session/sessionTiming.ts`: pure helper that derives lifecycle state (demo / active / analyzing / draft / ended), duration labels, and the `isLive` flag that drives the TopSessionBar and Sidebar live timers
  - `evidence/`: trust display (`trust.ts`), provenance / capture-method labels (`provenance.ts`), and evidence joins (`sourceLinks.ts`). `lib/sources/traceability.ts` is a backward-compat barrel that re-exports these helpers
  - `reports/reportContext.ts`: pulls report data-basis + evidence summary + analysis provider + resume prompt into one snapshot
  - `memory/projectMemoryContext.ts`: project-memory scope snapshot (`scope`, `scopeLabel`, `isCrossSession`, `dataBasisLabel`, `scopeCaveat`) on top of the existing project-memory derivations
  - `timeline/timelineViewModel.ts`: builds the Timeline `RenderModel` (visible events, display items, lanes, range, ticks, layout, focused set) and the inspector's view model so React components never compute math inline
  - `timeline/timelineControls.ts`: typed registry of Timeline + Inspector controls with `implemented | planned | hidden` status. The toolbar and inspector read tooltips from here so no JSX hand-rolls planned-control copy
  - `timeline/relationshipPolicy.ts`: visibility policy and connector aggregation. Timeline mode hides connectors by default and only reveals a focused subgraph; Flow Focus widens to a 2-hop graph. Both modes aggregate parallel raw relationships into weighted connectors
- `styles`: tokens, themes, global CSS, Tailwind entry

### Page Responsibilities

| Page | Route | Primary Purpose | Key Components |
|------|-------|----------------|----------------|
| Start Session | `start` | Session initialization and configuration | StartSessionView |
| Timeline | `timeline` | Main narrative timeline reconstruction | TimelineView (mode=timeline) |
| Flow Focus | `flow` | Relationship-focused timeline view | TimelineView (mode=flow) |
| Evidence | `evidence` | Source and import management | EvidenceView, ImportPanel |
| Review | `review` | Issues, decisions, and next actions | ReviewView (Issue Garden + Decision Log) |
| Reports | `reports` | Resume prompts and report generation | ReportsView |
| Memory | `memory` | Long-term project session history | MemoryView |
| Settings | `settings` | All configuration surfaces | SettingsView |

Frontend screens should not know filesystem paths, SQLite details, LLM provider APIs, or package internals directly. Those should arrive as typed data from backend commands.

### Source Integration Registry

Mori's source integration architecture is centralized in `src/lib/sources/sourceRegistry.ts`, which defines all 20 source integrations (9 implemented, 11 planned) with complete metadata:

- **Integration Status**: `implemented`, `partial`, `planned`, `mockOnly`, or `unavailable`
- **Capture Mode**: `manual`, `explicitImport`, `desktopCommand`, `plannedConnector`, or `mock`
- **Trust Level**: `verified` (user-provided), `observed` (Mori-captured), or `inferred` (analysis-generated)
- **Raw Data Policy**: `retained`, `summaryOnly`, `redacted`, or `notCaptured`
- **Privacy Note**: Clear boundaries about when and how Mori accesses data

**Implemented Integrations**: manualNote, url, aiConversation, claudeTranscript, chatgptTranscript, gitDiff, tauriGitDiff, repository, quickPass

**Planned Integrations**: terminal, fileSystem, editor, vscode, cursor, browserTab, codexTranscript, docs, slack, figma, notion

### AI Transcript Import Flow

The AI Transcript import is the first paste-based AI evidence path that
preserves source/event provenance end to end:

```text
Evidence Import Panel (ImportPanel.tsx, AI 대화 tab + platform dropdown)
  -> normalizeAiTranscript (src/lib/import/normalizeAiTranscript.ts)
  -> SourceRef (claudeTranscript | chatgptTranscript | codexTranscript | aiConversation)
     + TimelineEvent (type: "aiConversation", trustLevel: "verified")
  -> Timeline Inspector / Review / Reports (existing source-traceability helpers)
  -> Persistence (browser draft + .mori package + SQLite snapshot)
```

The platform dropdown decides the integration ID; the rest of Mori reads
provenance through the existing `SourceRef` traceability helpers in
`src/lib/sources/traceability.ts`. Direct AI-service connectors (Claude /
ChatGPT / Codex API or app integrations) remain explicitly planned, not
fake-active.

### Local connector capture foundation

External tools (Claude Code hooks, Codex CLI wrappers, git scripts,
terminal wrappers) feed Mori through a pure local pipeline. Nothing in
this pipeline is a daemon, none of it touches the network, and every
event passes through Import Review before reaching the session store:

```text
External tool (Claude Code hook | Codex CLI wrapper | git command | terminal | manual)
  -> writes JSONL line(s) to ~/.mori/connectors/<connector>/<date>.jsonl
  -> user opens Mori, Evidence Hub -> Connector JSONL tab
       Desktop (Tauri): clicks Refresh inbox -> picks a row ->
         src-tauri/connectors/inbox::list_connector_jsonl_inbox()
         src-tauri/connectors/inbox::read_connector_jsonl_file({path})
           (path canonicalised under ~/.mori/connectors/, 8 MB cap,
            symlink-escape rejected, allowed extensions only)
       Browser: pastes the JSONL contents into the textarea
  -> src/lib/connectors/parseConnectorJsonl(text)
       -> validateConnectorEvent (schema + kind-specific clusters)
  -> src/lib/connectors/jsonlPreview.buildConnectorJsonlPreview
       (typed snapshot: valid count, invalid lines, connector ids, event
        kinds, time range, project paths, warnings for secrets / missing
        session ids / unknown connector ids, PLUS new vs duplicate counts
        split by current-session / saved-session / in-batch sources via
        src/lib/connectors/connectorImportHistory. The Evidence Hub uses
        buildConnectorJsonlPreviewWithHistory and feeds it the active
        session view plus loadConnectorImportHistorySavedSessions() so
        cross-session detection survives reload.)
  -> src/lib/connectors/redaction.redactText
       (best-effort secret masking before persistence)
  -> Skip duplicates by default (preview.newEvents) unless the user opts
     into Include duplicates from the preview card.
  -> src/lib/connectors/normalizeConnectorEventBatch
       (buckets by (connectorId, sessionId), maps each event to an existing
        SourceKind, emits one SourceRef + N TimelineEvents per bucket,
        stamps connectorEventId on every produced TimelineEvent so the
        next import pass can detect duplicates. The identity persists
        through browser localStorage AND through SQLite via the
        events.connector_event_id column added in migration V002.)
  -> src/lib/connectors/connectorImportSummary.buildConnectorSourceImportSummary
       (derives the user-facing ConnectorSourceImportSummary
        — status: new | partialReimport | duplicateOnly |
        historyUnavailable | invalidOnly | unknown, default action,
        matched saved sessions, counts. Surfaced on the preview card,
        Import Review meta strip, and the Evidence Hub
        ImportedSourceRow / SourceDetailPanel. Optionally persisted on
        StoredSessionImport.importSummary so the row keeps its badge
        across reload.)
  -> src/lib/connectors/mergeForReview.mergeConnectorCandidatesForReview
       (collapses multi-bucket output into one composite candidate so the
        existing Import Review UI can host the whole batch in one draft)
  -> Import Review draft (Accept / Discard per item)
  -> useMoriSessionStore.addImport
  -> Timeline / Review / Reports / Project Memory
```

Honest scope rules baked into this milestone:

- The connector path reuses `claudeTranscript` / `codexTranscript` /
  `terminal` / `gitDiff` / `manualNote` from the source registry, plus
  the new `connectorJsonl` integration row used only for the Evidence
  Hub card. `vscode`, `cursor`, `browserTab`, `slack`, `notion`, `figma`,
  `fileSystem` etc. remain Planned.
- The pipeline is pure TypeScript with 0 IO. A future Tauri command can
  call `validateConnectorEventBatch` directly without changing the
  helpers.
- The UI surface today is a dedicated **Connector JSONL** tab in
  Evidence Hub: paste textarea, Parse / Preview button, preview card
  (counts, connectors, time range, warnings, line-tagged errors),
  Import to Review button. A native file picker is the next step.

#### Capture surface matrix

Alongside the schema, Mori exports a typed **capture surface matrix**
from
[`src/lib/connectors/captureSurfaces.ts`](../src/lib/connectors/captureSurfaces.ts)
that enumerates every paste / hook / CLI / desktop / web / IDE /
browser / GitHub / MCP surface with explicit `status` (Implemented ·
Partial · Manual-only · Docs-template-only · Planned · Unavailable).
Helpers group surfaces by family / status, look up the surface for a
registry integration id, and pick the single highest-value next
milestone.

Test invariants enforced at build time:

- `planned` surfaces cannot claim `canEnterImportReview`,
  `canCreateSource`, or `canCreateEvents`.
- `planned` surfaces cannot carry the `retained` raw data policy.
- Every row carries a non-empty `privacyBoundary` and at least one
  `whatMoriNeverAccesses` line.

Settings, Evidence Hub, and the screen-reference docs read from the
matrix rather than hand-rolling status copy. Companion docs:
[`docs/connectors/capture-surface-matrix.md`](./connectors/capture-surface-matrix.md),
[`docs/connectors/desktop-web-capture.md`](./connectors/desktop-web-capture.md),
[`docs/connectors/github-pr-import.md`](./connectors/github-pr-import.md).

The connector event schema was extended to match the matrix: the new
connector ids `terminalShell`, `gitCommand`, `desktopTranscriptImport`,
and `githubPrImport` join the original five, and the new event kind
`transcript_imported` slots into the existing AI-conversation
TimelineEvent type so pasted desktop / web transcripts flow through
every existing traceability helper without registry churn.

### Settings workspace

Settings is Mori's local-first trust surface. Every visible row comes
from a pure helper so the UI never invents status copy:

```text
useMoriSessionStore (analysisSettings + selectSessionView + hasAnalysis)
useMoriSqliteStore (available / kind / status / sessions / lastPersist)
useMoriRepositoryStore (settings / verifyingId)
  -> src/lib/settings/settingsStatus.ts
       (getProviderRows / getPrivacyPolicy / getStorageStatusRows /
        getPlannedConnectorRows / summarizeRepositories /
        getRecommendedSetupStep / statusLabelForIntegrationStatus)
  -> src/features/settings/
       SettingsView (5-tab nav + status strip + layout)
       LocalAiCard (provider cards + Ollama probe + endpoint/model/timeout/fallback)
       PrivacyDefaultsCard (Enforced / Default on / Planned status cards — no fake toggles)
       StorageCard (browser draft + SQLite + .mori v0 + Markdown + zip-planned)
       RepositoriesCard (summary badges + verify / select / rename / remove)
       PlannedConnectorsCard (every getIntegrationsByStatus("planned") row)
       TrustSummaryPanel (Runtime / Storage / Provider / Session grid +
         "what Mori accesses" + "what Mori never does" + recommended next step)
```

Every action the user can take ties back to an already-implemented store
(`updateAnalysisSettings`, `verifyRepository`, `persistSqlite`, etc.) so
no fake controls ship on this screen. Provider switching is restricted to
the two implemented providers (Deterministic, Ollama); LM Studio /
OpenAI-compatible / Cloud API render as Planned cards with disabled
"Planned" buttons.

The recommended-next-step button on the Trust panel navigates the user
through the seven-step setup chain (`import-source` → `run-quickpass` →
`save-to-sqlite` → `verify-repository` → `configure-ollama` →
`all-good`) and selects the matching tab so the user lands exactly on
the control that needs attention.

### Project Memory workspace

The Memory page surfaces accumulated project context. Its read path
deliberately stays single-session for aggregation today; cross-session
roll-ups are honestly Planned.

```text
useMoriSessionStore (selectSessionView)
useMoriSqliteStore (sessions / kind / refresh)
BrowserDraftRepository.listStoredSessions()
BrowserDraftRepository.loadMoriPackageDraft(sessionId)
  -> src/lib/project-memory/projectMemory.ts
       (deriveProjectMemoryStats / getRecentDecisions /
        getDecisionTimeline / getRecurringIssues / getKeyEvidence /
        getProjectMemorySummary / buildFollowUpPrompt /
        scopeLabelFor)
  -> src/features/memory/
       ProjectMemoryHero (stat tiles + Follow-up + Latest Report)
       DataScopeNote (mode + sqlite kind + saved session count)
       DecisionTimelineCard (chronological list, no chart lib)
       KeyEvidenceCard + RecurringIssuesCard
       RecentSessionsList (current + browser draft + SQLite)
       SavedReportsCard (.mori package drafts)
       ProjectMemorySummaryPanel (latest decision / risks /
         recommended next session / follow-up prompt + copy)
```

Honest scope rules baked into the page:

- Stats (`issueCount`, `decisionCount`, `nextActionCount`,
  `sourceCount`, `eventCount`) are always the **active session** only.
  The hero tile labels say so (`현재 세션 기준`, `Open N건`, etc.).
- `aggregatedSessionCount` is always 1 today. The hero shows
  `1건 집계 / N건 목록` so the user sees the difference between
  "sessions visible in the list" and "sessions whose data is rolled up".
- The scope caveat on the summary panel always re-explains what is
  *not* aggregated, including SQLite saved sessions and Quick Pass
  re-runs.
- `loadDesktopSession(sessionId)` is the only path that actually loads a
  saved-session payload. Clicking a SQLite row routes through that and
  then jumps to Timeline. Browser-draft rows route to Start Session
  because `BrowserDraftRepository` does not yet expose a load-by-id
  beyond the singleton `loadCurrentSessionDraft`.

### Reports workspace

The Reports page consumes every prior milestone's output (sources, events,
issues, decisions, next actions, Quick Pass analysis) and turns them into
a Resume Prompt + a live Markdown report + a `.mori v0` package export.
The flow:

```text
useMoriSessionStore (selectSessionView + analysis state)
  -> src/lib/report/resume-prompt.ts buildResumePrompt(view)
       (fallback when Quick Pass has not run)
  -> src/features/reports/ResumePromptCard
       (provider badge + copy-to-clipboard + copied confirmation)
  -> src/features/reports/SessionSummaryStrip
       (duration / sources / events / issues / decisions / next actions)
  -> src/features/reports/WorkContinuationCards
       (Next Actions, Open Issues, Recent Decisions, Resources)
  -> src/features/reports/ReportBuilderPanel
       -> src/lib/report/reportBuilder.ts buildReportMarkdown({
            type, sections, privacy, view, resumePromptOverride
          })
            -> live Markdown preview
            -> Markdown 복사 (clipboard) + .md 다운로드 (Blob)
       -> Format buttons: Markdown active, PDF + HTML disabled with
          "Planned" sublabel — these are honestly not implemented.
       -> Privacy toggles: clientSafe / excludeRawTranscripts /
          excludeSourceDetails. Full PII redaction is still a future
          milestone (the caveat is rendered below the toggles).
  -> .mori v0 JSON export keeps the existing
       createMoriPackageFromSession -> serializeMoriPackage -> Tauri save
       or browser Blob download path.
```

Quick Pass is never auto-run from Reports. The analysis strip exposes
Run / Re-run buttons that call the same `useMoriSessionStore.runQuickPass()`
entry point Evidence Hub and Review use.

The right-side Report Builder is the only place that mutates report
state. Choosing a report type sets default sections + default privacy
from `REPORT_TYPE_DEFINITIONS`; the user can override either axis
afterwards and the preview re-renders synchronously.

### Review workspace

Once accepted events land in the session via Import Review and a user
explicitly runs Quick Pass, the Review screen turns the analysis output
into a triage workspace. The flow is read-only today (state changes are
visibly disabled) but the read path already uses the full traceability
chain:

```text
useMoriSessionStore (selectSessionView)
  -> view.issues / decisions / nextActions
  -> src/lib/review-workspace/reviewWorkspace.ts
       (groupIssuesByStatus / getReviewSummary / getUnresolvedItems /
        pickDefaultReviewSelection / trust + priority + status tones)
  -> src/features/review/ ReviewView
       - 5-tab nav (Issue Garden, Decision Log, Next Actions, Unresolved, Suggestions)
       - sticky right column: ReviewDetailPanel + ReviewSummaryPanel
       - "Go to Timeline" link uses setSelectedEventId + setCurrentView
  -> src/lib/sources/traceability.ts
       (getIssueEvidenceSources / getDecisionEvidenceSources /
        getSourceDisplayStatus / getReportEvidenceSummary.dataBasis)
```

Quick Pass is never run from the Review screen automatically. The
analysis strip surfaces the current provider + generatedAt + counts and
exposes a "Run Quick Pass" button that calls
`useMoriSessionStore.runQuickPass()` — the same entry point Evidence Hub
uses, so there is exactly one analysis path.

Suggestions are gated behind `mode === "demo" || hasAnalysis`. Demo
sessions ship pre-baked `suggestedNextAction` strings inside mock issues;
real sessions only render suggestions after the user has explicitly run
Quick Pass.

### Import Review (review-before-apply)

AI Transcript and Git Diff imports route through Import Review before they
reach the session store. The flow:

```text
ImportPanel.handleAdd
  (kind === "ai" || kind === "git")
    -> useMoriReviewStore.startReview(candidate, origin)
         -> ImportReviewDraft { source, events: pending[], candidate, origin }
    -> EvidenceView swaps the Hub for <ImportReviewView />
         -> Accept / Discard / Edit per event card
         -> Apply footer (disabled until >= 1 accepted)
    -> useMoriReviewStore.apply((candidate) => addImport(candidate))
         -> buildAcceptedCandidate filters discarded events + applies edits
         -> useMoriSessionStore.addImport commits to the session
         -> Draft cleared, EvidenceView returns to the Hub with a banner
```

Cancel paths drop the draft without committing anything, so the original
import text never reaches the store. Manual Note and URL imports skip the
review and apply directly because they each produce exactly one user-typed
event. The Generated items column on Import Review stays empty by design:
Quick Pass is still the explicit session-wide pass for issues / decisions
/ next actions, and Import Review must not silently trigger it.

Pure logic for the review lives in `src/lib/review/reviewDraft.ts`
(create / set status / edit / counts / apply) and is fully covered by
`reviewDraft.test.ts`. The React surface (`src/features/review-import/`)
is a thin composition over those helpers + `useMoriReviewStore`.

**Traceability Helpers** (`src/lib/sources/traceability.ts`):
- `getSourceDisplayStatus()` — Integration label, status, capture method, trust label, raw data policy
- `getEventEvidenceSources()` — Sources for an event
- `getIssueEvidenceSources()` — Trace issue → events → sources
- `getDecisionEvidenceSources()` — Trace decision → events + direct sources
- `getBundleEvidenceSummary()` — Integration/trust mix for bundles
- `getReportEvidenceSummary()` — Full session evidence breakdown

**Evidence Flow**: Imports → SourceRef records → TimelineEvent sourceRefs → Issue/Decision sourceEventIds/relatedSourceIds → Report evidence summary

See [Source Integrations](source-integrations.md) for complete integration documentation, privacy boundaries, and implementation checklist.

## Backend Boundaries

Planned Rust/Tauri backend responsibilities:

- session persistence beyond the current package JSON shell
- project persistence
- SQLite access
- zip-like `.mori` save/open beyond the current JSON implementation
- import pipeline
- local LLM calls
- git diff import
- markdown export
- source retention and deletion
- redaction and privacy policy enforcement

Suggested command groups:

- `projects`: create/list/update/delete projects
- `sessions`: start/stop/list/load sessions
- `sources`: import AI conversations, browser URLs, manual notes, files, terminal summaries
- `analysis`: run local LLM analysis jobs and store generated records
- `timeline`: query events and relationships
- `exports`: generate Markdown first, PDF/HTML later
- `packages`: save/open `.mori` packages
- `settings`: manage providers, retention, privacy, and source preferences

## Local Storage

SQLite should store normalized Mori records:

- projects
- sessions
- sources
- events
- issues
- decisions
- relationships
- artifacts
- next_actions
- summaries
- settings
- redaction records

FTS5 can index event titles/summaries, source titles/details, issue descriptions, decision rationale, and generated summaries.

Current SQLite boundary:

- `src-tauri/migrations/V001__initial_schema.sql` defines the initial normalized schema and FTS5 tables.
- `src/lib/sqlite/records.ts` maps Mori domain objects to row snapshots.
- `src/lib/sqlite/snapshotValidation.ts` validates snapshot references and JSON-array columns before persistence.
- `src/lib/sqlite/desktopSqliteRepository.ts` sends validated snapshots through Tauri command boundaries.
- `src-tauri/src/sqlite.rs` registers command names and returns explicit not-implemented errors for real DB writes until `rusqlite` is added.

## `.mori` Package Format

The target `.mori` file should be a zip-like local package:

```text
project.mori
  manifest.json
  projects.json
  sessions.json
  events.jsonl
  issues.json
  decisions.json
  relationships.json
  artifacts.json
  sources/
  summaries/
  privacy.json
  theme.json
```

The package should distinguish raw evidence from normalized AI-derived records and should make retention/redaction decisions visible.

## Project Memory aggregation

Project Memory composes a cross-session view over already-persisted local
data (active session, browser-saved drafts, SQLite-saved metadata, stored
connector import summaries, `.mori v0` packages).

Pipeline:

```
useMoriSessionStore (active) ─┐
useMoriSqliteStore           ─┤
BrowserDraftRepository       ─┼─►  buildProjectMemoryViewModel  ──►  ProjectMemoryViewModel
StoredSessionImport.importSummary ┘                                        │
                                                                           ▼
                                                                 MemoryView.tsx (page)
                                                                 ReimportHistoryCard
                                                                 ProjectMemorySummaryPanel
```

Honesty rules baked into the architecture:

- `dataBasis` is computed from the *real* inputs (not a config), so the
  page badge cannot lie about reach.
- Saved-session bodies are loaded through
  `loadProjectMemorySessions` (non-mutating; SQLite via
  `SessionPersistenceService.loadSessionFromDesktop`, browser drafts via
  the repository). Cross-session decisions / issues / evidence aggregate
  only from sessions whose `loadStatus === "loaded"`. Metadata-only and
  failed sessions never produce decision / issue / evidence rows.
- `StoredSessionImport.importSummary` is the only cross-session
  contributor to the re-import rollup. Old imports without it never
  appear in the rollup.
- Loaded SQLite-saved sessions contribute decisions / issues /
  next-actions in addition to events / sources. Browser-saved sessions
  also contribute these fields when a `StoredSessionMemoryBody` is on
  disk (written after Quick Pass or via the one-shot
  forward-migration in `hydrate`). Browser sessions with neither a
  memory body nor an analysis stay metadata-only for issues /
  decisions / next-actions.
- The body loader caps reads at `DEFAULT_SAVED_SESSION_CAP = 20` and
  parallelises SQLite IPC calls with `Promise.allSettled` so a slow
  session can't block the page.
