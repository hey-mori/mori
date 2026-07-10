# Live Follow Lab · Request-Anchored Real-Time Session View

Design spec for the development verification screen that follows a
running Claude Code session in real time and lists, under each user
request, every piece of work the agent performed. This document is the
audit-before-implementation record for the capability: it fixes the
product decisions so the implementation slices stay small and
principle-safe, and it defines the graduation path by which the lab's
plumbing moves into the session 활동 tab once verified.

Read [`../mori-project-goal.md`](../mori-project-goal.md) first
(principles, non-goals, the A-vs-B surveillance line), then
[`local-llm-understanding-and-live-follow.md`](local-llm-understanding-and-live-follow.md)
§3.1 (the Live Follow doctrine this spec extends) and
[`../references/agent-session-viewer-landscape.md`](../references/agent-session-viewer-landscape.md)
(the external evidence this spec draws on).

## 1. Motivation

The user's direction: while working in Claude, Mori should pull the
work in continuously, request by request, so that for every question
asked there is a live, scrollable record of everything the agent did.
Today the user imports sessions one at a time by hand, and the import
is a one-shot snapshot. Two needs fall out:

- **Verification first.** Before real-time capture reaches the session
  surfaces, it needs a development screen where the pipeline can be
  watched end to end: does every JSONL line arrive, parse, classify,
  and land under the right request, while the session is still
  running?
- **A third reading of the stream.** The 타임라인 view is
  time-proportional (gaps and density carry meaning) and the 원본 view
  is a flat chronological list. Neither answers "what exactly did the
  agent do for this request, right now". The missing shape is
  order-proportional and request-anchored: time gaps ignored, work
  listed densely beneath the request that caused it. The 2026 agent-UX
  consensus (see the landscape synthesis §1.3) names this exact
  separation: conversation as anchor, activity as stream.

## 2. How this maps onto what already exists

An extension of existing seams, not a new subsystem.

| Need | Existing seam | Gap to build |
| ---- | ------------- | ------------ |
| Poll cadence, pause, error backoff | `src/lib/live-follow/` (followController reducer, followCadence 4s active to 30s idle, auto-stop), `useLiveFollow` foreground driver | None; reuse as-is |
| Read new evidence incrementally | `read_connector_jsonl_file` covers the connector inbox only; `get_claude_code_session` re-reads the whole file with an 8 MB cap | An agent session-store **delta read**: `(path, byte_offset)` in, new events plus new offset out |
| Follow-source identity | `followSource.ts` scopes new-event detection by connector source key; Claude Code imports carry no connector identity | A Claude-JSONL follow-source variant beside the connector one |
| Request grouping | `openedByUser` / `turnId` stamped at import (`claudeImport.ts`), `buildRequestSpans` segments the stream per user request | Reuse; the delta path must run the same turn classification (`classifyTurnActor`) so live and imported results agree |
| Work classification and labels | `activityModel.ts` (kinds, lanes, Korean labels) | Reuse for row rendering |
| Session discovery | `discover_claude_code_sessions` lists the store with mtimes | Auto-select the most recently modified session as the default follow target |
| Dev-surface routing | Palette-only views exist (graph, workbench pattern) | One new `ViewKey` reached from the command palette only |

## 3. Product decisions (made)

### 3.1 Follow source extends to the anchor agent's own session store

The Live Follow doctrine
([`local-llm-understanding-and-live-follow.md`](local-llm-understanding-and-live-follow.md)
§3.1) was written against the connector inbox. This spec extends the
follow source to the agent's own session store
(`~/.claude/projects/*.jsonl`), which Mori already reads on explicit
user action through the discovery readers. The extension stays inside
the "B" surface of the surveillance line
(`mori-project-goal.md` §6) because all three rails hold unchanged:

1. **Scope.** Only the session stores of anchor agents the user
   explicitly connected, and within a follow, only the one followed
   session's file. Never the screen, never unconnected apps.
2. **Review-before-apply.** Followed events render live and may be
   sessionised, but durable memory still requires the user's review
   and Apply. Following never writes memory.
3. **Transparency.** Follow is explicit, per session, visibly on or
   off, one tap to stop, foreground only (stops when the app closes).

### 3.2 The lab is a verification harness, and it retires

The lab is a development screen, routed from the command palette only,
never in the sidebar. Its purpose is to prove the delta pipeline with
real running sessions. Once the session 활동 tab hosts the same
follow (the `FollowControl` mount point already exists in
`TimelineHeader`), the lab is retired per the retire-don't-delete
rule: unwired from the palette default list but kept reachable. The
lab is therefore allowed developer-facing honesty that product
surfaces are not: parse counters, byte offsets, poll timestamps.

### 3.3 Order-proportional, request-anchored layout

The lab renders **request columns appended left to right** (horizontal
scroll, newest focused): one column per `openedByUser` boundary, the
request title as the column header, and beneath it the agent's work
rows in arrival order (tool runs, file touches with line deltas,
commands, response summaries), classified and labelled by
`activityModel`. New events append to their request's column; a new
request opens a new column and auto-focuses it. This is deliberately
not a replacement for any timeline view; it is the third reading named
in §1, and it graduates as an additional reading mode, not a
substitute.

### 3.4 Parse fidelity is a first-class display

The lab's reason to exist is trust in the pipeline, so it shows what
product surfaces hide: raw line count vs parsed event count, skipped
or unparseable lines, the current byte offset, last poll time, and
poll cadence state. A mismatch here is a bug surfaced early; the
first expected catch is drift between the delta path's turn
classification and the import path's.

### 3.5 The delta read is agent-generic from day one

The Rust command takes a session-store path and byte offset and
returns newly parsed events plus the new offset. Claude Code JSONL is
the first implementation, but the command shape (and the Rust trait
behind it) must not encode Claude specifics in its signature, so
Codex / OpenCode tails become additional implementations rather than
new plumbing. Reading only the delta also sidesteps the 8 MB
whole-file cap for growing sessions: the cap remains for one-shot
reads; a followed file is consumed incrementally.

## 4. Data model sketch

```
Rust (src-tauri)                          Frontend
----------------                          --------
get_claude_code_session_delta(            FollowSource variant "agentStore":
  session_path, byte_offset)                keys new-event detection by
  -> { events: ClaudeCodeMessage[],         session path instead of
       file_touches: ClaudeFileTouch[],     connector id
       new_offset: u64,
       stats: { raw_lines, parsed,        Lab view model:
                skipped, unparseable } }
                                            RequestColumn[] built by
Guards: same path-traversal +               buildRequestSpans over the
allowed-root checks as the                  accumulated live events;
existing session readers;                   delta events run through the
offset beyond EOF returns                   same classifyTurnActor /
empty delta, not an error;                  activityModel path as import
truncated trailing line is
left unconsumed (offset stops             Fidelity panel:
before it) for the next poll                rawLines, parsedEvents,
                                            skippedLines, offset,
                                            lastPollAt, cadence state
```

Invariants preserved: evidence is the source of truth; the live view
is a projection, not storage; durable writes still pass review;
capture stays explicit (follow reads what the connected agent already
writes).

## 5. Implementation slices (smallest first)

1. ~~**Rust delta read.**~~ Shipped. `get_claude_code_session_delta`
   (`src-tauri/src/claude/code.rs`): offset tracking, partial-trailing-line
   safety (consumes only through the last newline, so `new_offset` never
   lands mid-line and a torn UTF-8 tail is never decoded), `ClaudeDeltaStats`
   (`raw_lines` / `parsed` / `skipped` / `unparseable`, with the
   `raw_lines == parsed + skipped + unparseable` invariant), and the same
   canonical-root + JSONL path guards as the existing readers. The byte-tailing
   plumbing (`tail_new_complete_lines`) is agent-generic; only
   `parse_jsonl_delta` is Claude-specific, and it reuses the same per-line
   helpers as the full-read `parse_jsonl` so turn classification cannot drift.
   Reading the delta sidesteps the whole-file `MAX_FILE_BYTES` cap. Eight
   colocated Rust tests cover append-mid-poll, incomplete-trailing-line
   (Korean / multi-byte), offset-at/past-EOF, stats accounting, full-read
   parity, path rejection, and in-delta patch correlation. Command registered
   in `main.rs`.
2. ~~**Frontend tail adapter.**~~ Pure core shipped. The TypeScript
   command binding (`getClaudeCodeSessionDelta` in `claudeTauri.ts`, typed
   in `tauriCommands.ts` + `claude/types.ts`) and the pure agent-store
   accumulator (`lib/live-follow/agentStoreFollow.ts`): `appendDelta`
   (offset-monotonic fold, id-deduped events, composite-key-deduped touches,
   summed stats), `buildFollowSubject` (projects the tail into the exact
   `ClaudeCodeSessionDetail` the one-shot import consumes, so
   `openedByUser` / `turnId` match), and `runAgentStoreFollowPoll`
   (deps-injected read, append, react, reusing the generic
   `followController` / `followCadence`). Six colocated tests cover
   new-event detection, re-read dedup, offset monotonicity, and turn-boundary
   parity with the full-read import path (asserting identical events AND
   identical `buildRequestSpans` output). Remaining for slice 3: the desktop
   interval effect (a `useLiveFollow` sibling reading the delta) and the lab
   view, both best built and verified against a real running session.
3. ~~**Lab view.**~~ Shipped. Palette-only `liveFollowLab` `ViewKey`
   (`domain/types.ts`, routed in `App.tsx`, command in `commandPalette.ts`),
   the foreground driver (`features/live-follow-lab/useAgentStoreFollow.ts`:
   own local state, adaptive cadence, hidden-tab pause, error backoff,
   auto-stop), the view (`LiveFollowLabView.tsx`: session picker
   auto-selecting the most recent discovered session, request columns built
   through the shared import path + `buildRequestSpans`, a leading orphan
   column so nothing read is dropped, and a fidelity panel showing
   raw / parsed / skipped / unparseable / offset / cadence), the pure
   `buildLabColumns` (colocated test), and the feature CSS sheet
   (`styles/features/live-follow-lab.css`). Verified in browser mode (honest
   desktop-required empty state, no console errors); the live column build
   is verified against a real running session in the Tauri app.
4. ~~**Raw stream virtualization.**~~ Lab shipped; production list
   deferred. Added a dependency-free measured-height virtual list: the pure
   windowing math (`lib/virtual/virtualWindow.ts`, `computeVirtualRange` +
   `buildOffsets`, eight tests covering fixed / variable heights, overscan
   clamping, and spacer-sum invariance) and the `VirtualList` component
   (`components/ui/VirtualList.tsx`: estimate-then-measure heights, overscan,
   optional stick-to-bottom for live tails). Wired into the lab column
   bodies, where one request can accumulate hundreds of rows during a long
   session. Verified in a real browser via a throwaway probe: 1000 rows
   rendered only ~22 near the viewport (correct slice indices, full scroll
   height honored, window shifts on scroll). The 원본 (`TimelineChronoList`)
   migration is intentionally **not** done here: its rows are variable-height
   with inline expand-in-place and `scrollIntoView`-on-select, so a naive
   fixed-window pass would degrade a shared production surface; it is a
   separate careful slice on the same primitive.
5. **Graduation.** Mount the same follow pipeline behind the session
   활동 tab's `FollowControl` for sessions whose spine is a discovered
   agent-store session; retire the lab from the default palette list.

Each slice ships with green `npm run check:full`; slices 1 and 2 also
run `cargo check` / `cargo test`. Slice 3 onward is verified against a
real running Claude session, not fixtures alone, per the
real-data-verification working rule.

## 6. Non-goals (unchanged by this spec)

- A watcher that runs while the app is closed (tray, autostart,
  daemon). Foreground only, always.
- Auto-durable memory from followed events. Review gates unchanged.
- Driving the agent (starting, resuming, or scheduling Claude runs
  from Mori).
- Replacing the 타임라인 / 원본 / AI 흐름 readings. The
  request-anchored list is an addition, and only after verification.
- A standing sidebar surface for the lab.

## 7. Status

Slices 1 to 4 are shipped: the Rust delta read
(`get_claude_code_session_delta`), the pure `agentStoreFollow` accumulator
with full-read turn-boundary parity proven, the palette-only lab view
(foreground driver + request columns + fidelity panel), and the
dependency-free measured-height `VirtualList` (pure core tested, real-DOM
windowing verified) wired into the lab columns. What remains is the 원본
production-list migration onto the same primitive, and slice 5
(graduating the pipeline into the session 활동 tab, then retiring the lab
from the default palette list). Running the live column build against a
real growing Claude session in the Tauri desktop app is the remaining
real-data verification.
The external evidence base for the decisions here is recorded in
[`../references/agent-session-viewer-landscape.md`](../references/agent-session-viewer-landscape.md).
