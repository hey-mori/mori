# Mori Data Pipeline

Everything Mori displays — events, issues, decisions, reports, project memory
snapshots — traces back to a `SourceRef` the user explicitly imported. This
document is the contract for how data flows from capture to project memory.

The typed contract lives in `src/app/dataPipeline.ts`.

## Stages

```
SourceInput
   │  raw paste, JSONL row, or Tauri command output
   ▼
EvidenceSource (SourceRef)
   │  trustLevel, rawRetention, capture method
   ▼
NormalizedEventCandidate (NormalizedImportCandidate)
   │  src/lib/import/normalize* — pure functions
   ▼
ImportReviewDraft
   │  src/lib/review — user accept / discard / edit
   ▼
AppliedTimelineEvent (TimelineEvent)
   │  persisted on the session via useMoriSessionStore.addImport
   ▼
AnalysisResult (MoriAnalysisResult)
   │  Quick Pass deterministic | Ollama
   ▼
ReviewItem (Issue | Decision | NextAction)
   │  rendered in Review workspace
   ▼
ReportContext (lib/reports/reportContext.ts)
   │  Reports view + .mori v0 package
   ▼
ProjectMemorySnapshot (lib/memory/projectMemoryContext.ts)
   │  Memory view + follow-up prompt
```

## Provenance is preserved at every step

Every item Mori renders should be able to answer six questions:

| Question | Where the answer lives |
|---|---|
| Where did this come from? | `ProvenanceRecord.sourceIds[]` |
| Who/what created it? | `ProvenanceRecord.createdBy` (`user`, `import`, `ai`, `system`) |
| User-provided, imported, observed, or inferred? | `ProvenanceRecord.trustLevel` |
| What source supports it? | `getEvidenceSourcesForEvent` / `getIssueEvidenceSources` / `getDecisionEvidenceSources` |
| What confidence does it have? | `ProvenanceRecord.confidence` (only meaningful when `trustLevel === "inferred"`) |
| What raw-data policy applies? | `ProvenanceRecord.rawDataPolicy` |
| Can the user correct it? | `ProvenanceRecord.userCorrectable` |

Implementations:

- `getProvenanceForSource(source)`
- `getProvenanceForEvent(event, view)`
- `getProvenanceForIssue(issue, view)`
- `getProvenanceForDecision(decision, view)`
- `getProvenanceSummary(source)` (rendered display fields)

## Adapters

Pipeline-layer helpers (all in `src/app/dataPipeline.ts`):

| Helper | Use |
|---|---|
| `deriveEvidenceSources(view)` | Chronological list of `SourceRef`s for the current session. |
| `deriveTimelineCandidates(candidates)` | Flatten + sort normalized candidates into a `TimelineEvent[]`. |
| `deriveReviewContext({ candidate, origin })` | Build an `ImportReviewDraft` from one normalized candidate. |
| `deriveReportContext({ view, analysis, isDemoSession })` | Composes evidence + analysis into a `ReportContext`. |
| `deriveProjectMemorySnapshot({ view, scope, savedSessions, reportCount, hasAnalysis })` | Build the Memory page snapshot. |
| `getSessionPipelineOverview(view, hasAnalysis)` | One-shot counts + data-basis sentence. |

## Where the boundaries are

- `lib/import` — pure normalizers. No React. No persistence. Tested with
  fixture text.
- `lib/review` — review-draft state machine. Pure functions over the
  `ImportReviewDraft` shape.
- `lib/evidence` — trust display + provenance display + evidence joins.
  Single source of truth for source / issue / decision → SourceRef links.
- `lib/analysis` — Quick Pass providers (`deterministic`, `ollama`). All
  side-effects are confined to the network call inside Ollama.
- `lib/reports/reportContext.ts` — report data-basis + evidence summary.
  Uses `lib/evidence` for the joins.
- `lib/memory/projectMemoryContext.ts` — current-session snapshot. Uses
  `lib/project-memory/projectMemory.ts` for the detailed derivations.
- `app/dataPipeline.ts` — typed contract + thin adapters. **The only place
  React features should import from when they need the canonical names.**

## Demo data isolation

Demo and real data never mix. `selectSessionView` returns a demo view (with
`isDemo: true`) when no draft exists, and `composeSessionView` is called
the moment a draft appears. The Sidebar session card, the Session Detail
header, and the Settings storage card all read the discriminator and tag the
data scope.

The demo view is per-session, not a single stand-in:

- `src/lib/demo/demoSessionFixtures.ts` holds the bundled demo session
  *summaries* (`DEMO_SESSION_SUMMARIES`) that populate the sidebar, the Home
  recent list, the Project workspace, and the command palette. Ids carry the
  `demo-` prefix (`isDemoSessionId`); the set spans three projects, with
  `ng-gw` (NG Gateway) as the heavily populated one.
- `src/lib/demo/demoSessionContent.ts` expands each summary into a full,
  read-only `MoriMockSession` (events, sources, issues, decisions,
  relationships, artifacts, next actions) via `buildDemoSessionContent`. A
  compact per-session blueprint supplies the themed beats; a shared builder
  wires timestamps, evidence, links, and inferred relationships (one
  conversation can surface several issues; a decision links to the discussion
  it came out of and the code change that implements it).
- Opening a demo row sets `demoSessionId` on the session store.
  `loadBrowserSession` falls back to the demo builder for `demo-` ids, and
  `selectSessionView` returns that session's content (memoised per id). So
  clicking a demo session shows *that* session, not one fixed sample.
- Demo sessions stay read-only: every write action (`renameSession`,
  `runQuickPass`, issue / decision edits, …) is a no-op while `draft` is null,
  and `selectSessionMode` reports `demo`.

The canonical `moriMockSession` remains the default view when no specific
demo session is open (`demoSessionId === null`).

## Adding a new connector to the pipeline

1. **Normalize**: implement a `normalize<NewSource>` under
   `src/lib/import/` that returns a `NormalizedImportCandidate`.
2. **Capture surface**: add a row to `src/lib/connectors/captureSurfaces.ts`
   describing the paste / hook / CLI / desktop / web path.
3. **Feature registry**: add a `connector.<name>` row in
   `src/app/featureStatus.ts` and (if the surface should show up in
   Evidence Hub) an `evidence.addSource.<name>` row too.
4. **Wire**: feed the normalizer through Evidence Hub's import flow —
   `useMoriSessionStore.addImport` already accepts any
   `NormalizedImportCandidate`.
5. **Tests**: assert the normalizer's fixture output + the capture surface
   row's status invariants.

No part of the pipeline should be touched beyond those four steps.

## Related

- [Product flow](./product-flow.md)
- [Feature status](./feature-status.md)
- [Modular architecture](./modular-architecture.md)
- [Imports](./imports.md)
- [Quick Pass analysis](./quick-pass-analysis.md)
- [Source integrations](./source-integrations.md)
