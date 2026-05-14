# Mori Product Flow

Mori is a local-first AI work memory app. Every feature in the app is part
of one loop:

```
Capture
  → Normalize
    → Store
      → Review
        → Timeline
          → Extract
            → Summarize
              → Report / Resume
                → Project Memory
                  → Next Session
```

This document is the canonical reference for those stages. The typed model
lives in `src/app/productFlow.ts`. The honesty registry that backs every
disabled / planned control lives in `src/app/featureStatus.ts`.

## Stages

| Stage | What happens | Required capabilities (registry ids) | Optional upgrades |
|---|---|---|---|
| **Capture** | A user pastes a note / URL / AI transcript / git diff, or a Tauri Git diff command runs. Future: connector JSONL inbox. | `evidence.addSource.manualNote`, `urlImport`, `aiTranscriptPaste`, `gitDiffPaste` | `tauriGitDiff`, `connectorJsonl` |
| **Normalize** | `src/lib/import/normalize*` turns the paste into a `NormalizedImportCandidate` with `source` + `events[]`. | `evidence.addSource.manualNote`, `aiTranscriptPaste` | — |
| **Store** | Browser localStorage draft or desktop SQLite. `.mori v0 JSON` export available. | `settings.storage.browserDraft` | `settings.storage.desktopSqlite`, `moriPackageJson` |
| **Review** | Import Review surfaces the candidate's events / issues / decisions. User accept / discard / edit. | `evidence.addSource.aiTranscriptPaste` (gates review flow) | — |
| **Timeline** | Lane-based reading surface. Inspector, mini-map, focus interactions. | `timeline.density`, `filter`, `search`, `range.session` | `timeline.inspector.flowTrace` |
| **Extract** | Quick Pass (deterministic local or Ollama) runs over imports and produces issues + decisions + next actions + summary. | `evidence.runQuickPass`, `settings.localAi.deterministic` | `settings.localAi.ollama` |
| **Summarize** | Resume prompt + session summary are generated. | `reports.copyResumePrompt` | — |
| **Report / Resume** | Markdown report + `.mori v0` package. PDF / HTML are honestly Planned. | `reports.export.markdown` | `reports.export.moriPackage`, `pdf`, `html` |
| **Project Memory** | Current-session project memory snapshot. Cross-session aggregation is honestly Planned. | `memory.followUpPrompt` | `memory.crossSessionAggregation` |
| **Next Session** | Follow-up prompt + Start Session for the next scope. End-session writeback is honestly Planned. | `startSession.savePersistedDraft`, `memory.followUpPrompt` | `appShell.endSession` |

## Surfaces

Each visible product surface owns a slice of the registry:

| Surface | Owned capabilities |
|---|---|
| Start Session | `startSession.*` |
| Evidence Hub | `evidence.*` |
| Import Review | `evidence.addSource.aiTranscriptPaste` |
| Timeline | `timeline.*` |
| Flow Focus | `timeline.inspector.flowTrace` |
| Review Workspace | `review.*` |
| Reports | `reports.*` |
| Project Memory | `memory.*` |
| Settings | `settings.*` |
| Connector Setup | `evidence.addSource.connectorJsonl` + `connector.*` |

The detailed mapping is in `PRODUCT_SURFACES` (`src/app/productFlow.ts`). Tests
in `productFlow.test.ts` assert that every surface references real feature
ids and that the rollup math is consistent.

## Helpers

- `getSurfaceStatus(surfaceId)` — roll up a surface's per-feature statuses
  into one `{ status, statusLabel, tone, counts, total }` row.
- `getProductLoopProgress()` — walk the loop in order and report each
  stage's status + blocking + upgrade features.
- `getRuntimeDataScope({ lifecycle, runtime })` — map the session lifecycle
  + runtime into the canonical `DataScope` tag (`demo`, `browserDraft`,
  `desktopSQLite`, `moriPackage`, `crossSessionPlanned`).
- `getRecommendedNextStep({ lifecycle, importCount, hasAnalysis })` —
  recommend the single most useful next action.
- `getFeatureRegistryOverview()` — `{ total, counts }` summary.

## Data scope

`DataScope` is the single vocabulary for "what's the user actually looking
at right now?":

- `demo` — reference mock data only.
- `currentSession` — events from the active session.
- `browserDraft` — saved to browser localStorage.
- `desktopSQLite` — saved to local SQLite.
- `moriPackage` — backed by a loaded `.mori v0` JSON package.
- `crossSessionPlanned` — Planned. The Memory page surfaces this label when
  the user inspects something that *would* aggregate across sessions once
  cross-session memory ships.

Components should display `DATA_SCOPE_LABEL[scope]` rather than hand-rolled
strings.

## Runtime mode

`RuntimeMode` discriminates between `browser`, `desktop`, and `unknown`.
Several capabilities (`rollup.sqlitePersistence`, `rollup.repositoryMetadata`,
`evidence.addSource.tauriGitDiff`) carry a `runtime: "desktop"` requirement;
`getFeatureControlPropsInRuntime(id, runtime)` downgrades them to
`unavailable` when running in the browser build so users see them without
those rows pretending to be active.

## See also

- [Feature status](./feature-status.md)
- [Data pipeline](./data-pipeline.md)
- [Theme system](./theme-system.md)
- [Modular architecture](./modular-architecture.md)
- [Roadmap](./roadmap.md)
