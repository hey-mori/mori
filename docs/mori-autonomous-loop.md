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

**Open priority (highest first):**

1. `.mori` zip-like packaging — move `.mori v0` from a flat JSON file
   toward the documented zip-like layout.

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

When an item ships, move it to **Completed** and renumber the open
list. When the goal document's Current Gaps change, reconcile this
backlog with it.

## 8. Current Next Slice

The next slice should be:

**`.mori` zip-like packaging — dependency-free file-layout builder**

Goal:
`.mori v0` is one flat JSON object today. The documented future shape
is a zip-like layout (`manifest.json`, `projects.json`,
`events.jsonl`, …). The actual zip compression needs an archiving
dependency — a decision the loop must not make unilaterally — so this
slice ships the dependency-free half: a pure builder that turns a
`MoriPackageV0` into the documented multi-file layout as an in-memory
map.

Scope — do:
- Add a pure `buildMoriPackageFileLayout(pkg)` that returns a
  `Record<string, string>` keyed by the documented file names
  (`manifest.json`, `projects.json`, `sessions.json`,
  `events.jsonl`, `issues.json`, …, `consolidated_memories.json`,
  `audit_trail.json`), each value the serialised content.
- Reuse `serializeEventsJsonl` for `events.jsonl`; JSON-stringify the
  rest. Keep absent-safe slices absent-safe.
- Add a round-trip-shaped test: every documented file is present and
  parses; the layout is exhaustive over `MoriPackageV0`.

Scope — do not:
- Add a zip / archiving dependency — flag that as a separate decision.
- Change the in-memory `.mori v0` JSON format or the existing
  serialize / deserialize / validate path.

Suggested files:
- `src/lib/mori-package/fileLayout.ts` (new)
- `src/lib/mori-package/index.ts`
- `src/lib/mori-package/mori-package.test.ts`
- `docs/mori-package-v0.md`

Tests:
- the layout contains every documented file and each value parses
- `events.jsonl` round-trips through `serializeEventsJsonl`
- optional slices (`consolidatedMemories` / `auditTrail`) are handled
  absent-safe

After this slice ships, the remaining zip work is the archiving
dependency decision — record it in the backlog and continue with the
next concrete item.

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
