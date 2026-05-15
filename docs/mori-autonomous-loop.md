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

**Open priority (highest first):**

1. Local Connector Capture polish with real generated output
2. Evidence / Import Review polish for real captured data
3. `.mori` native file-open affordance if safe
4. `.mori` auditTrail package slice
5. Memory Audit Trail reviewed revert flow
6. SQLite / `.mori` parity cleanup (e.g. SQLite-side `importSummary`
   mirror)
7. CLI wrapper for Claude/Codex workflows, explicit/local only
8. IDE / Terminal integration planning, no hidden monitoring

When an item ships, move it to **Completed** and renumber the open
list. When the goal document's Current Gaps change, reconcile this
backlog with it.

## 8. Current Next Slice

The next slice should be:

**Local Connector Capture polish with real generated output**

Goal:
Make the `connectors/local-capture` bridge's real generated output
verifiably correct end-to-end, and keep its fixtures and docs in sync
with what the script actually emits.

Scope — do:
- Verify the `mori-local-capture` script output for each input mode
  (`--transcript`, `--note`, `--git-repo`) parses cleanly and yields
  valid Import Review candidates through the existing connector
  pipeline.
- Keep the committed sample fixture
  (`connectors/local-capture/sample-event.jsonl`) matching the
  shape the script emits today.
- Tighten the connector docs so they describe the real flow.

Scope — do not:
- Add watchers, daemons, or polling.
- Add wrappers unless explicit and local-only.
- Do any account / app / database scraping.
- Bypass Preview or Import Review — generated JSONL must continue
  through both.

Suggested files:
- `connectors/local-capture/mori-local-capture.py`
- `connectors/local-capture/sample-event.jsonl`
- `connectors/local-capture/README.md`
- `docs/connectors/local-capture.md`
- `src/lib/connectors/connectorLocalCaptureFixture.test.ts`

Tests:
- sample fixture parses with no validation errors
- each input mode (`transcript`, `note`, `git-repo`) produces a
  normalized Import Review candidate
- connector identities (`connectorEventId`) are present and stable
- no secret-shaped values or raw local paths leak into the output

Commit message:

```
feat: polish Local Connector Capture output

- Verify mori-local-capture output round-trips through Preview and Import Review
- Keep the local-capture sample fixture aligned with real script output
- Strengthen connector pipeline tests for transcript, note, and git inputs
- Preserve explicit, user-triggered, local-only capture boundaries
- Document the verified local capture flow
```

After this slice ships, set the next slice to the new top item of the
open backlog (Evidence / Import Review polish) and continue.

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
