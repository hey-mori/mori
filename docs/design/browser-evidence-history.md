# Browser Evidence History

Status: implemented and verified on 2026-09-13. Issue [#124](https://github.com/swarea/mori/issues/124).

## A. Starting Baseline

Fetched before branching on 2026-09-13:

- Mori: `9329686dd036fa160d88ab6223786933faf4ff05` (PR #123).
- Browser Extension: `c0aa32f869748b38c4d88811414584b59fe80bff` (PR #9).
- BrowserObservationEnvelope remains v1.
- Worktree: `C:/dev/mori-browser-evidence-history-dev`, branch `feat/browser-evidence-history`.
- The dirty `C:/dev/mori` checkout is not part of this change.

## B. Existing Read Path

V012 already owns durable Browser evidence in Mori's mutex-guarded SQLite
connection. `browserEvidenceRepository.recent(limit)` invokes
`list_recent_browser_evidence`; `browserLiveSource.recentEvidence()` reprojects
those rows through Browser normalization. Its callers are service tests and the
live smoke's direct Tauri health verification, not a product history view.
Both existing paths retain their 200-row compatibility cap. Current Context
and last-receipt health remain in-memory state, separate from historical events.

## C. Pagination Decision

OFFSET would shift rows when new evidence arrives. Browser-local keyset reads
preserve the existing observed-time ordering. A sequence watermark also excludes
late-arriving observations whose older timestamp would otherwise enter an
already-open browsing session. No generic Trace repository or token framework.

## D. Cursor Contract

`BrowserEvidenceCursor` is a typed object with `snapshotSequence`, `observedAt`
and `sequence`. The first bounds arrival sequence for this read session; the
other two mark the last returned row in display order. These are read positions,
not semantic event identities. Page response: `items` and nullable `nextCursor`.
No total-count query. Default application page: 50; accepted API range: 1..100.

Cursor validation rejects nonpositive/out-of-range sequences, noncanonical UTC
millisecond times, missing/future snapshot rows, missing cursor rows and a time
that does not match that row. Integer values must fit JavaScript's safe range.
The command reports only fixed invalid-limit, invalid-cursor or read-failure
messages; connection/migration errors cannot expose SQL or filesystem paths.
The view translates every failure into private Korean copy.

## E. Snapshot Semantics

No cursor starts a new read session using `MAX(sequence)` (zero when empty).
Every page has `sequence <= snapshotSequence`. A short read transaction covers
watermark/position validation and the SELECT, including another connection's
writes. It does not hold a transaction between page requests. Refresh starts
again with no cursor. Explicit data reset invalidates old positions; retrying
Refresh recovers. No row or read-state persistence is changed by inspection.

## F. Query And Index

First page selects under the watermark; older pages additionally use:

```sql
AND (observed_at, sequence) < (:observedAt, :sequence)
ORDER BY observed_at DESC, sequence DESC
LIMIT :limitPlusOne
```

The tuple comparison is the same strict lexicographic condition as timestamp
less-than OR timestamp equality with sequence less-than. Limit+1 determines
whether a next cursor exists. V012's `browser_evidence_observed` index is reused.
The 10,000-row EXPLAIN test requires that index, no temporary sort, and an index
SEARCH for older pages. First-page traversal scans the ordering index and stops
at the bounded limit. No V013, schema churn, count query or retention change.

## G. Read Model

`browserEvidenceHistory.ts` owns the Browser-local application projection and
view-local async read session. It reuses `browserEvidenceToTrace` for time,
provider, tab and sanitized resource projection, then selects observable fields
only. It does not pass raw row JSON, delivery identity, Trace title/summary,
confidence or storage cursor to row rendering. A private React key uses storage
sequence without claiming semantic identity or exposing it as a DOM attribute.

## H. UI Location

Settings > Connections > Browser opens an in-place detail surface. Back restores
the source entry's keyboard focus; the heading receives focus on entry. The
existing Settings shell retains its close/Tab behavior and rail. This avoids a
second nested overlay/focus trap and adds no top-level navigation item. Source
health and historical inspection remain distinct components.

## I. Activity Presentation

Korean action labels distinguish page navigation and tab activation in text and
Lucide icons. The primary row contains sanitized URL (or a URL-less activation
label), provider and observed time. Native keyboard-operable summary/details
discloses provenance. Context snapshots are not rows. No task, research topic,
intent, duration, ranking, project or usage interpretation is inferred.

## J. Time Semantics

Primary and ordering time is canonical UTC `observedAt`. Display uses local
Korean date/time formatting without reordering. Exact UTC survives in `datetime`
and title metadata. Details explicitly distinguish observation from Mori receipt
using `receivedAt`, never a combined or ambiguous created time.

## K. Provenance

Provider, transition type/qualifiers and available runtime/tab/window identifiers
are inspectable. Delivery identity, SQLite sequence, relay request ids and IPC
terms are not user-facing fields. Read cursor is transient application state.

## L. Privacy

No new collection, page title, DOM, account, cookie, credential, query or fragment
path. URL reprojection keeps origin+path. No external favicon/image requests or
click-through navigation are added. Existing storage validation is unchanged.
Read failures do not log or display evidence payloads or raw errors.

## M. Pagination UX

First-page loading, empty, older loading, read failure/retry and end are distinct.
Older success appends in source order; failure keeps rows and cursor. Refresh
supersedes an older pending request and only replaces displayed rows on success.
No polling, auto-refresh or live subscription. A view-local window retains the
latest 500 loaded rows; loading further evicts previously inspected rows from
the view only, not SQLite. The omitted count and info tooltip explain this bound.
Refresh returns to newest. This deliberately avoids a virtualization framework.

## N. Concurrent Append Verification

The storage regression uses 325 mixed rows, repeated observed timestamps and
late arrivals. A second SQLite connection appends both older and newer evidence
after page one. The original cursor traverses the exact initial row set without
duplicates/gaps; a new snapshot includes both additions.

## O. Durability

The same test reopens the database mid-pagination and continues with the original
cursor. `query_only` reads leave `total_changes` at zero. Existing upgrade,
privacy, explicit reset and 200-row recent-read tests remain. Actual Chrome/UI
restart evidence is recorded below after the full run.

## P. Real Chrome E2E

`scripts/browser-live-smoke.mjs --history --observations 180` extended the
existing isolated real-browser harness. Chrome 152 generated 180 main-frame
navigations plus activations. The initial snapshot contained 305 evidence rows
and traversed 7 UI pages without duplicate sequences, gaps or ordering drift. A
real navigation arriving after page one was absent from that snapshot. Refresh
created a 306-row, 7-page snapshot containing it. Mori then restarted against
the same database while capture was OFF; the UI still traversed the same 306
rows in 7 pages, while the in-flight OFF transition and 10 further OFF
navigations appended nothing.

The helper uses the actual Tauri page command and rendered Settings UI, not SQL.
The unchanged staged extension and packaged sidecar were used with temporary
registration restored in cleanup; no installed user profile or DB was used.
All 18 scenarios passed. Report, database and screenshots are retained under
`%TEMP%/mori-browser-live-dyBJnS/`.

After removing a programmatic heading-focus outline found in that visual pass,
a fresh instrumented release repeated all scenarios with 60 navigations, 106
rows and 3 pages at `%TEMP%/mori-browser-live-ucy59P/`. The corrected first,
detail and restart/OFF screenshots were inspected at 1180x760.

## Q. Performance

Two 50-row pages from 10,000 rows took 1.15 ms in the debug Rust test. The seven
real application page reads averaged 9.74 ms and peaked at 11.68 ms. These are
local diagnostics, not latency SLAs. Rendering 306 rows at 1180x760 produced no
surface or row horizontal overflow; all buttons had accessible names and the
footer remained inside the viewport. The 500-row application window has unit
coverage with a 650-row traversal.

## R. Tests

`scripts/check.sh --full` passed: typecheck, 3,438 Vitest tests (6 skipped),
stylelint, prose check, production build, Cargo check and tests. Rust: 285
application tests passed (2 intentionally ignored); 4 native-host tests passed.
Targeted coverage includes storage pages/validation/index, application
bridge/projection/races/failures/window bound and server-rendered row/control
states without a new test framework. Existing large-chunk, unused-inventory and
`connectors/lens.rs` test-import warnings remain advisory.
A normal production Tauri build then replaced the instrumented executable and
successfully produced the Windows NSIS bundle. It did not install or publish it.

## S. Mori Git

Issue #124; branch `feat/browser-evidence-history`. Commits and PR/merge identity
will be recorded in the completion report and linked PR after verification.

## T. Extension Git

**No Browser Extension change.** No extension issue, branch or companion PR.

## U. Store

**Chrome Web Store work intentionally deferred.** No Store id, registration,
submission, publication, signing, tag or release.

## V. Deferred

Search, filters, analytics, scoring, duration, retention/deletion controls, new
observation kinds, SPA events, identity/workspace, Flow/Episode/Memory semantics,
generic all-source history, cross-platform host and Store distribution.

## W. Next Milestone

**SPA same-document navigation coverage.** Durable inspection is now stable,
but v1 still misses route changes that never commit a main-frame navigation.
Covering this common modern-site gap is the smallest next improvement to the
factual evidence stream. It should remain a new observable Browser event path,
not semantic interpretation or Browser history import.
