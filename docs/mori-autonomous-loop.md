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
- Native file picker for `.mori v0` — `save_mori_package_json_as`
  (Save As) and `pick_mori_package_file` (Open) native dialogs, wired
  into the Reports export and the Consolidation Review import panel.
- Local Connector Capture bridge — `mori-local-capture.py` covers
  transcript (file + stdin), note, git working-tree, and `--git-commit`
  inputs, all verified through the connector-pipeline fixture test.
- `.mori` zip-like file layout — `buildMoriPackageFileLayout` turns a
  `MoriPackageV0` into the documented one-file-per-slice map
  (dependency-free; the zip archiving step is a separate decision).

**Open priority (highest first):**

1. `.mori v0` import validation hardening — make `validateMoriPackage`
   check each slice's record shape, not just array-ness, so an
   externally-supplied package is trustworthy before import.

Deferred — revisit when a concrete need appears:
- Evidence / Import Review polish — audited; the Import Review view,
  the `review` lib, and the connector pipeline are mature and
  well-tested with no concrete defect. Revisit when real captured
  data exposes a specific honesty / correctness gap.
- Optional watched-inbox tray — borders on the no-background-watcher
  non-goal; the refresh-only desktop inbox already covers the safe
  case. Revisit only with a concrete, explicitly-triggered design.
- IDE / Terminal integration runtime code — the explicit-capture
  design is documented; building an editor extension waits for a
  concrete first integration target.
- `.mori` zip archiving step — the file-layout builder is shipped;
  the actual zip archive needs an archiving dependency, which is a
  product/security decision the loop must not make unilaterally.
  Revisit when the dependency is explicitly approved.
- Team / shared memory beyond the `.mori v0` package round trip — a
  large surface with no concrete near-term requirement.

When an item ships, move it to **Completed** and renumber the open
list. When the goal document's Current Gaps change, reconcile this
backlog with it.

## 8. Current Next Slice

The next slice should be:

**`.mori v0` import validation hardening — per-record shape checks**

Goal:
`validateMoriPackage` today checks manifest fields, that each slice is
an array, and that privacy / theme are objects — but not the shape of
the records inside. An externally-supplied `.mori` package can carry
malformed records that only fail later. This slice hardens validation
to check each slice's record identity fields, so import can be
trusted.

Scope — do:
- Extend `validateMoriPackage` to check, per slice, that every record
  is an object carrying its required identity fields — e.g. each
  `projects[i]` / `sessions[i]` / `events[i]` / `issues[i]` /
  `decisions[i]` has a non-empty string `id`; `events[i]` also has a
  `type`. Report a precise path (`events[3].id`).
- Keep it structural and deterministic — no schema library, no
  network, no new dependency.
- Keep absent-safe slices absent-safe; only validate records that are
  present.

Scope — do not:
- Add a JSON-schema dependency or change the `.mori v0` format.
- Reject the optional `consolidatedMemories` / `auditTrail` slices
  beyond their existing array-or-absent rule (each record carries its
  own `schemaVersion`).

Suggested files:
- `src/lib/mori-package/validation.ts`
- `src/lib/mori-package/mori-package.test.ts`
- `docs/mori-package-v0.md`

Tests:
- a package with a record missing its `id` is rejected with a precise
  path
- a valid package still validates clean
- the optional slices stay absent-safe

After this slice ships, set the next slice to the new top backlog
item, reconciling with the goal document's Current Gaps.

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
