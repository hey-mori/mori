# Quick Pass Analysis

Mori's first analysis stage is called **Quick Pass**. It turns imported session
sources and events into structured Mori records: session summary, issues,
decisions, relationships, next actions, and a resume prompt.

Quick Pass is intentionally pluggable through a typed provider boundary so the
default deterministic heuristic, a real local LLM, and future cloud providers
can all back the same UI flow.

## What ships today

- A typed `MoriAnalysisProvider` boundary in `src/lib/analysis/analysisTypes.ts`.
- A default `DeterministicQuickPassProvider` (`deterministic-heuristic-v1`) that
  runs entirely in the browser without any network call. It is the default
  provider used by `useMoriSessionStore.runQuickPass`.
- An `OllamaQuickPassProvider` (`ollama-quick-pass-v1`) wired through the same
  boundary, with strict JSON prompt templates in `promptTemplates.ts` and tolerant
  response parsing in `parseOllamaQuickPassJson`. It is not the default; tests
  never hit the network.
- Per-session persistence of analysis results through the existing
  `BrowserDraftRepository`
  (`saveSessionAnalysis` / `loadSessionAnalysis` / `clearSessionAnalysis`).
- Issues / Decisions / Reports now read analysis output for real sessions and
  fall back to the demo mock only when no draft is active.

## Deterministic heuristic provider

The deterministic provider is not AI. It is a local heuristic for offline
development and tests. It:

- Scans imported event titles and summaries for known issue keywords
  (`risk`, `위험`, `error`, `fail`, `미정`, `필요`, `과도`, `unresolved`,
  `TODO`, `fix`).
- Scans for decision keywords (`결정`, `채택`, `우선`, `default`, `choose`,
  `decided`).
- Deduplicates by title and links each candidate back to the event and source
  that produced it.
- Generates `createdIssue` and `influencedDecision` relationships from events
  to extracted records.
- Generates next actions for every unresolved issue candidate.
- Builds a session summary and a resume prompt grounded in the highlights,
  issues, and decisions it actually extracted.

Every extracted record is marked `trustLevel: "inferred"` and `confirmed: false`.
The provider name and label are surfaced in the UI so users always know they
are looking at heuristic output.

## Ollama provider boundary

`OllamaQuickPassProvider` is intentionally separated from the deterministic
default. It takes a config (`endpoint`, `model`, `timeoutMs`) and:

- Builds a strict JSON prompt with system + user messages
  (`promptTemplates.ts`).
- POSTs to `/api/generate` with `format: "json"` and `stream: false`.
- Aborts on timeout via `AbortController`.
- Parses the response with `parseOllamaQuickPassJson`, which tolerates JSON
  embedded in surrounding prose.
- Coerces priorities and trust levels so unexpected model output cannot
  corrupt the Mori domain types.

Important: tests do not require Ollama to be running. The Ollama provider is
only constructed when the UI explicitly opts in. Future work will add a
provider selector in Settings and wire it into `runQuickPass(provider)`.

## Persistence

`StoredSessionAnalysis` is stored under `mori.sessionAnalysis.<sessionId>` in
`BrowserDraftRepository`. The session store hydrates the analysis on app
boot and on draft selection. `clearAnalysis` and `resetToDemo` both drop the
stored record. SQLite-based persistence will replace localStorage when the
`rusqlite` runner lands.

## UI surface

- **Sources / Evidence** has a Quick Pass control: status badge, summary,
  issue/decision/next-action counts, confidence percentage, and provider
  notes. Importing without a real session disables the action.
- **Issues & Decisions** renders analyzer-generated issues and decisions when
  a real session has analysis. With no analysis yet, the view shows an empty
  state with the action to run Quick Pass.
- **Resume & Report** uses the analyzer's resume prompt when available and
  shows a basis badge clarifying whether the report is built from demo mock,
  imported session data without analysis, or a Quick Pass run.

## What is still heuristic / stubbed

- The deterministic provider has no language model behind it. It cannot
  understand meaning that is not signaled by its keyword list.
- The Ollama provider is wired but not exercised in CI. Real LLM output
  quality depends on the user's local model and prompt fidelity.
- The provider boundary does not yet read provider configuration from
  Settings; only the deterministic default is used by the store today.
- There is no Quick Pass run history. Each new run replaces the stored
  result for that session.
