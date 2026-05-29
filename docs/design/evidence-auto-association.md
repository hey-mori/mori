# Evidence Auto-Association

Design for the capability that turns Mori's stated doctrine, "capture is
explicit, association is automatic", into real behaviour. It is the seam that
lets evidence (Git diffs, terminal runs, files, notes, connector events) attach
itself to the right **session spine** without the user hand-assembling a Work
Bundle. This document is durable; update it when a decision actually changes.

Companion reading: [`../mori-project-goal.md`](../mori-project-goal.md) §1 (spine
/ ribs model, "auto-association, never auto-capture"),
[`../source-connection-backlog.md`](../source-connection-backlog.md) (the source
direction section), [`mori-redesign-session-centric.md`](mori-redesign-session-centric.md)
(session-centric framing), and [`../work-bundle-import.md`](../work-bundle-import.md)
(the manual assembly path this demotes).

## 1. Why

Today a Mori session is anchored by one AI-agent conversation (the spine).
Everything else, the Git diff you ran, the terminal output, the note you took,
is evidence (the ribs). The product model says those ribs should hang off the
spine **automatically**, but the only way to attach them today is the manual
Work Bundle: the user picks each source by hand and assembles a composite. That
is slow, almost nobody will do it, and it pushes the wrong mental model
(the user composes a session) over the right one (Mori reconstructs what
happened and the user steers it).

The shift in focus: from **manual session assembly** to **surfacing what
happened during a piece of work and letting the user review and steer it.**
Auto-association is the mechanism behind that shift.

## 2. Invariants (non-negotiable)

These follow directly from the product principles and must hold at every stage.

- **Capture stays explicit.** Association never captures new evidence. It only
  groups evidence that an explicit connector / hook / paste already captured.
  No watcher, no daemon, no scraping. (`mori-project-goal.md` §6, §14.)
- **Association is a proposal, never a silent write.** Auto-association produces
  reviewable proposals that ride the existing Import Review gate. The user
  accepts, edits, or discards; nothing attaches to a session or to memory on its
  own. (Review-before-apply.)
- **Provenance is preserved.** Every association records *why* it was proposed
  (which signals matched) so the user can judge it, and the resulting link keeps
  the evidence's `SourceRef` / `connectorEventId` trace intact.
- **Deterministic and local.** Scoring is a conservative deterministic heuristic
  over local metadata (project path, time window, connector session id). No LLM,
  no embeddings, no network. The same inputs always yield the same proposals.
- **Honest confidence.** A proposal carries a qualitative confidence
  (high / medium / low) and only appears when at least one real signal matched.
  Mori never invents an association from nothing.

## 3. The model

A **spine** is the session anchor: an AI-agent conversation with a project and a
time window. A **candidate** is a piece of already-captured evidence that is not
yet attached to that spine. Auto-association scores each candidate against the
spine and proposes the ones that plausibly belong to the same piece of work.

### Signals (deterministic, in rough strength order)

1. **Connector session linkage** (strongest). The candidate is a connector event
   whose `connectorId` + external session id match the spine's. This is an
   identity match, not a heuristic, so it is high confidence on its own.
2. **Project match.** The candidate's project path / git repo path / work-context
   hint equals the spine's project path, or shares a meaningful directory prefix
   with it (reusing the Work Bundle's `deriveWorkContextHint` notion).
3. **Time-window overlap.** The candidate's capture time (a point, e.g.
   `SourceRef.capturedAt`, or an event span) falls inside the spine's
   `[startedAt, updatedAt]` window, within a small tolerance.

### Combining signals into confidence

- Connector-session match → **high** on its own.
- Project match **and** time overlap → **high**.
- Project match **or** time overlap alone → **medium**.
- Only weak time proximity (just outside the window, within tolerance) → **low**.
- No signal → **not proposed** (excluded entirely).

The grace / tolerance and the prefix-depth threshold are explicit constants so
the behaviour is legible and tunable, never magic.

## 4. Data we already have (build on these, do not reinvent)

Grounded in the current repo (see file references):

- **Spine metadata:** `AgentWorkSessionMeta` (`src/lib/agents/workSessions.ts`),
  carrying `projectPath`, `projectName`, `startedAt`, `updatedAt`,
  `connectorId`. The active `Session` (`src/domain/types.ts`) plus its events'
  `start` / `end` can also act as a spine window.
- **Candidate metadata:** `SourceRef.capturedAt` / `kind` / `relatedEventIds`,
  `TimelineEvent.start` / `end` / `connectorEventId`, and `ConnectorEvent`
  (`connectorId`, `sessionId`, `occurredAt`, `projectPath`, `git.repoPath`).
- **Connector identity:** `getConnectorEventIdentity`
  (`src/lib/connectors/connectorEventIdentity.ts`) for the strong linkage signal
  and for dedupe (`collectImportedConnectorEventIds`).
- **Existing grouping signals:** `buildWorkBundlePreview` /
  `deriveWorkContextHint` / `eventSpan` / `eventDedupKey`
  (`src/lib/import/workBundle.ts`) already compute shared directory prefix, time
  span, and cross-source dedupe. Auto-association reuses these notions rather
  than duplicating them.
- **Review gate:** `ImportReviewDraft` / `ReviewEventItem`
  (`src/lib/review/`, `src/app/reviewStore.ts`) is the review-before-apply seam
  a proposal feeds into.

## 5. Staged plan (each stage leaves Mori working)

- **P1 · Pure proposal helper (this slice).** A pure
  `buildEvidenceAssociationProposals(spine, candidates)` in
  `src/lib/association/` with colocated vitest tests. Narrow, decoupled input
  types (`AssociationSpine`, `AssociationCandidate`) so both an imported agent
  conversation and the active session can be a spine, and any evidence source can
  be a candidate. Output: typed `EvidenceAssociationProposal[]` with confidence
  and matched-signal reasons. No UI, no writes, no capture. Additive.
- **P2 · Candidate adapters.** Pure adapters that build `AssociationCandidate[]`
  from real sources, the connector inbox events, recently imported `SourceRef`s,
  a fetched Git diff, so P1 can run against live data. Still no writes.
- **P3 · Review integration.** Surface accepted proposals through the existing
  Import Review gate as "evidence to attach" items, so association uses the same
  accept / edit / discard path as every other import. Manual Work Bundle stays as
  the advanced fallback.
- **P4 · 소스 / session surface.** Replace the manual-first framing: when a spine
  is imported or active, show the proposed ribs for review instead of asking the
  user to assemble them. This is where the "surface-and-steer" focus becomes
  visible in the UI.

Order is suggested; each stage is independently shippable and reviewable. P1 is
the foundation and ships first.

## 6. Non-goals

- No background watcher, daemon, or scheduled association job. Association runs
  only when the user is importing / viewing a session.
- No auto-apply. Proposals never attach without review.
- No new capture surface. Association consumes already-captured evidence only.
- No LLM / embedding / semantic matching in the scoring path. Deterministic
  signals only; a smarter optional layer is out of scope until explicitly asked.
