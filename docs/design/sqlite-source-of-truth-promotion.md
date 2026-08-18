# Design · SQLite as the Source of Truth (W5)

The audit-before-implementation record for the production program's
W5: promoting desktop SQLite from a mirror of the browser store to the
authoritative store for all durable data, and demoting localStorage to
the browser-mode fallback plus a UI-preference cache.

**Status: direction approved, design re-baselined 2026-08-13, revised
plan written 2026-08-18. Awaiting approval of §7 before any build
starts.**
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

### 0.6 The classification, decided

§0.3 asks for a three-way call per kind. Making it surfaced a sharper
test than "is the origin preserved".

**Re-derivable means the derivation is deterministic, not merely that an
origin still exists.** Live intake qualifies: it is a parse of a
structured log, so re-running it on the same bytes yields the same rows,
which is what makes the locator (D1) worth anything. LLM analysis does
not qualify. Re-running it on the same transcript yields different
output, and any review or edit the user applied is gone. A preserved
origin does not make that content reconstructable, so it is durable
content, not an index.

| Data | Class | Consequence |
| --- | --- | --- |
| Session memory bodies | **kernel record** | Reviewed content, not reproducible by re-analysis. Never evictable. |
| Session analysis results + history | **kernel record** (evidence) | The audit trail of what an engine claimed and when. Re-running replaces rather than restores it. |
| Current session draft | **durable draft** | Not promoted content, but losing it loses the user's typing. Survives a crash; not a kernel record until applied. |
| `.mori` package drafts | **durable draft** | Same rule. |
| Live intake rows | **derived index** | D8, already decided and built. Evictable, locator-backed. |
| Project connections, user projects | **kernel record** | A user-authored mapping. Light, but its loss silently rewires every projection. |
| Diagnostics log | **file** | Append-only, disposable, and unfit for a row store. |
| Theme, sidebar, onboarding, notification prefs, observation opt-in, engine presets, language consent | **preference** | Device-local. Stays in localStorage, must never be read as a source of truth. |

### 0.7 Verified: the fallback is invisible where it matters most

Constraint §0.4.3 says a fallback must not become a resting state. It
already is one, in the surface that writes the most.

Every kernel operation catches a SQLite failure, writes to localStorage,
and returns `fellBack: true` with a reason. That contract is right. What
is missing is a reader:

- `record-ledger/useRecordLedger.ts` calls `saveRecord` in ten places and
  reads `fellBack` in **none**. The 기록 workspace is where the user
  authors records, so on desktop a broken SQLite write path sends every
  record to localStorage and says nothing.
- The signal is surfaced only by record search in the command palette and
  by the memory views, which read accepted memory rather than write it.

Two consequences for this plan. First, it is a plausible contributor to
issue #12 itself: a desktop user can be filling the 5 MB store while
believing they are on SQLite. Second, and more important for sequencing,
**every class moved into SQLite adds another silent-fallback path**, so
moving more data before the signal is visible multiplies the failure
rather than fixing it. That is why the revised §7 leads with it.

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

## 7. Slices, revised 2026-08-18

Replaces the original list, which numbered its first migration `V008`
and so would collide with the record kernel. Program order, one commit
each. The ordering rule is that **honesty precedes migration**: nothing
moves into SQLite until a failed write is something the user can see,
because each moved class otherwise adds another silent-fallback path.

**R0 · Surface the fallback.** No schema change, so this is buildable
before the rest is approved. Make `fellBack` reach the user in the
surfaces that write: the 기록 workspace first (§0.7), then any other
writer that discards it. One calm, persistent indication that this
device is not on SQLite and why, not a per-write toast. Add a diagnostics
line reporting the current resting storage per class.

**R1 · `V009` durable content.** Schema, Rust repository, Tauri commands,
TS bridge, mirroring the `V004` `session_imports` pattern, which is the
in-repo precedent. Document-per-row, as §9.3 asks. No adoption yet, so
this slice changes no behaviour and can be verified in isolation.

**R2 · Adopt the heavy classes: session memory bodies and analysis
history.** These are the two the store cannot hold and the ones with no
SQLite path at all today (§0.2). Dual-write, read from localStorage.

**R3 · Adopt the drafts**: current session draft and `.mori` package
drafts.

**R4 · Adopt the authored mappings**: project connections and user
projects. Light in bytes, heavy in consequence, since losing them
silently rewires every projection.

**R5 · Move live intake to a derived-index table** and delete
`evictIntakeRows` with the bound it enforces. Intake is evictable by
class (D8), so it may be rebuilt rather than copied. Its stop-gap exists
only because it shares the 5 MB budget; once it does not, the bound is
the wrong shape for the problem.

**R6 · Flip the read preference.** SQLite becomes authoritative for every
promoted class. A fallback now reports a degraded state through R0's
surface rather than passing as normal operation.

**R7 · Retire dual-write** after one clean cycle.

### 7.1 What each adoption slice owes

R2 through R5 each carry the same gate, from §0.4:

- A backup taken before the one-time pass, and a diagnostics report that
  can say what moved.
- Interruption tested as behaviour, not by inspection: partial, killed
  mid-way, re-run, run twice, and run against a full disk.
- **No deletion.** A derived index may be rebuilt instead of copied,
  which is not deletion, provided its origin is preserved.
- Colocated TS tests, `cargo test` for the Rust repository,
  `check:full` plus build, and a browser-mode check. Browser behaviour
  stays byte-identical throughout.

## 8. Out of scope

- FTS5 / search indexes (W9 global search decides its own storage).
- Changing the `.mori` package format (unaffected).
- Browser-mode storage changes beyond the shared code paths.
- The D5 browser-mode product decision.

## 9. Approval

R0 needs no approval: it changes no schema and moves no data, it only
stops an existing failure from being silent. R1 onward starts when the
user approves §7.

Open questions to confirm at approval time:

1. Is the one-release dual-write window acceptable, or should R6 wait
   for two cycles?
2. Should the one-time adoption also import **saved sessions** that
   exist only in localStorage (recommended: yes, same pass)?
3. Any objection to the document-per-row shape for `V009` (vs columnar
   decomposition)?
4. §0.6 classifies analysis history as durable evidence rather than a
   rebuildable cache, which means it is never evicted and grows without
   bound. Is an explicit retention rule wanted for it, or is unbounded
   correct for an audit trail?
