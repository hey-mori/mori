# Mori Modular Architecture

This document is the map of how Mori's code is organised, what each module owns,
where shared concepts live, and where new features should plug in.

## Module boundaries

```
src/
├─ app/              Zustand stores + cross-feature snapshots (the "session
│                    runtime"). Imports from `lib/` and `domain/` only.
│   ├─ store.ts                 - app-wide UI state (selection, filters)
│   ├─ sessionStore.ts          - persisted-session lifecycle
│   ├─ repositoryStore.ts       - saved repo paths
│   ├─ sqliteStore.ts           - desktop SQLite availability
│   ├─ reviewStore.ts           - import review draft state
│   ├─ featureStatus.ts         - feature catalogue (implemented/planned/…)
│   ├─ sessionLifecycle.ts      - unified session lifecycle snapshot
│   ├─ productFlow.ts           - product loop + surface rollups (audit layer)
│   └─ dataPipeline.ts          - typed pipeline contract + provenance records
│
├─ domain/           Plain data types + constants + mock data. No React.
│   ├─ types.ts                 - TimelineEvent, SourceRef, Decision, …
│   ├─ constants.ts             - eventTypeLabels, laneOrder, …
│   ├─ mock-data.ts             - moriMockSession
│   └─ backend-contracts.ts     - shared Rust ↔ TS contract types
│
├─ lib/              Pure logic. No React. Heavily tested.
│   ├─ analysis/                - Quick Pass providers + analysis types
│   ├─ connectors/              - connector event schema + capture surface matrix
│   ├─ desktop/                 - Tauri command bridges
│   ├─ evidence/                - Trust / provenance / source-link helpers
│   ├─ formatting/              - Time / number formatting
│   ├─ import/                  - Import normalisers
│   ├─ memory/                  - Project Memory context snapshot
│   ├─ mori-package/            - .mori v0 JSON serialisation
│   ├─ project-memory/          - Project Memory detailed derivations
│   ├─ relationships/           - Relationship traversal + display
│   ├─ report/                  - Markdown report builder
│   ├─ reports/                 - Report context snapshot
│   ├─ repositories/            - Saved repo settings + verification freshness
│   ├─ review/                  - Import-review draft logic
│   ├─ review-workspace/        - Review tab derivations
│   ├─ session/                 - Session view composition + timing helpers
│   ├─ settings/                - Settings page derivations
│   ├─ sources/                 - Source integration registry
│   ├─ sqlite/                  - SQLite schema + reconstruction
│   ├─ storage/                 - localStorage / persistence service
│   └─ timeline/                - Timeline math (layout, bundles, ticks,
│                                 view-model, relationship policy, controls)
│
├─ features/         React feature surfaces. Imports from app/lib/components.
│   ├─ evidence/
│   ├─ flow-focus/
│   ├─ import/
│   ├─ memory/
│   ├─ reports/
│   ├─ review/
│   ├─ review-import/
│   ├─ settings/
│   ├─ start-session/
│   └─ timeline/
│       └─ lib/                 - Feature-local view-model exports
│
├─ components/       Shared UI primitives.
│   ├─ layout/                  - AppShell / Sidebar / TopSessionBar / …
│   └─ ui/                      - Card / Button / Badge / Status / Trust / …
│
└─ styles/           Theme + global CSS.
    ├─ globals.css              - Tailwind + tokens + theme + styles.css
    ├─ tokens.css               - raw color / radius / shadow values
    └─ theme.css                - semantic theme layer (--mori-*)
```

**Rules**
- Code in `domain/` and `lib/` does not import React.
- Code in `app/` imports from `lib/` + `domain/`.
- Code in `features/` imports from `app/` + `lib/` + `components/`.
- Code in `components/ui/` is pure presentation. It may read from `app/featureStatus.ts`
  (registry lookup) and `lib/evidence/trust.ts` (canonical trust display) but
  must not read from feature folders.
- Code in `components/layout/` may read from app stores via hooks.

## Shared concepts

| Concept | Canonical home | Notes |
|---|---|---|
| `FeatureStatus` (`implemented / partial / planned / unavailable`) | `src/app/featureStatus.ts` | Single registry covering Timeline + App shell + Evidence + Review + Reports + Memory + Start Session + Settings. |
| `FeatureCapability` (registry row shape) | `src/app/featureStatus.ts` | Includes `actionEnabled`, `disabledReason`, `userFacingStatus`. |
| `CaptureSurface` | `src/lib/connectors/captureSurfaces.ts` | The matrix of every paste / hook / CLI / desktop / web / IDE path with honest status. |
| `ConnectorEvent` schema | `src/lib/connectors/types.ts` | One JSON event per line of the JSONL inbox. |
| `EvidenceSource` (a.k.a. `SourceRef`) | `src/domain/types.ts` | Persisted source row. Display helpers live in `src/lib/evidence/provenance.ts`. |
| `Provenance` display | `src/lib/evidence/provenance.ts` | `getProvenanceDisplay`, `getProvenanceSummary`, capture-method / raw-data labels. |
| `TrustLevel` display | `src/lib/evidence/trust.ts` | Single `getTrustDisplay` returning `{ level, label, description, tone }`. Legacy helpers in `relationships/relationshipDisplay.ts` and `privacy/trust.ts` re-export. |
| `RawDataPolicy` | `src/lib/sources/sourceRegistry.ts` (`retained / summaryOnly / redacted / notCaptured`) | Capture surface matrix adds `referenceOnly`; bridge documented per row. |
| `ImportReviewDraft` | `src/lib/review/types.ts` | Stays as-is. |
| `TimelineViewModel` | `src/lib/timeline/timelineViewModel.ts`, re-exported from `src/features/timeline/lib/timelineViewModel.ts` | Lane-specific + relationship-specific view models sit alongside it (`timelineLanes.ts`, `timelineRelationships.ts`). |
| `AnalysisResult` | `src/lib/analysis/analysisTypes.ts` | Stays as-is. |
| `ReportContext` | `src/lib/reports/reportContext.ts` | Composes data-basis + evidence summary + analysis provider into one snapshot. |
| `ProjectMemorySnapshot` | `src/lib/memory/projectMemoryContext.ts` | Composes stats + scope + caveat. |
| `SessionLifecycle` | `src/app/sessionLifecycle.ts` | Composes timing + storage scope + status labels. |
| `RuntimeMode` (`browser / tauri-desktop`) | `src/lib/settings/settingsStatus.ts` | Stays here today; migration to `app/` is a future cleanup. |
| `StorageScope` | `src/app/sessionLifecycle.ts` (`SessionStorageScope`) | `demo / browser-draft / desktop-sqlite / ended`. |
| `ThemeToken` | `src/styles/theme.css` (semantic) over `src/styles/tokens.css` (raw values) | Theme switcher itself is Planned (`settings.themeSwitcher`). |

## Data flow

```
   ┌───────────────────────────┐
   │   User pastes / imports   │
   └────────────┬──────────────┘
                ▼
       lib/import/* (normalisers) ──► NormalizedImportCandidate
                │
                ▼
   useMoriSessionStore.addImport()    (Zustand)
                │
                ▼
       lib/session/composeSessionView ──► SessionViewModel
                │
                ▼
       (Quick Pass) lib/analysis/*    ──► MoriAnalysisResult
                │
                ▼
   selectSessionView(state)           (merges analysis into view)
                │
                ▼
   ┌────────────────────────────────────────────────────────────┐
   │ Feature view models (built from the session view)          │
   │   - lib/timeline/timelineViewModel                          │
   │   - lib/reports/reportContext                                │
   │   - lib/memory/projectMemoryContext                          │
   │   - lib/evidence/* (joins event/issue/decision ↔ sources)   │
   │   - lib/review-workspace                                     │
   └────────────────────────┬───────────────────────────────────┘
                            ▼
                React features render the view model.
                            ▼
        Honesty: every disabled / planned control reads from
        src/app/featureStatus.ts. UI never invents Planned copy.
```

## Where to add a new …

### … capture surface (e.g. a Slack export importer)
1. Add a row to `src/lib/connectors/captureSurfaces.ts` describing the surface.
2. Update or add an integration row in `src/lib/sources/sourceRegistry.ts` if
   the surface should appear in Evidence Hub.
3. Add a normaliser under `src/lib/import/` that returns a
   `NormalizedImportCandidate` keyed by the new SourceKind.
4. Register the new capability in `src/app/featureStatus.ts` (`evidence.addSource.<name>`).
5. Add tests for the normaliser + capture-surface row.

### … import type (e.g. a new file format)
1. Normaliser in `src/lib/import/normalize<Whatever>.ts`.
2. Tests next to it.
3. Wire it into `src/features/import/ImportPanel.tsx`.

### … Timeline lane
1. Add the `EventType` to `src/domain/types.ts`.
2. Add label / tone / icon entries in `src/domain/constants.ts`.
3. Add a row to `laneOrder` in the same file.
4. No view-model changes required — the lane will flow through
   `timelineLanes.ts` automatically.

### … report section
1. Add a `ReportSectionId` to `src/lib/report/reportBuilder.ts` (or a sibling
   if the section diverges).
2. Add a `SECTION_DEFINITIONS` row.
3. Add a `defaultSections` entry on each `REPORT_TYPE_DEFINITIONS` row.
4. Render the section in `buildReportMarkdown`.

### … feature status row
1. Add the namespaced id (`surface.capability`) to the `FeatureId` union in
   `src/app/featureStatus.ts`.
2. Add a row to `REGISTRY_DATA`.
3. Update or read it from any component that wants honest disabled / tooltip
   behavior — prefer `getFeatureControlProps(id)` over hand-rolled flags.
4. Add a test for the row in `src/app/featureStatus.test.ts` if it carries a
   `disabledReason` worth asserting.

## How honesty / provenance is preserved

- **Honesty**: every disabled button / planned card derives its `disabled`
  flag and tooltip from `getFeatureControlProps(id)`. New features that
  introduce a button MUST add their id to the registry.
- **Provenance**: every Timeline event displayed in the UI must trace back
  to one or more `SourceRef`s through `event.sourceRefs`. The
  `src/lib/evidence/` helpers are the only way the UI is allowed to derive
  "where did this event come from?" — no inline filter loops over
  `view.sources.filter(s => event.sourceRefs.includes(s.id))`.

## Theme tokens

- Raw color / shadow / radius constants live in `src/styles/tokens.css`.
- Semantic role variables (`--mori-surface`, `--mori-text-muted`,
  `--mori-status-success`, …) live in `src/styles/theme.css`.
- New CSS should reference the `--mori-*` variables. Legacy CSS still using
  `--purple` / `--panel` continues to work; the semantic layer points at the
  same raw values.
- A future theme switcher (`settings.themeSwitcher`, Planned) will remap
  the semantic layer; raw tokens stay constant.

## Backward compatibility plan

This milestone introduced new modules without breaking old ones:
- `src/lib/sources/traceability.ts` → re-exports the helpers that moved to
  `src/lib/evidence/`. 15 caller files were untouched.
- `src/lib/privacy/trust.ts` → re-exports the canonical `getTrustDisplay`.
- `src/lib/relationships/relationshipDisplay.ts` → routes through the new
  trust + confidence helpers.
- `src/features/timeline/lib/*` → re-exports `src/lib/timeline/` helpers
  with feature-local sibling files (`timelineLanes.ts`,
  `timelineRelationships.ts`).
- `src/lib/timeline/timelineControls.ts` (legacy) and
  `src/features/timeline/lib/timelineControls.ts` (new) bridge via a
  mapping table to `src/app/featureStatus.ts`.

Future milestones can deprecate the legacy paths once every caller has
migrated.

## Gap-closure pass

After the initial modular-architecture milestone landed, a follow-up pass
closed the remaining gaps relative to the brief without rewriting working
code:

- **Card view-models added.** `src/features/timeline/lib/timelineCards.ts`
  introduces `TimelineEventCardViewModel` and `TimelineBundleViewModel`
  plus their builders (`buildTimelineEventCardViewModel`,
  `buildTimelineBundleViewModel`, `buildTrustGlyph`). The Timeline event
  card and bundle card now consume these view models instead of recomputing
  time labels / trust glyphs / footer parts inline.
- **Section + Inspector primitives added.** `MoriSection` and
  `MoriInspectorPanel` were added to `src/components/ui/`. They use the
  `--mori-*` semantic tokens and the `.mori-scroll` mixin so adopters get
  consistent header / scroll / shadow behavior without hand-rolling rules.
- **Saved-report availability** is now a first-class field on
  `ProjectMemorySnapshot.savedReportAvailability` with its own
  `deriveSavedReportAvailability(reportCount)` helper. Tone goes
  gray → blue (1–2) → green (3+), label singularises at 1.
- **Feature registry adoption widened.** `PlannedConnectorsCard`
  (Settings) and `ProjectMemoryHero` (Memory) now render
  `MoriFeatureStatusBadge` + `MoriPlannedAction` for capabilities the
  registry covers. Integrations that have no registry counterpart yet
  (slack / notion / figma / docs) keep their legacy badge as a fallback so
  no registry rows are fabricated.

These additions remained backward-compatible: every previous import path
still resolves, every prior test still passes (489 total, was 473).
