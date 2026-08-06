# Local LLM Understanding, Disclosure, and Live Follow

Design spec for evolving Mori's local-LLM layer from a single-pass
Quick Pass into a durable, re-runnable *understanding* layer with
per-element disclosure control and an explicit, session-scoped live
follow. This document is the audit-before-implementation record for the
capability; it makes the product decisions explicit so the
implementation slices stay small and principle-safe.

Read [`mori-project-goal.md`](../mori-project-goal.md) first (product
identity, principles, non-goals) and
[`quick-pass-analysis.md`](../quick-pass-analysis.md) for the existing
analysis layer.

## 1. Motivation

The user's direction: Mori should not merely render an imported
conversation as a timeline. It should call the user's **local LLM** to
*read* each session and turn it into reviewable understanding, while
treating the user's own request text as something that may need to be
abstracted rather than shown verbatim. Concretely:

- The local LLM reads a session and extracts what happened: issues,
  work done, decisions, documents/artifacts.
- The user's raw request messages are sensitive. Mori should be able
  to **store** them but **display** them as a summary or an abstraction
  ("the user requested X") instead of the literal prompt.
- Storage is uniform and complete; **visibility is a setting**, chosen
  per element, not a destructive edit.
- Local LLM connectivity should be broad and advanced (multiple
  runtimes, per-task model routing).
- A still-running session should be followable in real time: as more
  conversation happens, Mori keeps pulling the new evidence, the local
  LLM keeps judging, and notifications fire.
- Because analysis depends on which model/agent produced the
  conversation, re-analysis must be possible, and the *reason* an
  analysis came out the way it did must be inspectable.

## 2. How this maps onto what already exists

This is an extension of existing seams, not a new app.

| Vision element | Existing seam | Gap to build |
| --- | --- | --- |
| LLM reads session, extracts elements | Quick Pass: deterministic / Ollama / OpenAI-compatible providers producing `AnalysisResult` (issues / decisions / relationships / next actions / summary, each with `provenance`, `confidence`, `trustLevel`) | Add a `document/artifact` element; deepen extraction |
| Abstract the user's request text | `rawRetention` (`retained` / `summaryOnly` / `redacted` / `notCaptured`), `containsLikelySecret`, Resume Prompt privacy modes | A message-level "request abstraction" pass and a per-element disclosure level |
| Store all, choose what's shown | Per-source `rawRetention`, schema-versioned stored records | Separate the storage layer (always full + policy) from a projection layer (display by disclosure level) |
| Broad local LLM connectivity | Ollama + OpenAI-compatible providers, `probe*Connection`, persisted provider settings | LM Studio surface, model registry, per-task model routing, incremental runs |
| Live follow + notifications | Connector inbox (`~/.mori/connectors/.../<session-id>.jsonl`, written per session by the Claude hook); Notification Center producer seam | A session-scoped foreground follow loop + a follow producer |
| Re-analysis + reasons | `AnalysisResult` already carries `providerName`, `providerLabel`, `generatedAt`, `confidence`, `durationMs`, `notes` | Keep multiple runs (history), a current-adopted pointer, and a run diff |

## 3. Product decisions (made)

### 3.1 Live Follow boundary: session-scoped, foreground

The hard non-goals ban background watchers, daemons, and scheduled
jobs (`mori-project-goal.md` §14, `mori-autonomous-loop.md` §4). The
user reprioritised real-time follow, which the non-goal list permits
*only* on explicit reprioritisation. The principle-preserving form:

> **Live Follow** is an explicit, per-session, foreground capability.
> The user turns it on for one registered session. While the Mori app
> is open, Mori polls **only that session's** already-growing connector
> file (the same per-session JSONL the Claude hook already writes on
> explicit install). It is not a global machine watcher, not a daemon,
> and it stops when the session is unfollowed, the session is closed,
> or the app is closed.

Constraints that keep it honest:

- **No new capture.** Live Follow reads a file the user's explicitly
  installed connector is already writing. Mori never starts the agent,
  never watches arbitrary folders, never reads an app's private DB.
- **Review-before-apply is unchanged.** New events surface as pending
  import candidates; durable memory still requires the user's Apply.
  Live Follow may auto-*associate* already-captured evidence onto the
  session spine (allowed today), never auto-*capture* or auto-*commit*.
- **Foreground only.** No work happens while the app is closed. This is
  the line that separates Live Follow from the banned daemon.
- **Off by default, per session.** A session is static unless the user
  turns follow on.

A true always-on background watcher (runs while the app is closed)
remains a non-goal and a separate, identity-changing decision; it is
explicitly out of scope here.

**Amendment, 2026-08-06 · the boundary is multi-session, not
single-session.** The shipped 세션 surface
(`src/features/live-session/useLiveSessions.ts`) discovers the currently
active sessions and follows up to eight at once, re-discovering
periodically, rather than one session the user registered. It also reads
the agent's own store directly (Claude Code JSONL via
`get_claude_code_session_delta`) rather than only a hook-written
connector file, so following needs no script install.

Every constraint above still holds unchanged: foreground only, pauses
when the tab is hidden, no new capture, reads only sources the user
connected, never starts or drives an agent. What changed is the *count*
and the *reader*, not the rails. The "only that session's file" wording
is superseded; the product needs a view of concurrent work, which is the
whole point of the 세션 dashboard. Read the boundary as: **explicit,
foreground, connected-sources-only, multi-session.**

See [`live-project-intelligence-execution-plan.md`](live-project-intelligence-execution-plan.md)
§3.2 for the audit that found this, and D5 there for the local-LLM
scheduling rule that follows from watching several sessions at once.

This maps onto the A-vs-B surveillance line in `mori-project-goal.md` §6:
reading the followed session's already-connected file while the app is
running (even minimized / unfocused), and surfacing an OS notification, is
the permissible "B" surface, an extension of foreground Live Follow under
the three rails (scope, review-before-apply, transparency). A reader that
runs while the app is fully closed (tray-resident, autostart) is the still
banned "A"-adjacent watcher above.

### 3.2 Storage vs disclosure: store full, project by level

"Store everything the same, choose what's shown" is reconciled with the
"must not be stored silently" rule (`mori-project-goal.md` §9) as:

- **Storage layer** always retains the full element under its
  `rawRetention` policy, with secret-shaped strings detected and
  isolated at import (never stored as plain durable memory).
- **Projection layer** decides what a surface renders, by a per-element
  **disclosure level**:
  1. `raw` — the original text.
  2. `summary` — an LLM/heuristic summary.
  3. `abstract` — an intent line ("the user requested X"); the literal
     request is withheld.
  4. `hidden` — not rendered (still stored, still audited).
- The default disclosure level is configurable in Settings and
  overridable per element. Changing a level is a non-destructive view
  change, recorded like any other reviewable action.

This makes the user's "display is a setting" idea precise: the bytes are
constant, the projection is a policy.

### 3.3 Re-analysis: accumulate runs, do not overwrite

Today `StoredSessionAnalysis` holds one `result` and
`saveSessionAnalysis` overwrites it, so a re-run with a different model
destroys the prior understanding. The new model:

- Keep an **append-only run history** per session: each
  `AnalysisRunRecord` is one provider's output with its model,
  provider, prompt version, timing, confidence, and `notes` (the
  "why").
- A **current-adopted pointer** marks which run is the live
  understanding; the user can switch it.
- A **run diff** summarises what changed between two runs (elements
  added / removed / changed) so re-analysis is reviewable rather than
  silently authoritative, consistent with "AI interpretation is a
  proposal" and "user correction is first-class".
- The reason an analysis exists is always inspectable: model + provider
  + prompt version + timing + notes travel with each run.

## 4. Data model sketch

```
Storage layer (always full + policy)        Projection layer (display)
------------------------------------        --------------------------
RawEvent (text + rawRetention)              DisclosureLevel per element:
  - secret detection / isolation              raw | summary | abstract | hidden
ExtractedElement                              -> surfaces project, never mutate storage
  issue | decision | document |
  nextAction | relationship
  - provenance (sourceEventIds)
  - requestAbstraction (intent line)

Analysis layer (re-runnable)                 Live Follow (session-scoped, foreground)
----------------------------                 ----------------------------------------
AnalysisRunHistory                            follow(sessionId): poll that session's
  runs: AnalysisRunRecord[]   (append-only)     connector file while app is open
  currentRunId                                  -> new events = pending import candidates
  diff(runA, runB)                              -> incremental delta analysis, merged
each run: model, provider, promptVersion,       -> Notification Center producer fires
          generatedAt, durationMs,
          confidence, notes (the "why")
```

Invariants preserved: evidence is the source of truth, LLM output is a
reviewable proposal, durable writes require review, provenance is
always retained, capture stays explicit.

## 5. Implementation slices (smallest first)

Each is a standalone production slice with colocated tests; none
bypasses a review gate.

1. ~~**Analysis run history (pure helper).**~~ Shipped. `analysisRunHistory.ts`:
   append-only run records, current pointer, run diff, and a
   human-readable run-reason descriptor over the existing
   `AnalysisResult` fields. (Foundation for re-analysis + "why this
   analysis".)
2. ~~**Run-history persistence.**~~ Shipped. `StoredSessionAnalysisHistory`
   maintained inside `saveSessionAnalysis` (re-analysis appends, in-place
   edits update the run by id), `loadSessionAnalysisHistory` with forward
   migration from the legacy single-result record, and
   `selectSessionAnalysisRun`. Browser localStorage; analysis is not
   SQLite-mirrored, so no migration was needed there.
3. ~~**Run-history UI.**~~ Shipped. Store actions `loadAnalysisRunHistory`
   / `selectAnalysisRun`, a pure `buildAnalysisRunHistoryViewModel`
   (newest-first rows, run reason, Korean change-vs-previous), and the
   `AnalysisRunHistoryPanel` on the Review tab (adopted-run reason always;
   a disclosure with per-run diff + adopt action when multiple runs
   exist). Confidence % is intentionally not shown (internal-vocabulary
   rule).
4. **Disclosure level (projection).** Foundation shipped:
   `disclosureLevel.ts` (`raw` / `summary` / `abstract` / `hidden`,
   Korean labels, `projectDisclosure` with privacy-monotonic fallback so
   a missing variant never leaks a less-private one). Shipped end to
   end: a Settings default (RequestDisclosureCard) plus per-event
   overrides (`requestDisclosureOverrides` + `setRequestDisclosureOverride`,
   resolved via `resolveDisclosureLevel`) applied consistently in the
   Event Inspector, the chronological list, and the report builder, so a
   request hidden on one event stays hidden in every surface. The Resume
   Prompt embeds no raw event text, so it needs none.
5. **Request abstraction + first wiring.** Shipped:
   `requestAbstraction.ts` (`buildRequestAbstraction` /
   `classifyRequestIntent`, deterministic, content-free intent line, the
   always-available floor). Wired into the Event Inspector: a user's own
   request summary is projected at a persisted `requestDisclosureLevel`
   (`QuickPassAnalysisSettings`, default `raw`) via a segmented control,
   storage always keeps the original. Local-LLM-backed abstraction also
   shipped: `llmRequestAbstraction.ts` (`buildLlmRequestAbstraction`,
   privacy-safe prompt, deterministic fallback) plus a
   `generateRequestAbstraction` store action and an on-demand
   "로컬 LLM으로 요지 생성" inspector action that feeds the projection.
6. **Local LLM connectivity depth.** Shipped: the connection probe's
   discovered models are click-to-select chips in the Local AI settings;
   per-task model routing (`resolveTaskModel` + a `requestAbstractionModel`
   override so a small model can do the lightweight abstraction while
   Quick Pass keeps the main one). Remaining (optional): a richer model
   registry and a distinct LM Studio surface (today LM Studio connects
   via the OpenAI-compatible provider).
7. **Live Follow.** Brain + store orchestration shipped:
   `live-follow/followController.ts` (pure reducer: start / poll / pause /
   resume / error / stop, `computeNewEventIds`, `decideFollowReaction`)
   and the session-store slice (`follow` state + `startFollow` /
   `applyFollowPoll` / pause / resume / stop / setFollowError), both
   tested. The existing Tauri commands `list_connector_jsonl_inbox` and
   `read_connector_jsonl_file` already cover the polling IO, so no new
   Rust is needed. Remaining (a foreground desktop glue slice, best built
   while running the Tauri app so the live loop can be verified
   end-to-end): an interval driver that re-reads the followed session's
   connector file, parses + imports new events through the normal Import
   path, calls `applyFollowPoll`, and on the returned reaction triggers
   re-analysis + a Notification Center producer, plus a start / stop
   control. The driver is where the no-daemon principle is enforced:
   foreground only, session-scoped, stops on unfollow / app close.

## 6. Non-goals (unchanged by this spec)

- Always-on background watcher / daemon that runs while the app is
  closed.
- Global filesystem monitoring, screen capture, app-private-DB reading.
- Automatic durable memory writes without review.
- Cloud LLM hard dependency. Local LLM stays optional; the
  deterministic provider remains the always-available floor.
- Embeddings / vector store as the source of truth.

## 7. Status

Pillar 1 (explainable re-analysis, slices 1 to 3) shipped end to end:
re-running Quick Pass keeps every run, shows what changed, and lets the
user adopt any run, with each run's model and timing inspectable.

Pillar 2 (store everything, show by setting) is comprehensively shipped:
a global Settings default plus per-event overrides, applied without leak
across the Event Inspector, the chronological list, and exported
reports; a deterministic request abstraction with an optional on-demand
local-LLM abstraction; the original is always stored.

Pillar 3 (local LLM connectivity depth): discovered-model selection plus
per-task model routing (a dedicated request-abstraction model) shipped;
a richer registry / LM Studio surface remain optional.

Pillar 4 (Live Follow) has its tested decision brain and a tested
session-store orchestration slice; the polling IO is already covered by
existing connector-read Tauri commands. What remains is one foreground
desktop glue slice (interval → import new events → `applyFollowPoll` →
re-analysis + notification + start/stop control), best built while
running the Tauri app so the live loop is verified end-to-end.

Next: the Live Follow desktop shell (foreground session-scoped polling +
incremental analysis + notification producer; needs the Tauri desktop
app to build and verify), and deeper pillar 3 (per-task model routing, a
model registry). Pillars 1 and 2 are complete.

Follow-source extension: [`live-follow-lab.md`](live-follow-lab.md)
extends the §3.1 follow source from the connector inbox to the anchor
agent's own session store (delta read of `~/.claude/projects` JSONL),
under the same three rails, verified first on a palette-only lab screen
before graduating into the session 활동 tab.
