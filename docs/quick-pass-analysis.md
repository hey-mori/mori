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
  boundary, with strict JSON prompt templates in `promptTemplates.ts`, tolerant
  response parsing in `parseOllamaQuickPassJson`, and a `probeOllamaConnection`
  helper that calls `/api/tags` for a fast reachability check.
- Per-session persistence of analysis results through the existing
  `BrowserDraftRepository`
  (`saveSessionAnalysis` / `loadSessionAnalysis` / `clearSessionAnalysis`).
- A `QuickPassAnalysisSettings` shape (`src/lib/analysis/analysisSettings.ts`) for
  provider, endpoint, model, timeout, and fallback toggles, persisted through
  `saveQuickPassSettings` / `loadQuickPassSettings` on the repository.
- `useMoriSessionStore.runQuickPass` chooses the provider from settings (or an
  explicit override), records `analysisProviderLabel` and
  `analysisFallbackUsed`, and runs the deterministic provider as a fallback
  when Ollama fails *and* fallback is enabled.
- Issues / Decisions / Reports read analysis output for real sessions and fall
  back to the demo mock only when no draft is active.
- Settings → Local AI exposes provider selection, endpoint/model/timeout,
  fallback toggle, and an Ollama connection probe with honest status output.
- The Quick Pass control on Sources shows a provider segmented selector, the
  active endpoint/model, a fallback checkbox, a "fallback" badge when a run
  used the deterministic fallback, and a label distinguishing
  `real local LLM` from `heuristic (no LLM)`.

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

Configuration lives in `QuickPassAnalysisSettings`, shaped and sanitized in
`src/lib/analysis/analysisSettings.ts`. Defaults:

- provider: `deterministic`
- ollamaEndpoint: `http://localhost:11434`
- ollamaModel: `llama3.1:8b`
- ollamaTimeoutMs: `60000` (clamped 1000–300000 on save)
- fallbackToDeterministic: `true`

Tests do not require Ollama to be running — the deterministic provider remains
the default. The Ollama path is exercised in tests through an injected provider
double rather than a real network call.

### How fallback behaves

When `provider = ollama` and `fallbackToDeterministic = true`, a failed Ollama
run automatically re-runs through `DeterministicQuickPassProvider`. The stored
result keeps `providerName = deterministic-heuristic-v1`, the store sets
`analysisFallbackUsed = true`, and a leading note documents the swap:

> Ollama provider (...) failed: <reason>. Fell back to Deterministic Quick Pass
> (local heuristic).

When fallback is disabled, the run is reported as `failed`, no analysis is
saved, and the UI surfaces the error verbatim. There is no fake success.

### How to configure Ollama

1. Install Ollama and ensure it is reachable at the configured endpoint (default
   `http://localhost:11434`).
2. Pull a model that produces well-structured output, e.g. `ollama pull llama3.1:8b`.
3. Open **Settings / Privacy / Local AI** in the app.
4. Select the **Ollama** provider, optionally adjust endpoint/model/timeout, and
   click **Ollama 연결 테스트** to confirm reachability and list available models.
5. (Optional) Disable **Ollama 실패 시 결정론적 제공자로 폴백** if you want every
   failed run to surface the error instead of silently using the heuristic.

Provider choice is also reflected on **Sources / Evidence** so Quick Pass can be
flipped between heuristic and Ollama without leaving the run surface.

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

## What is still heuristic / experimental

- The deterministic provider has no language model behind it. It cannot
  understand meaning that is not signaled by its keyword list.
- The Ollama provider is configurable end-to-end, but Mori has not validated
  the *quality* of Ollama-generated issues, decisions, and relationships for
  any specific model. Treat its output as experimental until prompts and
  parsing are tuned per model.
- The connection probe verifies reachability and lists models. It does not
  verify that a given model produces well-structured JSON for Quick Pass.
- There is no Quick Pass run history. Each new run replaces the stored
  result for that session.
