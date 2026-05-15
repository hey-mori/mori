# Controlled Project Memory Consolidation

Phase 2 of the [Memory Orchestrator roadmap](roadmap.md#memory-orchestrator-roadmap).
This file specifies the **design** of Mori's controlled
project-memory consolidation system. Implementation lands in
sub-phases; this milestone ships the design plus a small pure helper
(`buildProjectMemoryConsolidationPreview`) so the rest of the work
can be designed against real shapes.

The companion reference analysis lives at
[`docs/references/memory-orchestrator-reference.md`](references/memory-orchestrator-reference.md).
The full memory architecture map lives at
[`docs/memory-architecture.md`](memory-architecture.md).

---

## 1. Problem

Today, Project Memory is recomputed live from the active session +
saved-session metadata + loaded saved-session bodies. That is honest
(no cached lie can sit on disk) but it has costs:

- **Repeated computation.** Every Memory page render rebuilds the
  aggregation from raw inputs. Cheap today, less cheap as the saved
  session count grows.
- **Pruning erases insight.** When a user deletes an old session,
  the cross-session decisions / issues / evidence that session
  contributed disappear with it. There is no "I want to keep that
  finding even after I delete the source session" path.
- **No durable promotion.** Recurring issues, important decisions,
  and key evidence stay in the live derivation. The user cannot say
  "this decision matters at the project level, lock it in."
- **Contradictions are silent.** Two sessions can hold opposing
  decisions and Mori today shows both, ranked by importance, without
  flagging the conflict.
- **Stale memory accumulates.** Old sessions keep contributing rows
  forever; there is no "mark this resolved / superseded" affordance.
- **Resume Prompt is shallow long-term.** The prompt aggregates the
  live state. It does not yet carry an explicit "this is what
  matters about this project" curated layer.

A **controlled consolidation** layer addresses all of these without
introducing the failure modes of the external always-on reference
(silent LLM merges, no review gate, no provenance preservation).

## 2. Product principle

Every consolidation interaction in Mori obeys these invariants:

1. **User-triggered.** Consolidation never starts on a timer, on
   file events, on app launch, or in the background. The user
   clicks a button.
2. **Local-only.** Consolidation runs entirely against locally
   stored sessions / imports / analysis / memory bodies. No external
   account, no cloud sync, no network call. LLM is optional and
   bounded to the user's chosen local endpoint.
3. **Review-before-apply.** Consolidation outputs are *proposals*.
   Nothing lands in durable project memory until the user accepts.
4. **Evidence-linked.** Every proposal cites the source sessions /
   events / sources it came from. No proposal is rendered without
   provenance.
5. **Reversible.** Accepted memories can be edited, marked stale,
   or retired. The audit trail is preserved.
6. **Editable.** The user may edit proposal title / detail / linked
   evidence before accepting.
7. **Privacy-aware.** No raw connector JSONL or transcript text is
   stored in consolidated memory. Existing redaction / retention
   policies on the source carry through.
8. **No always-on capture.** No watcher, no daemon, no scheduled job.

These are non-negotiable. Any future "smart" addition that breaks
one of them does not ship as-is — it goes back to design first.

## 3. Definitions

| Term | Definition |
| ---- | ---------- |
| **Project Memory** | Live, cross-session aggregation today. Recomputed every render from active + saved sessions. Includes `keyDecisions`, `recurringIssues`, `keyEvidence`, `unresolvedRisks`, `recommendedNextSession`, etc. See [`docs/project-memory.md`](project-memory.md). |
| **Consolidated Memory** | A durable, project-level record promoted from Project Memory by the user. Lives on disk independently of the source sessions; survives session pruning. |
| **Memory Proposal** | A typed *candidate* for consolidation. Generated locally from `ProjectMemoryViewModel`. Carries `kind`, `title`, `summary`, `confidence`, `importance`, `evidenceRefs`, `sourceSessionIds`, `proposedAction`, `status`. Never persisted until accepted. |
| **Promoted Decision** | A `Consolidated Memory` derived from one or more `ProjectMemoryKeyDecision` rows. Carries the original decision text + citations. |
| **Recurring Issue** | A `Consolidated Memory` derived from a `ProjectMemoryRecurringIssue` row where `crossSession === true`. Carries the normalised title + affected sessions + signal score. |
| **Key Evidence** | A `Consolidated Memory` derived from a `ProjectMemoryKeyEvidence` row. Cites the `SourceRef` only; no copied source content. |
| **Unresolved Risk** | A `Consolidated Memory` derived from a `ProjectMemoryUnresolvedRisk` row. |
| **Stale Memory** | A previously-accepted `Consolidated Memory` whose source sessions have been pruned, whose status has been resolved upstream, or whose `lastReviewedAt` is older than a configurable threshold. Surfaced for user review. |
| **Contradiction** | Two or more accepted `Consolidated Memory` rows whose `kind === "promotedDecision"` cover the same normalised title but disagree on outcome. Surfaced for user review. |
| **Next Session Recommendation** | A `Consolidated Memory` derived from `recommendedNextSession`. Acts as a planning artefact; can be marked done. |

## 4. Consolidation inputs

The consolidation pass reads from data Mori already has on disk:

- `ProjectMemoryViewModel` (active + saved + loaded body aggregation).
- Loaded saved sessions (`ProjectMemoryLoadedSession[]` from the loader).
- Stored imports per session (`StoredSessionImport[]`).
- Stored memory bodies (`StoredSessionMemoryBody`).
- Stored analyses (`StoredSessionAnalysis`).
- Stored `.mori v0` packages.
- (Future) previously-accepted `Consolidated Memory` records so a
  rerun can dedupe against them.

It does **not** read:

- the filesystem outside `~/.mori/connectors/`,
- network endpoints,
- external accounts,
- raw transcript text beyond what was already explicitly stored
  through Import Review.

## 5. Consolidation outputs

### 5.1 `MemoryProposal`

```ts
type MemoryProposalKind =
  | "promotedDecision"
  | "recurringIssue"
  | "keyEvidence"
  | "unresolvedRisk"
  | "contradiction"
  | "staleMemory"
  | "nextSessionRecommendation";

type MemoryProposalAction =
  | "promote"             // create a new Consolidated Memory
  | "merge"               // merge into an existing Consolidated Memory
  | "markStale"           // mark an existing memory stale
  | "keepWatching"        // accept but flag for re-review later
  | "resolve"             // mark closed/resolved
  | "scheduleNextSession";// add to "next session" tray

type MemoryProposalStatus = "proposed" | "accepted" | "edited" | "discarded";

type MemoryEvidenceRef =
  | { kind: "session";  sessionId: string; sessionTitle?: string }
  | { kind: "event";    sessionId: string; eventId: string }
  | { kind: "source";   sessionId: string; sourceId: string };

type MemoryProposal = {
  id: string;
  kind: MemoryProposalKind;
  title: string;
  summary: string;
  rationale: string;
  /** 0..1; derived from data we already trust (signalScore / priority / confidence). */
  confidence: number;
  importance: "high" | "medium" | "low";
  /** Cites sessions / events / sources — never raw text. */
  evidenceRefs: MemoryEvidenceRef[];
  sourceSessionIds: string[];
  relatedIssueIds: string[];
  relatedDecisionIds: string[];
  proposedAction: MemoryProposalAction;
  status: MemoryProposalStatus;
  createdAt: string;
  updatedAt: string;
};
```

### 5.2 `ConsolidationRun`

```ts
type ConsolidationRun = {
  id: string;
  projectId: string;
  createdAt: string;
  /** Mirror of viewModel.dataBasis at the time the run was generated. */
  dataBasis: ProjectMemoryDataBasis;
  sourceSessionCount: number;
  /** Counts per `MemoryProposalKind`. */
  proposalCounts: Record<MemoryProposalKind, number>;
  warnings: ProjectMemoryWarning[];
  proposals: MemoryProposal[];
};
```

A run is **ephemeral** by default — it lives in memory or session
storage until the user accepts proposals. Only accepted memories
land in durable storage.

## 6. User review flow

```
   Project Memory page
         │
         │  user clicks "Consolidate Memory"
         ▼
   ConsolidationRun built (pure, no IO beyond reading existing storage)
         │
         ▼
   Consolidation Review surface
   ─────────────────────────────────────────────────
   ▸ Decisions to promote      (N proposals)
   ▸ Recurring issues          (N proposals)
   ▸ Risks                     (N proposals)
   ▸ Contradictions            (N proposals)   ← optional, Phase 2.6
   ▸ Stale memories            (N proposals)   ← optional, Phase 2.6
   ▸ Suggested next sessions   (1 proposal)
   ─────────────────────────────────────────────────
         │
         │  per proposal: Accept / Edit / Discard / Keep watching
         ▼
   "Apply N accepted memories"
         │
         ▼
   Durable storage write (Phase 2.3 = browser, Phase 2.4 = SQLite)
         │
         ▼
   Project Memory page re-renders with consolidated memories
   Resume Prompt picks up the new layer
```

Hard rules:

- **No auto-apply.** "Apply" is a separate explicit user action.
- **Clear before/after.** Each proposal shows what currently exists
  in Project Memory and what the proposal would change.
- **Evidence panel.** Every selected proposal opens an evidence
  panel listing its `evidenceRefs` with deep links back to the
  session / event / source.
- **Confidence and data-basis are visible.** A proposal generated
  while `dataBasis === "savedSessionMetadataOnly"` is rendered with
  a warning chip.
- **Local-only notice.** The header carries the same privacy notice
  as the Resume Prompt section.

## 7. UI concept

Not implemented in this milestone. The proposed surfaces:

- **Project Memory right panel** gains a `Consolidate Memory` button
  below the Resume Prompt section. Disabled when there are zero
  loaded sessions or when `dataBasis === "unavailable"`.
- **Consolidation Review** opens as a full-page surface (similar to
  Import Review) so the user can scan all proposals at once.
- **Proposal groups** are collapsible cards keyed on
  `MemoryProposalKind`. Each card shows count + a representative
  proposal.
- **Per-proposal row**: title, summary, importance + confidence
  chips, session attribution, action buttons, evidence panel
  toggle.
- **Apply footer** mirrors Import Review: shows accepted count,
  enabled only when ≥ 1 proposal is accepted.
- **Settings affordance**: a "What's a consolidated memory?" link
  that opens this design doc.

## 8. Storage strategy

Phased so this milestone introduces no storage change.

### 8.1 Now (this milestone)

- `ConsolidationRun` is **ephemeral**. The Phase 2.0 helper returns
  it in-memory; nothing is persisted.
- No localStorage / SQLite / `.mori` change required.

### 8.2 Phase 2.3 — Browser persistence

- New key prefix: `mori.consolidatedMemory.<projectId>.<memoryId>`.
- New `StoredConsolidatedMemory` record:
  ```ts
  type StoredConsolidatedMemory = {
    id: string;
    projectId: string;
    kind: MemoryProposalKind;
    title: string;
    summary: string;
    rationale: string;
    importance: "high" | "medium" | "low";
    evidenceRefs: MemoryEvidenceRef[];
    sourceSessionIds: string[];
    relatedIssueIds: string[];
    relatedDecisionIds: string[];
    status: "active" | "watching" | "stale" | "retired";
    /** Bumped on edit / re-review. */
    schemaVersion: 1;
    acceptedAt: string;
    lastReviewedAt: string;
    /** Free-text user note added at review time. */
    note?: string;
  };
  ```
- `MoriDraftRepository` gains `saveConsolidatedMemory` /
  `listConsolidatedMemoriesByProject` /
  `updateConsolidatedMemoryStatus` /
  `clearConsolidatedMemory` methods.
- Old records (none today) load normally because the field doesn't
  exist yet.

### 8.3 Phase 2.4 — SQLite persistence

- New table `consolidated_memories` with columns mirroring the
  browser shape + a `project_id` foreign key.
- Migration `V00X__consolidated_memories.sql` + Rust command surface.
- Loader pattern: `listConsolidatedMemoriesByProject` returns rows
  from SQLite when available; falls back to browser localStorage
  otherwise.

### 8.4 Phase 2.5 — `.mori v0` export

- Add a `consolidatedMemories[]` slice to `MoriPackageV0`.
- Schema version bump (the package format already has one).
- Import path: a future "import .mori package" UI brings consolidated
  memories into the current project's tray as **proposed** again
  (re-reviewed before merging — same review-before-apply rule).

### 8.5 What never gets stored

- raw connector JSONL,
- raw transcript text beyond the SourceRef title/detail,
- file paths beyond what already exists in `SourceRef`,
- secret-shaped strings,
- session bodies (those stay in their own existing records).

A consolidated memory is **a curated pointer + summary**, not a
copy.

## 9. Relationship to existing systems

| System | Today | After consolidation |
| ------ | ----- | ------------------- |
| **Quick Pass** | Extracts issues / decisions / next-actions / summary from one session's events. Persists `StoredSessionAnalysis` + `StoredSessionMemoryBody`. | Unchanged. Quick Pass output is *input* to consolidation; consolidation never bypasses it. |
| **Project Memory aggregation** | Live cross-session computation; rebuilt every render. | Unchanged. The consolidation pass reads the same `ProjectMemoryViewModel` it would render. |
| **Resume Prompt** | Built from `ProjectMemoryViewModel`. | Will gain a new `consolidatedMemories` section (Phase 2.5) that supersedes raw key-decision / recurring-issue rows when an accepted consolidated memory exists. Live aggregation still shows below for non-promoted rows. |
| **Reports** | Built from session view + analysis. | Will optionally include accepted consolidated memories as a project-level "Long-term memory" appendix (Phase 2.5). |
| **Import Review** | Reviews captured events before they reach the timeline. | Unchanged. The Consolidation Review surface borrows the same review pattern but operates one tier higher. |
| **Evidence Hub** | Shows captured sources + provenance. | Unchanged. `evidenceRefs.kind === "source"` proposals deep-link back to the existing source detail panel. |

The mental model: **Quick Pass extracts → Project Memory aggregates
→ Consolidation promotes.**

## 10. Failure modes

| Failure | What the proposal helper does |
| ------- | ----------------------------- |
| `dataBasis === "activeSessionOnly"` | Emit proposals only for the active session; carry a warning that no cross-session validation is possible. |
| `dataBasis === "savedSessionMetadataOnly"` | Emit proposals only for the active session; suppress recurring-issue cross-session claims. |
| `dataBasis === "partialSavedSessionLoad"` | Emit proposals from loaded sessions only; warn about un-loaded sessions. |
| `dataBasis === "unavailable"` | Empty proposals + a single warning explaining demo / unreachable storage. |
| Saved session has no memory body and no analysis | Skip silently; no fabricated decisions. |
| Two proposals derive from the same underlying entity | Dedupe by normalised title + kind + sorted sourceSessionIds. |
| Conflicting decisions across sessions | Emit a single `contradiction` proposal that cites both decisions (Phase 2.6). |
| Stored consolidated memory references a now-pruned session | Phase 2.6: surface as a `staleMemory` proposal asking the user to retire or refresh. |
| User edits a proposal title | `MemoryProposal.status` flips to `edited`; `updatedAt` is bumped; the edit lands at accept time. |
| User runs consolidation twice in a row | The second run dedupes against accepted memories (Phase 2.3 onwards). |
| Helper called with `null`/empty view-model | Return an empty `ConsolidationRun` with `dataBasis: "unavailable"` and a `storage-unavailable` warning. |

## 11. Non-goals

These are explicit non-goals for Phase 2 — listed so they cannot
silently creep in.

- No background watcher.
- No scheduled consolidation job.
- No cloud sync of consolidated memories.
- No automatic external account reading.
- No unreviewed memory writes (acceptance is always explicit).
- No vector database / embedding requirement.
- No Google ADK / Gemini hard dependency.
- No LLM in the proposal helper (pure derivation only).
- No multimodal ingestion.
- No "auto-merge similar memories" without user review.

If a future sub-phase introduces an LLM-assisted refinement step, it
runs on the user's chosen local endpoint, processes a single
proposal at a time on demand, and the result is still gated by the
same review pattern.

## 12. Implementation phases

| Phase | Scope | Status |
| ----- | ----- | ------ |
| **2.0** | Design doc + pure proposal helper (`buildProjectMemoryConsolidationPreview`) + tests. No persistence, no UI. | ✅ |
| **2.1** | Typed `ProjectMemoryConsolidationState` derived from `ProjectMemoryViewModel`; wired into `MemoryView`; honest "Planned" preview card (no review surface yet). | ✅ |
| **2.2** | Consolidation Review UI: full-page surface, proposal cards, evidence panel, accept / edit / discard / keep-watching actions. No persistence yet — accepted memories are session-scoped. | After 2.1 |
| **2.3** | Browser persistence: `StoredConsolidatedMemory` + repository methods. Accepted memories survive reload. | After 2.2 |
| **2.4** | SQLite persistence: `consolidated_memories` table + Rust migration + load/store commands. | After 2.3 |
| **2.5** | Resume Prompt + Reports integration: promoted memories outrank live aggregation rows. `.mori v0` carries the slice. | After 2.4 |
| **2.6** | Stale / contradiction review: detect pruned-source references and conflicting decisions; surface them as their own proposal kinds. | After 2.5 |
| **2.7** | Optional local memory query against accepted memories with citations (Phase 4 entry on the higher-level roadmap). | Research |

Each sub-phase is independent and reversible. Stopping at any phase
leaves Mori in a working state — Phase 2.0 alone is useful for the
maintainer to see what consolidation would surface today.

### Consolidation State Wiring (landed)

`src/lib/project-memory/projectMemoryConsolidationState.ts` is the
typed state layer on top of the Consolidation Proposal Preview
helper:

```ts
type ProjectMemoryConsolidationStatus =
  | "ready"        // proposals exist; basis is rich
  | "empty"        // basis is fine but no proposals derive
  | "partial"      // basis is narrow (active-only / metadata-only / partial-load)
  | "unavailable"; // demo / no storage / unreachable

type ProjectMemoryConsolidationState = {
  status; preview; proposalCount; proposalCounts;
  topProposalKinds; canOpenReview;       // false until Review Surface exists
  dataBasis; warnings; emptyReason;
  nextStepLabel; generatedAt;
};

function buildProjectMemoryConsolidationState(
  memory: ProjectMemoryViewModel,
): ProjectMemoryConsolidationState;
```

The Memory page consumes this state via a `useMemo` next to the
existing `viewModel` derivation. A `ConsolidationPreviewCard`
component renders it: top-3 proposal kinds + counts, `dataBasis`
badge, "Review proposals (Planned)" disabled button, honesty copy
under the button. **No memory is written.** **`canOpenReview` is
hard-coded `false`** until the Consolidation Review Surface lands;
flipping it requires both a real route and a working accept flow.

## 13. Helper prototype API (Phase 2.0, this milestone)

Live in [`src/lib/project-memory/consolidationProposals.ts`](../src/lib/project-memory/consolidationProposals.ts).

```ts
export type ProjectMemoryConsolidationPreview = {
  dataBasis: ProjectMemoryDataBasis;
  sourceSessionCount: number;
  warnings: ProjectMemoryWarning[];
  proposals: MemoryProposal[];
  proposalCounts: Record<MemoryProposalKind, number>;
};

export function buildProjectMemoryConsolidationPreview(
  memory: ProjectMemoryViewModel,
): ProjectMemoryConsolidationPreview;
```

Rules baked into the helper:

- **Pure.** No IO. No LLM. No clock besides the caller's data.
- **No raw source content.** Proposals cite ids and titles only.
- **Dedupe.** Proposals with the same `(kind, normalisedTitle, sorted sourceSessionIds)` collapse to one.
- **Honest warnings.** Echoes the view-model's warnings + adds a
  basis-specific warning when consolidation reach is limited.
- **No persistence side-effects.** Caller decides what to do with
  the returned run; the helper never writes.

This is the only code change in this milestone. UI, persistence,
LLM, daemon — all deferred.

---

## See also

- [`docs/memory-architecture.md`](memory-architecture.md) — full
  layer map.
- [`docs/project-memory.md`](project-memory.md) — current live
  aggregation contract.
- [`docs/references/memory-orchestrator-reference.md`](references/memory-orchestrator-reference.md) —
  comparison against the external always-on reference.
- [`docs/roadmap.md`](roadmap.md) — phased plan including this
  consolidation work.
- [`docs/e2e-smoke-flow.md`](e2e-smoke-flow.md) — current
  end-to-end walkthrough.
