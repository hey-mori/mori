# Reference Synthesis · Manus Research

| Field | Value |
| ----- | ----- |
| Source reports | "Mori Reference Research Report" (Manus AI, 2026-05-15) and "Mori Controlled Project Memory Consolidation Research" (Manus AI, 2026-05-15). |
| Reports' stated scope | Public sources only; no private repo, credentials, logs, user data, or unpublished implementation details. |
| Analysis date | 2026-05-15 |
| Companion docs | [`memory-orchestrator-reference.md`](memory-orchestrator-reference.md) covers an external always-on memory agent; [`../memory-architecture.md`](../memory-architecture.md) is Mori's own architecture map. |

This file reconciles the two Manus reports against Mori's actual
implementation and documentation state. It does **not** copy the
reports · they remain external research artifacts. Instead it
extracts what Mori should adopt, what it should keep as background,
and what it should explicitly reject for now.

---

## What the reports got right

**Mori is best understood as a local-first AI work memory app for
evidence-based session reconstruction.** Both reports converge on
this framing. The durable unit of value is not a memory snippet ·
it is a reviewed, source-linked understanding of what happened, why
it mattered, what evidence supports it, what was decided, what
remains unresolved, and what should be carried into the next
session. This matches Mori's existing implementation:
[`../memory-architecture.md`](../memory-architecture.md) already
defines Capture → Evidence → Review → Timeline → Project Memory →
Query / Output → Storage as the layer model.

**Evidence is the source of truth; AI interpretation is a proposal.**
Both reports treat this as foundational. Mori's existing
review-before-apply gate (Import Review,
[`../imports.md`](../imports.md)) and the
[Controlled Project Memory Consolidation design](../project-memory-consolidation.md)
already encode this. The reports sharpen the language Mori should
use externally.

**Review-before-apply, with code-review-grade controls.** Both
reports point at GitHub pull request review as the strongest
analogue: per-item accept / edit / discard / comment / approve /
request-changes, viewed state, and a final explicit apply. Mori's
Import Review and the Consolidation Review Surface (planned) should
read like a memory pull request, not like a notes app.

**ADR-style decision memory.** Promoted decisions should carry
context, alternatives, rationale, trade-offs, consequences,
evidence links, status, and supersession instead of being
summary one-liners. Mori already names this idea in the
Consolidation design doc; this synthesis sharpens the field set.

**Memory lifecycle is explicit.** Memories progress through stable
states (proposed / accepted / edited / merged / discarded /
watching / stale / contradicted / superseded / retired). Each state
controls eligibility for Resume Prompt and Reports. Mori's current
design names the union loosely; this synthesis pins it.

**Local-first, no-cloud, no-background-capture as defaults.** Both
reports treat this as a non-negotiable product axis. Matches Mori's
honesty contract in
[`../memory-architecture.md`](../memory-architecture.md).

## What is already implemented in Mori

Both Manus reports list capabilities as "recommended" that Mori has
already shipped. Calling them out explicitly so the reports don't
get treated as a to-do list of unfinished work:

| Manus recommendation | Mori status |
| -------------------- | ----------- |
| Explicit paste / file import for AI transcripts | ✅ Implemented (AI Transcript import) |
| Connector JSONL import with schema validation | ✅ Implemented (paste + desktop inbox) |
| Source-linked evidence model with trust + retention + redaction state | ✅ Implemented (`SourceRef`, `connectorEventId`, `importSummary`) |
| Import Review with accept / discard | ✅ Implemented |
| Narrative Timeline from reviewed events | ✅ Implemented |
| Project Memory cross-session aggregation | ✅ Implemented |
| Saved-session body loading (browser localStorage + desktop SQLite) | ✅ Implemented |
| Resume Prompt with audience + privacy modes (client-safe, summary-only, normal) | ✅ Implemented |
| Local-first storage (browser localStorage + desktop SQLite + `.mori v0` export) | ✅ Implemented |
| Secret-pattern detection at import time | ✅ Implemented (`containsLikelySecret`) |
| Consolidation Proposal Preview helper deriving typed proposals from `ProjectMemoryViewModel` | ✅ Implemented (`consolidationProposals.ts`) |
| Consolidation State layer exposing readiness / counts / warnings to the Memory page | ✅ Implemented (`projectMemoryConsolidationState.ts`) |
| Compact "Planned" preview card on Memory page | ✅ Implemented (`ConsolidationPreviewCard.tsx`) |

The reports' framing of these as "recommended" reflects their
public-source-only scope · Manus could not see the repo state. They
remain accurate research, but should not be re-implemented.

## What Mori should adopt now (durable docs only)

These recommendations land in durable docs as part of this
milestone. No runtime behavior change.

1. **Sharpen product framing.** Make the "evidence-based session
   reconstruction" sentence the durable summary in
   [`../memory-architecture.md`](../memory-architecture.md). Surface
   the same framing in
   [`../project-memory.md`](../project-memory.md).
2. **Pin the Consolidated Memory lifecycle states.** Document the
   ten states (proposed, accepted, edited, merged, discarded,
   watching, stale, contradicted, superseded, retired) with the
   user action that causes each transition and the prompt/report
   eligibility rule.
3. **Adopt ADR field set for promoted decisions.** Specify
   `context`, `alternatives`, `rationale`, `tradeOffs`,
   `consequences`, `evidenceLinks`, `relatedIssues`, `status`,
   `supersededBy`, `createdAt`, `updatedAt`, plus Mori-specific
   `confidence` and `reevaluationTriggers`.
4. **Spec the Consolidation Review Surface.** Three-pane layout
   (grouping rail / proposal list / evidence inspector), grouped
   proposal cards, qualitative confidence labels (High / Medium /
   Low) with rationale, accept / edit / discard / split / merge /
   mark-stale / supersede / resolve / defer / keep-watching action
   set, batch-action guardrails, undo / revert with audit trail.
5. **Spec Accepted Memory Persistence + Audit Trail data model.**
   `AcceptedProjectMemory` carries id / kind / title / summary /
   status / importance / confidence / `evidenceRefs` /
   `sourceSessionIds` / version / `supersedes` / `supersededBy` /
   sensitivity / `resumeEligible` / `reportEligibility` / timestamps
   / `reviewActionIds`. `ReviewAction` records action / actor /
   timestamp / before / after / note / source proposal id.
6. **Resume Prompt + Reports inclusion policy.** Only **accepted**,
   **current** (not stale / contradicted / superseded / retired),
   **sensitivity-compatible** memories appear as current guidance.
   Stale / contradicted memories appear only under a clearly-labeled
   "Limitations / unresolved memory" section.
7. **Privacy posture refinements.** GDPR Article 5 vocabulary
   (transparency / purpose limitation / minimization / accuracy /
   storage limitation) and OWASP secrets-management guidance land in
   [`../memory-architecture.md`](../memory-architecture.md) and
   [`../project-memory-consolidation.md`](../project-memory-consolidation.md).
   "Never store in consolidated memory" list: raw credentials, API
   keys, passwords, private keys, OAuth tokens, session cookies,
   unredacted PII not required for the project, full raw
   transcripts without retention policy, confidential client
   details not marked client-safe, AI claims without an evidence
   link.
8. **Capability-bucket roadmap language.** Where touched, prefer the
   capability buckets (Import and Evidence Foundation, Timeline and
   Review Experience, Project Memory Consolidation, Resume and
   Report Outputs, Optional Local Automation, Queryable Memory,
   Team / Shared Memory) over phase numbers.

## What to keep as reference only

These are useful background but not actionable for Mori now:

- The broad AI memory taxonomy comparison (vector RAG /
  knowledge-graph / tiered memory / multi-strategy retrieval). Mori
  already chose structured + evidence-linked memory; the comparison
  is context for the choice, not a new task.
- The "Vectorize" article. Useful map of the agent-memory market;
  cited for context, not authoritative.
- Pieces' developer-memory feature set. Mori intentionally rejects
  always-on capture; Pieces' product surface is a useful contrast
  but not a model to copy.
- Session-replay / activity-stream UX patterns. Conceptually
  relevant to Narrative Timeline and Trace View, but Mori already
  has those primitives · the references are confirmation, not
  direction.
- Temporal Knowledge Graph for Agent Memory paper. The "validity
  period / supersession" idea has landed in Mori's lifecycle. The
  full TKG construction is out of scope.

## What Mori explicitly rejects from the reports

These recommendations appear in or near the reports but conflict
with Mori's product principles. They are non-goals.

| Recommendation in scope of reports | Why Mori rejects |
| ---------------------------------- | ---------------- |
| Always-on background capture (even as a future option without consent surface) | Violates explicit-import and review-before-apply. |
| Default account scraping (e.g. reading external services to bootstrap memory) | Violates local-first; no OAuth, no cloud, no external accounts. |
| Cloud sync as a baseline assumption | Violates local-first; sync only via explicit `.mori v0` export/import. |
| Autonomous consolidation that mutates Project Memory without review | Violates review-before-apply; AI proposes, user disposes. |
| Storing raw transcripts indefinitely without a retention policy | Violates Mori's `rawDataPolicy` contract. |
| Broad multimodal ingestion (image / audio / video / PDF) | Out of scope for the work-memory product today. |
| Opaque vector / embedding memory as the single truth layer | Violates evidence-as-source-of-truth and inspectability. |
| Confidence as an auto-apply trigger | Confidence is for review prioritisation, not consent. |

## Comparison: this synthesis vs. the always-on memory reference

The two reference packages cover different ground.

| Question | [`memory-orchestrator-reference.md`](memory-orchestrator-reference.md) | This synthesis |
| -------- | ---------------------------------------------------- | -------------- |
| Source | Google Cloud Platform's Always-On Memory Agent (ADK + Gemini) | Two Manus research reports synthesised across multiple public references |
| Posture | Autonomous, scheduled, LLM-driven memory writes | Review-before-apply, user-triggered, evidence-linked |
| Mori's stance | Adopt naming (Ingest / Consolidate / Query), reject defaults (watcher, scheduler, autonomous writes) | Adopt almost the entire posture (lifecycle, ADR, audit trail, privacy) · already aligned |
| What's new in this milestone | n/a (covered there) | Lifecycle states, ADR field set, Consolidation Review surface spec, AcceptedProjectMemory + audit trail data model |

The two references **agree** on what Mori should avoid (autonomous
durable writes, raw secrets in memory, opaque retrieval). They
**disagree** on how memory should normally land · and Mori sides
firmly with this synthesis: durable memory only ever lands through
an explicit user review action.

## Reference landscape Mori should keep a link to

When the corresponding capability surface is built or documented,
these references should be cited for posterity:

- **GitHub pull request review** · analogue for Import Review and
  Consolidation Review Surface.
- **Google Docs suggested edits** · analogue for "proposed vs.
  accepted" visual separation in the Consolidation Review Surface.
- **ADR (Architecture Decision Records)** · analogue for promoted
  decision memory fields and supersession.
- **Local-first software (Ink & Switch)** · foundational posture
  for local ownership, offline, long-term access.
- **GDPR Article 5** · design vocabulary for transparency, purpose
  limitation, minimization, accuracy, storage limitation, even in a
  local-only product.
- **OWASP Secrets Management** · concrete control list for never
  letting secrets reach durable memory or reports.

These belong inline in the docs that govern the corresponding
capability · not as a separate "links" page.

## How the two reports differ from each other

The **Reference Research Report** is broad: product positioning,
reference landscape, capture patterns, timeline/review UX,
prioritised opportunities, capability-bucketed roadmap. Best used
as the source-of-truth on framing.

The **Consolidation Research Report** is deep on one capability:
Controlled Project Memory Consolidation. It carries the lifecycle,
ADR field set, contradiction/staleness scenarios, the Review
Surface design, and the data model (MemoryProposal /
AcceptedProjectMemory / ConsolidationRun / EvidenceRef /
ReviewAction). Best used as the design brief for that capability.

Mori's documentation already absorbs them in this order: framing
first, then the consolidation specifics.

## Actionable doc changes landed in this milestone

| Doc | Change |
| --- | ------ |
| [`docs/references/manus-research-synthesis.md`](manus-research-synthesis.md) | **New** · this file. |
| [`docs/memory-architecture.md`](../memory-architecture.md) | Sharpened product framing (one durable sentence). Added the GDPR Article 5 / OWASP secrets vocabulary to the privacy section. Cross-link to this synthesis. |
| [`docs/project-memory-consolidation.md`](../project-memory-consolidation.md) | Added the ten-state Memory Lifecycle table with eligibility rules. Added the ADR-style decision field set. Added the Consolidation Review Surface UI spec (three-pane, evidence inspector, action set, batch guardrails). Added the Accepted Memory + Audit Trail data model. Added the Resume Prompt / Reports inclusion policy. |
| [`docs/project-memory.md`](../project-memory.md) | Pointer to the lifecycle table; note that accepted memory is a separate capability. |
| [`docs/imports.md`](../imports.md) | "Evidence is the source of truth; AI interpretation is a proposal" framing inserted near the existing review-gate language. |
| [`docs/persistence.md`](../persistence.md) | Pointer to the Accepted Memory data model (no implementation yet). |
| [`docs/roadmap.md`](../roadmap.md) | The capability buckets are surfaced as a top-level synthesis; existing phase-numbered sections are left in place per the no-sweep rule. |
| README.md | Untouched. The architecture / smoke-flow / memory-architecture links already point users to the deeper docs. |

## Open questions for future implementation

None of these block the current docs work, but they are worth
revisiting when the corresponding capability is implemented:

1. **`AcceptedProjectMemory` storage key shape.** Browser key
   prefix `mori.consolidatedMemory.<projectId>.<memoryId>` is in
   the design today; the SQLite analogue (`consolidated_memories`
   table) is still a future migration.
2. **Audit log retention policy.** How many `ReviewAction` rows do
   we keep, and do we ever prune? Initial answer: keep all (small
   payload). Revisit if the audit log grows past the localStorage
   quota.
3. **`reevaluationTriggers` representation.** A typed predicate
   set ("if connector X disappears", "if a later decision
   supersedes this one") or free-form note? Design pending; do not
   ship a complex DSL prematurely.
4. **Confidence label calibration.** Manus suggests qualitative
   labels (High / Medium / Low) with rationale; we should test
   whether qualitative labels improve review quality without
   encouraging overtrust before settling on a numeric vs. label
   surface.
5. **Client-safe export expansion.** The Resume Prompt's
   `clientSafe` mode already strips local paths / URLs / connector
   identity triplets. Should accepted memory carry an explicit
   `sensitivity` flag (`normal | private | client-sensitive |
   secret-risk | redacted`) the same way? Design says yes; not yet
   modelled in code.
6. **Stale detection signals.** Mori has timestamps and
   connector-event identities · enough to detect "newer source
   supersedes older evidence." More sophisticated signals (status
   transitions, scope splits) require richer Quick Pass output.

## Sources

- [Mori Reference Research Report · Manus AI (provided by the user)](https://manus.im) · broad reference landscape.
- [Mori Controlled Project Memory Consolidation Research · Manus AI (provided by the user)](https://manus.im) · Consolidation deep dive.
- [GitHub Docs · About pull request reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews)
- [Google Docs Help · Use suggested edits](https://support.google.com/docs/answer/6033474)
- [Martin Fowler · Architecture Decision Record](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html)
- [ADR community resource](https://adr.github.io/)
- [Ink & Switch · Local-first software](https://www.inkandswitch.com/essay/local-first/)
- [GDPR Article 5 · Principles relating to processing of personal data](https://gdpr-info.eu/art-5-gdpr/)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Park et al. · Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442)
- [Vectorize · Best AI Agent Memory Systems](https://vectorize.io/articles/best-ai-agent-memory-systems) (secondary)
- [Temporal Knowledge Graphs for AI Agent Memory](https://arxiv.org/abs/2501.13956) (secondary)
- [Pieces Documentation · Meet Pieces](https://docs.pieces.app/products/meet-pieces) (contrast)
