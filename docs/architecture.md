# Architecture

This document describes Mori's intended engineering architecture and the current frontend plus desktop-shell foundation. It does not claim that unfinished SQLite, capture, import, or LLM pieces are implemented.

## Current Foundation

The current repository is a React + TypeScript + Vite frontend foundation with a Tauri v2 desktop shell and typed domain model.

Current implementation includes:

- React app entry under `src/main.tsx`
- App shell and view state in `src/app/`
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

Mori's source integration architecture is centralized in `src/lib/sources/sourceRegistry.ts`, which defines all 19 source integrations (7 implemented, 12 planned) with complete metadata:

- **Integration Status**: `implemented`, `partial`, `planned`, `mockOnly`, or `unavailable`
- **Capture Mode**: `manual`, `explicitImport`, `desktopCommand`, `plannedConnector`, or `mock`
- **Trust Level**: `verified` (user-provided), `observed` (Mori-captured), or `inferred` (analysis-generated)
- **Raw Data Policy**: `retained`, `summaryOnly`, `redacted`, or `notCaptured`
- **Privacy Note**: Clear boundaries about when and how Mori accesses data

**Implemented Integrations**: manualNote, url, aiConversation, gitDiff, tauriGitDiff, repository, quickPass

**Planned Integrations**: terminal, fileSystem, editor, vscode, cursor, browserTab, claudeTranscript, codexTranscript, docs, slack, figma, notion

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
