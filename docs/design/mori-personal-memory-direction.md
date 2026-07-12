# Mori as a personal memory system · direction

Status: **direction accepted 2026-07-13.** The user confirmed Mori should be
able to grow beyond coding activity into a general personal memory system
while the evidence-linked coding experience remains the strongest use case.
Everything below the fold is the working model: sections are marked **fact**
(verified in code), **accepted** (user-confirmed), or **proposal** (needs a
decision, listed in §8). The v1 exploration lives in this file's git history;
§7 records what v2 revised or rejected, including parts of v1 itself.

Companion reading: [`mori-project-goal.md`](../mori-project-goal.md),
[`memory-architecture.md`](../memory-architecture.md),
[`memory-as-a-service.md`](memory-as-a-service.md),
[`key-decisions-register.md`](key-decisions-register.md) (row 26).

## 1. Product definition (accepted)

> Mori is a local-first personal memory system. It captures what you work on,
> read, and learn (starting with AI-assisted coding work), turns it into
> reviewed or reviewable provenance-linked memory, and recalls it when it
> becomes useful.

Mori stays **one product**. Code, Knowledge, and Language are not products,
tracks, tabs, or databases. They are capability clusters over one shared
foundation (§3).

## 2. What the repository provides (fact)

| Layer | State |
| --- | --- |
| Memory spine (proposals, `StoredAcceptedProjectMemory` with 10-state lifecycle, audit + revert, confidence, sensitivity, evidenceRefs, consolidation + stale + contradiction review, Ask Mori, `.mori` export) | Domain-neutral, pure, tested. Reusable as-is |
| Engine seam (규칙 기반 · Ollama · OpenAI 호환) | Decoupled from what is analyzed; `askMoriLlm.ts` is the adapter template for any new capability |
| Event model | `EventType` already includes `documentNote`, `webResearch`, `artifact`; `SourceKind` reserves `docs`, `url`, `file`, `browser` |
| Capture | Agent stores, connector JSONL, paste, git only. No file ingestion (no Markdown, no PDF) |
| Scope | Memory API is per-`projectId`; cross-project enumeration now exists at the repository layer (`listAllAcceptedProjectMemories`, 2026-07-13) but no surface uses it yet |
| Identity doctrine | `mori-project-goal.md` still says "one AI-agent work session" and bans PDF ingestion (§14); edits pending §8.4 |

## 3. The model: evidence + memory + recall, organized by projects, powered by capabilities (proposal)

Three nouns, one container, and verbs:

- **Evidence** 자료: what Mori saw. Original sources preserved with
  provenance, trust, retention. Searchable but not asserted as knowledge.
- **Memory** 메모리: what Mori keeps. Derived items with kind, status,
  confidence, sensitivity, evidenceRefs, full audit. The only layer Mori
  treats as true, and even then with honest status.
- **Recall** 회상: search, Ask Mori, resume prompts, reports. Pull, not push.
- **Project** 프로젝트: the one container. A repo is a project; a research
  topic, a course, or a writing effort is also just a project. No new
  "topic space" aggregate unless projects demonstrably fail (§7).
- **Capabilities**: verbs applied to content, each riding the same engine
  seam and producing proposals into the same memory store:
  - **Code**: capture agent sessions, reconstruct, analyze. The deepest
    capability today; unchanged.
  - **Understand** (the Language idea): explain/translate any text the user
    selects, in context; optionally remember expressions and corrections.
  - **Distill** (the Knowledge idea): ingest a document/page, keep it as
    evidence, derive only the few durable claims policy allows.

Why this instead of v1's "source families × lenses × memory kinds × views":
fewer concepts, verbs match how the user meets them, and "lens" stays
reserved for the Reconstruction Lab's shipped timeline lenses instead of
being overloaded into a product-wide abstraction.

A session remains **the unit of agent work only**. A saved expression or an
imported document attaches to a project directly; plumbing may use a
lightweight capture record, but the UI never shows a fake "session".

## 4. Memory governance (proposal · the core new design)

Goal: avoid both review fatigue and silent AI truth. Model: one **memory
policy** with three modes, small fixed exceptions, and a new `provisional`
status. Smallest sufficient model; explicitly not a policy engine.

Modes (global default; per-project override only if real use demands it):

| Mode | Behavior |
| --- | --- |
| **항상 확인** (default, today's behavior) | Every durable-memory proposal waits in consolidation review |
| **자동 저장** | Qualifying proposals land immediately as `provisional` memory; the rest go to the exception queue (the existing consolidation review surface, reused) |
| **수집만** | Evidence only; no derivation runs |

Qualifying for auto = ALL of: additive (creates new memory, does not touch
existing), confidence high, sensitivity normal, no conflict with existing
memory. Everything else asks. In particular these **always ask, in every
mode**:

- any mutation of existing memory (merge, supersede, markStale, resolve)
- anything sensitive
- anything that contradicts existing memory

`provisional` (new status in the existing 10-state lifecycle):

- fully recallable in personal surfaces (search, Ask Mori, resume prompt)
  with an honest marker, e.g. 잠정
- **never crosses an external boundary**: reports, `.mori` export, clientSafe
  and team outputs include confirmed memory only
- becomes confirmed only by explicit user action (confirm or edit); never by
  time or silent use
- audited like everything else, actor `auto-policy`, one-click revert via the
  existing revert machinery
- swept by the existing stale review when old, unconfirmed, and unused, so
  the store cannot silently fill with noise

One sentence of doctrine that summarizes it: **automation may raise the floor
of what Mori remembers for you; review remains the gate for what leaves the
machine and for anything that rewrites what you already confirmed.**

## 5. Navigation and layout direction (proposal)

Evaluated against the current shell (홈 · 라이브 · 연동 · 프로젝트 · 대시보드 ·
워크벤치, sessions living under projects). Verdict: the shell survives; two
moves, no redesign.

1. **Projects generalize to any context.** No rename needed; the workspace
   stops assuming a repo path is the only grouping. Coding projects keep
   sessions; other projects hold evidence and memory without sessions.
2. **메모리 becomes a primary surface** (global, cross-project):
   - 전체 검색 across all memory (rides `listAllAcceptedProjectMemories`)
   - 최근 메모리 stream
   - 확인 대기: the provisional + exception queue (§4), one place to
     confirm, correct, or discard
   - collections by kind later (e.g. 표현 노트), as filters, not new screens

```
홈           command-first landing (unchanged)
라이브        live agent sessions (coding capability surface)
연동          capture: agents, connectors, paste, document import later
프로젝트      contexts: repo projects with sessions · other projects without
메모리        NEW primary: search all · recent · 확인 대기 · collections
대시보드/워크벤치  unchanged (workbench already parked, register row 22)
```

The Context Inspector doctrine holds: capability results (e.g. a selection
explanation) render in the right-side inspector, never a second workspace.

## 6. Validation plan (accepted direction, proposed sequence)

Two small end-to-end experiments over one shared foundation. Neither builds a
platform.

**Foundation (partly built)**
- Cross-project memory enumeration: **shipped 2026-07-13** at the repository
  layer (browser prefix scan + SQLite `list_all_accepted_project_memories` +
  runtime routing, tested). Unblocks the 메모리 surface and global search.
- `provisional` status + policy modes: build after §8.1 is decided.
- Memory-kind extension (e.g. `expression`, `claim`): with the experiment
  that first needs it; a deliberate union bump + consumer audit each time.

**Experiment L · Understand (first)**
- L1: select text in a session transcript or evidence surface → 이해 action →
  Context Inspector shows natural translation, contextual meaning, useful
  expressions. Engine via the existing provider seam; deterministic fallback
  is honest ("엔진 없음"), never a fake answer. No save, no OS capture.
- L2: 저장 turns a result into an `expression` memory with provenance to the
  exact event, entering through the §4 policy like any proposal.
- Validates: capability pattern, inspector UX, first non-code memory kind,
  daily EN↔KO value with zero new capture infrastructure.

**Experiment K · Distill (second)**
- Paste or import Markdown/plain text → evidence attached to a chosen
  project → sparse distillation: propose only claims that connect to existing
  memory or that the user highlighted; everything else stays searchable
  evidence. Success check: Ask Mori answers a question from the document with
  a citation, and the memory store gained only a handful of items.
- Validates: non-session capture identity, extraction economics rule,
  evidence-vs-memory boundary under the policy.

Order rationale: L first because it needs no capture-layer change and tests
the governance surface with the lowest-stakes memory kind; K second because
it depends on the non-session capture decision (§8.3) and its economics rule
deserves a real-document trial, not speculation.

## 7. Rejected and deferred (so they are not re-litigated)

- **Tracks / separate products / separate databases**: rejected. One store,
  one lifecycle, one recall.
- **v1's "lens" as the product-wide abstraction**: retired (self-revision).
  Capabilities replace it; "lens" keeps its shipped Reconstruction Lab
  meaning.
- **Topic spaces as a new aggregate**: deferred; projects are the container
  until a real use case breaks them.
- **Document manager / wiki / standalone translator / spaced-repetition
  system**: not building. Fragments of value they represent arrive as
  capabilities + memory instead.
- **OS-wide selection capture**: later, consent-gated, explicit-action-only;
  clipboard watching and screen reading stay banned.
- **Policy engine** (per-source × per-kind × per-integration matrices):
  rejected; one mode + fixed exceptions is the whole model until proven
  insufficient.
- **Embeddings as source of truth**: still a non-goal; embeddings remain a
  later option strictly over accepted memory.
- **Time-based auto-confirmation of provisional memory**: rejected;
  confirmation is always an explicit act.

## 8. Decisions needed (user)

1. **Governance**: approve the §4 model (three modes, always-ask exceptions,
   `provisional` semantics, confirmed-only external outputs)?
2. **IA**: approve promoting 메모리 to primary navigation with the 확인 대기
   queue inside it?
3. **Non-session capture identity** (needed before Experiment K): lightweight
   hidden capture record vs project-level evidence without any session
   object. Recommendation: hidden capture record, because every existing
   evidence path hangs off a session id and this avoids a schema migration.
4. **Doctrine edits**: with the direction accepted, `mori-project-goal.md`
   §1 (identity), §2 (session doctrine), §14 (narrow the PDF non-goal to
   image/audio/video) should be updated to match. Approve making those edits?
5. **Naming**: keep "이해" (Understand) and "정리/증류" (Distill) as internal
   capability names, with no user-facing "Mori Code/Knowledge/Language"
   vocabulary. Confirm or rename.

## 9. Open questions (not blocking the next step)

- Sparse-extraction gate for K: is "connects to existing memory or
  user-highlighted" right? Decide from a real-document trial.
- Where expressions live before the 메모리 surface exists: a global
  pseudo-project vs the project the selection came from. Leaning: the source
  project, since provenance already points there.
- Bidirectionality of 이해 at L1: EN→KO comprehension first; KO→EN expression
  as L1.5 if the first week of real use demands it.
- Whether per-project policy overrides are ever needed, or the global mode
  suffices permanently.
