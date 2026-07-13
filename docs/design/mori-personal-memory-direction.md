# Mori as a personal memory system · direction

Status: **broad direction accepted 2026-07-13** (register row 26); this
revision (v3, same day) reframes the objective after the user clarified the
real concern: not any missing feature, but **extensibility without
fragmentation**. Mori must not be permanently constrained by its
coding-session starting point, and must also not become an everything app.
Sections are marked **fact** / **accepted** / **hypothesis**; §10 is the
ledger. Prior revisions live in git history.

Companion reading: [`mori-project-goal.md`](../mori-project-goal.md),
[`memory-architecture.md`](../memory-architecture.md),
[`memory-as-a-service.md`](memory-as-a-service.md). The ordered remaining work
(Now / Next / Later, plus the legacy audit) lives in the execution roadmap,
[`mori-memory-roadmap.md`](mori-memory-roadmap.md); this doc stays the model.

## 1. The product problem (restated)

Mori today is structurally excellent at one thing: turning AI coding sessions
into reviewed, provenance-linked memory. The risk is not that it lacks a
Knowledge tab; the risk is that every schema, screen, and habit quietly
assumes "evidence = an agent session in a repo", so that the first non-code
source either gets forced into a fake session or triggers a rebuild. The
opposite risk is designing a universal platform for sources that do not exist
yet. The objective is a **small stable core that many source types can enter
honestly**, plus discipline about what to build only when usage demands it.

## 2. Identity and trajectory (accepted)

> Mori is a local-first personal memory system that turns evidence from what
> users work on, read, and learn into reusable, provenance-linked memory,
> starting with AI-assisted software development.

Stages, each gated by validation rather than a roadmap date:

1. **Now**: coding memory stays the wedge and keeps getting deeper.
2. **Next**: prove one capability (Understand) and one non-session source
   (small text/Markdown) can enter the same lifecycle honestly.
3. **Later**: source-appropriate reading/organizing experiences where usage
   shows the generic surfaces straining; generated topic views over memory.
4. **Not a stage**: file manager, document editor, note app, wiki platform,
   spaced-repetition system, OS-wide capture, everything app.

## 3. Shared core · varying experience · visibility (hypothesis, load-bearing)

What the user asked to distinguish, distinguished:

| Layer | Contents | Varies by source? |
| --- | --- | --- |
| **Shared core** (one of each, never forked) | Evidence store + provenance/trust/retention · memory lifecycle + audit + governance · recall (search, Ask Mori, resume, reports) · scopes (§4) · engine seam | Never |
| **Source-appropriate experience** | How evidence is captured, read, and navigated: sessions/timelines for agent work; document/source views for imported material later; live view for running agents | Yes, by design |
| **Contextual capabilities** | Actions on content wherever it appears: 이해하기 (understand/translate), 정리하기 (distill), 기억하기 (remember), later 표현하기 (express) | Available everywhere text exists |
| **Internal-only concepts** | Source kinds, memory kinds, lifecycle states, capture records, policy internals, storage adapters | Never user-facing vocabulary |

The rule that prevents both silos and forced uniformity: **specialize at the
content level, unify at the navigation level.** A document gets a
document-shaped reading surface (when it exists) inside the same shell,
contexts, memory, and recall as everything else. It never gets its own app,
database, lifecycle, or brand.

### Concept audit (fact: what is truly universal today)

| Concept | Verdict |
| --- | --- |
| Accepted memory, proposals, audit, lifecycle, recall, `.mori` | Universal now; reuse as-is |
| Project | Universal container; only its *grouping copy* assumes repo paths |
| Session | Honest only for agent work streams. Keep it that way; never fake one |
| TimelineEvent | Generic core (title/summary/type/confidence) + code payload (fileTouches, toolName). Non-code events already have lanes (`documentNote`, `webResearch`) |
| SourceRef | Generic except `sessionId` coupling: evidence currently requires a session. This is THE seam experiment K must settle (§7) |
| Context Inspector, InfoHint, review surfaces | Universal interaction patterns; reuse |
| Ask Mori / queryableMemory | Universal; needs provisional-status honesty when governance lands |

## 4. Scopes: where information lives (hypothesis)

Four kinds of belonging, three mechanisms, no new container types:

| Belonging | Mechanism |
| --- | --- |
| Session-bound (agent work) | Session inside a project (today's model, unchanged) |
| Project-bound (docs, decisions for a context) | Project. A user-named research topic is just a project the user creates deliberately; nothing forces it |
| Personal (expressions, general facts, cross-context knowledge) | A reserved **personal scope**. Internally it can ride the existing `projectId` keying as a well-known id; user-facing it is 개인 메모리, never "a project named personal" |
| Topic-bound across projects | Not a container now. Revisit trigger: real demand for one memory to live in several contexts at once (then consider links/tags, not new containers) |

This resolves "cross-project knowledge must not be forced into an arbitrary
project" without a schema migration, and cross-scope recall already works
(`listAllAcceptedProjectMemories`, shipped).

## 5. Jobs and information architecture (hypothesis)

The concrete shell plan (diagnosis, navigation, screens, flows, migration
stages) lives in [`mori-product-shell-ia.md`](mori-product-shell-ia.md);
this section keeps only the job model.

Users think in jobs, not source families. The shell should map to jobs; the
current shell already mostly does:

| Job | Surface |
| --- | --- |
| 이어가기 · continue what I was doing | 홈 (command field, resume), project overview |
| 지금 무슨 일이 일어나나 | 라이브 |
| 가져오기 · save something useful | 연동 (agents, paste; document import lands here later) |
| 맥락에서 일하기 | 프로젝트 (sessions for code; sources/memory for everything) |
| 찾기 · ask across my material · 신뢰 관리 | **메모리** (new primary: 전체 검색 · 최근 · 확인 대기 · 잠정 · scope filter) |
| 이해하기 · express | Contextual actions wherever text is, results in the Context Inspector |

Consequences:

- **No global `Code | Knowledge` navigation.** That is navigation by source
  type; it reintroduces silos at the shell level and designs a workspace for
  content that has never entered the product. Rejected for now with an
  explicit revisit trigger (§10).
- The Code experience is untouched; it is the project/session experience.
- Progressive disclosure: a new user sees 홈, 연동, 프로젝트; 메모리 gains
  meaning as memory accumulates; governance controls live in settings, not in
  the shell.
- Advanced internals (kinds, states, policies) never become navigation.

## 6. Language: role and boundaries (hypothesis)

Language is the same extensibility problem in miniature, and its first proof.
Role: a **contextual capability, not a workspace**.

- 이해하기 acts on any selected text (session transcript, evidence, later
  documents): natural translation, what it actually means in this context,
  useful expressions, grammar/nuance only when it adds value, link back to
  the source.
- Saved results become ordinary memory (kind `expression`/`correction`) in
  the personal scope or the source's project, with provenance to the exact
  event. They surface through recall and a 메모리 collection filter.
- A dedicated Learn/review surface is justified only by usage (trigger:
  saved expressions accumulate and repeat-lookup behavior appears). Until
  then it is a filter, not a screen.
- The result model carries detected `sourceLang`/`targetLang`; the polished
  first path is EN↔KO but nothing hard-codes the pair.

## 7. Validation sequence (accepted shape, hypothesis details)

Each experiment: hypothesis · flow · reuses · introduces · success ·
decision informed · not built.

**L1 · selection → 이해** (first; smallest, zero capture change)
- Hypothesis: contextual capabilities can feel native inside existing
  surfaces and deliver daily value before any new memory type exists.
- Flow: select text in a session reading surface → 이해하기 → Context
  Inspector shows translation + contextual meaning + expressions, honest
  "엔진 없음" state without an LLM.
- Reuses: Context Inspector, engine seam (`askMoriLlm` adapter pattern),
  existing settings. Introduces: one selection affordance + one panel + a
  pure understand lib. Not built: saving, OS capture, new nav.
- Success: the user reaches for it during real work; explanation quality is
  worth keeping. Informs: capability interaction pattern for everything
  later.

**L2 · save expression** (after L1 proves quality)
- Hypothesis: a non-session-derived memory can ride the existing lifecycle
  unchanged.
- Introduces: `expression` kind (deliberate union bump) + personal scope use.
  Informs: governance surface for user-initiated memory (explicit selection
  is a strong trust signal; likely auto-accept as confirmed, since the user
  literally chose it).

**K · small text/Markdown source** (after L2; the architectural one)
- Hypothesis: a non-session source can enter honestly, share the lifecycle,
  and be recalled with citations alongside coding memory.
- Flow: paste/import small text → evidence with provenance in a chosen
  project → sparse derivation under policy → Ask Mori answers from it with a
  citation.
- Decision checkpoint (the `SourceRef.sessionId` seam): implement a hidden
  generic capture record ONLY if it does not masquerade as a session
  anywhere user-visible; if honesty requires it, make the minimal
  sessionless-evidence change instead. This decision is deliberately made
  here, against implementation reality, not in advance.
- Not built: PDF, collections, topic views, any Knowledge workspace.

**IA checkpoint (after K)**: only now decide whether document reading needs a
source-appropriate surface beyond the evidence tab, and what it looks like,
from observed friction.

## 8. Memory governance (partially shipped 2026-07-13)

Three-mode model (자동 저장 · 항상 확인 · 수집만) with fixed always-ask
exceptions (mutations of existing memory, sensitive items, contradictions)
and a `provisional` status.

**Shipped (commit bf0b24d):** the default flipped from review-first to
**auto**. A pure policy (`memoryGovernance.ts`) separates durable memory from
activity (a next-session recommendation is no longer a memory proposal) and
lifecycle mutations, then routes safe · additive · high-confidence · durable
proposals to `auto` and everything else to review. The `auto` bucket is
written as `provisional` memory (`provisionalMemory.ts`) when a project's
memory is viewed (`useAutoOrganizeMemory`, idempotent), so memory accumulates
without clearing a queue. Provisional is recallable + marked, never resume/
report eligible, reversible, audited (`autoOrganize` / `auto-policy`). The
global hub shows a distinct 잠정 segment. **Deferred:** a governance-mode
setting (the mode is default-auto in code, not yet user-settable); reframing
the consolidation screen as the exception queue; the session-end "Mori가
정리한 내용" summary; Ask Mori disclosing provisional reliance; verifying the
auto-trigger against real desktop proposals (demo mode disables consolidation).

The rest of this section records the still-relevant visibility rules. Added visibility requirements:

- provisional items are visibly marked wherever they appear
- Ask Mori and search disclose when an answer depends on provisional memory
- provisional ranks below confirmed and is filterable/excludable in recall
- external outputs (reports, `.mori`, clientSafe) remain confirmed-only
- auto-save must be easy to choose at setup even though 항상 확인 is default
- explicit user selection (e.g. saving an expression) is itself a strong
  trust signal and may confirm directly

Still deliberately not built: policy matrices per source/kind/integration,
decay timers, recall-time revalidation. Extend only on evidence.

## 9. Boundaries (accepted)

What would make Mori too broad: authoring surfaces (editing documents,
writing wiki pages), organizing surfaces that demand manual curation,
becoming the system of record for files, source types without a recall
story. Out of scope stays: image OCR / audio / video ingestion, cloud sync
by default, autonomous daemons, embeddings as source of truth, multi-user
(`.mori` export remains the sharing boundary).

## 10. Ledger

- **Facts**: neutral memory spine; capture edge is code-only; evidence
  requires a session today; cross-scope enumeration shipped (0618258).
- **Accepted**: broad direction (row 26); identity sentence (§2); one
  product, one core; experiments L before K; document-text ingestion will
  enter scope via doctrine edit.
- **Working hypotheses**: jobs-based IA with 메모리 primary (§5); scopes
  model (§4); governance modes + provisional (§8); Language as capability
  (§6).
- **Deferred with triggers**: dedicated document/source reading surface
  (trigger: K shows evidence-tab friction); Learn surface (trigger: saved
  expressions + repeat lookups); topic linking (trigger: one memory needed
  in several contexts); global source-type navigation (trigger: a second
  mature source experience actually exists and job-based nav measurably
  fails); per-project policy overrides.
- **Rejected**: Code/Knowledge/Language as products, tabs, or databases;
  fake sessions for documents; "Wiki" as a commitment (generated topic
  summaries over memory remain a possible later output); preemptive memory
  kind taxonomy; policy engine; time-based auto-confirmation.

## 11. Decisions needed (user)

1. Governance model incl. the §8 visibility additions: approve to build
   (provisional status + modes) after L1?
2. 메모리 primary navigation with 확인 대기 inside: approve?
3. Personal scope as a reserved internal id (§4): approve the approach?
4. Doctrine edits to `mori-project-goal.md` (§1 identity, §2 session
   doctrine wording "sessions are for agent work; other evidence enters
   without one", §14 non-goal narrowed to image/audio/video): approve?
5. L2's trust rule (user-saved expressions confirm directly, skipping
   provisional): approve?
