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
| `activePlusSavedSessions`      | Every saved session contributed a real body to the cross-session aggregation, or a browser-saved session contributed real import summaries to the rollup. |
| `savedSessionMetadataOnly`     | Saved sessions exist but no body could be loaded (SQLite without desktop runtime, or browser without summaries). |
| `partialSavedSessionLoad`      | Some saved-session bodies loaded, some collapsed to `metadataOnly` or `failed`. |
| `unavailable`                  | Demo mode, or storage is not reachable. The page shows only the active mock view + storage-unavailable warning. |

The page renders the data-basis label in the header as a Mori badge.

## Saved-session body loading

Project Memory uses `loadProjectMemorySessions` to fetch saved-session
bodies safely:

- **Active session** — always included, never mutated.
- **Desktop SQLite** — `SessionPersistenceService.loadSessionFromDesktop`
  reconstructs the full `MoriMockSession` (project + session + events +
  sources + issues + decisions + nextActions). Calls run in parallel via
  `Promise.allSettled`; one failure does not block the page.
- **Browser localStorage** — `BrowserDraftRepository.listSessionImports`
  yields the per-session events/sources via the persisted imports.
  `loadSessionMemoryBody` lifts the durable issues / decisions /
  next-actions snapshot (`StoredSessionMemoryBody`); when missing the
  loader falls back to `loadSessionAnalysis`. Sessions that never ran
  Quick Pass and have no memory body load as `metadataOnly` for those
  fields rather than fabricating empty rows.
- **Cap** — `DEFAULT_SAVED_SESSION_CAP = 20`. SQLite-saved sessions take
  precedence over browser ones because their payloads are richer.

Each loaded entry carries a `loadStatus`:

| `loadStatus`     | What it means                                                              |
| ---------------- | -------------------------------------------------------------------------- |
| `loaded`         | Body was fetched; the aggregator may use its decisions / issues / sources. |
| `metadataOnly`   | Body could not be loaded; only the metadata row appears in recent sessions.|
| `failed`         | Loader rejected; `failureReason` is surfaced as a warning.                 |

The loader never throws past the caller and never mutates the active
session — the previous `loadDesktopSession` path that swapped the active
draft is NOT used here.

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

## Cross-session aggregation

When `loadedSessions` contributes real bodies, the view-model builder
delegates to `crossSessionAggregation.ts`:

- **Key decisions** — collected from every loaded session, ranked by
  importance, with the active session winning ties so live work surfaces
  first. Each row carries `sessionId` + `sessionTitle` + `sessionIsActive`.
- **Recurring issues** — grouped by normalized issue title (lowercase,
  trimmed, trailing punctuation stripped). When a normalized title
  appears in more than one loaded session the row is flagged
  `crossSession: true` with `affectedSessions[]` and `affectedSessionCount`.
- **Key evidence** — sources deduplicated by `source.id` across loaded
  sessions, ranked by linked event count with active-session ties broken
  in favour of the live session.
- **Unresolved risks** — open issues at high priority OR low-confidence
  inferred issues across loaded sessions, ranked by priority then active
  first.
- **Counters** — `aggregateCounters` de-duplicates timeline events and
  sources by id so an active session that's also persisted is never
  double-counted.
- **Recommended next session** — prefers cross-session recurring issues,
  falls back to in-progress / next-action / generic prompt.

Metadata-only and failed sessions contribute nothing to aggregation;
they only show up in the recent-sessions list with a `loadStatus`
badge.

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
| Saved sessions exist but no body loaded | `dataBasis = savedSessionMetadataOnly`. The `saved-session-bodies-not-loaded` warning lists the count.       |
| Saved bodies partially loaded          | `dataBasis = partialSavedSessionLoad`. `saved-session-bodies-partial-load` warning carries loaded / metadata / failed counts. |
| Some saved bodies failed to load       | `saved-session-load-failed` warning is emitted with the first one or two failure reasons. |
| SQLite-only saved sessions in browser  | Sessions show in the recent list with `Desktop SQLite · metadata only`. Bodies are not loadable in browser. |
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

- **Cross-session decision / issue / next-action aggregation in browser
  mode** — browser-saved drafts now persist a durable
  `StoredSessionMemoryBody` snapshot (issues / decisions / next-actions
  / optional summary snapshot) so browser-saved sessions can contribute
  these fields to Project Memory. The body is written:
    - whenever Quick Pass / analysis succeeds,
    - during `hydrate` as a one-time forward migration when a saved
      analysis exists but no body has been written yet.
  Sessions that never ran Quick Pass remain memory-body-less and load
  as `metadataOnly` for those fields — no fake rows are produced.
- **SQLite import summary persistence** — `importSummary` lives in
  browser localStorage today; SQLite-saved sessions therefore cannot
  contribute to the re-import rollup. A `warning` of kind
  `import-summaries-unavailable / reason: sqlite-only` documents the gap.
- **Body-loading cap** — `DEFAULT_SAVED_SESSION_CAP = 20`. Older saved
  sessions beyond the cap are not loaded; they still appear in the
  recent list as `metadataOnly`. Raise the cap deliberately if needed.
- **Cross-device project memory** — explicit `.mori v0` package export
  and import is the supported path. There is no background sync.
- **Session Canvas / Workroom** — deferred. The current Memory page is
  a card-based aggregation; a visual board / canvas surface is documented
  in `docs/roadmap.md` and is not part of this milestone.
