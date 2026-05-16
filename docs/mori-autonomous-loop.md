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
- `.mori` zip import wiring — the Consolidation Review import panel
  reads a real `.mori` zip; picked bytes route by the `PK` zip magic
  (`parseImportedMemoryProposalsFromZip`), JSON / paste still works.
- Team / shared memory specification — `docs/team-shared-memory.md`:
  the explicit `.mori` handoff sharing primitive, roles, privacy
  boundaries, client-safe export rules, conflict / duplicate model.
- Client-safe `.mori` package filter — `buildClientSafeMoriPackage`
  (pure transform: only `clientSafe` / non-sensitive memory,
  surviving-memory audit rows, `clientSafeExport` manifest flag).
- Client-safe export UI — the Reports `.mori` package strip's
  "client-safe export" action runs the filter before `zipMoriPackage`
  and reports kept / dropped memory counts.
- `.mori` handoff workflow — `team-shared-memory.md` §7: the explicit
  Author export → transfer → Reviewer import walkthrough.
- Real capture walkthrough — `docs/real-capture-walkthrough.md`: an
  end-to-end guide capturing real Claude / Codex / Git work through
  the shipped capture artifacts into the full Mori loop (Track B.3).
- Capture-surface matrix honesty — `captureSurfaces.ts` now lists the
  `localCaptureBridge` surface and the VS Code / terminal rows point
  at the shipped explicit-capture templates; stale `nextStep`s fixed.

**Open priority (highest first):**

All four roadmap tracks (Real `.mori` zip · IDE/terminal capture ·
Team/shared memory spec · continued loop) are approved; sequence them
into small slices in this order:

1. Surface the client-safe marker on `.mori` import — when an
   imported package has `clientSafeExport: true`, the import result
   and the Consolidation Review import panel say so honestly.
2. Project Memory UX polish for real captured data (open — needs a
   concrete defect or improvement to slice).
3. Queryable Memory extensions if a clear safe slice remains.

Deferred — revisit when a concrete need appears:
- Evidence / Import Review polish — audited; the Import Review view,
  the `review` lib, and the connector pipeline are mature and
  well-tested. Revisit when real captured data exposes a specific
  honesty / correctness defect.
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

**Surface the client-safe marker on `.mori` import**

Goal:
`buildClientSafeMoriPackage` marks a package `clientSafeExport: true`
and `getPackageIsClientSafe` reads it, but the import side never
surfaces it. `team-shared-memory.md` §4–5 says an importer should be
able to see a package was filtered. This slice closes that loop.

Scope — do:
- Carry an `isClientSafe` boolean on the `ok` branch of
  `ParseImportedMemoryResult`, set from `getPackageIsClientSafe` in
  `parseImportedMemoryProposals` / `parseImportedMemoryProposalsFromZip`.
- In the Consolidation Review import panel, when an imported package
  is client-safe, show an honest note (e.g. "이 패키지는 client-safe
  export입니다 — 일부 memory가 제외되었을 수 있습니다").
- Keep it a small, honest UI note — no behaviour change to the
  review flow itself.

Scope — do not:
- Change the import / review / dedup logic.
- Treat a client-safe package differently on accept — it still flows
  through the normal review path.

Suggested files:
- `src/lib/project-memory/importedMemoryReview.ts` + its test
- `src/features/memory/ConsolidationReviewView.tsx`
- `docs/team-shared-memory.md`, `docs/project-memory-consolidation.md`

Tests:
- a client-safe package's import result carries `isClientSafe: true`
- a normal package's result carries `isClientSafe: false`

After this slice ships, Tracks A / B / C have their concrete slices
done; reconcile section 7 with the goal document's Current Gaps and
take the next genuinely concrete item (or surface that the remaining
backlog needs a concrete defect / decision).

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
