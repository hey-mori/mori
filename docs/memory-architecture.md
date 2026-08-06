# Mori Memory Architecture

> **Doctrine status (2026-07-14): implementation reference, no longer
> identity.** The identity sentence below is superseded: Mori is a
> local-first personal context workspace centered on the user's record
> ledger, per
> [`design/mori-context-workspace-architecture.md`](design/mori-context-workspace-architecture.md)
> and the rewritten [`mori-project-goal.md`](mori-project-goal.md) §1.
> The layer map in this file stays accurate as a description of the
> implemented engine, which becomes the Distill stage (extraction →
> Understand/Propose, aggregation → Aggregate, consolidation →
> Distill). Do not cite this file for product direction.

Mori is a **local-first AI work memory app for evidence-based
session reconstruction and continuation**. The durable unit of
value is not a memory snippet · it is a reviewed, source-linked
understanding of *what happened*, *why it mattered*, *what evidence
supports it*, *what was decided*, *what remains unresolved*, and
*what should be carried into the next session*.

This file is the canonical map of Mori's memory layers: what each
one does today, what its inputs and outputs are, what the privacy
boundary looks like, and what's planned next.

For comparison against external always-on memory designs (Google
ADK's Always-On Memory Agent) see
[`docs/references/memory-orchestrator-reference.md`](references/memory-orchestrator-reference.md).
For the synthesised reconciliation of external research against
Mori's actual implementation see
[`docs/references/manus-research-synthesis.md`](references/manus-research-synthesis.md).
For a runnable walkthrough of the full loop see
[`docs/e2e-smoke-flow.md`](e2e-smoke-flow.md).

## Honesty contract

These properties hold across every layer below. If a feature would
violate any of them it does not ship.

- **Explicit ingestion only.** No filesystem watcher, no daemon, no
  account scraping. Every import begins with a user action.
- **Review-before-apply.** Every captured artifact passes through
  Import Review before reaching the session timeline.
- **Provenance over prose.** Every memory row is anchored on a
  typed `SourceRef` with kind, trust level, redaction status, and
  raw-data retention policy.
- **Determinism over LLM trust** wherever possible. Dedupe,
  aggregation, and resume-prompt synthesis run in pure code. LLM
  involvement is optional and bounded to Quick Pass.
- **Local-only.** No cloud sync, no OAuth, no external account
  reading.

## Privacy and security principles

Even though Mori runs entirely local, the privacy posture is
explicit. The vocabulary borrows from
[GDPR Article 5](https://gdpr-info.eu/art-5-gdpr/) (transparency,
purpose limitation, data minimization, accuracy, storage
limitation, integrity and confidentiality) and from the
[OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
(do not let secrets reach durable artefacts):

- **No background capture by default.** No watcher, no daemon, no
  scheduled job.
- **No account scraping.** No OAuth, no cloud, no external account
  reading.
- **Raw transcript retention is explicit.** Every connector event
  carries a `rawDataPolicy` (`summary_only` / `retained` /
  `redacted` / `reference_only`); Mori does not silently keep raw
  text past what the policy allows.
- **Secret detection before apply.** `containsLikelySecret` runs
  at import time; the Import Review banner surfaces matches.
- **Evidence-linked claims.** Every derived item points to its
  source spans (`sourceEventIds`, `relatedSourceIds`,
  `connectorEventId`).
- **Stale / contradictory memory needs review.** It does not
  silently flow into Resume Prompt or Reports.
- **Visible consent.** The Memory page surfaces a `dataBasis`
  badge and a warnings strip so the user can see exactly what
  reach Project Memory has.
- **Client-safe outputs avoid sensitive source details.** Resume
  Prompt's `clientSafe` mode strips local paths, URLs, connector
  identity triplets, and secret-shaped strings.
- **What never enters durable consolidated memory:** raw
  credentials, API keys, passwords, private keys, OAuth tokens,
  session cookies, unredacted PII not required for the project,
  full raw transcripts without retention policy, confidential
  client details not marked client-safe, AI claims with no
  evidence link. The Consolidation Review Surface enforces this
  before durable writes; see
  [`project-memory-consolidation.md`](project-memory-consolidation.md).

---

## Mori Memory Orchestrator (overview)

```
   Capture / Import  ─────────►  Review / Interpretation  ─────────►  Timeline
        │                                  │                              │
        ▼                                  ▼                              ▼
   Evidence / Provenance  ─────────────────────────────────────►  Project Memory
                                                                          │
                                                                          ▼
                                                                Query / Output
                                                                (Resume Prompt,
                                                                  Reports)
                                                                          │
                          ┌───────────────────────────────────────────────┘
                          ▼
                      Storage
                (localStorage / SQLite / .mori v0)
```

The "orchestrator" is not a process · it's the sequence of explicit
user actions the UI walks the user through. The orchestration code
lives in `src/app/sessionStore.ts`, `src/features/memory/MemoryView.tsx`,
and the import / review feature trees.

---

## Layer 1 · Capture / Import

Where the user explicitly hands work artefacts to Mori.

| Input source | Implementation status | File |
| ------------ | -------------------- | ---- |
| Connector JSONL (paste) | ✅ Implemented | [`src/features/import/ImportPanel.tsx`](../src/features/import/ImportPanel.tsx) |
| Connector JSONL (desktop inbox, `~/.mori/connectors/`) | ✅ Implemented (Tauri only; user picks files manually) | [`src-tauri/src/connectors/inbox.rs`](../src-tauri/src/connectors/inbox.rs), [`src/lib/desktop/connectorInbox.ts`](../src/lib/desktop/connectorInbox.ts) |
| AI Transcript (paste) | ✅ Implemented | [`src/features/import/`](../src/features/import/) |
| Git Diff | ✅ Implemented | [`src/features/import/`](../src/features/import/), [`src/lib/import/`](../src/lib/import/) |
| Manual Note | ✅ Implemented | [`src/features/import/`](../src/features/import/) |
| URL / web research | 🟡 Partial · captures the URL + manual note, no fetch | [`src/features/import/`](../src/features/import/) |
| Repository metadata | ✅ Implemented (for git diff) | [`src/lib/repositories/`](../src/lib/repositories/) |

**Inputs:** raw text the user explicitly pasted, or files the user
explicitly selected.

**Outputs:** typed `ConnectorEvent[]` (for connectors) or normalised
`NormalizedImportCandidate` records for other sources.

**Privacy boundary:** raw text stays only inside the import surface
until the user clicks Apply. `ConnectorPrivacyBoundary` records the
capture method and the raw-data retention policy on every event.
Secret-pattern detection runs at import time.

**Failure modes:**
- Malformed JSONL lines → reported as `ConnectorValidationError`,
  never crash the import.
- Browser repository unavailable → import is blocked with a warning.
- Tauri inbox unavailable → browser fallback message.

**Next tasks:**
- ~~Optional opt-in watcher for `~/.mori/connectors/`~~ · shipped as
  the opt-in background inbox watcher (`src/lib/background-watch/`,
  off by default, review gate unchanged).
- Real URL fetcher with redaction (deferred).

## Layer 2 · Evidence / Provenance

Where each captured artefact gets a stable identity, trust label, and
retention policy.

**Implementation status:** ✅ Implemented.

Key concepts:

- `SourceRef` (`src/domain/types.ts`) · `id`, `kind`, `title`,
  `detail`, `trustLevel`, `redactionStatus`, `rawRetention`,
  `capturedAt`, `relatedEventIds`.
- `TimelineEvent.connectorEventId` · stable triplet
  `<connectorId>::<externalSessionId|unscoped>::<eventId>` used for
  duplicate detection across sessions.
- `StoredSessionImport.importSummary` · `ConnectorSourceImportSummary`
  carrying the per-import re-import status, matched saved sessions,
  duplicate counts, and history-availability flag.
- Identity-based dedupe runs in pure code in
  [`src/lib/connectors/connectorEventIdentity.ts`](../src/lib/connectors/connectorEventIdentity.ts)
  and [`src/lib/connectors/connectorImportHistory.ts`](../src/lib/connectors/connectorImportHistory.ts).

**Privacy boundary:** redaction state is recorded per source. Raw
data retention follows `rawDataPolicy` (`summary_only` /
`retained` / `redacted` / `reference_only`). Cross-session duplicate
detection never compares text · only identities.

**Failure modes:**
- Old imports without `connectorEventId` cannot retroactively be
  deduplicated. Project Memory surfaces this as a
  `old-imports-without-identity` warning.

**Next tasks:**
- SQLite-side `importSummary` mirror so desktop-saved sessions can
  contribute to the connector re-import rollup.

## Layer 3 · Review / Interpretation

Where the user reviews each captured artefact before it joins the
session timeline.

| Surface | Status | File |
| ------- | ------ | ---- |
| Import Review (accept / discard / edit per event) | ✅ Implemented | [`src/features/review-import/ImportReviewView.tsx`](../src/features/review-import/ImportReviewView.tsx) |
| Source-level re-import summary on Apply | ✅ Implemented (post-`4c404b5`) | [`src/lib/connectors/connectorImportSummary.ts`](../src/lib/connectors/connectorImportSummary.ts) |
| Quick Pass analysis (issue / decision / next-action extraction) | ✅ Implemented (deterministic provider + optional Ollama) | [`src/lib/analysis/`](../src/lib/analysis/) |
| User correction of AI-extracted items | 🟡 Partial · Review allows accept/discard/edit on events; no edit UI on Quick-Pass-derived issues/decisions yet | [`src/features/review-import/`](../src/features/review-import/) |

**Inputs:** captured events from Layer 1 + (optionally) the active
session's already-applied imports.

**Outputs:**
- Applied `TimelineEvent[]` (via `StoredSessionImport`).
- After Quick Pass: `MoriAnalysisResult` (issues / decisions /
  next-actions / relationships / summary).
- After Quick Pass: `StoredSessionMemoryBody` snapshot persisted to
  browser localStorage.

**Privacy boundary:** Quick Pass uses the active session's events
and sources only. The Ollama provider hits a local endpoint the user
configures; the deterministic provider runs entirely in JS.

**Failure modes:**
- Ollama unreachable → automatic fallback to deterministic
  heuristic, annotated in `MoriAnalysisResult.notes`.
- Apply with no draft → no-op with an honest error banner.

**Next tasks:**
- Review edit UI for Quick-Pass-derived issues / decisions /
  next-actions (deferred to a future polish milestone).

## Layer 4 · Timeline

Where applied events become a navigable session view.

**Implementation status:** ✅ Implemented.

Owners: [`src/features/timeline/`](../src/features/timeline/),
[`src/lib/timeline/`](../src/lib/timeline/).

**Inputs:** `TimelineEvent[]` flattened from
`StoredSessionImport.events` plus Quick-Pass-derived
relationships.

**Outputs:** Timeline cards, lanes (Flow view), trace relationships.

**Privacy boundary:** Timeline shows only what was applied through
Review. No raw connector JSONL is read here.

**Failure modes:** empty session → friendly placeholder + link to
Evidence Hub.

**Next tasks:** none from this milestone.

## Controlled consolidation (Phase 2)

Project Memory today is computed live from active + saved sessions
every render. **Controlled consolidation** is the user-triggered
layer that promotes selected aggregations into durable project-level
memories. It is review-before-apply, evidence-linked, reversible,
and never automatic. The design lives at
[`docs/project-memory-consolidation.md`](project-memory-consolidation.md).

The Consolidation Proposal Preview helper
([`src/lib/project-memory/consolidationProposals.ts`](../src/lib/project-memory/consolidationProposals.ts))
produces typed `MemoryProposal[]` from any `ProjectMemoryViewModel`.
The Consolidation State layer
([`src/lib/project-memory/projectMemoryConsolidationState.ts`](../src/lib/project-memory/projectMemoryConsolidationState.ts))
wraps it in a `ProjectMemoryConsolidationState` that the Memory page
consumes alongside its view-model. From there the user launches the
Consolidation Review Surface, reviews each proposal (accept / edit /
discard / keep-watching / defer), and clicks Apply; accepted
proposals persist as durable `StoredAcceptedProjectMemory` rows with
an append-only audit trail. The Review Surface, Accepted Memory
Persistence (browser + SQLite V003), Resume and Reports Memory
Integration, and Stale / Contradiction Review have all shipped; see
the goal doc §4 for the verified inventory.

## Layer 5 · Project Memory / Consolidation

Where memory accumulates across the active session and saved
sessions, and where the Memory page reads from.

**Implementation status:** ✅ Implemented.

Owners: [`src/lib/project-memory/`](../src/lib/project-memory/),
[`src/features/memory/`](../src/features/memory/).

Sub-pieces:

| Concern | File |
| ------- | ---- |
| Aggregation view-model | [`projectMemoryViewModel.ts`](../src/lib/project-memory/projectMemoryViewModel.ts) |
| Cross-session decision / issue / evidence / risk aggregators | [`crossSessionAggregation.ts`](../src/lib/project-memory/crossSessionAggregation.ts) |
| Saved-session body loader (non-mutating) | [`loadProjectMemorySessions.ts`](../src/lib/project-memory/loadProjectMemorySessions.ts) |
| Data-basis flag (`activeSessionOnly` / `activePlusSavedSessions` / `savedSessionMetadataOnly` / `partialSavedSessionLoad` / `unavailable`) | [`projectMemoryModel.ts`](../src/lib/project-memory/projectMemoryModel.ts) |
| Re-import rollup | [`projectMemoryViewModel.ts`](../src/lib/project-memory/projectMemoryViewModel.ts) |
| UI | [`MemoryView.tsx`](../src/features/memory/MemoryView.tsx) and siblings |

**Inputs:** active session view + saved-session metadata + loaded
saved-session bodies (where available) + stored imports + stored
analysis + stored memory bodies + `.mori v0` packages.

**Outputs:** `ProjectMemoryViewModel` carrying `summaryStats`,
`recentSessions`, `keyDecisions`, `recurringIssues`, `keyEvidence`,
`unresolvedRisks`, `reimportSummary`, `savedReports`,
`moriPackages`, `recommendedNextSession`, `warnings`, and a
`dataBasis` honesty flag.

**Privacy boundary:** local-only. Browser-loaded sessions contribute
issues / decisions / next-actions only when a
`StoredSessionMemoryBody` is on disk (or, as a one-time forward
migration, when stored analysis exists). Metadata-only sessions
contribute nothing fabricated. Old imports without
`connectorEventId` are never marked duplicate.

**Failure modes:** every state has a typed warning
(`saved-session-bodies-not-loaded`,
`saved-session-bodies-partial-load`, `saved-session-load-failed`,
`saved-session-body-loading-unavailable`,
`import-summaries-unavailable`, `old-imports-without-identity`,
`old-sessions-without-analysis`, `demo-mode`, `storage-unavailable`).

**Next tasks:**
- User-triggered consolidation pass over Project Memory (Phase 2 on
  roadmap): merge near-duplicate decisions, promote recurring issues
  to project-level entities, surface stale-memory candidates.
- SQLite-side `importSummary` mirror so desktop-saved sessions
  contribute to the rollup.

## Layer 6 · Query / Output

Where the accumulated memory becomes something the user can hand to
another tool or person.

| Surface | Status | File |
| ------- | ------ | ---- |
| Resume / follow-up prompt (audience- + privacy-aware) | ✅ Implemented (post-`d7752e5`) | [`projectMemoryResumePrompt.ts`](../src/lib/project-memory/projectMemoryResumePrompt.ts) |
| Reports page (Markdown / `.mori v0` export) | ✅ Implemented | [`src/features/reports/`](../src/features/reports/), [`src/lib/report/`](../src/lib/report/) |
| Natural-language memory query | ❌ Planned (Phase 4) | n/a |

**Inputs:** `ProjectMemoryViewModel` for Resume Prompt; full session
data for Reports.

**Outputs:**
- Resume Prompt: copyable text body, structured sections, dataBasis
  label, warnings · see audience (`self / claude / codex / chatgpt
  / handoff`) and privacy modes (`normal / summaryOnly / clientSafe`).
- Reports: Markdown report, `.mori v0` package.

**Privacy boundary:** Resume Prompt scrubs local paths, URLs,
connector identity triplets, and secret-shaped values in
`clientSafe`; the entire builder is local pure code with no LLM
call. Reports clientSafe mode strips the same surface.

**Failure modes:** empty Project Memory → still renders a usable
prompt; partial load → limitations section enumerates warnings.

**Next tasks:**
- Persist audience / privacy selection in `RepositorySettings`
  (small follow-up).
- Project Memory ↔ Reports prompt convergence (medium UX call ·
  see roadmap).
- Local natural-language memory query (Phase 4 · future research).

## Layer 7 · Storage

Where memory durably lives.

| Backend | Status | File |
| ------- | ------ | ---- |
| Browser localStorage (drafts, imports, analysis, memory bodies, packages, settings) | ✅ Implemented | [`src/lib/storage/localStorageAdapter.ts`](../src/lib/storage/localStorageAdapter.ts) |
| Desktop SQLite (active session snapshot + accepted memory + audit + session imports) | ✅ Implemented (read + write, migrations V001–V007; `importSummary` mirrors via the V004 `session_imports` table) | [`src/lib/sqlite/`](../src/lib/sqlite/), [`src-tauri/src/db/`](../src-tauri/src/db/) |
| `.mori v0` JSON package (export / explicit cross-device transfer) | ✅ Implemented | [`src/lib/mori-package/`](../src/lib/mori-package/) |
| Cloud sync | ❌ Out of scope | n/a |
| Vector / embedding store | ❌ Out of scope | n/a |

**Inputs / Outputs:** see [`docs/persistence.md`](persistence.md).

**Privacy boundary:** every persisted record is keyed by a known
prefix, schema-versioned where applicable, and never includes raw
connector JSONL or transcript text beyond what the import explicitly
retained.

**Failure modes:**
- Browser quota exceeded → write throws; nothing partially written
  (records are JSON-stringified atomically).
- SQLite snapshot mismatch → loader returns `null`; the row is
  surfaced as `failed` in the loader output.
- Unknown `schemaVersion` on memory body → loader returns `null`
  rather than risk consuming an incompatible shape.

**Next tasks:**
- SQLite-side `importSummary` mirror (medium milestone).
- SQLite-side `memoryBody` mirror (smaller follow-up).
- `.mori v0` import path UI polish (deferred).

---

## Mapping of named "agents" in external references

When you read about Memory Orchestrator / Ingest / Consolidate /
Query agents in the always-on-memory literature, here is the rough
Mori translation:

| External term | Mori today | Mori boundary |
| ------------- | ---------- | -------------- |
| Memory Orchestrator | `sessionStore` + `MemoryView` flow | Not a process; a UI flow + state. |
| Ingest Agent | Connector / Transcript / Git-diff / Manual-note importers | No LLM in the path. Pure parsing + normalisation. |
| Consolidate Agent | Quick Pass + Project Memory aggregation | LLM is optional (Ollama) with deterministic fallback. Aggregation is pure code. |
| Query Agent | Resume Prompt builder | No LLM call. Pure derivation from `ProjectMemoryViewModel`. |
| Memory store | localStorage + SQLite + `.mori v0` | Schema-versioned. No vectors. |

The shapes match · the contracts don't. Mori's review-before-apply
gate and per-row provenance are the load-bearing differences.

---

## See also

- [`docs/references/memory-orchestrator-reference.md`](references/memory-orchestrator-reference.md) ·
  reference architecture analysis (Google ADK + Gemini).
- [`docs/project-memory.md`](project-memory.md) · Project Memory
  data model and aggregation contract.
- [`docs/persistence.md`](persistence.md) · storage adapters,
  schema versions, fallback behaviour.
- [`docs/imports.md`](imports.md) · capture surfaces.
- [`docs/e2e-smoke-flow.md`](e2e-smoke-flow.md) · runnable
  walkthrough of every layer.
- [`docs/roadmap.md`](roadmap.md) · phased plan including the
  Memory Orchestrator phases below.
