# Controlled Project Memory Consolidation

The **Project Memory Consolidation** capability on Mori's
[roadmap](roadmap.md#memory-orchestrator-roadmap). This file
specifies the **design** of Mori's controlled project-memory
consolidation system. Implementation ships incrementally as discrete
capabilities (Consolidation Proposal Preview, Consolidation State,
Consolidation Review Surface, Accepted Memory Persistence, Memory
Audit Trail, Stale Memory Review, Resume and Report Memory
Integration). The Consolidation Proposal Preview helper and the
Consolidation State layer have landed; the rest is design only.

Companion docs:

- [`docs/references/memory-orchestrator-reference.md`](references/memory-orchestrator-reference.md) —
  external always-on memory agent for contrast.
- [`docs/references/manus-research-synthesis.md`](references/manus-research-synthesis.md) —
  reconciliation of broader external research (review-before-apply,
  ADRs, lifecycle, audit trail, privacy posture).
- [`docs/memory-architecture.md`](memory-architecture.md) —
  Mori's full memory layer map.

The product principle that drives every decision in this file:
**AI may propose project memory, but only the user can make it
durable.**

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
   ▸ Contradictions            (N proposals)   ← optional, lands with Stale Memory Review
   ▸ Stale memories            (N proposals)   ← optional, lands with Stale Memory Review
   ▸ Suggested next sessions   (1 proposal)
   ─────────────────────────────────────────────────
         │
         │  per proposal: Accept / Edit / Discard / Keep watching
         ▼
   "Apply N accepted memories"
         │
         ▼
   Durable storage write (Accepted Memory Persistence: browser → SQLite)
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

- `ConsolidationRun` is **ephemeral**. The Consolidation Proposal Preview helper returns
  it in-memory; nothing is persisted.
- No localStorage / SQLite / `.mori` change required.

### 8.2 Accepted Memory Persistence — Browser

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

### 8.3 SQLite Accepted Memory Storage

- New table `consolidated_memories` with columns mirroring the
  browser shape + a `project_id` foreign key.
- Migration `V00X__consolidated_memories.sql` + Rust command surface.
- Loader pattern: `listConsolidatedMemoriesByProject` returns rows
  from SQLite when available; falls back to browser localStorage
  otherwise.

### 8.4 Resume and Report Memory Integration — `.mori v0` export

- An optional `consolidatedMemories[]` slice on `MoriPackageV0`
  carries accepted memory with the package. **Landed** — the field
  is additive and absent-safe, so no `formatVersion` bump was needed
  (each record already carries its own `schemaVersion`). See
  [`mori-package-v0.md`](mori-package-v0.md).
- The Reports page `.mori v0` export populates the slice from the
  project's accepted memories.
- Import path: a future "import .mori package" UI brings consolidated
  memories into the current project's tray as **proposed** again
  (re-reviewed before merging — same review-before-apply rule). The
  package round-trips the slice today; the review-on-import surface
  is the next step.
- The `auditTrail[]` slice is not carried yet — a later addition.

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
| **Resume Prompt** | Built from `ProjectMemoryViewModel`. | Will gain a new `consolidatedMemories` section (Resume and Report Memory Integration) that supersedes raw key-decision / recurring-issue rows when an accepted consolidated memory exists. Live aggregation still shows below for non-promoted rows. |
| **Reports** | Built from session view + analysis. | Will optionally include accepted consolidated memories as a project-level "Long-term memory" appendix (Resume and Report Memory Integration). |
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
| Conflicting decisions across sessions | Emit a single `contradiction` proposal that cites both decisions (Stale Memory Review). |
| Stored consolidated memory references a now-pruned session | Stale Memory Review: surface as a `staleMemory` proposal asking the user to retire or refresh. |
| User edits a proposal title | `MemoryProposal.status` flips to `edited`; `updatedAt` is bumped; the edit lands at accept time. |
| User runs consolidation twice in a row | The second run dedupes against accepted memories (Accepted Memory Persistence onwards). |
| Helper called with `null`/empty view-model | Return an empty `ConsolidationRun` with `dataBasis: "unavailable"` and a `storage-unavailable` warning. |

## 11. Non-goals

These are explicit non-goals for the Project Memory Consolidation capability — listed so they cannot
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

## 12. Implementation capabilities

| Capability | Scope | Status |
| ---------- | ----- | ------ |
| **Consolidation Proposal Preview** | Pure proposal helper (`buildProjectMemoryConsolidationPreview`) + tests. No persistence, no UI. | ✅ |
| **Consolidation State** | Typed `ProjectMemoryConsolidationState` derived from `ProjectMemoryViewModel`; wired into `MemoryView`; honest preview card. | ✅ |
| **Consolidation Review Surface** | Full-page surface, grouped proposal cards, evidence inspector, local-draft accept / edit / discard / keep-watching / defer / reset actions. No persistence — accepted memories are draft-scoped. | ✅ |
| **Accepted Memory Persistence** | `StoredAcceptedProjectMemory` + `StoredMemoryReviewAction` repository methods; accepted / edited / watching / deferred memories survive reload via browser localStorage. | ✅ landed (browser) |
| **SQLite Accepted Memory Storage** | `consolidated_memories` table + Rust migration + load/store commands. | Planned |
| **Resume and Report Memory Integration** | Promoted memories outrank live aggregation rows; `.mori v0` carries the slice. | Resume Prompt ✅ landed; Reports ✅ landed; `.mori v0` slice ✅ landed (review-on-import planned) |
| **Stale Memory Review** | Detect pruned-source references and conflicting decisions; surface them as `staleMemory` / `contradiction` proposal kinds. | Planned |
| **Queryable Memory over accepted memory** | Optional local memory query against accepted memories with citations. | Research |

Each capability is independent and reversible. Stopping at any
capability leaves Mori in a working state — the Consolidation
Proposal Preview alone is useful for the maintainer to see what
consolidation would surface today.

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
badge, and a "Review proposals" button. **No durable memory is
written.** **`canOpenReview` stays `false`** in the typed state
until Accepted Memory Persistence ships and we have a real apply
path; today the Review Surface is reached via the preview card's
button directly.

### Consolidation Review Surface (landed)

`src/features/memory/ConsolidationReviewView.tsx` is the
full-page review surface, reachable via the
`currentView === "consolidation"` route. Shape:

- **Layout**: two-pane — proposal list on the left (grouped by
  kind), evidence inspector pinned on the right (collapses below on
  narrow viewports).
- **Grouping**: `Decisions to promote / Recurring issues / Key
  evidence / Unresolved risks / Next session recommendations`. The
  `contradiction` and `staleMemory` kinds are reserved on the union
  but not yet emitted by the helper — they appear when the Stale
  Memory Review capability lands.
- **Per-proposal actions**: Accept / Edit (inline modal) / Discard /
  Keep watching / Defer / Reset. Each action runs through the pure
  helper at `src/lib/project-memory/consolidationReviewState.ts`,
  which produces a new immutable draft on every transition.
- **Evidence inspector**: typed `MemoryEvidenceRef[]` rendered as
  session / event / source references. No raw connector content or
  transcript text. Deep links into the source detail panel are
  reserved for a future capability and rendered as ids/titles
  today.
- **Apply boundary**: the footer carries an `Apply accepted
  memories (N)` button that is enabled whenever the draft has at
  least one `accepted` / `edited` / `watching` / `deferred` entry.
  On click the surface calls
  `buildAcceptedMemoriesFromReviewDraft` and writes the result via
  `BrowserDraftRepository.saveAcceptedProjectMemories` +
  `appendMemoryReviewAction`. A success banner shows the saved
  count + audit-log count, with a "Memory로 돌아가기" link. SQLite
  Accepted Memory Storage and `.mori v0` export are separate
  capabilities that lay on top of the same shape later.
- **State scope**: the review draft lives in component state. It
  re-initialises when the underlying proposal set changes (via
  `proposalSignature`). The Apply pass is the only path that
  writes to durable storage; cancelling the navigation discards the
  draft.

The pure draft state helper exposes:

```ts
initializeConsolidationReviewState(proposals) → ConsolidationReviewState
acceptProposal / discardProposal / keepWatchingProposal /
  deferProposal / resetProposal / editProposal / setReviewerNote
countConsolidationReviewStatuses / getReviewEntry /
  effectiveTitle / effectiveSummary
```

All transitions are immutable and unknown-proposal-ids are no-ops
that return the same state reference (the UI can dispatch without
guarding).

## Memory Lifecycle

Every consolidated memory progresses through an explicit state. The
state controls whether the memory is eligible for Resume Prompt or
Reports as **current** guidance, and which user action is required
to move between states. A proposal cannot become `accepted` without
a review action, and a `stale` / `contradicted` memory cannot
appear as current guidance until the user explicitly resolves it.

| Status | Meaning | User action that produced it | Prompt / report eligibility |
| ------ | ------- | ---------------------------- | --------------------------- |
| `proposed` | The Consolidation Proposal Preview emitted a candidate; nothing is durable yet. | (helper output) | Excluded. |
| `accepted` | User approved the proposal as durable Project Memory. | Accept | Eligible if sensitivity allows and the state is `accepted`. |
| `edited` | User changed proposal content (or an already-accepted memory) before / after accepting; before/after diff lives in the audit log. | Edit (then Accept) | Eligible if the resulting state is `accepted`. |
| `merged` | Multiple proposals or accepted memories were combined into one record; absorbed source ids are recorded. | Merge | Eligible as one consolidated memory. |
| `discarded` | User rejected the proposal. Optionally retained in a lightweight audit row; the proposal does not reappear unless new evidence materially changes it. | Discard | Excluded. |
| `watching` | User accepted the proposal as a "keep watching" item — durable, but not yet treated as a strong claim. | Keep watching | Surfaces as advisory, not as guidance. |
| `stale` | Previously useful memory may be outdated (newer evidence, time-bound validity expired, etc.). | Mark stale / detected by Stale Memory Review | Excluded by default; may appear under a "Limitations / unresolved memory" section with a label. |
| `contradicted` | Evidence or another accepted memory conflicts with this claim. | Detected via Contradiction Review / user-marked | Excluded from definitive guidance; appears under unresolved limitations. |
| `superseded` | A newer accepted memory replaces this one; `supersededBy` carries the link. | Supersede | Excluded from current guidance; visible in audit / history. |
| `retired` | User intentionally removed the memory from active use; can be restored. | Retire | Excluded from prompts and normal reports. |

Eligibility rule: **only `accepted` (and not `stale` / `contradicted` /
`superseded` / `retired`) memories appear as current guidance in
Resume Prompt or Reports.** Stale / contradicted memories may
appear only under an explicitly-labelled limitations section.

## ADR-style Decision Memory Fields

Promoted decisions carry full
[Architecture Decision Record](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html)
field discipline rather than a single summary line. The field set
applies to any consolidated memory of kind `promotedDecision`:

| Field | Purpose |
| ----- | ------- |
| `title` | Concise, searchable decision name. |
| `decision` | The durable claim, written as a reviewed statement. Never "AI thinks…". |
| `context` | Why this decision mattered. Cites session evidence / reports / diffs / transcripts. |
| `rationale` | Why this option was chosen; separates fact from interpretation. |
| `alternatives` | Options considered but not chosen. |
| `tradeOffs` | Costs, benefits, constraints, risks. Prevents overconfident memory. |
| `consequences` | Expected or observed downstream effects. Reviewable as they evolve. |
| `evidenceLinks` | Typed `MemoryEvidenceRef[]` — session / event / source pointers. Evidence remains the source of truth. |
| `relatedIssues` | Linked recurring issues, risks, or next actions. |
| `status` | `proposed` / `accepted` / `edited` / `stale` / `contradicted` / `superseded` / `retired` (lifecycle above). |
| `supersededBy` | Pointer to the newer accepted decision when applicable. Preserves history instead of silent mutation. |
| `confidence` | Qualitative label (`high` / `medium` / `low`) + a `rationale` string. **Not** a numeric auto-apply trigger. |
| `reevaluationTriggers` | Free-form notes ("if connector X disappears", "if a later decision changes this API", "if this project ends") that the Stale Memory Review uses to surface the decision for re-review later. |
| `createdAt` / `updatedAt` | Explicit review/edit timestamps. `updatedAt` only bumps on user action, not on background re-runs. |

The same field discipline extends naturally to other consolidated
memory kinds (recurring issues, key evidence, unresolved risks) —
they reuse the lifecycle fields and skip the decision-specific
ones.

## Consolidation Review Surface — UI spec

The Consolidation Review Surface is the analogue of GitHub's pull
request review and Google Docs' suggested-edits flow, scoped to
project memory. It is **not** implemented yet — this section is the
design contract the implementation will satisfy.

### Layout

Three panes:

- **Left rail**: proposal grouping + filter (by kind, by data
  basis, by source session, by confidence label). Carries a "Run
  scope" summary at the top (which sessions are in scope, what
  privacy mode this run used, evidence types included).
- **Center list**: proposal cards, grouped by `MemoryProposalKind`
  (Decisions / Recurring Issues / Key Evidence / Unresolved Risks
  / Stale Memories / Contradictions / Next-session
  Recommendations). Each card shows the proposed durable claim,
  the affected existing memory (if any), the action buttons, the
  qualitative confidence label, sensitivity badge, and last
  evidence date.
- **Right inspector**: evidence inspector for the selected
  proposal. Shows evidence excerpts, source metadata, capture
  type, timestamps, evidence id (never local paths in
  `clientSafe`), related memories, before/after preview, and
  reviewer notes.

The top bar carries a "Apply N accepted proposals" button.
Disabled until at least one proposal is `accepted`. A run banner
declares "Consolidation uses only the evidence you selected. No
memory is written until you apply."

### Per-proposal action set

| Action | Behaviour |
| ------ | --------- |
| Accept | Marks the proposal `accepted`; included in the next apply. |
| Edit | Opens editable fields (title / decision / rationale / etc.); on save the proposal's state becomes `edited` and apply commits the edited form. |
| Discard | Marks the proposal `discarded`; remains visible under a "Show discarded" toggle. |
| Split | Breaks one proposal into multiple narrower proposals (e.g. one decision per scope). |
| Merge | Combines selected proposals (or a proposal + an accepted memory) into one durable record. |
| Mark stale | For proposals against existing memory: flag the existing accepted memory as `stale`. |
| Supersede | Replace an existing accepted memory with the new proposal; preserves the old via `supersededBy`. |
| Resolve | For `contradiction` proposals: record the user's resolution choice and update both contradicting memories. |
| Defer | Park the proposal for the next run without changing memory. |
| Keep watching | Accept as `watching` (durable but advisory, not guidance). |
| Add reviewer note | Free-text annotation; lands on the proposal and on the resulting audit row. |

### Batch actions — guardrails

Batch actions are **only** allowed for safe scopes:

- "Discard all low-confidence duplicate proposals" (constrained:
  matching `confidence === "low"` AND dedupe-key match).
- "Accept selected reviewed proposals" (constrained: only the
  proposals the user explicitly selected).
- No "Accept all" without an explicit confirmation step that
  surfaces the count + sensitivity summary.

Each batch action triggers a preview ("you are about to discard /
accept N proposals") and an undo affordance (next section).

### Empty / partial-data states

- **No candidates**: "No consolidation candidates found from the
  selected evidence. Import more evidence or broaden the run
  scope."
- **Partial data**: per-proposal badge ("Based on AI Transcript
  imports only; Git Diff evidence was not included.") and a
  run-level limitations summary.
- **Privacy notice**: persistent banner explaining local-only
  derivation, no cloud, no external accounts.

### Undo / revert

After the user clicks "Apply N accepted proposals":

- A review summary appears: applied count, source titles,
  sensitivity summary, audit log link.
- **Undo apply** creates a *new* audit row that reverts the
  changes; history is preserved (no silent deletion).
- The full audit log is reachable from the Project Memory page
  and is filterable by proposal kind, actor, and timestamp.

### Confidence display

Mori uses qualitative confidence labels (`high` / `medium` /
`low`) with a `why` string. **Confidence is never an auto-apply
trigger.** Apply requires a user action; confidence only helps the
user prioritise their review.

## Accepted Memory Persistence — data model

When the Consolidation Review Surface lands and the user accepts
proposals, the accepted memories persist as durable project-level
records. The shape is fixed here so storage, audit, and Resume
Prompt integration can be implemented against a stable contract.

### `AcceptedProjectMemory`

```ts
type ConsolidatedMemoryStatus =
  | "accepted"
  | "watching"
  | "stale"
  | "contradicted"
  | "superseded"
  | "retired";

type ConsolidatedMemorySensitivity =
  | "normal"
  | "private"
  | "client-sensitive"
  | "secret-risk"
  | "redacted";

type AcceptedProjectMemory = {
  id: string;
  projectId: string;
  kind: MemoryProposalKind;           // promotedDecision | recurringIssue | …
  title: string;
  summary: string;
  /** ADR-style fields when `kind === "promotedDecision"`. */
  structured?: {
    context?: string;
    rationale?: string;
    alternatives?: string[];
    tradeOffs?: string[];
    consequences?: string[];
    reevaluationTriggers?: string[];
  };
  status: ConsolidatedMemoryStatus;
  importance: "high" | "medium" | "low";
  confidence: { label: "high" | "medium" | "low"; rationale: string };
  evidenceRefs: MemoryEvidenceRef[];    // session | event | source pointers only
  sourceSessionIds: string[];
  originProposalIds: string[];
  supersedes?: string;                  // AcceptedProjectMemory.id
  supersededBy?: string;                // AcceptedProjectMemory.id
  sensitivity: ConsolidatedMemorySensitivity;
  resumeEligible: boolean;              // Resume Prompt inclusion
  reportEligibility: "personal" | "team" | "client-safe" | "excluded";
  version: number;                      // bumps on explicit edit
  createdAt: string;
  updatedAt: string;
  acceptedAt: string;
  acceptedBy?: string;                  // local user / device label, optional
  reviewActionIds: string[];            // links into the audit trail
  schemaVersion: 1;
};
```

### `ReviewAction` (audit row)

```ts
type ReviewActionType =
  | "accept" | "edit" | "discard" | "split" | "merge"
  | "markStale" | "supersede" | "resolve" | "defer"
  | "keepWatching" | "retire" | "revert" | "reviewerNote";

type ReviewAction = {
  id: string;
  projectId: string;
  actionType: ReviewActionType;
  actor: "local-user";                  // single-user product today
  timestamp: string;
  /** Compact diff or structured before/after of the target. */
  before?: unknown;
  after?: unknown;
  note?: string;
  sourceProposalId?: string;
  targetMemoryIds: string[];
  runId?: string;                       // ConsolidationRun id
  reversible: boolean;                  // does this support one-click undo
  schemaVersion: 1;
};
```

### What never gets stored in `AcceptedProjectMemory`

- raw connector JSONL,
- full raw transcripts beyond what the user explicitly retained,
- file paths beyond what already exists on the underlying
  `SourceRef`,
- secret-shaped strings (the proposal helper screens for these;
  the apply path screens again before write),
- AI claims with no `evidenceRefs` entry.

A consolidated memory is **a curated pointer + summary**, not a
copy of the evidence.

## Memory Audit Trail

The `ReviewAction` records above form an append-only audit trail
per project. Every state transition in the lifecycle produces one
row. The trail is local-only and shipped as part of `.mori v0`
export when the package format is extended for the consolidation
capability.

UI surfacing — landed:

- The **Memory Audit Trail** card on the Project Memory page renders
  the log via the pure `buildMemoryAuditTrailViewModel` helper
  (`src/lib/project-memory/memoryAuditTrail.ts`): actions sorted
  newest-first, grouped by UTC date, with an action-type filter.
- Each row shows the action type, time, affected-memory count, and
  an optional reviewer note. The `before` / `after` snapshots are
  intentionally **not** rendered, so the audit surface never exposes
  raw evidence content or local paths.
- The helper tolerates legacy / missing fields (unknown action type,
  missing `targetMemoryIds`, unparseable timestamp).

UI surfacing — still planned:

- "Undo apply" creates a new `ReviewAction` with
  `actionType: "revert"`, `reversible: true`, and a `before`/`after`
  pair that captures the reverted state. Undo is itself reversible.
- Discard rows are kept by default (lightweight payload); the user
  can purge them via Settings → Memory cleanup.
- SQLite-backed audit storage and the `.mori v0` `auditTrail`
  export.

## Resume Prompt and Reports inclusion policy

When consolidated memory persistence lands, the Resume Prompt
builder and the Reports builder consume `AcceptedProjectMemory[]`
under a conservative policy:

| Output | Which memories | Citation style | Sensitive-detail handling |
| ------ | -------------- | -------------- | -------------------------- |
| Resume Prompt | `status === "accepted"` AND not stale / contradicted / superseded / retired AND `resumeEligible === true` AND sensitivity-compatible with the chosen privacy mode. | Inline evidence ids or compact source labels. | Exclude `client-sensitive` / `private` / `secret-risk` memories unless the audience + privacy mode explicitly allow. |
| Handoff Report | `status === "accepted"` decisions + open risks + next actions + status. | Footnotes / evidence appendix. | Team-safe policy; private notes omitted. |
| Team Update | High-level accepted progress, current blockers, agreed decisions. | Minimal evidence links. | Personal retrospective + client-confidential content omitted. |
| Personal Retrospective | Accepted patterns, recurring issues, decision quality, process notes. | Evidence references optional. | Local + user-approved only. |
| Client-safe Report | Only memories with `reportEligibility === "client-safe"`. | Sanitised references; no raw artefacts. | Strictly omit secrets, internal reasoning, personal data, unapproved evidence. |

Stale / superseded decisions never appear as current guidance.
They may appear under a clearly-labelled "Historical context" or
"Superseded decisions" appendix when historically useful.
Contradicted memories appear only under "Open contradictions /
limitations" until the user resolves them.

### Resume Prompt hookup — landed

The Resume Prompt builder
[`projectMemoryResumePrompt.ts`](../src/lib/project-memory/projectMemoryResumePrompt.ts)
now accepts an optional `acceptedMemories` input. When supplied it
renders an **Accepted project memory (reviewed)** section
immediately after the summary — ahead of the live `decisions` /
`issues` aggregation — so reviewed durable memory outranks
recomputed rows.

The inclusion policy is the exported pure predicate
`isResumeGuidanceMemory(memory, privacyMode)`: a record is current
guidance only when `resumeEligible` is true, its status is
`accepted` / `edited`, its kind is not `staleMemory` /
`contradiction`, and (in `clientSafe` mode) its sensitivity is
`normal`. The companion predicate `isMemoryFlaggedForReview` marks
`staleMemory` / `contradiction` kinds and `watching`-status records
for re-review — they are counted under Limitations, never shown as
guidance. `superseded` / `retired` records are excluded entirely.

A future refinement may dedupe a live aggregation row when an
accepted memory already covers the same kind/title; today both can
appear, with the accepted section clearly labelled as reviewed.

### Reports hookup — landed

The Reports builder
[`reportBuilder.ts`](../src/lib/report/reportBuilder.ts) accepts the
same optional `acceptedMemories` input and exposes a toggleable
`consolidatedMemory` report section. Inclusion is gated by
`isReportGuidanceMemory(memory, type)`, which combines the lifecycle
gate (status `accepted` / `edited`, kind not `staleMemory` /
`contradiction`) with an **audience-tier** check: each report type
has a tier (personal / team / client) and a memory's
`reportEligibility` rank must meet it. `excluded` memories never
appear. Stale / contradicted / watching records are counted in a
re-review note rather than rendered as guidance, reusing the shared
`isMemoryFlaggedForReview` predicate.

The remaining part of this capability is the `.mori v0` package
slice — exporting / importing accepted memories so they travel
between devices.

## Contradiction and Staleness signals

The Consolidation Proposal Preview helper does not yet emit
`contradiction` or `staleMemory` kinds; the design specifies how
they will be detected when Stale Memory Review and Contradiction
Review ship:

| Signal | Detection | Resulting proposal |
| ------ | --------- | ------------------ |
| Newer evidence supersedes older evidence behind an accepted memory. | Source `capturedAt` timestamps + `connectorEventId` chains. | `staleMemory` proposal citing the original memory + the newer evidence. |
| Two accepted decisions cover the same normalised title with different `decision` text. | Title-normalisation match across `AcceptedProjectMemory[]`. | `contradiction` proposal grouping the conflicting decisions. |
| An issue was open in an older session and resolved in a newer session. | Status transition detected via the cross-session aggregator. | Either a `staleMemory` proposal (if the resolution is uncertain) or a direct resolution action (if confidence is high). |
| `reevaluationTriggers` fired (e.g. "if connector X disappears"). | Run-time check against the current `ProjectMemoryViewModel`. | `staleMemory` proposal with the trigger named. |
| Proposal is based on partial run data. | Run-level limitations carried on the proposal. | Existing proposal carries a "partial data" badge; no new kind. |

In every case the Consolidation Review Surface presents the
detection as a **review task**, not as an AI verdict. Phrasing
defaults to "This may conflict with…" or "Newer evidence suggests
this memory may be outdated."

## 13. Helper prototype API — Consolidation Proposal Preview

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
