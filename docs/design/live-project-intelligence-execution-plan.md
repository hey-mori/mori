# Live Project Intelligence · execution plan

Status: **proposal, 2026-08-06.** Planning only. No product code was written
for this document.

This is the execution layer for [`../live-project-intelligence.md`](../live-project-intelligence.md),
which has carried the status `Draft` since it was written. That document's
product thesis (Signal / Summary / Trace, the event taxonomy, the notification
policy, the local-LLM guardrails) is still correct and is not restated here.
What it lacks is an honest read of what the repository actually built against
it, answers to the open questions that block the first slice, and a staged
plan. This document supplies those three things.

Companion docs:
[`../mori-project-goal.md`](../mori-project-goal.md) (identity, invariants,
apply policy), [`agent-work-visibility-vision.md`](agent-work-visibility-vision.md)
(the north-star direction this serves, especially §7),
[`local-llm-understanding-and-live-follow.md`](local-llm-understanding-and-live-follow.md)
(the Live Follow boundary decision),
[`../project-connection-mapping.md`](../project-connection-mapping.md)
(project identity, shipped).

---

## 1. The finding in one paragraph

Mori did not fail to build Live Project Intelligence. It built **both ends and
skipped the middle**. Observation is strong: `useLiveSessions` polls every
active agent session at once and `liveFeed` merges them into request blocks
with per-request status and file touches. Delivery is strong: `signalPolicy`
implements all six notification reasons with delivery gating, and
`osNotification` bridges to the OS. Project identity is strong and tested
(`projectConnection`, `projectExternalSessions`). What does not exist is
everything between observation and delivery: nothing persists what the live
layer sees, nothing folds it into project state, and nothing produces the
signal candidates the policy was built to gate. The live layer's only signal
producer is called from inside a React component
(`src/features/live-session/LiveSessionView.tsx:491`), so when the view
unmounts, the product's awareness of the user's work stops existing.

That is why a project overview cannot stay current, and why
`buildProjectStateSummary` can only ever report `basis: "savedSessions"`.

## 2. Code-verified status of the MVP

Against the MVP list in [`../live-project-intelligence.md`](../live-project-intelligence.md)
§ MVP Scope, verified 2026-08-06.

| # | MVP item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Associate connector / discovery events with a project | **Shipped** (pure layer) | `src/lib/projects/projectConnection.ts`, `src/lib/projects/projectExternalSessions.ts`, both tested |
| 2 | External agent session status (running / waiting / blocked / completed / unknown) | **Partial** | `liveFeed.ts` derives `working` / `recent` / `done` only; no `waitingForUser`, no `blocked`, and the status is per *request*, not per session |
| 3 | Live Intake Buffer producing pending events | **Missing** | no match for `intake` anywhere in `src/` or `src-tauri/src/` |
| 4 | Provisional live events in the session trace with trust labels | **Missing** | no match for `provisional` under `src/features/timeline/` or `src/features/session/` |
| 5 | Project current-state strip | **Partial** | `ProjectStateStrip.tsx` + `buildProjectStateSummary` exist, but `basis` is hard-wired to `"savedSessions"` and `riskDetected` / `blocked` are documented as never produced (`src/lib/project/projectStateSummary.ts:18`) |
| 6 | Deterministic / local insight candidates | **Missing** | no match for `InsightCandidate` |
| 7 | Promote three notification classes | **Shipped past scope, but unwired** | `src/lib/notifications/signalPolicy.ts` implements all six reasons; its only non-test caller is `osNotification.ts`. No producer feeds it a candidate |
| 8 | Link every summary and signal to supporting events | **Partial** | companion signals carry `evidenceRefs`; the live path carries none |

Shipped: 1. Partial: 2, 5, 8. Missing: 3, 4, 6. Built-but-unwired: 7.

Note that the missing and unwired items form one contiguous band: intake (3),
provisional state (4), candidates (6), and the producers that would drive the
policy (7). This is the middle described in §1.

## 3. Doc drift found while auditing

Four conflicts between the doc set and the code. Each needs a correction; none
changes the product direction.

1. **OS notifications are described as absent.**
   [`agent-work-visibility-vision.md`](agent-work-visibility-vision.md) §8 says
   "OS-native notifications are absent (no Tauri notification call exists)".
   `src/lib/notifications/osNotification.ts` exists and `tauri-plugin-notification`
   is a declared dependency (`src-tauri/Cargo.toml:22`). The doc is stale.

2. **Live Follow is described as single-session; the code follows many.**
   [`local-llm-understanding-and-live-follow.md`](local-llm-understanding-and-live-follow.md)
   §3.1 decides Live Follow polls "**only that session's** already-growing
   connector file" and is "not a global machine watcher".
   `src/features/live-session/useLiveSessions.ts` discovers the active set and
   follows up to eight sessions at once, re-discovering periodically. The code
   is still foreground-only and still reads only connected sources, so no
   invariant is broken, but the written boundary no longer describes it. The
   code went the right way for the product; the doc must be updated to a
   multi-session foreground boundary rather than the code narrowed.

3. **The background watcher is listed as a non-goal; it shipped.**
   [`../live-project-intelligence.md`](../live-project-intelligence.md)
   § Relationship To Existing Live Follow tabulates "Background watcher | Whole
   machine | Non-goal | Not allowed in this planning slice", and § Current
   Planning Decisions repeats it. [`../mori-project-goal.md`](../mori-project-goal.md)
   §5 records the opt-in watched inbox as **shipped**, and §6's surveillance-line
   note records rail B as designed and shipped. The planning doc predates that
   decision.

4. **The live view and the background watcher read different sources.**
   Not a doc error, but an unstated structural fact. `useLiveSessions` reads the
   agent's own store (Claude Code JSONL, via `discoverClaudeCodeSessions` /
   `get_claude_code_session_delta`), which needs no user setup and carries rich
   data. `src/lib/background-watch/inboxWatch.ts` fingerprints the **connector
   inbox** (`~/.mori/connectors/`), which requires the user to have installed a
   hook script and carries less. So the background path cannot today feed the
   project overview with what the foreground path already sees. Any background
   slice must read the agent stores, not only the inbox.

## 4. Research findings that constrain the design

### 4.1 File watching on Windows

A native watcher does not pay for itself here. `ReadDirectoryChangesW`
allocates a fixed-size buffer per directory handle and fails with
`ERROR_NOTIFY_ENUM_DIR` when it cannot record all changes, at which point the
caller must fall back to enumerating the directory anyway; its behaviour is
also inconsistent across Windows versions and degrades on large batches. The
Rust `notify` crate wraps it and inherits those limits, which is why
`notify-debouncer-mini` exists.

Decisive point for Mori: a change notification only says *something changed*.
Mori needs the appended bytes, so it must still perform a byte-offset tail
read. The watcher would replace one cheap `stat` call, not the read. Adding it
buys a Windows-specific failure mode for almost no saving.

The repository is already well positioned. `tail_new_complete_lines`
(`src-tauri/src/claude/code.rs:442`) is partial-line safe, never lands
mid-line, never decodes a torn UTF-8 sequence, and enforces path containment.
Its one documented gap is rotation: `src-tauri/src/claude/code.rs:447` states
that re-reading a shrunk file from its new start "is a later slice; we never
read backwards here". Today a truncated or rotated session file silently stops
producing deltas forever.

### 4.2 Local LLM contention

Ollama does not gracefully share a saturated GPU. When memory is insufficient
for a new model, "all new requests will be queued until the new model can be
loaded"; an overloaded server returns 503; idle models are unloaded to make
room. So a background analysis pass launched while the user's local agent is
generating does not run alongside it, it queues behind it or evicts it. Mori
would degrade the very work it exists to observe. Holding a model warm makes
this worse, because the warm model holds VRAM the agent may need. The
prewarm-at-startup and TTL work (commits `6c2447c`, `4f7c578`) was tuned for
foreground responsiveness and must be re-evaluated before any background pass.

The established pattern for background inference under contention is
opportunistic scheduling: attempt work only when there is idle capacity, and
back off when local activity is high. Prefetching under contention actively
hurts.

**Mori has an unusually good signal for this.** It already computes whether the
observed agent is working: `LiveRequestStatus` in
`src/features/live-session/liveFeed.ts` derives `working` / `recent` / `done`,
with a stall threshold. Mori's own observation layer is therefore the correct
scheduler input for its analysis layer. No GPU probing is required.

## 5. Decisions

These resolve the open questions in [`../live-project-intelligence.md`](../live-project-intelligence.md)
§ Open Questions that block the first slice. Questions not listed here remain
open and are deliberately deferred.

### D1 · The raw trace already persists outside Mori, so intake may be lossy

The no-data-loss invariant (`../mori-project-goal.md` §6, and architecture doc
§16.4) requires raw inputs to be preserved for re-derivation. For agent
sessions that requirement is **already satisfied without Mori copying
anything**: the agent's own JSONL file is the durable raw trace, it lives on
the user's disk, and Mori addresses it by path plus byte offset.

Therefore the intake layer may persist a reduced record, provided every
persisted row carries a `SourceLink`-style locator (path, byte range, content
hash) sufficient to re-derive the full detail on demand. This is the unlock
that lets Mori keep a durable project overview without becoming the raw log
viewer its own thesis forbids.

Consequence for the retention policy: intake rows are `rawRetention:
summaryOnly` with a re-derivable origin, not `retained`.

### D2 · Three retention tiers, aligned to Signal / Summary / Trace

| Tier | Contents | Lifetime | Persisted |
| --- | --- | --- | --- |
| T0 · raw window | full message text, per message, as `liveFeed` builds today | minutes, current view only | no |
| T1 · request records | one row per request block: title, actor, start / end, step count, tools used, files touched with `+N / -M`, error flag, terminal status, source locator | bounded per project | yes |
| T2 · project projection | one mutable row per project, folded from T1 | until superseded | yes |

T0 is what exists. T1 is the Live Intake Buffer (MVP 3). T2 is the object that
makes an overview "continuously updated" rather than recomputed from saved
sessions.

The tiers are a decay gradient, not three copies: T0 never becomes durable, T1
drops message bodies, T2 keeps only current state. Detail is recovered by
re-deriving from the origin locator (D1), not by storing more.

### D3 · Observation auto-applies; interpretation stays gated

Run the six-factor apply matrix (`../mori-project-goal.md` §3, architecture
§5.2) over T1 and T2 honestly:

| Factor | T1 / T2 observation |
| --- | --- |
| Interpretation confidence | high · deterministic parse of a structured log |
| Mutates existing records? | creates only (T1); T2 is a projection, not an authored record |
| Creates new entity / context? | resolves to a known project via `projectConnection` |
| Sensitivity | no message bodies persisted (D1) |
| Reversibility | single-row, undoable, re-derivable |

Every column points to auto. So T1 and T2 **auto-apply with a `Revision`**, and
no review queue stands between the user's work and their overview. This is
consistent with the existing doctrine that timeline events are deterministic
parses and AI is a separate proposal layer.

Interpretation is unchanged: `InsightCandidate` output from a local LLM stays
`inferred`, carries supporting row ids, and remains review-gated before it
becomes distilled memory.

This answers the doc's first open question ("Should provisional live events
bypass Import Review visually but require review before durable memory, or
should every live event wait behind review?"): **observation does not wait;
interpretation does.**

### D4 · Keep polling; add stat-gating and rotation recovery

Per §4.1, do not add `notify`. Instead:

- Make each poll two-stage: a cheap metadata sweep (size, mtime) across the
  active set, then a tail read only for files whose size grew. This is the same
  fingerprint shape `inboxWatch.ts` already uses for the connector inbox.
- Add rotation recovery to `tail_new_complete_lines`: when file length is below
  the stored offset, re-baseline instead of going permanently silent. This is
  the gap the code itself flags at `src-tauri/src/claude/code.rs:447`.
- Keep the existing adaptive cadence and error backoff from `useLiveSessions`.

### D5 · Local LLM work is opportunistic, gated on Mori's own live status

No analysis pass starts while any followed session is in `working` state.
Release the warm model when the observed agent becomes active, and re-warm on
idle. Per §4.2 this avoids queueing behind (or evicting) the agent the user
actually cares about. Deterministic candidates are exempt: they are cheap and
may run at any time, which also means a project overview stays useful with no
LLM configured at all.

### D6 · Signal producers move out of the view layer

`buildLiveCompletionNotification` is invoked from
`src/features/live-session/LiveSessionView.tsx:491`. Signal production belongs
in the intake layer so it fires regardless of which screen is mounted, and it
must route through `signalPolicy` rather than composing a feed notification
directly. That gives `signalPolicy` the producer it was built for and makes the
remaining five reasons reachable.

### D7 · `ContextView` owns the project Summary role, and gains a current-state section

Two project surfaces compete today, and that is why live-intelligence work has
had nowhere obvious to land. They are not duplicates: they answer different
questions, and only one of them is asked first.

| | `ContextView` (`ViewKey: contexts`, the sidebar destination) | `ProjectView` (`ViewKey: project`) |
| --- | --- | --- |
| Question answered | what is *filed* under this project | what *state* is this project in |
| Sections | 하위 프로젝트 · 최근 · 노트 · 세션 · 남긴 기록 (`record-workspace/v8-project-calendar-surfaces.md` §5) | current-state strip · activity heatmap · synthesis counts · sessions · memory · connection candidates |
| Tense | retrospective inventory, ordered by recency | present state |
| Reached by | the sidebar | Dashboard, Graph, Home, Session detail |

**Decision: `ContextView` owns Summary.** It is the sidebar destination, it is
the newer approved design, and its layer rule is the governing doctrine for
project surfaces. `ProjectView` is session-centric, the shape the 2026-07-14
identity rewrite superseded.

**But the winning surface is missing the section that matters most.** The v8
spec orders its sections "by what a returning user asks", and yet begins at
하위 프로젝트. The question a returning user actually asks first is the Summary
question this whole program exists to answer: what is happening now, and what
changed since I last looked. So the T2 projection (D2) lands as **section 0 of
the v8 project page**, above 최근. That completes the v8 ordering on its own
stated principle rather than contradicting it.

What migrates from `ProjectView`:

- `ProjectStateStrip` · yes, upgraded from `basis: "savedSessions"` to the live
  projection.
- `ProjectSynthesisSection` · yes, folded into the same section as counts.
- `ProjectPulse` · **no.** A contribution heatmap plus current / longest streak
  answers "how often did I work", not "what is happening". It is cadence
  gamification occupying the surface's best slot, and the brand rule already
  warns against game-like treatment of core work surfaces
  (`../mori-project-goal.md` §10).

`ProjectView` is **retired, not deleted**, per the CLAUDE.md do-not list: it
stays routed and reachable from Dashboard, Graph, Home, and Session detail, and
stops being where project work is expected to happen.

One related orphan to place deliberately rather than by accident:
`src/features/project/ProjectTimelineSection.tsx` has no importer. It lays every
saved session of one project on a shared axis with quiet gaps between them,
which is a genuine capability and squarely a **Trace**-level surface, not
Summary. It should be re-homed under Trace when S5 lands, or explicitly retired.
It must not be pulled into section 0.

### D8 · T1 is a derived index, T2 is an aggregate record

Where the two durable tiers live is the last question blocking S1, and the
kernel already carries the vocabulary to answer it. `RecordLayer`
(`src/lib/record-kernel/kernelTypes.ts:75`) is `occurrence | distilled |
container | source | aggregate`, mirroring the architecture doc §2 layer model,
and `agent-session` is already a system schema at `layer: "occurrence"`.

The naive reading is that T1 rows are occurrences too, so they should be kernel
records. That is wrong on volume. An `agent-session` record is one row per
session; a T1 row is one per *request*, and a long session holds dozens. Making
them ledger peers would flood the record space with machine-grained rows, which
is the failure the ledger doctrine exists to prevent and which this repo has
already had to fix once for capture.

The architecture supplies the right shape instead. §3.1 establishes that a
high-volume derived series is a **projection materialized in a derived index
table**, explicitly *not* a separate authored object (the wording is about
metrics, but the principle is general). So:

| Tier | Home | Precedent | Why |
| --- | --- | --- | --- |
| T1 · request records | derived index table, new SQLite migration, keyed by session with a source locator | architecture §3.1 derived index | high volume, machine-grained, evictable, must not enter the record space |
| T2 · project projection | kernel record, new system schema `project-state`, `layer: "aggregate"` | `daily-entry`, the existing aggregate schema | one row per project, genuinely a folded summary, and it *should* be searchable, context-linked, and revisioned |

Consequences that fall out and are worth stating:

- T2 gets FTS, context links, and `kernel_revisions` for free, which satisfies
  the visible-and-reversible invariant with no new machinery.
- T1 is deletable at any time without data loss, because D1's source locator
  makes it re-derivable from the agent's own JSONL. That is what makes an
  eviction policy safe rather than lossy.
- T1 is a projection, so it needs no schema registration and cannot collide with
  a user-defined schema.
- The existing treatment of derived occurrences carries over for T2: `qa`,
  `source-document`, and `agent-session` are already grouped as derived kinds
  (`src/features/record-ledger/recordPresentation.ts:81`) and filtered out of the
  note explorer, so an aggregate row has an established presentation path.

Eviction for T1: bounded per project, oldest-first, with the projection updated
before rows are dropped so evicting never rewrites current state. The exact cap
is a tuning decision for S1, not a doctrine question.

### D9 · The five session statuses are already derivable, just collapsed

MVP 2 reads as missing data. It is not. `isSessionWorking`
(`src/features/live-session/liveFeed.ts:169`) already separates "the agent
finished and is waiting for the user" from "the agent is mid-turn" using the
transcript's own `stop_reason`, and pairs it with a stall threshold. The live
feed then collapses all of it into three presentation states
(`working / recent / done`) and persists none of it.

So the full status model is a mapping over signals that already exist:

| Status | Derivation |
| --- | --- |
| `running` | open turn, last activity within the stall threshold |
| `waitingForUser` | last message is an assistant turn with `stop_reason` `end_turn` or `stop_sequence` |
| `blocked` | open turn, but stalled past the threshold, or the last step carried a tool error |
| `completed` | session file quiet beyond the active window, last turn ended cleanly |
| `unknown` | no readable last message, or an unparsed transcript shape |

This is a T1 field, not a new reader. S3 lands it by persisting what the feed
already computes rather than by extracting anything new, which also means
`blocked` becomes available to `signalPolicy`, whose `blocked` reason has never
been reachable.

### D10 · Deferred, needs a product decision

**Whether a background tier ships in this program at all.** The rails permit it
(`../mori-project-goal.md` §6, rail B) and the opt-in inbox watcher already
exists, but everything in §6 below is valuable foreground-only. Background is a
separate, later opt-in, and §3.4 shows it would first need to read the agent
stores rather than only the connector inbox.

## 6. Staged plan

Each stage leaves the product working and is independently valuable. Stages 1
and 2 are the ones that change what the product *is*; the rest build on them.

| Stage | Scope | Done when |
| --- | --- | --- |
| **S1** | Live Intake Buffer (T1) as a derived index table per D8, carrying the D9 status field and a source locator, written as `liveFeed` produces requests. Rotation recovery in the Rust tail. Eviction cap. | Closing the 세션 view and reopening it, or restarting the app, does not lose what was observed |
| **S2** | Project projection (T2) as the `project-state` aggregate schema per D8. Fold T1 into it; make `buildProjectStateSummary` report a real `basis` and derive all five project statuses. | The project surface answers "what is happening now" without the live view being open |
| **S3** | Relocate signal producers into intake and route them through `signalPolicy`, which makes its `blocked` reason reachable for the first time (MVP 2, MVP 7). | A completion or a block raises a signal with no live view mounted |
| **S4** | Land the projection as section 0 of the `ContextView` project page per D7. Migrate `ProjectStateStrip` and the synthesis counts, drop `ProjectPulse`, retire `ProjectView` without deleting it. | The sidebar's project destination opens on current state; `ProjectView` still resolves from its existing entry points |
| **S5** | Deterministic insight candidates (MVP 6), including cross-session file-overlap conflict detection, which T1's file touches make cheap. Evidence links throughout (MVP 8). | Validation scenario 3 passes with no LLM configured |
| **S6** | Opportunistic local-LLM enrichment under D5. Optional background tier per D10. | Enrichment never runs while a followed session is working |

Sequencing rationale: S1 before everything because every later stage consumes
T1; S2 before S3 because a signal needs project state to be about; S4 before S5
so candidates have one home; S5 before S6 so the deterministic floor exists
before the LLM is layered on and a failed engine degrades to something useful.

## 7. Validation

Reuse the four validation scenarios in [`../live-project-intelligence.md`](../live-project-intelligence.md)
§ Validation Scenarios unchanged. Add two that target this plan's specific
claims:

- **Durability.** Observe a session, navigate away, restart the app. The
  project overview still reports the work and cites its origin locator.
- **Non-interference.** With a local engine configured and a session actively
  working, no analysis request is issued, and no warm model is held.

Per `../mori-project-goal.md` §12: pure derivations get colocated Vitest
coverage, `npm run check:full` before commit, and `cargo check` / `cargo test`
if `src-tauri/` changes.

## 8. What this plan does not do

- It does not widen capture. Every source read here is one the user already
  connected; the A-ban is untouched.
- It does not add a review queue for observation, and does not remove the review
  gate for interpretation.
- It does not make Mori drive or start an agent.
- It does not delete a surface. `ProjectView` is retired in place per D7, and
  `ProjectTimelineSection` is re-homed or retired, never removed.
- It does not decide whether a background tier ships (D10).
