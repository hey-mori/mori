# Mori · strategic synthesis, 2026-08-31

Status: **analysis + recommendation.** Commissioned to re-examine Mori's
product identity and long-horizon architecture against a broader "capture my
life" direction. Every claim below is verified against the repository, the
git history, or a local development database snapshot. No code was changed.

Companion authority: this document does **not** replace
[`mori-context-workspace-architecture.md`](mori-context-workspace-architecture.md)
(the governing kernel design) or [`../mori-project-goal.md`](../mori-project-goal.md)
(canonical identity). It is the evidence layer under both, and it recommends
edits to each in §12.

---

## 1. Executive thesis

**Mori's kernel is right, its capture story is already automatic, and its
bottleneck is not breadth. It is that nothing comes back out.**

The single most important fact in this repository is not in any document. It
is in a local development database snapshot:

| Measure | Value |
| --- | --- |
| Kernel records | **414** |
| ...that are `agent-session` | **408 (98.6%)** |
| ...that are anything else | **6** (3 note, 1 meeting, 1 study-session, 1 workout) |
| Records with status `provisional` | **409 (98.8%)** |
| Kernel contexts (projects) | **0** |
| Personalization rules learned | **0** |
| Legacy `sessions` / `events` / `sources` tables | **0 rows each** |
| Distinct project contexts observed | **14+** |

Two readings follow, and they point the same way.

**The automatic path works.** 408 records arrived with no ceremony, across
fourteen distinct project contexts, spanning 2026-07-20 to 2026-08-18. The
kernel is the live store; the legacy session schema in SQLite is empty. K1
through K3 are not aspirational, they are load-bearing.

**The manual path was abandoned by its own author.** All six non-agent
records were created on 2026-07-14 and 2026-07-15, the two days of the
pivot. One of them is `ㄴㅇㄴㅁㅇ`, a keyboard mash. Since 2026-07-15 the
composer has produced **zero** life-domain records in six and a half weeks
of daily use.

The user is now proposing to widen capture toward computer activity, phone,
location, purchases, exercise, and more. The evidence says the constraint is
elsewhere: **the one source Mori already captures automatically produces 408
records that answer no question today.** Zero contexts means none of them is
bound to a project. 409 provisional means almost none may cross into a
report or a `.mori` export. Zero aggregate records means no day, week, or
episode was ever built from them.

Adding sources multiplies inert records. Gordon Bell reached this conclusion
the expensive way with MyLifeBits: *"The problem isn't putting it all in.
The problem is getting it out."*

**Recommendation: keep the kernel life-wide, make the product work-deep.**
Breadth is already free because schemas are data; a `수면` schema costs one
literal. Depth is expensive and unbought. Buy depth first, against the 408
records that already exist.

---

## 2. Mori today, verified

Sixteen weeks old (first commit 2026-05-12), 1560 commits, 179k lines of
TypeScript across 1038 files, 17.9k lines of Rust, 348 test files, ten SQLite
migrations. The core is green: `record-kernel` + `capture` + `understanding`
run 200 tests across 21 files, all passing.

**What is genuinely built and working:**

- **The record kernel** (`src/lib/record-kernel/`). `MoriRecord` typed by
  `SchemaDefinition` as data, 17 system schemas including workout, study,
  investment, meeting, reflection. Contexts, entities, aliases, relations,
  sources, source links, derivations, append-only revisions, rules. FTS5 with
  sync triggers. This is a well-made kernel and it earns its place.
- **The capture pipeline** (`src/lib/capture/capturePipeline.ts`). Raw source
  preserved unconditionally, proposer behind a swappable seam, entity
  resolution, personalization applied, six-factor apply policy, revisions
  written. Pure and IO-free. Correct.
- **The apply policy** (`applyPolicy.ts`). The six-factor matrix is real, 40
  lines, readable, and honest in its Korean reasons.
- **Automatic agent capture.** `useAutoImportSessions` → `upsertAgentSessionRecords`,
  default on, desktop. This is what produced all 408 records.
- **Seven agent readers in Rust** (Claude Code, Codex, OpenCode, Antigravity,
  Continue, Cline, Cursor) plus live multi-session tailing.
- **Document understanding** (`src/lib/understanding/`). The v7 contract:
  summary, glossed terms, insights, log-only items, each carrying a
  `SourceSpan` into the note body. Provenance by construction.

**What is built but inert:**

- **Contexts.** `projectContextConverter` exists and is tested. Zero contexts
  in the real database. `agentSessionKernel` deliberately never auto-creates
  one, so 408 records are unbound to any project.
- **Personalization.** Seven `RuleKind`s declared; only two are ever written
  (`alias`, the late-night date rule). Zero rules in the real database. There
  is no "Mori가 배운 것" surface, so the user cannot see, edit, or disable
  what Mori learned. Correction-driven learning, which the user names as a
  moat, is roughly 15% built and 0% visible.
- **Schemas as data.** True in code, unreachable by a user: there is no
  schema-authoring surface, and `SETTINGS_TAB_DEFS` has no 스키마 or 규칙 tab.
  The extensibility promise is real for a developer and absent for a user.
- **Aggregate layer.** `daily-entry` is a declared system schema with the
  `aggregate` layer. Zero aggregate records exist. No day, episode, routine,
  or week is materialized.

**What is a defect, not a gap:**

- **`provisional` has collapsed into a quarantine.** `agentSessionKernel`
  writes every discovered session with status `provisional` by design, and
  nothing ever confirms them. Provisional records are excluded from external
  outputs by policy. Result: 98.8% of the ledger cannot reach a report, a
  resume prompt, or a `.mori` export. A trust mechanism intended to mark the
  uncertain minority now marks everything, which means it marks nothing and
  silently disables the Reuse layer. This is the highest-value correctness
  finding in the audit.

**Documentation state.** 134 markdown files. Eleven declare themselves
canonical, approved, or governing, and three of those (`record-workspace/v2`,
`v3`, `v4`) were superseded by v7 and v8 while keeping their approval banners.
The repository's own rule (architecture §20: "no doc may remain ambiguously
canonical") is currently violated by the repository. Three surfaces of drift
found in one hour: the README still calls Mori "a local-first AI work memory
app" and lists migrations V001–V007; the goal doc says V001–V008; the tree
has V001–V010. The navigation differs in all three of README, goal doc §4,
and `Sidebar.tsx`.

---

## 3. What Mori has been becoming

Reading the history rather than listing it.

**Act I, 2026-05-12 to 2026-05-21. A tool.** Import, timeline, Quick Pass,
SQLite, `.mori` v0. Mori was a viewer for AI work.

**Act II, 2026-05-22. The session spine.** `mori-redesign-session-centric.md`
made one AI conversation the unit of everything. This was productive and it
is the origin of most of today's 179k lines. It also created the constraint
that everything must hang off a session.

**Act III, 2026-07-13 to 2026-07-14. The pivot.** Three documents in two
days moved the center from the session to the record ledger. The architecture
doc is unusually good: decision authority order, legacy assumption audit,
target-versus-transition split, removal criteria. The kernel it specified was
built and works.

**Act IV, 2026-07-15 to 2026-07-17. Eight surfaces in three days.** R0
(timeline ledger), v2 (document workspace), v3 (daily ledger), v4 (note-first),
v5 (note tool bar), v6 (honest notes), v7 (document understanding), v8
(project and calendar). The kernel settled in one day; the screen did not
settle in eight attempts.

That churn is the most informative event in the history. The best of those
documents, v7, diagnoses it precisely: Mori kept asking every document *"what
did the writer do?"*, which is a meeting-transcript question, and it produced
four bogus 활동 records from a Kotlin article. v7's inversion, **"understanding
is the product; 'what you did' is one output of it"**, is the strongest single
idea in this repository and it was reached by competitive research across 13
tools plus one day of real use.

**Act V, 2026-07-18 to 2026-08-31. Back to work.** Six weeks: live project
intelligence, SQLite promotion and dual-write (V009, V010), performance, dark
mode, dead code. Not one new life-domain schema, not one new non-agent
source, no K4. The declared roadmap said knowledge, storage stage 2, and
`.mori` v1. What was actually built was more AI-session observation and more
plumbing.

**The pattern across all five acts.** Mori repeatedly builds both ends and
skips the middle. The repository names this itself in
`live-project-intelligence-execution-plan.md` §1: "Observation is strong ...
Delivery is strong ... What does not exist is everything between." That
finding is not specific to the live layer. It is the shape of the product:
capture is excellent, storage is excellent, and the layer that turns stored
traces into answers has never been built.

Behavior is a better guide than doctrine here. Doctrine said "personal
context workspace." Six weeks of commits said "AI work observation." The
commits were closer to the truth of what Mori is good at.

---

## 4. The user problem, restated

Underneath "AI session memory" the real problem is not storage and not
capture. It is this:

> A person doing knowledge work with AI agents generates an enormous amount
> of consequential context, and loses essentially all of it within days.
> Not the artifacts, the *reasoning*: what was tried, what was rejected and
> why, what broke, what was decided under which assumption, and what the
> assumption was.

That loss is asymmetric. Code survives in git. Decisions do not. The user's
own list of target questions is dominated by *why* and *when did this start*
questions, not *what did I own* questions. The purchase and possession
examples are real desires but they are a different, weaker problem: they are
lookup, and a receipt search already half-solves them.

The strongest version of the broader idea is therefore not "record my life."
It is: **make the past explainable.** That framing keeps the ambition, drops
the surveillance connotation, and has a testable success criterion.

---

## 5. Competing identities, judged

| # | Identity | Strength | Fatal weakness |
| --- | --- | --- | --- |
| A | AI coding session memory | Matches 98.6% of real data; clear buyer | Viewer-shaped; commoditized by claude-code-history-viewer and by the agents' own native history |
| B | AI work memory | True to the data and one step above the viewer | Still ends where the AI stops; misses the reasoning that happens outside a session |
| C | Personal context workspace | Current doctrine; kernel already matches it | Zero real records validate it; "workspace" implies a place the user works, and the user does not |
| D | Personal activity / event memory | Honest about the primitive | Sounds like a log; no promise of value |
| E | Personal life memory | Emotionally strongest | Unearned by six records; enters the graveyard in §9 |
| F | Personal data / context OS | Architecturally flattering | "OS" is a claim about other software depending on you; nothing does yet |
| G | Personal intelligence layer | Points at the real gap (the middle) | Vague; invites a chatbot |
| H | *Recommended below* | | |

**Recommendation: keep three names for three audiences, and stop trying to
make one word carry all of them.**

1. **Internal architecture identity: context ledger.** Unchanged. The kernel
   is correct and this name is already in the code. Do not rename anything.
2. **Product identity (now, 1 year): "Mori remembers how your work happened."**
   Not what you did, *how it happened*, which is exactly what the AI-session
   trace uniquely contains and a git log does not. This is B sharpened by v7's
   inversion: understanding, not enumeration. It is honest against the data,
   it is what the README already says in its first line, and it does not
   promise a life.
3. **Long-term vision identity (3 to 10 years): personal context substrate.**
   The thing that can explain any part of your past and hand that explanation
   to whatever agent asks. E and F are reachable *from* here; neither is
   reachable directly, because both require retrieval quality that does not
   exist yet.

The user's framing is not rejected. It is **resequenced**: the life-wide
model stays (it costs nothing and is already built), the life-wide *product*
waits until one domain is proven to yield answers.

---

## 6. The kernel: do not redesign it

The user asked whether the primitive should be Observation, Event, Record,
Memory, or something else, and offered five candidate models. Having read the
implementation: **the current kernel is the right answer and should not be
touched.** Specifically:

- `Source` → `Record` (+ `SourceLink`, `Derivation`) is Model C
  (Observation → Interpretation → Record) already, with the interpretation
  step made explicit as a separate object rather than a phase.
- A separate `Observation` entity is **not** warranted. It would sit between
  `Source` and `Record` carrying nothing that `SourceLink.locator` plus
  `Derivation` do not already carry, and every new kernel entity is a
  permanent tax on every consumer.
- `Memory` must **not** become a kernel entity. The architecture doc already
  decided this correctly (§2: "durable memory is not a separate store"), and
  the legacy `consolidated_memories` table, still holding 10 rows, is the
  cautionary example of what happens when it is.
- Episodes, routines, days, and weeks need **no new primitive**: they are
  records with `layer: container` or `aggregate` and an
  `occurredStart/occurredEnd` span. The kernel already expresses them. Nothing
  materializes them, which is a build gap, not a model gap.
- Graph: **relational, as built.** `KernelRelation` with typed edges over
  SQLite is sufficient for every relation the user listed. A graph database
  buys traversal performance at a scale (millions of edges) that is three
  orders of magnitude away, and costs local-first simplicity now. Revisit only
  if a real query is provably too slow.

**The one genuine model gap** is bi-temporality for distilled claims. When
Mori concludes "this project's storage is SQLite-canonical" and that later
stops being true, the current model has `status` transitions but no
`valid_at / invalid_at` interval, so the ledger cannot answer "what did I
believe in July?" The repository already found this pattern in Graphiti
(`references/personal-context-platform-references.md` §3) and correctly noted
it is four plain columns. Add them when distillation ships, not before.

---

## 7. Epistemic model: subtract, do not add

The user proposed thirteen states (observed, captured, parsed, inferred,
proposed, provisional, confirmed, user-authored, derived, distilled, stale,
superseded, contradicted). Mori already carries roughly that many across
`timeBasis` (6), `status` (5), `origin` (5), plus lifecycle states on accepted
memory (10). **The failure mode here is not too few distinctions. It is too
many, unloaded.**

The evidence: with 414 records, `status` takes exactly two values in
practice, and one of them covers 98.8%. `origin` takes three. The vocabulary
is far richer than the data.

**The minimum epistemic model is three orthogonal axes, and Mori has all
three already:**

1. **Where it came from.** `Source` + `SourceLink` + `Derivation`. Answers
   "how do we know this." Non-negotiable, already correct.
2. **How much Mori will assert it.** One axis with three values, which is
   what `status` was meant to be: Mori is confident / Mori is guessing / the
   user said so. Everything else the user listed is a *reason* for a value on
   this axis, and reasons belong in `Derivation`, not in the state enum.
3. **When it happened, and how sure of that.** `timeBasis` + `timeConfidence`.
   Deserves its own axis because time is uniquely and pervasively uncertain,
   and Mori is unusually good here already.

**Concrete recommendation, and it is a fix not a redesign:** stop writing
`provisional` unconditionally in `agentSessionKernel.ts`. A session Mori read
directly from Claude's own JSONL is not a guess; it is `source-exact`
observation, and it should be `active`. Reserve `provisional` for
interpretations that genuinely could be wrong. This single change moves ~408
records out of quarantine and makes the Reuse layer possible at all.

---

## 8. Automation, burden, and the principle that matters

The user asked for management burden to be treated as a first-class concern.
It should be, and the repository already has the data to define it sharply.

**Proposed principle, and it should go in the goal doc's invariants:**

> **A record that never comes back is a cost, not an asset.**
> Every capture path must ship with a demonstrated retrieval path. Mori does
> not add a source, a schema, or a proposer until an existing question gets
> a better answer because of it.

This is the anti-lifelogging rule. It is exactly what MyLifeBits lacked, what
"second brain fatigue" describes, and what the abandonment literature
measures. It is also directly testable against Mori today, where the honest
score is: 414 records, 0 answers.

**The companion metric**, replacing vanity counts:

> **Context yield** = records that appeared in an answer the user actually
> read ÷ user actions spent creating or curating records.

Today's baseline is 0/6 for manual and 0/408 for automatic. Any number above
zero is progress; the automatic path will win on the denominator forever,
which is itself the argument for automation.

**On ceremony.** The apply matrix is well designed and should not grow more
factors. The real ceremony problem is not the matrix, it is that
`daily-ergonomics-audit.md` found the most repeated action in the product,
새 기록, has **no keyboard path and no out-of-app path**, six weeks ago, and
still does. A global hotkey while the app runs is clean under current
doctrine (the audit says so explicitly) and is a far larger burden win than
any policy tuning.

---

## 9. Prior art, and the three lessons that bind

The repository's existing competitive research is strong on the AI and PKM
axis and has a blind spot exactly where the new direction points: the
lifelogging lineage. That lineage is a graveyard, and its causes of death are
specific.

**MyLifeBits (Microsoft Research, 1998 to ~2010).** Captured essentially
everything Gordon Bell produced. Bell's own verdict: *"The problem isn't
putting it all in. The problem is getting it out."* The archive became
"hellishly difficult to search," and Bell concluded the project "wasn't
something that was bringing a lot of value to my life." **Lesson: capture
completeness is not correlated with value. Retrieval quality is.**

**Rewind.ai → Limitless → Meta (2023 to 2025).** The best-funded modern
attempt at "record your computer." Pivoted to a $99 pendant in April 2024;
early users called it a bait-and-switch and the promised local and swappable
LLMs never shipped. Meta acquired it on 2025-12-05; the Mac app shut down and
screen and audio capture were disabled two weeks later. A product whose entire
pitch was "your data stays on your device" ended with that data inside an
advertising company. **Two lessons: broad ambient capture has not yet found a
business that survives on its own, and local-first is a promise only an
architecture can keep, never a policy.** Mori's local-first invariant is
vindicated, and its "no cloud by default" stance is a genuine differentiator
rather than a limitation.

**Quantified Self and personal informatics (2007 to present).** A large
research literature on abandonment. The dominant causes are perceived data
inaccuracy or uselessness and loss of tracking motivation, and abandonment
driven by *uselessness* correlates with lasting negative attitudes toward
self-quantification. **Lesson: wrong inferences do not merely annoy, they
poison the category for that user.** This is a strong argument for Mori's
provenance and reversibility rails, and an equally strong argument against
shipping an inference layer that guesses.

**PKM, 2026.** The failure now has a name, "second brain fatigue," the
exhaustion of maintaining a system that produces more filing than thinking.
The named research failure mode is **provenance drift**: tools capture
sources but cannot show the source behind a later claim. **Mori's span-anchored
understanding (v7) and `SourceLink` are precisely the fix for the one failure
the market has named and not solved.** That is a real, defensible position and
it is under-exploited.

**What Mori should avoid repeating:** capturing before it can retrieve
(MyLifeBits), promising local-first without an architecture that survives an
acquisition (Rewind), and shipping inference that is wrong often enough to
poison trust (QS).

**What is newly possible in 2026 that was not:** local LLMs good enough to
summarize and gloss in Korean on-device, embeddings cheap enough for local
semantic recall, and structured extraction reliable enough to be worth
reviewing. All three are exactly what the *middle* layer needs, and all three
are the reason the middle is now buildable when it was not in 2010.

---

## 10. The moat, honestly assessed

| Candidate | Real? | Why |
| --- | --- | --- |
| **Longitudinal personal dataset** | **Yes, strongest** | 408 sessions across 14 projects cannot be copied, bought, or backfilled. It compounds daily and it is already accruing. |
| **Provenance to the source span** | **Yes** | The one failure the PKM market has named and not fixed. v7 makes hallucination structurally impossible, not merely unlikely. |
| **Local-first that survives** | **Yes, and newly proven** | Rewind's users learned in December what an architectural guarantee is worth. |
| **Korean-first term glossing** | **Yes, narrow but unowned** | Only NotebookLM ships automatic glossing at all, and not Korean-first, not in-document-context. |
| **Correction-driven personalization** | **Not yet** | Zero rules learned. Real if built; today it is a claim. |
| **Cross-source reconstruction** | **Not yet** | Needs a second real source. |
| More integrations | **No** | claude-code-history-viewer supports 28 assistants. This race is lost and not worth entering. |
| The UI | **No** | Copyable in a quarter. |

The moat is the **dataset plus the provenance discipline**, and neither is
helped by adding sources. Both are helped by making the existing data
answerable, because a dataset nobody queries compounds nothing.

---

## 11. Current → target → transition

**Current (verified).** A very good kernel, an automatic agent-session
capture path that works, a strong understanding contract gated behind an
optional local LLM, and a Reuse layer that is effectively disabled by the
provisional default. Legacy session surfaces still exist in code but their
SQLite tables are empty.

**Target (3 to 5 years).** A context ledger over many sources where any claim
is explainable to its source span, days and episodes are materialized, the
user's corrections have become visible rules, and an external agent can ask
Mori for grounded context under an explicit permission scope. The kernel does
not change to get there. Sources, aggregates, and retrieval do.

**Transition, in the order value is unlocked.**

1. **Unblock what exists.** Fix the provisional default. Bind agent sessions
   to project contexts (a rule already exists to do it conservatively; it
   never fires because there are no contexts to match). Materialize the
   `daily-entry` aggregate.
2. **Make it answer.** One retrieval surface over kernel records with
   provenance, tested against the 408 real sessions.
3. **Make it learn.** Ship the 규칙 surface so the two rule kinds that exist
   become visible, then wire classification and context-binding.
4. **Then, and only then, widen.** The second source should be the cheapest
   one adjacent to work that the kernel already models: **git history**,
   which is local, high-signal, already parsed elsewhere in the codebase, and
   requires no new privacy posture. Computer activity, phone, location, and
   purchases stay behind the §13 gate.

---

## 12. Reuse / Adapt / Deprecate / Remove

The architecture doc §9 already did this well. Corrections from evidence:

| Element | Doc verdict | Evidence-based verdict |
| --- | --- | --- |
| Record kernel | (new) | **Reuse, freeze.** Proven in production data. Resist redesign. |
| Capture pipeline + apply policy | Reuse | **Reuse.** Correct. |
| Automatic agent import | (not classified) | **Promote to headline.** It is the only thing producing data. |
| v7 understanding contract | (post-dates doc) | **Reuse, and unblock.** Gated on Ollama; needs a floor. |
| Legacy session SQLite tables | Adapt | **Removable sooner than planned.** All zero rows; §21 criteria are closer than the doc assumes. |
| `consolidated_memories` (10 rows) | Reuse as Distill engine | **Deprecate harder.** It is the only surviving "memory as a place," and it competes with the ledger. |
| Memory Hub | Deprecate | **Deprecate.** Note: it was un-retired on 2026-08-25 ("make the retired memory hub reachable again"), which is drift back toward the old center. |
| `.mori` v0 | Deprecate | Unchanged. |
| Reconstruction Lab (5 lenses) | Keep | **Re-evaluate.** Substantial code serving a session-scoped reading need; the same lenses over *ledger* records would be far more valuable than over one session. |
| Workbench / 대시보드 / 작업 그래프 | Re-evaluate | **Still unevaluated, now in the nav.** Three of eight nav slots serve the old center. |

---

## 13. Non-goals, sharpened

Keep every existing non-goal. Add one, and make it the operative rule:

- **No new capture source until the current one yields answers.** Concretely:
  not until a question can be answered from the 408 records with provenance.
  This is the §8 principle in enforceable form.

Also explicitly not now, with reasons rather than fear:

- **Camera, always-on microphone, screen recording.** Already banned by the
  A-ban invariant. Rewind's ending is the empirical argument, not just the
  ethical one.
- **Phone, location, purchases, wearables, health.** Each needs a cloud
  account or a mobile runtime, both of which break local-first. Revisit only
  after a second *local* source has proven the multi-source model.
- **Graph database.** §6.
- **Cloud sync, team features, MCP read surface for external agents.** The
  agent-facing surface (`memory-api`) is designed and internal-only, and it
  currently reads the *legacy* memory store rather than the kernel. Exposing
  it now would export the wrong layer.
- **Automatic people recognition, financial aggregation, autonomous external
  actions.** Unchanged.

---

## 14. Experiments, ranked by what they would settle

1. **The retrieval experiment (do this one).** Write ten questions the user
   actually has ("이 프로젝트 언제 시작했지", "지난주 뭐 했지", "왜 SQLite로
   갔지"). Try to answer each from the 408 existing records. Score: answered
   with provenance / answered without / not answerable. **This settles
   whether the whole thesis holds, costs no new capture, and uses real data.**
   If the score is poor, no additional source would have helped.
2. **The provisional experiment.** Flip agent sessions to `active`, bind them
   to contexts, and see whether project pages and reports become useful.
   Cheap, reversible, and directly tests §7.
3. **The understanding floor experiment.** Understanding requires Ollama; with
   no model, every region is empty. Measure how much of v7's value survives
   with no local LLM. If the answer is "none," the flagship differentiator has
   an install-a-model prerequisite and that must be a stated product fact.
4. **The correction experiment.** Ship the 규칙 surface, then count rules
   learned per week. Tests the personalization moat before more is built on it.
5. **The second-source experiment (later).** Add git history and test whether
   a day reconstruction from two sources beats one. Only after 1 and 2.

---

## 15. Day reconstruction: yes, but scoped

It should be a primary experience, and it is nearly free: 408 records already
carry `occurredStart`, `occurredEnd`, and `source-observed` time basis across
14 projects. What is missing is the `daily-entry` aggregate that nothing
writes.

But it should be scoped to **work day reconstruction** first, not life. The
data supports work, the questions the user listed are dominated by work, and
a work day that reconstructs honestly is a far better proof than a life day
that interpolates. Gaps must render as gaps; the honest empty span is the
whole credibility of the surface.

---

## 16. Recommended next milestone

**"Answer from what you already have."** One vertical slice, no new capture,
no new source, no kernel change:

1. Stop writing `provisional` unconditionally for directly-read agent
   sessions (`agentSessionKernel.ts`). Observation is not a guess.
2. Create project contexts from the session project keys so the existing
   conservative binding rule can actually match, and bind the 408.
3. Materialize `daily-entry` aggregates over kernel records.
4. One retrieval surface that answers "what happened on this project" and
   "what did I do last week" from kernel records, every claim carrying its
   `SourceLink`.
5. Run experiment 1 against the result and write the score down.

This is small, uses only proven machinery, corrects a real defect, and
produces the first evidence in Mori's history that the ledger can pay a
question back. Everything in the broader vision depends on that evidence and
nothing else does.

---

## 17. Documentation recommendation

Do not add strategy documents. The repository has 134 docs, eleven claiming
canonical status, three of them superseded while still marked approved. Adding
a sixth strategy doc is the failure the user explicitly warned against, and
this document should be the last one added until consolidation happens.

**Proposed canonical hierarchy, four documents, everything else a reference:**

| Layer | Document | Action |
| --- | --- | --- |
| Why | `mori-project-goal.md` | Keep as canonical. Correct §4 drift (V008 → V010, nav list), add the §8 principle to the invariants. |
| What | `design/mori-context-workspace-architecture.md` | Keep as governing. Add the §7 assertion-axis correction and the bi-temporal note from §6. |
| How | `design/record-workspace/README.md` | Keep. Fold v2, v3, v4 into it as history and **remove their approval banners**; they are superseded and currently readable as canonical. |
| Where next | This document | Becomes the roadmap input; retire `production-program.md` sequencing as already flagged. |

Immediate corrections regardless of the above: the README's identity line and
migration range, the goal doc's V008, and the three-way navigation
disagreement.

---

## 18. Open questions, deliberately unresolved

1. **Does the user actually ask historical questions?** Experiment 1 answers
   it. Everything else is downstream.
2. **Is a local LLM an acceptable prerequisite?** If yes, understanding is the
   differentiator. If no, Mori needs a deterministic floor for summary and
   glossing, which the code says is impossible today.
3. **Does the user want to *write* in Mori at all?** Six weeks of zero manual
   records suggests no, but the composer was also never given a keyboard path.
   Fix the ergonomics before concluding.
4. **Is the second source git, or computer activity?** Git is cheaper and
   safer; computer activity is closer to the broader vision. Decide after
   experiment 1, not before.
5. **Should Mori serve other agents?** Strategically coherent and premature.
   The facade exists but reads the legacy layer; revisit after retrieval works.
