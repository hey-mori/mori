# Workflow-first assessment · external design conversation vs Mori

Status: **proposal, 2026-07-15.** Decision document reconciling a long
external design conversation (Personal MCP → family knowledge service →
personal context platform → workflow-first product) against Mori's actual
code and doctrine. No product code was written for this document.

Companion docs: [`../mori-project-goal.md`](../mori-project-goal.md)
(identity + invariants),
[`mori-context-workspace-architecture.md`](mori-context-workspace-architecture.md)
(governing architecture, §16 decision authority),
[`record-workspace/README.md`](record-workspace/README.md) (기록 canon,
R1-R8 shipped),
[`memory-as-a-service.md`](memory-as-a-service.md) (capability layer, the
predicted MCP read surface),
[`../references/personal-context-platform-references.md`](../references/personal-context-platform-references.md)
(the code-verified open-source review this document consumes).

## 1. The single most important conclusion

The external conversation, after months of iteration (build a personal
MCP → give it to family → survey the market → survey open source → strip
everything back), converged on almost exactly the doctrine Mori adopted in
the 2026-07-14 identity rewrite:

| Conversation's final principle | Mori today |
| --- | --- |
| The product's center is the workflow, not the harness | §16.1 product-vs-safeguard; 기록 R1-R8 is one end-to-end flow |
| Users want outcomes, not tools | Low-ceremony rule (§16.3): capture → Mori organizes → user glances |
| AI judges meaning; the system guarantees execution | The six-factor apply matrix (`applyPolicy.ts`) is exactly this split |
| Separate capture from canonical knowledge | Ledger layer vs distilled layer; promotion is gated |
| Documents are truth; memory is derived context | Records + raw `Source` are canonical; aggregates/distillates derive |
| Every AI write carries revision, audit, undo | Invariant since before the rewrite; `kernel_revisions` is append-only |
| Storage and engines are replaceable adapters | Runtime-aware repositories; engine seam (rule / Ollama / OpenAI-compat) |
| Open source is parts and evidence, not the answer | Existing `docs/references/` practice |

**Verdict: this is validation, not a pivot.** The conversation does not
reveal a flaw in Mori's direction; it independently re-derives it from a
different starting point (Obsidian + ChatGPT + MCP) and arrives at the
same invariants. The correct response is to absorb the few genuine deltas
(§5), explicitly reject the branches that belong to a different product
(§6), and otherwise keep executing the existing K-sequence and 기록 R9.

The conversation's *product* (a multi-user, cloud-connected, family
knowledge service reachable from ChatGPT) is **not Mori and must not
become Mori**. It violates three identity invariants at once (local-first,
no external account reading, no cloud sync) and its target user (a
non-technical family member on a phone) is not Mori's user (a person whose
work already produces local traces). If pursued, it is a separate project
that may one day *consume* Mori exports; it never reshapes Mori's kernel.

## 2. How to read the conversation (thought stages, not a spec)

The conversation is a log of a thought process, and its stages disagree
with each other. Later stages supersede earlier ones:

- **A. Initial itch.** Record ChatGPT conversations; keep a light capture
  space apart from a heavy canonical wiki; use MCP personally.
- **B. Expansion.** Non-technical family should benefit; files thrown at
  the system should organize themselves; past context and decision
  rationale must be findable; private vs shared spaces; history, restore,
  permissions, provenance.
- **C. Corrections under research.** Plain MCP connectivity is not
  differentiation; Mem / Notion / NotebookLM cover much of it; do not
  build another store or note app; ChatGPT as the only UI is a platform
  risk; never expose GitHub or Obsidian to non-technical users.
- **D. Final convergence.** Workflow-first; high-level intent tools over
  low-level file tools; capture vs canonical; document / memory / current
  context / agent state as distinct layers; revision-audit-undo on every
  AI write; storage and memory engines as adapters; open source as parts.

Internal contradictions to be aware of (do not cherry-pick a superseded
stage): the mid-conversation "fork Kryton + Supermemory" proposal is
retracted by the later "never build a mixed product from parts" stance;
the elaborate family-SaaS phase plans sit on the stage-B frame that stage
D demotes; the code review in the companion reference doc shows several
of the conversation's factual claims about these repos were optimistic
(Kryton's Cedar unenforced, Supermemory's engine closed, mem0's
reconciliation dead code, Loopat's sandbox drifted).

## 3. Fit assessment

Classification of every substantive idea the conversation raised.
CORE = belongs at the center of Mori; FOUNDATION = internal layer Mori
needs; OPTIONAL = staged extension for a real, demonstrated need;
SEPARATE = a different product/project, not Mori; REJECT = should not be
built at all in Mori.

| Idea | Class | Ground |
| --- | --- | --- |
| Quick capture, zero-ceremony | CORE | Shipped (composer, R1). Memos confirms the ceiling: keep one field + one keystroke |
| ChatGPT/AI conversation save | CORE | Shipped (transcript import; agent-session records). No new work |
| Daily log / day summaries | CORE | Shipped (daily-entry, 오늘 lens, aggregates) |
| Weekly review | CORE | Shipped (R6: weekly review + routine suggestions) |
| Decision journal (incl. investment records) | CORE | Shipped as schemas (`decision`, `investment-entry`); advice stays a non-goal |
| Capture → canonical promotion | CORE | Shipped as ledger → distill with lifecycle; Loopat's ladder validates the friction grading |
| Document revision / undo | CORE | Shipped (`kernel_revisions`, 되돌리기) |
| Source provenance | CORE | Shipped (`Source` + `SourceLink` + `Derivation`) |
| AI operation log ("what did AI do, from what, why") | FOUNDATION | Largely covered by Derivation + Revision; the gap is a user-facing "Mori가 정리함" day disclosure roll-up, already doctrine (§5.2) |
| User memory / preferences | FOUNDATION | Shipped as `Rule` rows + distilled records; mem0's ADD/UPDATE/DELETE taxonomy is the reference for the LLM-assisted reconciliation slice |
| Current context (open work, recent decisions) | FOUNDATION | Aggregate layer + resume prompt; keep improving as Reuse work |
| Temporal knowledge (facts that change over time) | FOUNDATION | Partially shipped (stale/contradiction lifecycle). Graphiti's four-timestamp closure is the upgrade path, as plain SQLite columns |
| High-level workflow tools for external AI | OPTIONAL | The strongest genuine delta. See §5.2: a local, read-first MCP surface over the memory/record capability layer, intent-level tools only |
| Workflow run / step / approval model | OPTIONAL | See §5.3: adopt only when multi-step background work grows; the four-table minimal model is specified and ready |
| Obsidian export / Markdown workspace | OPTIONAL (already planned) | K4 storage stage 2 is exactly this; the conversation adds urgency, not design |
| GitHub backup of the workspace folder | OPTIONAL | Cheap once K4's deterministic export exists; user-driven, never a sync daemon |
| Background workflow (watch + headless analysis) | OPTIONAL (already shipped) | The opt-in watcher; B-surface rails apply |
| Approval / confirm gates | CORE | Shipped (confirm cards; provisional semantics) |
| Local LLM memory engine assist in Distill | OPTIONAL | Deterministic-first stays the rule; LLM proposes, policy applies |
| Vector recall layer | OPTIONAL | Doctrine unchanged: optional recall only, never canonical. Kryton's RRF file is the reference when it comes |
| MCP capture input (agents emit into Mori) | OPTIONAL (already planned) | Connector long-term plan already lists an MCP emitter |
| Multi-user accounts / auth / RLS | SEPARATE | Different product. Violates local-first identity |
| Family shared workspace / managed accounts | SEPARATE | Same. Kinhold's server-side-policy pattern is noted for any future agent surface, nothing else |
| Cloud connectors (Gmail / Drive / Calendar OAuth) | REJECT (for Mori) | Explicit non-goal: no account scraping, no OAuth reading |
| ChatGPT as the (or a primary) product UI | REJECT | Mori's UI is the product; external AI may become a *client* of the read surface, never the interface |
| Managed storage / SaaS / billing | SEPARATE | Different product entirely |
| Adopting Supermemory / Mem0 as the memory engine | REJECT | Cloud-coupled or embeddings-canonical; both violate invariants; Mori's distill engine is already further along for its purpose |
| Fork Kryton (or any repo) as the base | REJECT | Mori's kernel is stronger where it matters; forks import someone else's product decisions |
| Workspace profiles / template packs | REJECT (as product packs) | Mori's answer is schemas-as-data + contexts; a "직장인 팩" is a preset of schemas at most, not a product concept |
| Knowledge graph database | REJECT | Relations + FTS suffice; Graphiti itself proves the temporal pattern needs no graph DB |

## 4. Workflow-first, applied honestly to Mori

The conversation's sharpest lens: *judge a product by whether it finishes
a user's job end-to-end, not by which screens exist.* Applying it to
Mori's shipped surface:

| User job | End-to-end today? |
| --- | --- |
| 흘려보내듯 기록하면 정리되어 쌓인다 | **Yes** (composer → propose → apply → ledger, R1-R8) |
| 그날/그주에 뭘 했는지 돌아본다 | **Yes** (오늘 lens, 캘린더, weekly review) |
| 에이전트 작업이 기록으로 남는다 | **Partial**: adapter ships, but kernel records and legacy sessions are two parallel systems until R9 |
| 과거 기록을 다시 찾아 쓴다 | **Partial**: FTS is desktop-only, search UX is young, 검색 as a job-complete surface is the thinnest Reuse pillar |
| 과거 작업이 다음 AI 세션의 컨텍스트가 된다 | **Partial**: resume prompt is manual copy-paste; no programmatic surface |
| 축적이 지식/포트폴리오가 된다 | **Not yet** (K4 territory) |

Conclusion: Mori's capture side is job-complete; its **Reuse side is
where workflow-first has teeth**. The priority order this document
recommends is therefore unchanged R9 first (one explorer over records and
sessions, the precondition for honest reuse), then Reuse-completion work
(search as a job, then the agent-context surface), then K4.

## 5. The genuine deltas to absorb

### 5.1 Workflow-first as a standing evaluation lens

Adopt the sentence "a surface ships when it finishes a job, not when it
renders data" as review vocabulary alongside §16.2. No code implication
by itself; it sharpens milestone selection (it is why §4 ranks Reuse
completion above new capture channels).

### 5.2 Agent-context read surface (local MCP, intent-level, read-first)

The conversation's most transferable product insight: the user's daily AI
tools should be able to *ask Mori for context* instead of the user
pasting resume prompts. [`memory-as-a-service.md`](memory-as-a-service.md)
§2 already predicted this ("a read-only MCP server as a thin adapter over
the capability layer"); the reference review adds the concrete shape:

- **Same service layer, second front-end** (Kryton): the MCP adapter
  calls the same pure capability functions the UI uses; zero duplicated
  logic. Mori's `buildXyz` discipline makes this nearly free.
- **Intent-level tools only** (Kryton, Kinhold, and the conversation's
  own low-level-tool failure story): `search_records`,
  `get_project_context`, `get_recent_activity`, `prepare_resume_context`,
  never `read_file` / `write_record`. Few tools, one optional `action`
  discriminator where a domain needs variants.
- **The model is an untrusted client** (Kinhold): scope tags per tool,
  enforced at dispatch; read-only in v1. Any future write tool (a
  `capture` intent) enters the normal pipeline as origin `agent` and
  faces the same apply matrix; it never writes durable records directly.
- **Local only**: stdio transport for local agents (Claude Code first).
  No tunnel, no OAuth, no network listener beyond localhost. This stays
  inside the local-first invariant; it is a Reuse output, exactly like
  resume prompts and reports.

Staging: after R9, as a Reuse milestone, starting read-only with 3-5
tools. Not before, because until R9 the ledger cannot answer for agent
sessions honestly.

### 5.3 Minimal run ledger, held until needed

The four-table model (run / step / snapshot chain / approval waitpoint,
checkpoint-and-skip resume, allowed-transition guard) is specified in the
reference review §7. Adopt it **when**, not now: the trigger is real
multi-step background work with failure/resume needs (today only the
opt-in watcher + headless Quick Pass qualifies, and it is small). Until
then, the composer state machine + revisions + candidate status already
give every foreground flow its states and its undo. Building the run
ledger early would be machinery without a customer, the exact failure the
conversation warns against.

Two cheap pieces may land earlier because they cost one column each:
paperless-style `trigger_source` on background analysis results, and
Graphiti-style `valid_at / invalid_at / expired_at` columns when the
distill lifecycle next gets schema attention (they subsume the current
stale/contradicted statuses with honest time semantics).

### 5.4 Distill reconciliation, deterministic-first with an LLM seam

mem0's ADD / UPDATE / DELETE / NONE taxonomy (as a spec; its own live
code is additive-only) plus Graphiti's "LLM flags the contradiction,
pure code closes the fact with timestamps" split is the design for the
next quality step of stale/contradiction review: keep today's
deterministic proposers as the floor, add an optional local-LLM proposer
behind the existing engine seam, and remap record ids to small integers
in any prompt (mem0's anti-hallucination trick). Proposals only; the
lifecycle gate is untouched.

## 6. What must not be absorbed, and where it lives instead

- **Multi-user, family sharing, managed accounts, auth, RLS, billing,
  managed storage, cloud connectors, ChatGPT-as-UI.** These form a
  coherent *other* product (the conversation's "personal/family context
  service"). If the user pursues it, it should be a separate repository
  and product that can consume `.mori` exports or the future Markdown
  workspace; Mori contributes format and doctrine, not code paths. Mori
  gains nothing and loses identity by hosting any of it.
- **External memory engines and vector-canonical retrieval.** Both
  candidate engines fail the invariants (closed cloud; embeddings as
  truth; mandatory models for capture). Mori's rule stands: capture and
  deterministic analysis must work with no model present.
- **Forking any reference repo.** Every load-bearing thing the repos do,
  Mori's kernel already does with stronger guarantees (append-only
  revisions vs disk snapshots; typed provenance vs event origins;
  enforced apply policy vs unenforced Cedar).

## 7. Decisions requested (open questions, prioritized)

1. **Confirm the classification and priority order** in §3-§4:
   R9 → Reuse completion (search-as-a-job, then the MCP read surface) →
   K4, with the run ledger deferred behind a real trigger.
2. **Name the separate project boundary.** If the family/service idea
   stays alive, give it its own working title and repo so its gravity
   stops pulling on Mori planning documents.
3. **MCP read surface scope for v1** when its milestone arrives. A
   concrete proposal now exists:
   [`agent-context-read-surface.md`](agent-context-read-surface.md)
   (five read-only intent tools; the `capture` write intent deferred to
   v2 with an explicit route decision against the connector MCP
   emitter).
4. **Bi-temporal columns timing**: fold `valid_at / invalid_at /
   expired_at` into the next distill-schema migration, or defer until
   LLM-assisted reconciliation lands.

## 8. Drift register (found during verification, 2026-07-15)

Documentation/code mismatches noticed while verifying current truth; none
block this document, all worth small follow-ups:

- `src/lib/navigation/navGroups.ts` encoded the retired 4-axis nav
  (홈/연동/프로젝트/대시보드/워크벤치) while the real nav is
  `Sidebar.tsx` `PRIMARY_NAV` (홈/기록/라이브/프로젝트/대시보드/워크벤치).
  **Resolved 2026-07-15:** the module was provably dead (imported only
  by its own test; `Sidebar.tsx` never consumed it) and was removed
  with its test per the §21 removal criteria.
- `mori-project-goal.md` §4 lists the pre-기록 nav and §9 says migrations
  are "currently V001 and V002"; reality is V001-V008 with the kernel in
  V008. Doc bug per that file's own update rule.
- The apply matrix's `mutatesExisting` factor is pinned `false` in
  `runCapturePipeline` (mutation slice deferred), so the
  irreversible-mutation confirm gate is not yet exercised by real
  captures. Honest per the roadmap; worth stating wherever the matrix is
  described as fully live.
- Browser mode has no FTS (plain substring filter); docs describing FTS
  should scope the claim to desktop.
- Retired views (memory, memoryHub, consolidation, timeline-lab) remain
  routed in `App.tsx` per retire-don't-delete; fine, but §21 removal
  criteria should eventually be run against them.

## 9. Expansion candidates from the reference pass

Concrete improvement opportunities the code-verified reference review
surfaced, each with its entry condition. None is scheduled by this
document; they are a shelf to pull from when their trigger arrives.
Ordered by likely order of relevance.

1. **Agent-context read surface v1.** The flagship candidate, specified
   in [`agent-context-read-surface.md`](agent-context-read-surface.md).
   Entry: R9 shipped + capability facade extracted.
2. **검색 as a job (Reuse audit).** §4 marks "과거 기록을 다시 찾아
   쓴다" as the thinnest complete-job pillar: FTS is desktop-only, the
   explorer search is per-surface, and no global 검색 surface exists
   over the ledger (the target IA lists one). Entry: after R9, run a
   current-state audit in the record-workspace style before designing.
3. **Derivation rebuild (재분석) as a batch.** Memos'
   `RebuildMemoPayload` is the hygiene model: re-derive proposals from
   retained raw sources after parser/rule changes. Mori's raw-retention
   invariant (§16.4) exists precisely to enable this, and the
   record-workspace worklog already lists the 재분석 header action as
   unwired. Entry: R9+; ship as proposals through the normal apply
   matrix, never in-place rewrites.
4. **Bi-temporal distill columns.** `valid_at / invalid_at /
   expired_at` (+ system `created_at`) on distilled records, replacing
   status-only stale/contradicted semantics with honest time semantics
   (Graphiti's four-timestamp closure; nothing deleted, facts closed).
   Entry: the next distill-schema migration.
5. **LLM-assisted distill reconciliation.** mem0's ADD / UPDATE /
   DELETE / NONE taxonomy as the spec for an optional local-LLM
   proposer behind the existing engine seam, with two pre-passes that
   cost nothing: deterministic hash dedup before any model call, and
   record-id → small-integer remapping inside prompts (small-model
   reliability). Proposals only; lifecycle gate untouched. Entry: after
   candidate 4.
6. **Typed trigger source + terminal status on background analysis.**
   Paperless' `TriggerSource` and n8n/Windmill's small terminal-status
   unions: one column each on background-watch results, paying off when
   the watcher gains retry/reprocess. Entry: first watcher-reliability
   complaint or feature.
7. **"Mori가 정리함 N건" day disclosure rollup.** Already doctrine
   (§5.2 auto-apply disclosure); a small UI slice on 오늘/기록 once
   auto-apply volume is real. Entry: auto outcomes appearing in daily
   use.
8. **Optional recall layer, single-query fusion.** If real-data FTS
   recall proves insufficient, Kryton's `fused-search.service.ts` is
   the reference: one query fusing FTS rank + optional local-embedding
   similarity + relation-neighbor boost, with graceful lexical-only
   fallback. Embeddings stay an optional recall layer, never canonical
   (existing non-goal). Entry: demonstrated FTS recall failure on the
   user's real ledger, not before.
9. **Minimal run ledger.** Already specified (§5.3 and the reference
   review §7). Entry: real multi-step background work with
   failure/resume needs.
