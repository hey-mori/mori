# Project Memory

Project Memory is Mori's long-term, **local-only** project context surface.
It aggregates every locally-persisted Mori session, the connector imports
each session captured, and the `.mori v0` packages the user has exported,
so that starting a follow-up session never feels like starting from
scratch.

This file describes what Project Memory actually shows today, what it does
*not* aggregate yet, and the privacy boundaries that hold even as the
feature grows.

---

## What Project Memory aggregates

The Memory page is driven by a typed view model
(`src/lib/project-memory/projectMemoryViewModel.ts`) that takes the
following inputs:

| Input                          | Source                                     | Required |
| ------------------------------ | ------------------------------------------ | -------- |
| Active session view            | `selectSessionView(useMoriSessionStore)`   | yes      |
| Browser-saved session metadata | `BrowserDraftRepository.listStoredSessions` | optional |
| Browser-saved session imports  | `BrowserDraftRepository.listSessionImports` | optional |
| SQLite-saved session metadata  | `useMoriSqliteStore.sessions`              | optional |
| `.mori v0` packages            | `BrowserDraftRepository.listMoriPackageDrafts` | optional |
| Active analysis flag           | `selectHasRealAnalysis`                    | optional |
| Session mode                   | `selectSessionMode` (`demo` / `draft`)     | required |

The output is a `ProjectMemoryViewModel` with the following surfaces:

- `summaryStats` — session / decision / issue / source / report / re-import
  counters.
- `recentSessions` — current session + saved sessions, deduped by id,
  ordered active-first then by `savedAt`/`endedAt` desc.
- `keyDecisions`, `recurringIssues`, `keyEvidence` — scoped to the active
  session today (saved-session bodies are not loaded).
- `reimportSummary` — connector re-import rollup across saved sessions
  whose imports carry `StoredSessionImport.importSummary`.
- `savedReports` / `moriPackages` — every persisted `.mori v0` package.
- `unresolvedRisks`, `latestImportantDecision`, `recommendedNextSession`
  — feed the right summary panel.
- `warnings` — honest notes about what is *not* currently aggregated.
- `privacyNotice` — one-line copy for the page footer.

---

## Data basis

The view model carries a `dataBasis` flag that decides what the page is
allowed to claim:

| Value                          | Meaning                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `activeSessionOnly`            | No saved sessions are visible. The page shows only the current session.                                  |
| `activePlusSavedSessions`      | At least one browser-saved session contributed real import summaries to the rollup.                      |
| `savedSessionMetadataOnly`     | Saved sessions exist (SQLite-only, or browser without summaries) but only metadata is shown.             |
| `unavailable`                  | Demo mode, or storage is not reachable. The page shows only the active mock view + storage-unavailable warning. |

The page renders the data-basis label in the header as a Mori badge.

---

## Re-import history rollup

Project Memory consumes `StoredSessionImport.importSummary` to build the
project-level "이번 프로젝트 재import" card. The roll-up:

- counts `new` / `partialReimport` / `duplicateOnly` /
  `historyUnavailable` / `invalidOnly` summaries separately,
- collects the top matched saved sessions (overlap targets),
- collects union of connector ids and event kinds,
- exposes the latest re-import timestamp,
- lists up to six recent re-import items with status + new/duplicate
  counts + an honesty hint when saved-session history was unavailable at
  the moment of import.

Old imports persisted before `connectorEventId` and `importSummary` landed
contribute **nothing** to the rollup. They are surfaced as a warning so
the user understands why the rollup may underreport.

---

## What Project Memory is NOT

This list is part of the page's honesty contract. Surfaces must not claim
any of these:

- Project Memory does **not** load saved-session bodies from SQLite or
  localStorage. Decisions / issues / next-actions in the page are scoped
  to the active session only.
- Project Memory does **not** scan arbitrary folders or `~/.mori/`
  beyond the local connector inbox (which is opt-in and surfaced in the
  Import flow, not the Memory flow).
- Project Memory does **not** sync with cloud accounts. There is no
  OAuth path; no transcripts are uploaded.
- Project Memory does **not** monitor a running Claude Code / Codex CLI
  instance. Connector events arrive only through explicit JSONL imports.
- Project Memory does **not** carry context across devices automatically.
  Cross-device project memory requires explicit `.mori v0` export +
  import.
- Project Memory does **not** show a live Session Canvas / Workroom view
  yet. That surface is deferred (see `docs/roadmap.md`).

---

## Empty / fallback states

| State                                  | Page behaviour                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Demo mode                              | Shows mock memory, surfaces "Demo 모드" warning, suppresses re-import rollup.                                |
| No saved sessions at all               | `dataBasis = activeSessionOnly`. Hero stats reflect the active session only.                                |
| Saved sessions exist but no `importSummary` | `dataBasis = savedSessionMetadataOnly`. A warning explains old imports don't contribute to re-import rollup. |
| SQLite-only saved sessions             | Sessions show in the recent list with `Desktop SQLite · metadata only`. Import summaries unavailable note.   |
| Storage unreachable                    | Empty view model + storage-unavailable warning.                                                              |

---

## Tests

`src/lib/project-memory/projectMemoryViewModel.test.ts` covers:

- active-session-only state,
- demo-mode unavailable state,
- active + browser saved sessions (full rollup),
- SQLite-only metadata-only state,
- old-imports-without-identity warning,
- recent-sessions ordering,
- matched-saved-session aggregation,
- per-status counters,
- summary stats derivation,
- storage-unavailable fallback,
- no fake decision/issue counts for metadata-only sessions,
- model helper labels and tone mappings.

---

## Limitations and future work

- **Cross-session decision / issue / next-action aggregation** —
  requires loading saved-session bodies. Not implemented; a `warning` of
  kind `saved-session-bodies-not-loaded` documents the gap.
- **SQLite import summary persistence** — `importSummary` lives in
  browser localStorage today; SQLite-saved sessions therefore cannot
  contribute to the re-import rollup. A `warning` of kind
  `import-summaries-unavailable / reason: sqlite-only` documents the gap.
- **Cross-device project memory** — explicit `.mori v0` package export
  and import is the supported path. There is no background sync.
- **Session Canvas / Workroom** — deferred. The current Memory page is
  a card-based aggregation; a visual board / canvas surface is documented
  in `docs/roadmap.md` and is not part of this milestone.
