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
- `.mori v0` import validation hardening — `validateMoriPackage` now
  checks each slice's per-record identity fields with precise paths.
- `.mori` zip-like layout round-trip — `parseMoriPackageFileLayout`
  reassembles a validated `MoriPackageV0` from the one-file-per-slice
  map, the inverse of `buildMoriPackageFileLayout` (dependency-free).
- Connector template fixture coverage — the `claude-code` and
  `codex-cli` connector sample JSONL are guarded by pipeline
  round-trip tests, mirroring the local-capture fixture test.
- IDE integration — first artifact: `connectors/vscode-task/`, a VS
  Code task template that runs `mori-local-capture.py` on an explicit
  Run Task action (no extension, no watcher).
- Terminal integration — first artifact: `connectors/terminal-helper/`,
  a `mori-capture` shell function wrapping `mori-local-capture.py`
  (git / commit / note / transcript) on an explicit command.
- Real `.mori` zip package — `fflate` dependency added;
  `zipMoriPackage` / `unzipMoriPackage` archive the canonical file
  layout into a real `.mori` zip and validate it back.
- `.mori` zip export wiring — the Reports export writes a real
  `.mori` zip (desktop `save_mori_package_zip_as` Save As dialog;
  browser zip blob download).

**Open priority (highest first):**

All four roadmap tracks (Real `.mori` zip · IDE/terminal capture ·
Team/shared memory spec · continued loop) are approved; sequence them
into small slices in this order:

1. `.mori` zip import wiring — the Consolidation Review import panel
   and desktop open path read a real `.mori` zip package (keep the
   JSON / paste path as a fallback).
2. Evidence / Import Review polish for real local-capture output.
3. Team / shared memory specification doc — roles, privacy
   boundaries, client-safe exports, conflict handling.
4. `.mori` handoff workflow + client-safe package / export rules.
5. Local Connector Capture polish for real captured data.
6. Project Memory UX polish for real captured data.
7. Queryable Memory extensions if a clear safe slice remains.

Deferred — revisit when a concrete need appears:
- Optional watched-inbox tray — borders on the no-background-watcher
  non-goal; the refresh-only desktop inbox already covers the safe
  case. Revisit only with a concrete, explicitly-triggered design.
- A real editor / browser extension — the explicit-capture task and
  shell-helper artifacts ship; an extension waits for that contract
  being proven in real use.
- Cloud sync / remote collaboration backend for shared memory — a
  hard non-goal; team memory ships as spec + `.mori` handoff only.

When an item ships, move it to **Completed** and renumber the open
list. When the goal document's Current Gaps change, reconcile this
backlog with it.

## 8. Current Next Slice

The next slice should be:

**`.mori` zip import wiring — read a real zip package**

Goal:
The Reports export now writes a real `.mori` zip; the import side
still only reads JSON / pasted text. This slice makes the
Consolidation Review import panel and the desktop open path accept a
real `.mori` zip, routed through `unzipMoriPackage` so validation and
review-on-import still apply.

Scope — do:
- Add a Tauri command that reads a picked `.mori` file as raw bytes
  (the existing `open_mori_package_json` reads text — a zip needs
  bytes), or extend the picker flow to return bytes.
- In the Consolidation Review import panel: when the picked file is a
  zip (`.mori`), decode it with `unzipMoriPackage` and feed the
  resulting package's `consolidatedMemories` into the existing
  review-proposal path; keep JSON / pasted-text import working.
- The browser `File` pick should detect a zip (magic bytes `PK`) and
  route through `unzipMoriPackage`.
- Imported memory still enters review — no auto-merge.

Scope — do not:
- Change the canonical layout, the importer's review flow, or the
  in-memory `MoriPackageV0`.
- Add any dependency beyond the approved `fflate`.

Suggested files:
- `src-tauri/src/package.rs`, `src-tauri/src/main.rs`
- `src/lib/desktop/tauriCommands.ts`
- `src/features/memory/ConsolidationReviewView.tsx`
- `src/lib/project-memory/importedMemoryReview.ts` (if a zip-aware
  entry point helps)
- `docs/mori-package-v0.md`, `docs/project-memory-consolidation.md`

Tests:
- a zipped package imports its accepted memory as review proposals
- a corrupt / non-zip file is rejected honestly
- the JSON / paste import path still works

Validation note: touches `src-tauri/` — run `cargo check` / `cargo
test` too.

After this slice ships, set the next slice to Evidence / Import
Review polish for real local-capture output.

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
