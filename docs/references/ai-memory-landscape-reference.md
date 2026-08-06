# AI memory & capture landscape · reconciled against Mori

External tools in the "capture AI / developer work and make it useful later"
space, reconciled against Mori's principles. Purpose: stop the recurring
"isn't this already built?" question with an honest map, and harvest the few
concepts worth borrowing without drifting off-mission.

Companion references: [manus-research-synthesis.md](./manus-research-synthesis.md),
[memory-orchestrator-reference.md](./memory-orchestrator-reference.md). Mori's
non-negotiables live in [mori-project-goal.md](../mori-project-goal.md) §6.

## TL;DR

The space splits on two axes Mori cares about: **how capture happens**
(ambient/automatic vs explicit/reviewed) and **where memory lives**
(cloud/server vs local). Mori is the explicit + local + review-gated corner,
and almost nothing else sits there. The surface overlap (timelines, session
ingest, "memory") hides opposite stances on capture, review, and trust.

The single strongest validation from the landscape: **OpenTelemetry's GenAI
conventions default to metadata-only and make content capture opt-in for
privacy reasons** · the same posture as Mori's `summary_only` default. We are
aligned with where the standard is going, not fighting it.

## The landscape

| Tool | What it is | Capture stance | Memory home | Audience |
|---|---|---|---|---|
| **Langfuse** | LLM-app observability (traces/evals/metrics/prompt mgmt) | auto-ingest spans | cloud / self-host server | teams operating an LLM product |
| **Pieces** | Long-term dev memory | **OS-level ambient (OCR across all apps)** | local (PiecesOS) | individual developers |
| **mem0** | Agent memory layer | auto fact-extraction → vector store | vector DB (often cloud) | agent builders |
| **Letta (MemGPT)** | Agent runtime w/ tiered memory | agent self-manages memory | server/runtime | agent builders |
| **OTel GenAI** | Telemetry *standard* (not a product) | metadata default, content opt-in | wherever you export | instrumentation authors |
| **Mori** | Local work memory for session reconstruction/continuation | **explicit import + review-before-apply** | **local (SQLite / `.mori`)** | individual dev/knowledge worker |

## Where Mori is genuinely different

- **vs Langfuse** · observability for *an LLM app you operate* (cloud, team,
  cost/eval), not memory for *your own work*. See the screenshot pitch:
  "debug and improve your LLM application." Opposite architecture and audience.
- **vs Pieces** · same *demand* (developers want durable work memory) but the
  **opposite capture stance**: Pieces captures at the OS level via OCR across
  every app/website. That is precisely Mori's hard non-goal (no screen
  capture, no always-on watcher). Pieces also has no review-before-apply gate
  and no evidence/decision lifecycle · capture is ambient and trusted, not
  reviewed and evidence-linked.
- **vs mem0 / Letta** · these are memory for *the AI agent* (so a chatbot
  remembers across turns), not for *the human* reconstructing their work.
  mem0 is vector-store + auto fact-extraction; Mori explicitly rejects
  embeddings-as-source-of-truth and auto-extraction-without-review.

## What is worth borrowing (concepts, not code)

Ranked by value and fit. None of these are licensed-code imports · the stacks
are server/cloud or OS-level and conflict with local-first; these are ideas to
re-implement on Mori's terms.

1. **Align `ConnectorEvent` with OTel GenAI conventions (interop + framing).**
   Adopt the standard's vocabulary where it maps cleanly (`gen_ai.input.messages`
   / `gen_ai.output.messages`, tool calls, `finish_reasons`) so a future Mori
   could ingest OTel GenAI spans, and cite the standard's metadata-default
   posture as the basis for Mori's `summary_only`. Low risk, high
   interoperability payoff. Backlog candidate.
2. **Time-relative query UX (from Pieces).** "What was I working on 3 days
   ago / last Thursday" over the user's own reviewed memory. Mori already has
   Queryable Memory + timeline; adding time-relative phrasing is a natural,
   safe extension. Borrow the UX, not the OS-level capture behind it.
3. **MCP context endpoint (Pieces ships this; Mori has it Planned).** Expose
   accepted memory to a Claude Desktop / Codex host via MCP, explicitly and
   read-only. Already on Mori's roadmap as Planned; the landscape confirms it
   is the emerging integration surface.
4. **Memory-tier vocabulary (from Letta).** Letta's Core / Recall / Archival
   tiers map loosely onto Mori's active-session / accepted-memory / archived
   lifecycle. Useful framing for explaining Mori; not a new mechanism.

## What to explicitly reject (off-mission / non-goal)

- OS-level / OCR / screen capture (Pieces) · hard non-goal.
- Embeddings / vector store as the source of truth (mem0) · Mori uses
  structured evidence-linked memory; vector retrieval can only ever be an
  optional research layer over accepted memory.
- Auto-extraction without review (mem0, Pieces) · violates
  review-before-apply.
- Cloud / team server, cost/eval dashboards, prompt playground (Langfuse) ·
  off-mission and several are explicit non-goals.

## Net

Mori is not reinventing Langfuse/Pieces/mem0; it occupies the corner they all
avoid (explicit + local + reviewed). The actionable harvest is small and
concrete: align with OTel GenAI conventions, add time-relative queries, ship
the planned MCP endpoint. Everything else stays a deliberate non-goal.

Sources (captured 2026-05): Pieces long-term memory, mem0/Letta/MemGPT 2026
comparisons, OpenTelemetry GenAI semantic conventions, Langfuse repo.
