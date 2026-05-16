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
- Memory Audit Trail reviewed revert flow — revert eligibility
  planner (`planMemoryReviewRevert`, pure, read-only).
- Memory Audit Trail reviewed revert flow — proposal builder
  (`buildMemoryRevertProposal` → `MemoryRevertProposal`, pure).
- Memory Audit Trail reviewed revert flow — apply helper
  (`applyMemoryRevertProposal`, pure; `revert` audit `actionType`).

**Open priority (highest first):**

1. Memory Audit Trail reviewed revert flow — wire the revert proposal
   + apply helper into the Memory Audit Trail UI surface
2. SQLite / `.mori` parity cleanup (e.g. SQLite-side `importSummary`
   mirror)
3. CLI wrapper for Claude/Codex workflows, explicit/local only
4. IDE / Terminal integration planning, no hidden monitoring

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

**Memory Audit Trail reviewed revert flow — per-entry revert eligibility
in the audit view-model**

Goal:
Surface, per audit-trail entry, whether that action can be reverted —
so the UI slice that follows only has to render a button and call the
already-built helpers. The planner, proposal builder, and apply
helper exist; this slice carries their verdict into
`MemoryAuditTrailViewModel`.

Scope — do:
- Extend `buildMemoryAuditTrailViewModel` to optionally accept the
  project's accepted memories and, when supplied, attach a per-entry
  `revert` summary — `{ eligible, ineligibleReason }` — computed via
  `planMemoryReviewRevert`. Keep the option absent-safe: with no
  memories passed, entries carry no revert summary and behaviour is
  unchanged.
- Keep the helper pure: no IO, no mutation, deterministic.

Scope — do not:
- Add the revert button or apply wiring — that is the next slice.
- Persist anything or change the audit card's rendering yet.
- Replay imported `.mori` audit rows.

Suggested files:
- `src/lib/project-memory/memoryAuditTrail.ts`
- `src/lib/project-memory/memoryAuditTrail.test.ts`
- `docs/project-memory-consolidation.md`

Tests:
- with accepted memories supplied, an eligible action's entry is
  marked revertible
- an ineligible action's entry carries the reason
- with no memories supplied, entries carry no revert summary

After this slice ships, set the next slice to rendering the revert
action in the Memory Audit Trail card and wiring acceptance through
the repository, then continue with the open backlog.

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
