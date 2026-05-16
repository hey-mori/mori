# Mori Autonomous Development Loop

This document is the operating guide for Ralph-style autonomous
development of Mori. It is a **living document** — sections 7 and 8
(the backlog and the next slice) are kept current as the project
evolves. Sections 1–6 and 9 are stable policy.

Read [`docs/mori-project-goal.md`](mori-project-goal.md) first; it is
the canonical product direction, implementation-status guide, and
non-goal list. This document governs *how* the loop runs.

## 1. Operating Goal

Keep building Mori into a real local-first AI work memory product.

The product loop is:

```
Claude / Codex / ChatGPT / CLI / Git / terminal work
→ explicit capture/import
→ Preview
→ Import Review
→ Timeline / Evidence Hub
→ Project Memory
→ Consolidation Review
→ Accepted Memory
→ Resume Prompt / Reports
→ continue work
```

## 2. Ralph Behavior

Ralph should:
- inspect current repo state
- choose the next highest-value production slice
- implement it
- test it
- update relevant docs
- update this autonomous loop document if the backlog changes
- commit exactly one clean commit
- continue to the next slice automatically

Ralph should not stop just because:
- one milestone is complete
- a milestone is substantial
- a fresh session would be nicer
- a small product decision is needed
- a living goal document update is needed

If a capability is large, Ralph should split it into the smallest
useful production slice and start.

## 3. Decision Standard

Ralph may make product decisions when they are governed by:
- docs/mori-project-goal.md
- existing architecture
- local-first principles
- review-before-apply principles
- evidence-first principles
- long-term extensibility

Choose the option that is:
- product-coherent
- extensible
- testable
- honest about current capability
- safe for user data
- compatible with SQLite, .mori packages, desktop workflows, and
  future connectors

Do not choose temporary shortcuts just because they are easier.

## 4. Hard Non-Goals

Never implement:
- account scraping
- Claude Desktop database scraping
- ChatGPT browser scraping
- Cursor internal database scraping
- browser history scraping
- screen recording
- keylogging
- hidden clipboard capture
- hidden background monitoring
- cloud sync by default
- OAuth integrations
- external account reading
- always-on daemon
- scheduled consolidation jobs
- automatic memory writes without review
- Workroom / Session Canvas / pixel-agent UI unless explicitly
  reprioritized
- Google ADK / Gemini dependency
- embeddings/vector search as source of truth
- broad unrelated rewrites

## 5. Validation Contract

Before every commit:

```
npm run check:full
npm run build
git diff --check
git status --short
```

If src-tauri changed:

```
cd src-tauri
cargo check
cargo test
cd ..
```

## 6. Commit Rules

One clean commit per production slice.

Do not include:
- Co-Authored-By
- Generated with Claude
- AI footers
- validation logs
- audit logs
- “already in place”
- “no changes”

Do not push unless explicitly asked.

## 7. Current Autonomous Backlog

Maintain this list as the project evolves. Capability-based names
only — no phase numbers.

**Completed (do not redo):**
- Queryable Memory — accepted-memory search helper
  (`searchAcceptedMemories`).
- Queryable Memory — Project Memory search UI (`QueryableMemoryCard`).
- Queryable Memory — extension to timeline events, evidence sources,
  and review-action notes (`searchProjectMemoryReferences`).
- Local Connector Capture polish — real `mori-local-capture` output
  verified to round-trip; clean-repo git snapshot coverage added.
- `.mori` native file-open affordance — file picker on the
  Consolidation Review import panel (browser `File` API, no Tauri).
- `.mori` auditTrail package slice — optional additive
  `auditTrail?: StoredMemoryReviewAction[]` on `MoriPackageV0`,
  populated on export with `getPackageAuditTrail` read helper.
- Memory Audit Trail reviewed revert flow — eligibility planner,
  proposal builder, apply helper, per-entry view-model eligibility,
  and the confirm-gated Revert affordance in the audit card.
- SQLite / `.mori` parity cleanup — schema-completeness check now
  covers the V003 accepted-memory tables (`consolidated_memories` /
  `consolidated_memory_audit`) in `requiredSqliteTables`.
- CLI wrapper for Claude/Codex workflows — `mori-local-capture.py
  --transcript -` reads a piped CLI session from stdin (explicit,
  local-only, no subprocess wrapping or background watching).
- IDE / Terminal integration planning — explicit-capture design doc
  in `source-integrations.md` (explicit emit, no background watch).

**Open priority (highest first):**

1. SQLite-side `importSummary` mirror — desktop SQLite-saved sessions
   cannot contribute to the connector re-import rollup; the Memory
   page surfaces this honestly as a warning today.
2. Native file picker for `.mori v0` save / open.
3. Local Connector Capture — a tested end-to-end bridge for real
   Claude / Codex / Git work into `~/.mori/connectors/`.

Deferred — revisit when a concrete need appears:
- Evidence / Import Review polish — audited; the Import Review view,
  the `review` lib, and the connector pipeline are mature and
  well-tested with no concrete defect. Revisit when real captured
  data exposes a specific honesty / correctness gap.

When an item ships, move it to **Completed** and renumber the open
list. When the goal document's Current Gaps change, reconcile this
backlog with it.

## 8. Current Next Slice

The next slice should be:

**SQLite `importSummary` mirror — V004 migration + row mappers**

Goal:
Lay the SQLite foundation for desktop sessions to carry their
connector re-import summary. Today only browser-saved sessions carry
`StoredSessionImport.importSummary`; this slice adds the SQLite table
and the pure TS row converters so a later slice can wire the Tauri
command.

Scope — do:
- Add a `V004__session_imports.sql` migration to
  `src-tauri/migrations/` creating a `session_imports` table — id,
  session_id, source identity, saved_at, and a JSON
  `import_summary_json` column (flatten the object, opaque to Rust).
- Mirror the migration in the TS catalog (`schema.ts`) with a
  matching checksum, and add `session_imports` to
  `requiredSqliteTables`.
- Add pure `toSqliteSessionImportRow` / `fromSqliteSessionImportRow`
  converters in `src/lib/sqlite/` with round-trip tests.
- Keep it additive — the migration only creates a new table; nothing
  existing is rewritten.

Scope — do not:
- Wire the Tauri command or change `localStorageAdapter` yet — the
  command + UI is the next slice.
- Drop or rewrite any existing table.

Suggested files:
- `src-tauri/migrations/V004__session_imports.sql`
- `src/lib/sqlite/schema.ts`
- `src/lib/sqlite/sessionImportRows.ts` (new)
- `src/lib/sqlite/sqlite.test.ts` / a new test file
- `docs/sqlite-migrations.md`, `docs/sqlite-persistence.md`

Tests:
- a `StoredSessionImport` (with and without `importSummary`)
  round-trips through the row converters
- the migration catalog validates and `migrationMentionsRequiredTables`
  covers `session_imports`

Validation note: this slice touches `src-tauri/` — run `cargo check`
and `cargo test` in addition to `npm run check:full` / `npm run build`.

After this slice ships, set the next slice to wiring the Tauri
`session_imports` command + the desktop repository path, and continue.

## 9. Stop Conditions

Stop only if:
- working tree is dirty in a way Ralph cannot understand
- validation fails twice after attempted fixes
- the next task requires cloud sync, scraping, watchers, credentials,
  or account access
- the next task requires Workroom / Session Canvas / pixel-agent UI
- the next task requires a new dependency with product/security
  implications
- the next task requires destructive or ambiguous migration
- the next task cannot be split into a small production slice
- Ralph is about to push

Do not stop because a clean boundary was reached.
Clean boundary means commit and continue.
