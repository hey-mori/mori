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
- SQLite `importSummary` mirror — complete: V004 `session_imports`
  migration, `sessionImportRows` converters, the Rust repository, the
  `persist` / `list` / `list_all` Tauri commands, the runtime-aware
  `SessionImportRepository`, and `loadConnectorImportHistorySavedSessionsAsync`
  wired into the `ImportPanel` connector preview so desktop sessions
  feed the re-import rollup.

**Open priority (highest first):**

1. Native file picker for `.mori v0` save / open.
2. Local Connector Capture — a tested end-to-end bridge for real
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

**Native file picker for `.mori v0` export — Save As dialog**

Goal:
Today the Reports `.mori v0` export saves to Mori's default storage
directory (`save_mori_package_json`). This slice adds a native Save As
picker on desktop so the user chooses where the `.mori` file lands.
The `tauri_plugin_dialog` is already initialised and
`pick_repository_directory` is the existing precedent.

Scope — do:
- Add a Tauri command that opens a native Save dialog for a `.mori` /
  `.mori.json` file and returns the chosen path (or a cancelled
  flag), mirroring `repositories::picker::pick_repository_directory`.
- Wire it into the Reports `.mori v0` export: on desktop, pick a path
  then write through `save_mori_package_json` (or a path-taking
  variant); a cancelled dialog aborts cleanly with no error.
- Keep the browser path unchanged (blob download fallback).
- Type the new command in `src/lib/desktop/tauriCommands.ts`.

Scope — do not:
- Change the `.mori v0` package format or the serializer.
- Add the Open / import picker in this slice — Save As first; the
  Open picker is a follow-up.

Suggested files:
- `src-tauri/src/package.rs` (or a `picker` sibling)
- `src-tauri/src/main.rs`
- `src/lib/desktop/tauriCommands.ts`
- `src/features/reports/ReportsView.tsx`
- `docs/mori-package-v0.md`

Tests:
- Rust: the dialog command path-validation / extension rules
  (mirror the `package::tests` extension test)
- frontend: the export still works in the browser fallback path

Validation note: this slice touches `src-tauri/` — run `cargo check`
and `cargo test` in addition to `npm run check:full` / `npm run build`.

After this slice ships, set the next slice to the `.mori v0` Open /
import native picker, then continue with the open backlog.

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
