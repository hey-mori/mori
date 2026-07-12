# Mori as a personal memory system · direction proposal

Status: **proposal, awaiting user decision** (requested 2026-07-13). Nothing in
this document changes doctrine. `docs/mori-project-goal.md` remains the
canonical identity until the decisions in §9 are explicitly accepted, at which
point they should also be recorded in
[`key-decisions-register.md`](key-decisions-register.md).

Companion reading: [`mori-project-goal.md`](../mori-project-goal.md),
[`memory-architecture.md`](../memory-architecture.md),
[`memory-as-a-service.md`](memory-as-a-service.md),
[`../references/competitive-landscape-2026-07.md`](../references/competitive-landscape-2026-07.md).

## 1. The question

Should Mori evolve from "AI work memory for coding sessions" into a broader
personal memory system, with Code, Knowledge, and Language as possible product
areas? This document evaluates that direction against the actual repository and
records the recommended model. The proposal treats the three areas as
hypotheses, not a specification, and this evaluation does the same.

## 2. What the repository already is

The codebase splits cleanly into a **domain-neutral memory spine** and a
**coding-coupled capture edge**.

Already domain-neutral (verified in code, not aspiration):

| Layer | Evidence |
| --- | --- |
| Memory proposals | `MemoryProposal` kinds (promotedDecision · recurringIssue · keyEvidence · unresolvedRisk · contradiction · staleMemory · nextSessionRecommendation) contain zero coding concepts |
| Durable memory | `StoredAcceptedProjectMemory`: kind, status (10-state lifecycle), importance, confidence label, sensitivity, evidenceRefs, audit chain, supersededBy. No code fields |
| Review machinery | Consolidation review, append-only `StoredMemoryReviewAction`, revert, stale + contradiction proposals: all pure, tested, content-agnostic |
| Recall | `queryableMemory` (deterministic search), Ask Mori (grounded, citation-tagged, engine-optional), resume prompt, reports, `.mori` package |
| Engine seam | deterministic → Ollama → OpenAI 호환 provider config is decoupled from *what* is analyzed; `askMoriLlm.ts` shows how a new lens bolts on |
| Event model | `EventType` already includes `documentNote`, `webResearch`, `artifact` beside `fileCode`; `SourceKind` already reserves `docs`, `url`, `file`, `browser`, `notion`, `slack` |

Coding-coupled today:

| Layer | Coupling |
| --- | --- |
| Identity doctrine | "A Mori session is one AI-agent work session"; "agents anchor; everything else is evidence" (`mori-project-goal.md` §1, §2) |
| Capture | Only agent stores, connector JSONL, paste, git. No file ingestion of any kind (no Markdown, no PDF) |
| Anchor registry | All 7 anchors in `agentRegistry.ts` are coding agents |
| Event payload | `fileTouches`, `toolName`, `tokenUsage` on `TimelineEvent`; `FileTouch` entirely |
| Memory scope | Memory is siloed per `projectId`; `listAcceptedProjectMemories(projectId)` has no cross-project enumeration |
| Non-goals | §14 bans "multimodal ingestion (image / audio / video / PDF) as a core capability" |
| Copy | Resume-prompt audience presets (claude / codex), coding-flavored labels |

Conclusion: **the memory contract generalizes; the capture layer and the
doctrine do not, yet.** Generalizing Mori is mostly an ingestion and identity
question, not a memory-model rewrite. `memory-as-a-service.md` already argued
the enabling half of this ("memory is a capability layer, not a destination").

## 3. Recommended product definition

> Mori is a local-first personal memory system. It captures what you work on,
> read, and learn (starting with AI-assisted coding work), turns it into
> reviewed, provenance-linked memory, and recalls it when it becomes useful.

The invariant identity is the **memory contract** (§5), not the domain. Mori
Code stays the first and deepest domain: the competitive research
(`competitive-landscape-2026-07.md`) locates Mori's open lane precisely in
evidence-linked, review-gated coding-session memory, and the production
program is still hardening that loop. Broadening the *definition* does not
mean diluting that focus; it means new domains must ride the same spine
instead of becoming parallel products.

## 4. Reject tracks · adopt source families × lenses × memory kinds

Code / Knowledge / Language should **not** become three products, databases,
or navigation silos. The repository already contains a better model, and even
the right word: the Reconstruction Lab ships five timeline **lenses**
(서사 · 국면 · 인과 · 계보 · 맥동) over one event stream. Extend that pattern:

| Concept | Meaning | Exists today |
| --- | --- | --- |
| Source family | Where captures come from: agent stores, git, terminal · documents, web pages, pasted prose | Coding families only |
| Lens | An interpretation pass over captured material: issues/decisions (Quick Pass), causal chains, and later claims/concepts, 설명/번역 | 5 timeline lenses + Quick Pass |
| Memory kind | What a reviewed durable item is: decision, recurring issue, evidence, risk, and later claim, expression | 7 kinds, closed union |
| View | A surface over shared data: timeline, project memory, and later a topic space, an expression notebook | Session/project views |

Mapped onto the proposal's areas:

- **Code** = the existing source families + existing lenses. No change.
- **Knowledge** = new source families (document, web page, pasted prose) + a
  claim/concept lens + a topic aggregation view. The event lanes and source
  kinds for it already exist.
- **Language** = **not a domain at all**: a lens (explain/translate any
  captured text) plus a memory kind (expression / correction / pattern).
  It is cross-cutting by nature, which is exactly what the user asked for
  ("language activity should be connected to the same projects, sources,
  topics, and memories").

One capture can gain multiple interpretations without duplication: the same
`SourceRef` yields a decision proposal through the code lens and an expression
memory through the language lens, each carrying `evidenceRefs` back to the
same event. That is the proposal's "one memory system, not silos" requirement,
satisfied with machinery that already exists.

## 5. The shared memory contract (invariants any domain must honor)

1. Original sources preserved with `rawRetention` / `trustLevel` /
   `captureFidelity`; provenance via `evidenceRefs` on everything derived.
2. Deterministic normalization into `{ SourceRef, TimelineEvent[] }`; parsing
   is not AI.
3. AI output is a **proposal**, never memory. Connect = auto for events;
   durable memory always passes review (the shipped relaxation stands).
4. Ten-state lifecycle; retire, never delete; supersede, never overwrite;
   append-only audit.
5. Confidence is honest and qualitative; `dataBasis` says what an aggregate
   was computed from.
6. Local-first; engines classified by protocol (규칙 기반 · Ollama · OpenAI
   호환); no silent fallback between engines.
7. Recall is pull (search, Ask Mori, resume); notifications stay gated and
   low-noise.

## 6. Domain notes

### Knowledge: what it is and is not

Mori must not become a wiki, note app, or document manager (existing
non-goals, kept). Knowledge in Mori = **documents and pages as evidence,
plus sparsely extracted, reviewed claims tied to projects or topics**.

The unsolved problem is extraction economics: a 50-page PDF can yield dozens
of claims. Gating each one recreates review fatigue; auto-accepting violates
doctrine. Proposed rule, to validate before building big: **extract sparsely**.
Only propose claims that (a) connect to existing memories/projects, or (b) the
user explicitly highlighted. Everything else stays searchable evidence,
reviewable on recall rather than on import.

### Language: the wedge lens

Daily-value candidate (the user works across EN↔KO constantly), and the
codebase already contains its embryo: `semanticTerms.ts` is a deterministic
EN↔KO cluster bridge built so Korean questions reach English evidence, and
`askMoriLlm.ts` is the exact adapter pattern a new LLM lens needs.

First slice requires **no OS-level capture**: Mori's own surfaces are full of
English text (session transcripts, tool output, evidence). Select text inside
Mori → 설명/번역 action → optional save as an expression memory with
provenance to the event it came from. OS-wide selection capture is a later,
consent-gated step (explicit user invocation sits inside the established
capture rails: scope · review-gate · transparency); clipboard watching or
screen reading stays banned.

The failure mode to avoid is an isolated translation utility. The guard:
language output that the user does not save is ephemeral; what is saved
becomes ordinary memory, searchable and citable like everything else.

## 7. Foundational gaps (needed regardless of domain order)

1. **Cross-scope recall.** Memory is siloed per `projectId` with no
   cross-project enumeration. Add `listAllAcceptedMemories()` to
   `AcceptedMemoryRepository` (browser prefix scan; SQLite query + Tauri
   command). Unblocks global ⌘K memory search (already deferred once for this
   exact reason), cross-project Ask Mori, and any topic space.
2. **File ingestion.** None exists. Markdown/plain-text import is trivial and
   safe; PDF text extraction is a later Rust-side step and requires narrowing
   the §14 non-goal (keep image/audio/video banned; allow text extraction
   from documents).
3. **Memory kind extensibility.** The 7-kind union is closed. Adding kinds
   (claim, expression) is a deliberate schemaVersion bump plus a mapping
   audit, cheap but not free.
4. **Non-session capture identity.** Today every capture needs a session with
   an agent spine. A saved expression or an imported document has no natural
   home. Options: a lightweight capture-type session, or project-level
   evidence without a session. Decision needed (§9).
5. **Copy audit.** Event lanes are fine (`documentNote`, `webResearch`
   already exist); resume-prompt audiences and some labels assume coding.

## 8. Sequencing

| Stage | Content | Why |
| --- | --- | --- |
| Validate first | Language lens MVP inside existing surfaces: select → 설명/번역 → save as memory | Cheapest real test of the lens pattern, a new memory kind, and non-code memory value; zero new capture infrastructure |
| Next MVP | Knowledge ingestion slice: Markdown / text / URL-page import → documentNote events → existing review + consolidation; one topic view reusing the project-memory model | Proves the second source family end-to-end on existing machinery |
| Foundational (parallel, small) | Cross-project memory enumeration + global ⌘K memory search | Independently valuable today; prerequisite for everything cross-domain |
| Later possibility | PDF text extraction; OS-level selection capture (consent-gated); embeddings **over accepted memory only** (the boundary `semanticTerms.ts` already documents); MCP memory exposure (`memory-as-a-service.md`); cross-source contradiction/dedup for knowledge |
| Do not build | Three separate track products or databases; a document library manager; a standalone translation utility; a universal memory platform before both domain slices are validated; embeddings as source of truth (non-goal stands) |

## 9. Decisions acceptance would require (none made yet)

1. `mori-project-goal.md` §1: identity sentence broadens from "AI work memory
   app" to the §3 definition, with Mori Code named as the first domain.
2. §2 session doctrine: permit captures without an AI-agent spine (choose the
   §7.4 mechanism).
3. §14 non-goal: narrow "multimodal ingestion (image / audio / video / PDF)"
   so document **text** extraction is in scope; image/audio/video stay out.
4. Memory scope: confirm cross-project recall is wanted (it changes the
   privacy surface: one search now reaches everything).
5. Naming: whether "Mori Code" becomes user-facing vocabulary or the product
   stays one undivided "Mori" (recommended: one Mori; families and lenses are
   internal structure, not navigation).

## 10. Open questions

- Sparse-extraction rule for documents: is "connects to existing memory or
  user-highlighted" the right gate? Needs a real-document trial.
- Where language memory lives before cross-project scope exists (a global
  pseudo-project vs waiting for §7.1).
- Bidirectionality of the language lens at MVP (EN→KO comprehension only, or
  KO→EN expression from day one).
- Whether topic spaces are projects (reuse everything) or a new aggregate
  (only if projects demonstrably fail to fit reading/research work).
