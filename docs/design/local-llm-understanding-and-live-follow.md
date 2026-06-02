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
4. **Disclosure level (projection).** Per-element disclosure level with
   a configurable default; non-destructive projection over stored
   elements. Wire into Review / Timeline / Resume Prompt rendering.
5. **Request abstraction pass.** A provider pass that produces an intent
   line for a request message; feeds the `abstract` disclosure level.
6. **Local LLM connectivity depth.** LM Studio surface, a model
   registry, and per-task model routing on top of the existing
   provider settings.
7. **Live Follow.** Session-scoped foreground polling of the session's
   connector file, incremental delta analysis merged into the current
   run, and a Notification Center producer. Built last because it
   depends on 1 to 4.

## 6. Non-goals (unchanged by this spec)

- Always-on background watcher / daemon that runs while the app is
  closed.
- Global filesystem monitoring, screen capture, app-private-DB reading.
- Automatic durable memory writes without review.
- Cloud LLM hard dependency. Local LLM stays optional; the
  deterministic provider remains the always-available floor.
- Embeddings / vector store as the source of truth.

## 7. Status

Slices 1 to 3 shipped: the explainable re-analysis spine is complete
end to end (pure helper, persistence, store, and a visible Review-tab
panel). Re-running Quick Pass with a different local model now keeps
every run, shows what changed, and lets the user adopt any run as the
live understanding, with the model and timing of each run inspectable.

Next: slice 4 (per-element disclosure / projection), the foundation for
"store everything, show by setting" and request abstraction.
