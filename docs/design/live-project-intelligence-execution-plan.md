# Live Project Intelligence · execution plan

Status: **stages S1 to S5 built, 2026-08-07.** Written as a proposal on
2026-08-06 with no product code; the plan below is preserved as written, and §9
records what actually landed and where reality corrected it.

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

> **As built, 2026-08-07.** Stages S1 to S5 have landed. The table below is the
> audit that started this work and is kept as written, because the shape of the
> gap it found is the reason the stages were ordered the way they were. Current
> status is in §9, at the end, next to what the building changed about the plan.

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

> **All four were corrected in the same change that added this plan.** Kept here
> because the pattern is the point: every one of them was a doc describing an
> earlier decision that the code had already moved past, and the cost of leaving
> them was that a later reader would plan against a repository that no longer
> existed. §9 exists for the same reason.

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

### 4.3 Measured volume, from a real agent store

Sizing T1 by guesswork would set the wrong eviction policy, so this is measured
against one real Claude Code store (the maintainer's machine, 2026-08-06). It is
a real-world sample, not a benchmark.

| Quantity | Measured |
| --- | --- |
| Project directories | 18 |
| Session files | 676 |
| Total on disk | ~950 MB |
| Largest single session | 134 MB · 44,940 lines |
| Requests in that session | 638 |
| Requests per heavy session (top 10) | 89 to 713 |
| **Total real requests across the entire store** | **4,834** |

"Requests" counts user-role messages excluding tool results, which is the unit
`liveFeed` already groups by. The gap matters: that largest session holds 13,886
user-role messages but only 638 actual requests, so a naive row-per-user-message
design would be 20x too large.

Three consequences:

1. **T1 is small.** The whole history of an 18-project, 950 MB store is under
   5,000 rows. Storage is not a constraint, so eviction is a retention *choice*,
   not a capacity requirement. An earlier draft of D8 justified eviction on
   volume; that justification was wrong and is corrected below.
2. **The ledger-pollution argument in D8 gets stronger, not weaker.** Roughly
   5,000 machine-generated rows would still dominate a personal ledger holding a
   few hundred human notes. Keeping T1 out of the record space is about meaning,
   not megabytes.
3. **Bounded reads stay mandatory.** A single 134 MB session file confirms
   `TAIL_BYTES` (2 MB) is load-bearing, and that the rotation recovery in D4 must
   re-baseline against a bounded tail rather than re-reading a rotated file whole.

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
| T1 · request records | one row per request block: title, actor, start / end, step count, tools used, files touched with `+N / -M`, error flag, terminal status, source locator | bounded per project | yes, **upserted by id** (see §9.5) |
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
records. That is wrong, but not for the reason a first draft assumed. An
`agent-session` record is one row per session; a T1 row is one per *request*,
and §4.3 measures a heavy session at 89 to 713 requests, with about 4,800 across
a whole 18-project store. That is trivial to store and would still swamp a
personal ledger holding a few hundred human-authored notes. The objection is
semantic, not physical: it would flood the record space with machine-grained
rows, the failure the ledger doctrine exists to prevent and one this repo has
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

Eviction for T1: per §4.3 this is a retention choice rather than a capacity
need, so S1 should ship **without** an eviction cap and add one only if a real
store proves it necessary. If it is ever added, it is bounded per project,
oldest-first, with the projection updated before rows are dropped so evicting
never rewrites current state.

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

### D11 · An observation is a claim about the moment it was made

This is the honesty rule the whole projection hangs on, so it comes before the
shape.

A T1 row's status was true at its `observedAt`. Mori only observes while the app
is open and the follower is polling, so a row saying `running` proves the request
was mid-turn **then**, not now. If the app was closed overnight, a projection
that renders "2개 세션 진행 중" from yesterday's rows is fabricating a present
tense, which the never-fabricate and no-fake-connected-states invariants
(`../mori-project-goal.md` §6, §10) both forbid.

So the projection carries its own freshness and the surface must respect it:

| Freshness | Condition | What the surface may claim |
| --- | --- | --- |
| `live` | newest contributing observation is within the follow window | present tense: 진행 중 / 대기 중 / 막힘 |
| `recent` | within a few hours | past tense with a time: "3시간 전 기준" |
| `stale` | older | no present-tense counts at all; last known activity only |

A `running` row that goes stale does **not** become `completed`. Mori did not
see it finish, and inventing an ending is the same failure as inventing a
present. It becomes `unknown`, which the status model already carries for
exactly this.

This also answers what "continuously updated" honestly means: the overview is
current whenever Mori is running, and openly says how old it is when not.

### D12 · The `project-state` shape, and what it deliberately omits

One record per project, `layer: "aggregate"`, folded from every T1 row sharing a
`projectPath` (which is why S1 had to persist that path rather than the trailing
label). Ordered by the question a returning user asks first.

| Group | Fields | Why |
| --- | --- | --- |
| Identity | `projectPath`, `label` | The fold key, per D8 |
| Freshness | `observedAt`, `freshness` | D11; without it nothing below may be read as present tense |
| Now | `runningCount`, `waitingCount`, `blockedCount`, and for each running request its `elapsedMs` and `stepCount` | "무엇이 지금 돌아가고 있나 / 나를 기다리나 / 막혀 있나", and "잘 가고 있나" |
| Lately | `recentRequests[]` (title, status, endedAt, capped) | "무슨 작업을 했나", the question the ledger cannot answer for live work |
| Touched | `topFiles[]` (path, additions, deletions) | "무엇이 바뀌었나", already rolled up per row in S1 |
| Since | `changedSince(seenAt)` as a derivation, not a stored field | "내가 안 본 사이 뭐가 바뀌었나" |

Deliberately **not** in the projection:

- **No *aggregate* effort totals** (tools used this week, steps this month,
  tokens spent). Summed over time they measure effort rather than state, which
  is the same thing the contribution heatmap did on the project page (D7).
  **The effort of the thing running right now is different and does belong
  above**: "71스텝째, 30분째" answers whether a request is going well or is
  stuck, which is state, and is precisely what the notification policy's
  `longRunningNoProgress` reason needs. The line is *current* versus
  *accumulated*, not effort versus state.
- **No LLM-derived summary.** S2 is deterministic. Interpretation enters at S6
  and stays labelled `inferred`, per D3.
- **No risk or conflict field yet.** Those are S5, and they need cross-session
  file-overlap detection that T1 makes cheap but does not itself perform.
- **No `lastSeenAt` stored on the record.** When the user last looked is a
  property of the viewer, not of the project, and storing it inside a shared
  aggregate would mean a revision every time someone opened a page.

Accumulated effort is **excluded from this surface, not from the product.** T1
already persists `stepCount`, `tools`, and per-file `+N / -M` on every row, so
the data exists and nothing needs re-capturing to use it. It has two honest
homes, both later stages:

- **대시보드**, which is where cross-project aggregate reads already belong.
- A folded 작업량 disclosure on the project page, per the CLAUDE.md convention
  that secondary items sit behind a `<details>` rather than competing as peer
  cards with the actionable ones.

Tokens are the one piece not yet captured: `ClaudeMessage` carries no usage
field today, though the raw JSONL has it and the `agent-session` kernel schema
already declares a `tokenCount` property. Adding it is a reader change, not a
projection change, and is out of scope until something asks for it.

### D13 · `basis` reports what actually contributed, and stops being a constant

`ProjectStateSummary.basis` is typed `"savedSessions"` and is a literal constant,
which was honest when saved rows were the only input. With T1 it becomes a real
union, because a project can now be backed by observation, by saved sessions, by
both, or by neither, and the surface must not imply reach it lacks:

| `basis` | Meaning |
| --- | --- |
| `liveAndSaved` | T1 rows and saved sessions both contributed |
| `liveOnly` | observed but never imported or reviewed |
| `savedOnly` | imported work Mori never watched run, so no present tense is available at all |
| `none` | nothing to say; the strip stays hidden |

`savedOnly` is the case worth naming: it is every project in the store today, and
its overview can only ever be retrospective. Reporting it as such is what keeps
the new surface from looking broken on old projects.

## 6. Staged plan

Each stage leaves the product working and is independently valuable. Stages 1
and 2 are the ones that change what the product *is*; the rest build on them.

| Stage | Scope | Done when |
| --- | --- | --- |
| **S1** | Live Intake Buffer (T1) as a derived index table per D8, carrying the D9 status field and a source locator, written as `liveFeed` produces requests. Rotation recovery in the Rust tail, re-baselining against a bounded tail. No eviction cap (§4.3). | Closing the 세션 view and reopening it, or restarting the app, does not lose what was observed |
| **S2** | Project projection (T2) as the `project-state` aggregate schema, shaped per D12, folded on `projectPath`. Carry freshness per D11 and a real `basis` per D13. | The project surface answers "what is happening now" without the live view being open, and says how old the answer is |
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

## 9. As built · what landed, and what the building changed

Written 2026-08-07, after S1 to S5 shipped. Kept next to the plan rather than
replacing it, so the difference between what was designed and what was learned
stays legible.

### 9.1 MVP status now

| # | MVP item | Then | Now |
| --- | --- | --- | --- |
| 1 | Associate events with a project | Shipped (pure layer) | Shipped, and used: T1 rows carry the reader's full `projectPath` |
| 2 | Session status | Partial (3 presentation states) | **Shipped**, all five, persisted per request |
| 3 | Live Intake Buffer | Missing | **Shipped** (`src/lib/live-intake/`) |
| 4 | Provisional live events with trust labels | Missing | Still missing, and now unnecessary in this form: observation auto-applies (D3), so there is nothing provisional to label |
| 5 | Project current-state strip | Partial, `basis` hard-wired | **Shipped** on 프로젝트, with freshness and a real `basis` union |
| 6 | Deterministic insight candidates | Missing | **Shipped** for conflicts; decisions / issues / risks remain for S6 |
| 7 | Promote notification classes | Built but unwired | **Wired**: completion, blocked, long-run, conflict all reach the policy |
| 8 | Link signals to supporting events | Partial | Conflict notices link both sessions; row signals carry the session |

The contiguous missing band described in §1 is closed. What remains is
interpretation (S6), not plumbing.

### 9.2 Five things the building changed

Each of these was a plan statement that met reality and lost:

1. **`blocked` was over-firing at 33%.** The first rule marked a request blocked
   if *any* step hit a tool error. A real store showed 4 of 12 requests blocked,
   because tool errors are ordinary mid-request. It now means the request
   **ended** on a failure. Caught by looking at a real distribution, not by a
   test.
2. **T1 could not be folded by project.** Rows carried only the session label,
   which is a trailing path segment, and `projectConnection.ts` explicitly
   forbids auto-grouping on those. S1's row gained `projectPath` before S2 could
   work at all.
3. **The long-run signal could never have fired.** It compared "how long had it
   been running last time" against the *current* clock, making both sides equal
   and the crossing undetectable. Now measured against the previous
   observation's own timestamp.
4. **Volume was estimated an order of magnitude low.** The plan said a long
   session holds "dozens" of requests; a real store holds 89 to 713, with 4,834
   across 18 projects. That corrected §4.3 and removed the eviction cap from S1.
5. **Effort metrics were excluded too broadly.** "No tool or step counts" was
   right for accumulated totals and wrong for the request running now, whose
   elapsed time and step count are exactly what `longRunningNoProgress` needs.

### 9.3 One decision made after the plan

**Observation is app-wide, opt-in, off by default.** The plan left the poller
inside 세션, which meant Mori only noticed work while the user watched it happen
· the inverse of the point. Observation now runs in the shell whenever the
opt-in is on, with an always-visible state and a one-tap off in the sidebar,
because rail B permits this only when scope, review-gate and transparency all
hold (`../mori-project-goal.md` §6).

Hoisting introduced a hazard worth recording: with the opt-in on, opening 세션
would have started a second follower over the same files, double-counting work.
The shell now owns the single poller and 세션 reads its snapshot. This is the
same class of bug as running two app instances, one level down.

### 9.4 Still open

- **S6 · interpretation.** Local-LLM enrichment under D5's contention gate.
  Everything below it is deterministic and works without a model.
- **D10 · a background tier.** Untouched. Ambient observation runs only while
  the app is open; a tray-resident reader remains a separate decision.
- **Visual confirmation.** Still owed. The app now starts and is no longer
  stalling on every poll, but nobody has yet confirmed that the current-state
  section, the sidebar watching indicator, or any signal actually looks right.
  See §9.5 for what the first run alone found.
- **Single instance.** Reverted after it hung startup; see §9.5. The double
  observation it prevented is now partly self-correcting, but not fully. A safe
  retry should not signal an existing window synchronously; an observation lease
  would avoid touching process startup at all.
- **Project-level handoff is built and dormant.** Investigated while looking for
  what still answers "지금 뭘 하고 있는지 어떻게 설명할 수 있고", the part of the
  goal this program serves least. There are three resume-prompt paths:

  | implementation | scope | wired |
  | --- | --- | --- |
  | `lib/report/resume-prompt.ts` | session | yes |
  | `deterministicQuickPassProvider` | session, post-analysis | yes |
  | `lib/project-memory/projectMemoryResumePrompt.ts` | **project** | **no** |

  The first two document their relationship (the second supersedes the first once
  a Quick Pass runs). The third states no relationship to either, has no
  production caller, and the panel that would render it
  (`features/memory/ProjectMemorySummaryPanel.tsx`) has none either.

  A `liveState` section was written for it and then **reverted unbuilt**: adding
  to a module nothing calls is the same mistake as `signalPolicy` sitting
  complete and unreachable, which S3 fixed by making it reachable rather than by
  extending it further.

  The real question is not "wire it" but whether handoff should be
  project-scoped at all, and how that relates to the two session-scoped paths.
  That is a product decision, not a wiring task.

  Context: `npm run unused` reports 58 unused files, and both orphans above are
  among them. This is an instance of a tracked condition, not a new discovery.

### 9.5 What running the app changed, 2026-08-07 afternoon

The surfaces above were built without anyone looking at them, which every pull
request said outright. Then the app was opened. Four things came out of that,
none of which a green suite could have found.

**The desktop app would not start.** Two separate causes, in order:

1. `sessionShortLabel` called `.slice` on a `sessionId` a session read off disk
   may not have. That throw was survivable while the feed was built inside 세션,
   under the route boundary; once observation moved to the shell it blanked the
   window. Fixed, and the provider now has its own boundary so the next fault
   degrades instead of erasing the app.
2. The single-instance plugin hung the main thread at startup: zero CPU, no
   panic, unresponsive window. **Reverted.** Its problem is real (two instances
   each observe the same files), so it should return, guarded so that signalling
   an existing window cannot block startup, and tested against a deliberately
   stale instance.

**It felt slow, and the cause was not where I expected.** Measured at the
follower's ceiling (8 sessions x 4,000 messages), the per-poll feed rebuild cost
~90ms and the dedup pass ~5ms. So the rebuild was ~95% of it, and moving
observation into the shell had turned that from one screen's cost into every
screen's. Two changes: a slower cadence when the live screen is closed, and a
bounded scan (~30ms). An idle background tick now publishes nothing at all.

**A data-loss bug that predated all of this.** D2 said intake rewrites a
session's rows whole, on the reasoning that the follower re-derives every request
each poll so the newest write is the whole truth. That stopped being true when
the follower began trimming its own message history: once old messages age out,
their requests leave the feed, and the rewrite discarded rows Mori had already
observed. **Rows are now upserted by id.** That correction stands on its own,
independently of the bounded scan that surfaced it.

It also quietly weakens the case the reverted plugin was making: two instances
observing the same session produce the same row ids, so upserts converge rather
than double-count. Duplicate *notifications* and duplicate file reads remain.

**The pattern worth keeping.** Every real defect today came from real data, a
real run, or a real measurement: a status rule that fired on a third of a live
store, a signal whose clock comparison made it unfireable, a volume estimate an
order of magnitude low, a crash only the desktop path took, a hang with no stack,
and a cost that was 95% in the one place not suspected. The suite was green
throughout, before and after each.
