# Agent-context read surface · v1 specification proposal

Status: **proposal, 2026-07-15.** Screen-less Reuse surface: a local,
read-only MCP server that lets the user's own coding agents (Claude Code
first) ask Mori for context instead of the user pasting resume prompts.
Staged **after 기록 R9** (the unified explorer over kernel records and
legacy sessions); building it earlier would expose a ledger that cannot
answer for agent sessions honestly.

Companion docs:
[`memory-as-a-service.md`](memory-as-a-service.md) (the capability-layer
contract this surface consumes; it predicted this adapter),
[`workflow-first-direction.md`](workflow-first-direction.md) §5.2 (the
decision context),
[`../references/personal-context-platform-references.md`](../references/personal-context-platform-references.md)
(Kryton / Kinhold / Loopat patterns cited below),
[`../mori-project-goal.md`](../mori-project-goal.md) §6 (invariants this
surface must clear).

## 1. The job

The user works in Claude Code (or another local agent) and wants the
agent to know: what this project's recent history and open threads are,
what was decided and why, and what the user did recently, without the
user assembling that context by hand. Today this job is served by the
Resume Prompt (manual copy-paste). This surface makes the same reviewed
context **pull-based**: the agent asks, Mori answers with cited, honest,
already-reviewed data.

This is a Reuse output exactly like reports and resume prompts. It is
not a sync channel, not a write path, and not a product UI.

## 2. Doctrine fit (why this is allowed)

- **Local-first**: stdio transport only; the MCP server is a child
  process the agent spawns on this machine. No network listener, no
  tunnel, no OAuth, no cloud.
- **B-surface rails**: reads only Mori's own store, which contains only
  explicitly captured data. Opt-in in 설정, always-visible on/off state,
  one-tap off (transparency rail).
- **External-output policy applies**: MCP responses are external outputs.
  Provisional records never cross (existing invariant), sensitivity
  filters apply (the report-tier machinery), and secret-shaped strings
  never leave. The same inclusion policies that gate Reports gate this.
- **The model is an untrusted client** (Kinhold pattern,
  `app/Mcp/Tools/Concerns/ScopesToFamily.php`): the server enforces
  read-only scope and inclusion policy on every call, regardless of what
  the calling agent claims. v1 ships zero write tools.

## 3. Architecture

**One capability layer, second front-end** (Kryton pattern,
`modules/agents/mcp/tools.ts`): the MCP server is a thin adapter over
the same pure helpers the UI consumes. No business logic lives in the
adapter.

```text
Claude Code ──spawn/stdio──> mori-context (small Node MCP server)
                                │  imports pure helpers only
                                ▼
                     capability layer (src/lib/…)
                     record-kernel repository · aggregates ·
                     distill inclusion policies · resume builder
                                │
                                ▼
                     SQLite (read-only connection, WAL)
```

Implementation shape (decide at build time, both keep the adapter thin):

- **A. Standalone Node binary** staged into `~/.mori` like the Mori CLI
  (`stage_mori_cli` precedent), opening the desktop SQLite file with a
  read-only connection. Works while the app is closed; needs the pure
  helpers bundled.
- **B. Tauri sidecar** shipped with the desktop app and only advertised
  while the app runs. Simpler distribution, tighter state guarantees.

v1 leans A (agents outlive app sessions), with the on/off switch
implemented as a staged/unstaged server registration so "off" is
physically off, not a soft flag.

## 4. v1 tools (five, intent-level, all read-only)

Low-level file/CRUD tools are explicitly rejected; the external
conversation's Personal MCP experiment showed models flailing across
`files_search` / `files_read` chains. Tools express user-goal intents
(Kryton's `get_daily_note` / `get_backlinks` granularity), each tagged
`scope: read-only` and gated at dispatch.

| Tool | Input | Output | Backed by |
| --- | --- | --- | --- |
| `search_records` | query text; optional schema kind, context, date range, limit | ranked records: id, title, kind, activity time (+ `timeBasis`), context names, snippet, source count | kernel FTS5 (`search_kernel_records`) + filters |
| `get_record` | record id | full record body, properties, contexts, entities, origin summary (source kinds + capture dates, per retention), revision count | kernel repository + `SourceLink` rollup |
| `get_project_context` | context id or name | project state: recent episodes/activity, current decisions with rationale, open tasks, guidance-eligible distilled knowledge | aggregate layer + distill inclusion policy |
| `get_recent_activity` | day range (default 7) | per-day rollup: day summaries, record counts by kind, notable decisions, "Mori가 정리함" counts | day aggregates |
| `prepare_resume_context` | context id/name; audience (`self / claude / codex / handoff`); privacy mode | the resume prompt as structured sections (same builder the UI uses) | `buildProjectMemoryResumePrompt` and its ledger successor |

Response contract, every tool: `dataBasis` honesty flag, record-id
citations for every claim, and an explicit `excluded` note when
provisional/sensitive records were filtered (count only, never content).
That is the existing capability-layer contract
(`memory-as-a-service.md` §3) surfacing verbatim.

Deliberate v1 exclusions:

- No `list_everything` / bulk export tool (that is `.mori` / Markdown
  export's job).
- No raw source bodies in any response; `get_record` returns an origin
  *summary*. Raw transcripts stay inside the app per retention policy.
- No cross-project "everything about me" tool; every tool is scoped by
  query or context.

## 5. The future write intent (v2, out of scope here)

A single `capture` tool (text in, proposal out) is the only write shape
that will ever be considered: it enters `runCapturePipeline` with origin
`agent`, faces the same six-factor apply matrix, lands as
candidate/provisional like any other capture, and is disclosed in the
day rollup. Direct record mutation via MCP is permanently out. The
connector plan's MCP *emitter* (JSONL into the inbox) remains the
alternative capture route; the two must not be built as parallel
duplicates, so v2 starts with a one-pager choosing between them.

## 6. Settings surface

One card in 설정 > 연결: 사용 안 함(기본) / 사용. When on: which agents
have registered it (best-effort detection, honest "알 수 없음"
otherwise), what is exposed (읽기 전용 · 검토된 기록만 · 잠정/민감 제외),
and a copyable registration snippet per agent (Claude Code
`claude mcp add`, Codex config), following the existing
`getConnectorSetupGuide` copy pattern. No live status theater: if Mori
cannot verify a registration, it says so.

## 7. Staging and done criteria

1. **Precondition**: R9-equivalent unification shipped (agent sessions
   are records; slices S2-S3 of the unification audit), and the
   capability facade exists for the pieces the five tools consume.
   Verified 2026-07-15: `src/lib/memory-api/` exists but is scoped to
   the **legacy** memory stack (accepted memories, session evidence,
   glossary, Ask Mori). No kernel-side capability entry point exists
   yet; `search_records` / `get_record` can sit on the pure
   `KernelRepository` directly, but `get_project_context` /
   `get_recent_activity` / `prepare_resume_context` need a small
   ledger-side facade (the aggregates are already pure helpers under
   `src/features/record-ledger/`, so this is an extraction, not new
   logic). That extraction is part of this surface's slice 2, not a
   separate project.
2. **Slice 1**: `search_records` + `get_record` over the kernel
   repository, server binary + staging + 설정 card. Done when Claude
   Code answers "지난주에 X 관련해서 뭐 기록했지" from a cold session
   with correct citations and zero provisional/sensitive leakage
   (fixture test on the inclusion filter).
3. **Slice 2**: the three context tools. Done when a real Claude Code
   session on the Mori repo itself starts from `prepare_resume_context`
   instead of a pasted prompt, and the user judges the answer honest.
4. Colocated tests: inclusion-policy fixtures (provisional, sensitive,
   stale/contradicted records must not appear), FTS-injection guard
   reuse, and a golden-output test per tool.

## 8. Open questions

1. Binary packaging: bundle Node runtime vs require it; or fall back to
   implementation shape B (sidecar) if staging a runtime is heavy.
2. Should `get_project_context` include tracker aggregates (운동/학습
   totals) or stay work-scoped in v1?
3. Per-context exposure control (특정 프로젝트만 노출) in v1 or v2? v1
   default is all-contexts with the global switch; per-context scoping
   is one `Rule` row away if wanted early.
