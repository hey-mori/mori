# Design · SQLite as the Source of Truth (W5)

The audit-before-implementation record for the production program's
W5: promoting desktop SQLite from a mirror of the browser store to the
authoritative store for all durable data, and demoting localStorage to
the browser-mode fallback plus a UI-preference cache.

**Status: direction approved, design re-baselined 2026-08-13. Still
awaiting approval of the revised plan below before any build starts.**
Written 2026-07-12 against the repo at that date; §0 records what has
changed under it since, and supersedes the schema numbering and scope in
§4 and §7.

## 0. Re-baseline · 2026-08-13

This document was written before the record kernel landed, so parts of it
plan work that already exists and number migrations that are already
taken. The direction is unchanged and correct. What follows replaces the
schema numbering in §4 and narrows the scope in §7.

### 0.1 What is already SQLite-canonical

Verified against the repository, not inferred from this document:

| Data | Migration | Router |
| --- | --- | --- |
| Kernel records / objects / revisions, with FTS | `V008` | `record-kernel/kernelRepository.ts` |
| Accepted project memory + audit rows | `V003` | `project-memory/acceptedMemoryRepository.ts` |
| Session imports | `V004` | `storage/sessionImportRepository.ts` |
| Active session snapshot | `V001` | `storage/sessionPersistenceService.ts` |

Each prefers SQLite on desktop and falls back to localStorage with an
explicit `fellBack` reason rather than silently claiming success. That
pattern is the precedent the rest of this work should follow, and it did
not exist when §7 was written.

**`V008` is taken by the record kernel.** This document's §4 assigns
`app_settings` to `V008` and typed per-session tables to `V009`. The next
free number is now **`V009`**, and any plan that reuses `V008` will
collide.

### 0.2 What is still localStorage-only, on desktop too

This is the actual remaining scope, and it is smaller and heavier than §7
assumed.

| Data | Key family | Weight | Proposed owner |
| --- | --- | --- | --- |
| Session memory bodies | `mori.sessionMemory.*` | **heavy** | SQLite (no path exists today) |
| Session analysis results + history | `mori.sessionAnalysis*` | **heavy** | SQLite |
| Current session draft | `mori.currentSessionDraft` | heavy | SQLite |
| `.mori` package drafts | `mori.packageDraft` | heavy | SQLite, or a file |
| Live intake rows | `mori.liveIntake.session.*` | bounded | derived index in SQLite |
| Project connections, user projects | `mori.projectConnections.v1`, `mori.userProjects.v1` | light | SQLite (durable, user-authored mapping) |
| Diagnostics log | `mori.diagnostics*` | light | file, not SQLite |
| Preferences: theme, sidebar, onboarding, notification prefs, observation opt-in, engine presets, language consent | various | trivial | **stays in localStorage** |

The heaviest item has no SQLite path at all: `grep` for a memory-body
table or command returns nothing. Session bodies are the transcripts this
document opened by describing as unfittable in a 5 MB store, and they are
still there.

### 0.3 The classification this needs, before the migration

The 2026-07-12 framing was "move durable data to SQLite". With the kernel
in place the question is sharper, and is the same one
[`live-project-intelligence-execution-plan.md`](live-project-intelligence-execution-plan.md)
D8 answered for the intake buffer: **for each kind of data, is it a kernel
record, a derived index, or a cache?**

- **Kernel record** · authored or promoted domain content. Belongs in
  `kernel_records` and inherits FTS, contexts and revisions. Never
  evictable.
- **Derived index** · re-derivable from a preserved origin. May be
  dropped and rebuilt; must carry a locator that makes that true. Live
  intake is the worked example.
- **Cache or preference** · device-local, disposable, and correctly
  localStorage. Must never become the source of truth for anything else.

Deciding this per kind is the work. Moving bytes is the easy part, and
doing it without deciding would produce a second storage layer beside the
kernel rather than one store.

### 0.4 Constraints the revised plan must carry

1. **Numbering starts at `V009`.**
2. **Every durable kind is classified** per §0.3 before it moves.
3. **A fallback must not become canonical.** Today's routers fall back to
   localStorage on a SQLite failure, which is right for one call and wrong
   as a resting state; the revised plan needs an explicit rule for when a
   fallback is a failure to surface rather than a mode to live in.
4. **Migration is tested for interruption**: partial, killed mid-way,
   re-run, run twice, and run against a full disk.
5. **A backup is taken before migrating**, and a diagnostics report can
   say what moved.
6. **No data is deleted by the migration.** Derived indexes may be
   rebuilt rather than copied, which is not deletion, provided the origin
   is preserved.

### 0.5 Interim guard already in place

Live intake now bounds its own growth by age and count
(`lib/live-intake/evictIntakeRows.ts`), reporting what it drops. That is
a stop-gap to stop one new writer filling the shared budget, not a
substitute for this work, and it should be removed when intake moves.

## 1. Why (and why before launch)

- Real user data (session drafts, imports, analysis, memory bodies)
  lives in webview localStorage: quota-bound (5–10 MB), clearable by
  the OS, and not the file a user would back up
  (`production-readiness-audit.md` §3, §5).
- The W6 quota guard makes failures visible, but visibility is not
  durability; a 10 MB transcript in a 5 MB store cannot be guarded
  into fitting.
- **Sequencing is the point**: today there are zero external users, so
  this is a design change. After public distribution it becomes a
  user-data migration program. The launch checkpoint (program §2)
  blocks on this workstream for exactly that reason.

## 2. Current state (verified)

- `SessionPersistenceService` (`src/lib/storage/sessionPersistenceService.ts`)
  routes between `BrowserDraftRepository` (localStorage) and the SQLite
  bridge; desktop mode already **prefers SQLite for active-session
  hydration**.
- SQLite (migrations V001–V007) already persists: the active session
  snapshot (projects / sessions / sources / events / issues /
  decisions / relationships / artifacts / next actions / summaries),
  accepted project memory + audit rows (V003), and session imports
  (V004).
- Still **localStorage-only** durable data (the promotion targets):
  - `StoredSessionMemoryBody` rows (`mori.sessionMemory.*`)
  - `StoredSessionAnalysis` + analysis history
    (`mori.sessionAnalysis.*`, `mori.sessionAnalysisHistory.*`)
  - Import Review drafts (`mori.sessionPendingReview.*`)
  - `.mori` package drafts (`mori.packageDraft.*`)
  - Quick Pass settings, repository settings
    (`mori.quickPassSettings`, `mori.repositorySettings`)
- Deliberately **staying in localStorage** (UI preference cache, low
  value, loss-tolerable): theme, sidebar collapse / grouping /
  expansion, home metric lens, notification read state, engine
  presets, demo-content flags. These are device-local preferences,
  not work data.

## 3. Target state

In Tauri desktop mode:

- SQLite is authoritative for every durable record class in Section 2.
- localStorage keeps two roles only: the browser-mode store (unchanged
  behaviour when not in Tauri) and the UI-preference cache.
- The Settings storage card and the sidebar badge say "Desktop
  SQLite" for all durable classes, honestly; no class silently reads
  one store and writes another.
- Browser mode is unchanged (and stays subject to the D5 decision on
  its product framing).

## 4. Schema additions (V008+)

Two shapes cover everything being promoted:

1. **`app_settings` (V008)**: `(key TEXT PRIMARY KEY, schema_version
   INTEGER, value_json TEXT, updated_at TEXT)`. Rows: Quick Pass
   settings, repository settings. Settings are small, schema-versioned
   JSON documents already; a typed table per setting adds migration
   cost without query value.
2. **Typed per-session tables (V009)**: `session_memory_bodies`,
   `session_analyses` (+ history), `session_pending_reviews`,
   `package_drafts`; each `(session_id TEXT, schema_version INTEGER,
   payload_json TEXT, updated_at TEXT)` with the same
   one-JSON-document-per-row shape the localStorage adapter stores
   today. Rationale: the payloads round-trip as documents everywhere
   in the app; decomposing them into columns buys nothing until a
   query needs it (and `session_imports` V004 set this precedent).

## 5. Migration and transition

1. **Pre-migration backup (W6 dependency).** Before running V008+,
   copy the SQLite files aside (the W6 backup slice); a failed
   migration restores and reports.
2. **One-time localStorage adoption.** On desktop startup after V009,
   for each promoted record class: if SQLite has no row and
   localStorage has one, copy it in (stamped `migrated_from_browser`).
   localStorage is **not** cleared; it simply stops being read for
   these classes in desktop mode.
3. **Dual-write window.** For one release cycle, desktop mode writes
   both stores (SQLite authoritative on read). This keeps a manual
   rollback path: flipping the read preference back is one change.
4. **Retire the dual-write.** After the window proves clean (no
   fallback events in the diagnostics log), stop writing localStorage
   for promoted classes in desktop mode.

Rollback story: during the window, reverting is a read-preference
flip; after adoption but before retirement, localStorage still holds
a pre-promotion copy of everything it ever had.

## 6. Failure honesty

- Every SQLite write failure falls back to localStorage **visibly**
  (the same observer pattern as the W6 quota guard; a notification
  says the desktop store is degraded), never silently.
- The `PersistenceSource` badge already distinguishes
  `browser-draft` / `desktop-sqlite`; promoted classes adopt the same
  labeling so degraded states are visible in Settings.

## 7. Slices (each one commit, program order)

1. **S1 · V008 `app_settings`** + route Quick Pass / repository
   settings through a runtime-aware settings repository.
2. **S2 · V009 typed tables** + Rust repository + Tauri commands +
   TS bridges (mirrors the V004 `session_imports` pattern).
3. **S3 · Adoption + dual-write** for memory bodies and analyses.
4. **S4 · Adoption + dual-write** for pending reviews and package
   drafts.
5. **S5 · Read-preference flip** (SQLite authoritative for all
   promoted classes) + degraded-state notifications.
6. **S6 · Dual-write retirement** after a clean cycle.

Each slice: colocated TS tests, `cargo test` for Rust repositories,
`check:full` + build, and a browser-mode regression check (browser
behaviour must be byte-identical throughout).

## 8. Out of scope

- FTS5 / search indexes (W9 global search decides its own storage).
- Changing the `.mori` package format (unaffected).
- Browser-mode storage changes beyond the shared code paths.
- The D5 browser-mode product decision.

## 9. Approval

Build starts when the user approves this design. Open questions to
confirm at approval time:

1. Is the one-release dual-write window acceptable, or should S5 wait
   for two cycles?
2. Should the one-time adoption also import **saved sessions** that
   exist only in localStorage (recommended: yes, same pass)?
3. Any objection to the document-per-row shape for V009 (vs columnar
   decomposition)?
