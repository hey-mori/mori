# Mori Workroom Direction

Forward-looking design note. Mori is a single-user local-first app today. The
working hypothesis: the durable unit of value will shift from **"a session"**
to **"a project workroom"** · a shared space that holds many sessions from
many collaborators, with explicit visibility tiers and review-before-share
gates.

This document captures the direction, the privacy contract, and the small
flexibility hooks already in the code. It does NOT propose shipping team /
sync infra today. The single-user product stays the focus until the user
asks for the workroom switch.

---

## 1. Why a workroom unit

The session-centric model works for one person watching one AI conversation
at a time. It strains for:

- A user with **many parallel sessions** (different Claude projects, Codex
  CLI runs, manual notes) · the "1 conversation = 1 session" model is too
  fine-grained when "what am I working on" is the real unit.
- A team where multiple people **contribute to the same project**. Without a
  unit above the session, there is no place for "decisions the team made"
  vs "decisions I made privately while exploring."
- A handoff where you want to **share what happened** without exposing
  every private prompt.

The workroom is the unit that holds the answers to those questions: who is in,
what's shared, what's private, what stays after I leave.

## 2. Privacy contract

Three visibility tiers, applied at the **session level** and inherited by the
session's events / decisions / next-actions unless overridden:

| Tier | Who sees it | Default for |
|---|---|---|
| `personal` | Only the creator | Every session, every record (today's behaviour) |
| `team` | Project members | Sessions the user explicitly marks shareable |
| `shared` | Anyone with the project link | Only after a `clientSafe` filter run |

The **review-before-apply** principle from the single-user product carries
into the workroom: a teammate's accepted memory enters my project as a
`proposed` consolidation candidate, never an auto-merged record. The
existing [.mori package import path](../src/lib/project-memory/importedMemoryReview.ts)
is the prototype for this workflow.

Memory records already carry their own per-content tiers
(`sensitivity` + `reportEligibility`); those are content boundaries. The
session-level `visibility` is the *container* boundary · "can this teammate
see I had this conversation at all?"

## 3. What's shareable, what isn't

The deliberate non-goals carry over:

- **Raw transcripts never auto-share.** A shared session exposes its accepted
  memory + reviewed evidence refs, not its raw conversation body.
- **Secret-shaped strings never leave personal storage**, regardless of tier.
  The `containsLikelySecret` check at import time is the gate.
- **Inferred items never share without review.** Inferred = the AI's
  reasoning. A teammate sees only what the creator has explicitly accepted.
- **Audit trail is per-actor.** A `revert` is an action recorded against the
  actor that performed it; the trail isn't rewritten when a member leaves.

## 4. Flexibility hooks already in place

The following additive changes are in main TODAY. They cost ~60 lines, are
backward-compatible (every field is optional and defaults to today's
behaviour), and unblock the workroom direction without forcing a rewrite:

- **`Session.createdBy?: string`** and **`Session.visibility?: SessionVisibility`**
  on the core `Session` type
  (`src/domain/types.ts`). Stored sessions mirror them in
  `StoredSessionSummary` (`src/lib/storage/storageTypes.ts`) so the sidebar /
  workspace can filter without loading bodies.
- **`SidebarGroupingMode`** abstraction in `src/lib/sidebar/sessionList.ts`.
  `groupSidebarRows` now accepts `"recency"` (default · today's behaviour) or
  `"project"` (groups by `sourceLabel`, with an "기타" trailing bucket). The
  renderer can switch modes without rewriting the data layer.
- **`actorVisibilityFilter`** pure helper in
  `src/lib/project-memory/actorVisibilityFilter.ts`. Pure functions
  `canSeeRecord` + `filterByActorVisibility` apply the visibility tiers
  against a `VisibilityActor` (defaults to `LOCAL_ACTOR`). Single-user paths
  call the helper with the default and get every record back; the future
  workroom plumbs a real actor through.

## 5. What still belongs to "when we commit"

The audit was deliberate about deferring the heavy work until the team
backend lands:

- **A real auth + actor model.** No server-side identity exists.
- **Sync / conflict resolution.** Storage is local; concurrent edits are
  out of scope until a sync surface exists.
- **A team-aware sidebar.** The grouping abstraction is in place but the
  default stays `recency`. Switching the UX to `project`-first today
  creates many sparse single-session groups for solo users.
- **`createdBy` populated at write sites.** Every write currently omits it,
  which the helper treats as the local user. When the team backend lands,
  writes thread the real actor id through.

## 6. Decisions

- The session-list sidebar stays the default. The workroom evolution adds a
  grouping toggle, not a wholesale IA flip.
- Visibility defaults to `personal` everywhere a value is missing, so a
  silent leak is impossible by construction. Silent omissions degrade
  visibility, never expand it.
- The `clientSafe` export is the prototype for "what an external collaborator
  sees" · the existing
  [`buildClientSafeMoriPackage`](../src/lib/mori-package/clientSafe.ts) stays
  the reference filter.
- We will not write a server. The team backend, when it lands, plugs into
  the `.mori` package round trip (export from one machine, import on
  another) before any sync protocol is added.

## 7. Open questions (do not resolve until asked)

- Will a project ever span **multiple Claude project paths**? Today
  `sourceLabel` is treated as the project identifier in the workspace
  browser, but a real workroom may want explicit project rows independent
  of source paths.
- Where does **member identity** live in the `.mori` package round trip?
  An imported memory's `acceptedBy` likely needs a stable id namespace per
  workroom so reverts can cite the original reviewer.
- How does a **leaving member** affect the audit trail? The current design
  keeps every action; we will need a "left at" marker without rewriting
  history.

These are explicit deferrals · the answer is "decide when we commit to the
workroom direction," not "ignore."
