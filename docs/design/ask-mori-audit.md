# Ask Mori · implementation audit (proposal, awaiting approval)

Status: **Slice 1 (lib) + Slice 2a (LLM adapter) + Slice 2b (UI) all
implemented.** This started as the "write an audit before implementation"
deliverable required by `mori-project-goal.md` §11. With the three open
questions in §8 confirmed (decision A, slice-by-slice, accepted-memory +
active-session scope), the capability is now built:

- **Slice 1 (`src/lib/ask-mori/`):** `askMoriTypes` / `askMoriContext`
  (incl. `extractQueryTerms` with Korean particle stripping) /
  `askMoriAnswer` (`answerFromMemory`). Pure, injected LLM port.
- **Slice 2a (`src/lib/ask-mori/askMoriLlm.ts`):** `createAskMoriLlm` /
  `createAskMoriLlmFromSettings`. Reuses the shipped settings → config
  mapping; prose mode (not the Quick Pass JSON); existing providers
  untouched. Returns `null` for the deterministic provider.
- **Slice 2b (`src/features/memory/AskMoriCard.tsx`):** the LLM sibling of
  the Memory Search card, wired into `MemoryView` inside the "메모리 분석 ·
  도구" disclosure beside `QueryableMemoryCard`, fed the same four data
  props plus `analysisSettings` from `useSessionStore`. Honest basis badge
  (로컬 LLM / 규칙 기반 / 근거 없음), cited references, non-current flag.

Validation: 18 colocated lib tests green, project typecheck clean,
stylelint clean, production build green. The UI has no pixel test (per
working rules); its logic lives in the tested pure helpers.

Shipped since: Ask Mori is surfaced on Home's command space (the 묻기 mode) and
searches across every saved session (see
[`cross-session-memory-search.md`](cross-session-memory-search.md)). Retrieval
also runs a deterministic multi-round "search → read → search again" loop
(`expandRounds`): after each round it mines the hits' titles for salient terms
the question never named and re-retrieves, so evidence phrased differently from
the question still surfaces. Still local + deterministic, no LLM drives the
loop, bounded so it always terminates.

Follow-ups (not in scope here): wire citation rows to the memory detail
drawer / timeline navigation; per-claim citation parsing of the LLM's inline
tags; carry a typed session name from the 만들기 mode into the new-session flow.

## 1. What Ask Mori is

A way to ask a natural-language question ("이 프로젝트에서 인증은 어떻게
결정했지?") and get a **grounded, cited answer** built from the project's
*already-reviewed* memory, using the user's optional Local LLM. It is the
LLM-query layer over the structured memory Mori already accumulates.

It is **not** a chatbot, not a general assistant, and not a new capture
surface. It reads only what the user already reviewed and accepted; the
answer is a reviewable proposal, never durable memory.

## 2. Why this is the right next milestone

- **Builds entirely on shipped pieces.** Retrieval is
  `searchAcceptedMemories` + `searchProjectMemoryReferences`
  (`src/lib/project-memory/queryableMemory.ts`, shipped, deterministic,
  evidence-cited). The LLM call is the existing `AnalysisProvider`
  abstraction + `resolveQuickPassProvider` /
  `buildProviderConfigFromSettings` (`src/lib/analysis/`, shipped: a
  deterministic provider always available, Ollama and OpenAI-compatible
  optional). No new engine, no new settings, no network primitive.
- **Independent of the A/B background work.** It touches none of the
  surveillance-line / Live-Follow machinery. Pure additive value, low risk.
- **Principle-clean by construction.** Source is reviewed memory only;
  output is a proposal with citations; degrades honestly with no LLM.
- It is the "Personal Memory / Ask Mori" frontier both the user and the
  external review identified as the highest-leverage next layer.

## 3. Architecture (retrieval → ground → answer → cite)

```
question
   │
   ▼
retrieve   searchAcceptedMemories(acceptedMemories, {text})           [shipped]
           + searchProjectMemoryReferences(activeSessionRefs, {text}) [shipped]
   │   → top-K cited candidates (memoryId / evidenceRefs, isCurrent flag)
   ▼
ground     buildAskMoriContext(question, candidates)                  [NEW, pure]
   │   → a bounded, citation-tagged prompt; only curated fields
   │     (title / summary), never raw transcripts (queryableMemory
   │     already guarantees this for snippets)
   ▼
answer     AnalysisProvider-style call via resolveQuickPassProvider   [reuse]
   │   → if no LLM engine configured / reachable: deterministic
   │     fallback = "no engine; here are the top retrieved memories",
   │     i.e. it degrades to the Queryable Memory result list
   ▼
cite       parse answer, attach the candidate citations it drew on    [NEW, pure]
       → AskMoriAnswer { text, citations[], basis, usedLlm, isCurrentOnly }
```

### Key design decision to confirm before coding

The shipped `AnalysisProvider.analyze()` is shaped for Quick Pass
*extraction* (returns `MoriAnalysisResult`: issues / decisions / …). Ask
Mori is a different task (free-form Q → grounded prose + citations). Two
options:

- **(A · recommended) Add a sibling capability, reuse the transport.** Keep
  `analyze()` untouched. Add a thin `answerQuestion()` path that reuses the
  same provider *config / endpoint / timeout / fallback* wiring
  (`buildProviderConfigFromSettings`, `resolveQuickPassProvider`) but with
  its own prompt + parse. Smallest blast radius; no risk to Quick Pass.
- (B) Overload the existing provider interface with a QA method. More
  coupling, risks Quick Pass regressions. Not recommended.

This audit assumes **(A)**.

## 4. Smallest valuable slice (Slice 1)

Pure library + types + tests. **No UI, no network of its own** (LLM call
goes through the existing provider, which the user has already configured or
not).

New files:

- `src/lib/ask-mori/askMoriContext.ts` · `buildAskMoriContext()` (pure):
  question + retrieved candidates → bounded grounded prompt + the citation
  set it embeds. No IO.
- `src/lib/ask-mori/askMoriAnswer.ts` · `answerFromMemory()`: orchestrates
  retrieve → ground → provider-call → cite. Takes the provider (or the
  deterministic fallback) as an injected dependency so the core stays
  testable without a network.
- `src/lib/ask-mori/askMoriTypes.ts` · `AskMoriAnswer`, `AskMoriCitation`,
  `AskMoriBasis` (`llm` / `deterministicFallback` / `noMemory`).
- `src/lib/ask-mori/askMoriContext.test.ts`,
  `askMoriAnswer.test.ts` · colocated Vitest, fixture-driven (no live LLM).

Explicitly **out of this slice**: any UI surface, MCP exposure, team
sharing, cross-project memory, embeddings / vector retrieval (non-goal as
the primary store), and conversation memory across questions.

## 5. Slice 2 (separate approval) · thin UI

An "Ask Mori" surface on the Project Memory page (or command palette entry),
Korean-first copy, that runs `answerFromMemory` and renders the cited
answer with each citation linking back to its memory / evidence. Reuses
existing memory-page data loading. Proposed only after Slice 1 is green.

## 6. Principle compliance (`mori-project-goal.md` §6)

- **Local-first.** No new network; uses the user's already-configured
  optional Local LLM or the deterministic fallback. No cloud dependency.
- **Evidence is source of truth / AI is a proposal.** Every answer is built
  from reviewed memory and carries citations; it is displayed as an answer,
  never written to durable memory. No review gate is bypassed because
  nothing is persisted.
- **No new capture.** Reads existing accepted memory + active-session
  evidence only. No watcher, no daemon, no A-surface.
- **Honest status.** When no LLM is configured / reachable, the answer is
  explicitly labeled `deterministicFallback` and shows the retrieved
  memories instead of fabricating prose. `noMemory` when retrieval is empty.
- **Privacy.** Snippets already come only from curated fields
  (queryableMemory guarantees this); the grounded prompt inherits that.
  Non-current memory (`stale` / `contradicted` / …) is flagged `isCurrent:
  false` and excluded from authoritative claims.

## 7. Validation plan

- During: `npx vitest run src/lib/ask-mori` for the new pure helpers;
  fixture-driven, no live LLM (inject a stub provider).
- Before commit: `npm run check:full`.
- Before handoff: `npm run build`.
- No `src-tauri/` change in Slice 1, so no `cargo` step.
- No Playwright / pixel tests (per working rules); behavior is covered by
  pure-function fixtures.

## 8. Open questions for the user

1. Confirm design decision **(A)** (sibling capability, reuse transport).
2. Slice 1 (pure lib) first, then Slice 2 (UI) on separate approval · ok?
3. Retrieval scope for v1: accepted memory only, or accepted memory +
   active-session references? (Recommend both; both are already shipped.)
