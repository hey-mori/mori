# Reference Synthesis · Agent Session Viewer and Work-Log Landscape

| Field | Value |
| ----- | ----- |
| Method | Direct web survey (product docs, GitHub READMEs, comparison articles), public sources only. |
| Analysis date | 2026-07-10 |
| Companion docs | [`../design/live-follow-lab.md`](../design/live-follow-lab.md) is the design spec that consumes this synthesis. [`../design/local-llm-understanding-and-live-follow.md`](../design/local-llm-understanding-and-live-follow.md) holds the Live Follow doctrine. [`manus-research-synthesis.md`](manus-research-synthesis.md) covers the memory-consolidation research space. |

This file reconciles the 2026 landscape of agent-session viewers,
LLM observability platforms, agent mission-control UIs, and personal
work-capture tools against Mori's implementation state. Like the other
reference syntheses, it extracts what Mori should adopt, what stays
background knowledge, and what it should explicitly reject.

---

## 1. The landscape in four families

### 1.1 Claude Code viewer ecosystem (direct competitors)

Tools that read the same `~/.claude/projects/*.jsonl` files Mori reads.

| Tool | Form | Standout patterns |
| ---- | ---- | ----------------- |
| [claude-code-viewer](https://github.com/d-kimuson/claude-code-viewer) | Web UI | Real-time view of a running session's log; session resume / continue; Cmd+K fuzzy search across conversations; project combobox for instant project jumps; Explorer tab summarising edited files with tool-invocation filters; git diff viewer. |
| [claude-code-history-viewer](https://github.com/jhlee0409/claude-code-history-viewer) | Desktop (Tauri-like) | 25-provider unified browsing; live session file watching (SSE push); token stats dashboard with dual billing-vs-conversation modes; per-skill and per-subagent analytics; virtual scrolling plus Web Worker search indexing for large histories; right-side TOC; context menu with "copy resume command". |
| [claude-code-log](https://github.com/daaain/claude-code-log) | Python CLI to HTML/MD | Table of contents with session summaries; token usage per session; ccusage-style daily summaries on its roadmap. |
| [sniffly](https://github.com/chiphuyen/sniffly) | Local dashboard | Usage-pattern dashboard; error breakdown by type ("where Claude Code makes mistakes"); message-history walkthrough; local-only processing; shareable dashboard links. |
| [ccusage](https://github.com/ryoppippi/ccusage) | CLI | Daily / weekly / monthly / per-session / 5-hour-block token and cost reports across many agent CLIs; per-model breakdown; cache-token visibility; statusline integration. |

**The common denominator: every tool in this family is
"install it and everything is visible".** None of them asks the user to
pick sessions one by one; discovery of the agent's session store is
automatic, and the two viewers with traction both do live updates.

### 1.2 LLM observability platforms

[Langfuse](https://langfuse.com/docs/observability/overview) and
[LangSmith](https://www.langchain.com/langsmith/observability) both
converged on serving the **same trace through two complementary
views**: a structure view (agent graph / run tree, inferred from
nesting and timings) and a flat log-stream view for loops and branches
that a tree renders poorly. Filtering is by session, user, cost, and
latency. These are enterprise products; their fleet dashboards and
eval tooling are out of Mori's scope, but the dual-view convergence is
a strong external validation signal.

### 1.3 Agent mission-control UIs

Cursor's background-agent panel shows, per agent, the current step,
elapsed time, and a live log; Devin Desktop manages a fleet of agents
from one surface. The 2026 agent-UX consensus (see
[Fuselab's agent UX overview](https://fuselabcreative.com/ui-design-for-ai-agents/))
is the most directly useful finding for Mori:

> Separate the conversation from the activity stream. The conversation
> thread is where the user sets goals; a dedicated activity panel shows
> the agent's autonomous work, so the user can see what was done, what
> is running, what is blocked, and what is next at a single glance,
> without scrolling chat history.

This is precisely the shape of the request-anchored live list in the
Live Follow Lab design: the user's request is the anchor, the work is
the stream beneath it.

### 1.4 Personal work-capture tools

[WakaTime](https://wakatime.com/) and ActivityWatch capture
automatically and present only aggregates (daily / weekly dashboards);
[Granola](https://www.granola.ai/) captures a raw meeting stream and
surfaces only distilled notes, decisions, and next steps. The shared
lesson: **automatic capture is made calm by digest-first presentation**,
never by showing the raw stream as the default surface. Mori's Quick
Pass and consolidation layer already play the Granola role for coding
sessions; what Mori lacks is the digest surface (a quiet weekly
summary), not the distillation machinery.

## 2. What the landscape confirms about Mori's direction

- **The three-view doctrine is externally validated.** 원본 (flat raw
  stream) / 타임라인 (structural activity map) / AI 흐름 (interpreted
  flow) is the same structure-plus-log duality Langfuse and LangSmith
  converged on, plus an interpretation layer none of the viewers have.
- **Request-unit grouping is differentiating.** The surveyed viewers
  group by session or by trace; none anchors the display on the user's
  request the way `buildRequestSpans` already segments Mori's stream.
  The mission-control consensus (conversation vs activity separation)
  says this is the right anchor.
- **Mori's review / memory / consolidation layer has no counterpart**
  in any surveyed tool. Viewers stop at display; observability
  platforms stop at metrics. Evidence-gated durable memory is Mori's
  moat and needs no course correction.

## 3. Table stakes Mori is missing

Measured against the viewer family (the tools a user would actually
compare Mori to), these are standard and Mori lacks them:

1. **Automatic discovery.** Every viewer shows all sessions on launch.
   Mori requires 새 세션 → agent → modal → pick per session.
2. **Live updates.** Both viewers with traction follow a running
   session in real time. Mori's live-follow brain exists but is wired
   only to the connector inbox, not to the agent session stores.
3. **Global search.** Cmd+K across all sessions is standard. Mori's
   search is fragmented per surface.
4. **Scale rendering.** claude-code-history-viewer virtualises lists
   and indexes search in a Web Worker. Mori renders 800+ event
   sessions with no windowing.
5. **Usage surfaces.** Token / tool statistics are table stakes
   (ccusage, sniffly, history-viewer). Mori already parses token usage
   at the Rust boundary (`TokenAccumulator`) and stores per-file diff
   previews, but surfaces neither.
6. **Resume affordance.** "Copy resume command" is a one-line feature
   with outsized utility; Mori has the richer continuation prompt but
   not the cheap direct one.

## 4. What Mori should adopt (priority order)

The complexity rule that governs all of these: **no new standing
screens.** Everything lands on existing surfaces (command palette,
session 개요, project page, Home); the only new view is the Live
Follow Lab, and it is designed to retire into the 활동 tab after
verification.

**P1 · Real-time foundation** (design spec:
[`../design/live-follow-lab.md`](../design/live-follow-lab.md))

- Agent-generic delta read (tail) of session-store JSONL, a
  Claude-JSONL follow-source variant for the existing live-follow
  brain, and the request-anchored lab view with parse-fidelity
  counters.
- List virtualization for the raw stream view, before live growth
  makes it urgent.

**P2 · Friction removal**

- Auto-discovery inbox: sessions from connected anchor agents appear
  automatically; viewing is reading, one click sessionises via the
  existing `importAndOpenAsNewSession`. Review gates stay where they
  are (durable memory), consistent with the A-vs-B surveillance line.
- Global Cmd+K search across sessions, events, and accepted memory,
  with Web Worker indexing.
- Per-session "resume 명령 복사" action (`claude --resume <id>`).

**P3 · Surfacing already-parsed data**

- Token and tool-usage statistics on the session 개요 and project
  page, borrowing the dual billing-vs-conversation mode from
  claude-code-history-viewer.
- File-touch diff rendering from the stored `diff_preview` /
  `structuredPatch` data (the follow-up already named in
  [`../design/agent-work-visibility-vision.md`](../design/agent-work-visibility-vision.md)).
- A weekly digest on Home: one Granola-style paragraph with links to
  decisions and unresolved items, not a dashboard.

## 5. Keep as background (not now)

- **Provider breadth (25 agents).** The `agentRegistry` seam already
  positions Mori to add anchors; add them on demand, not for parity.
- **Error-pattern analytics (sniffly).** Interesting once the LLM
  understanding layer matures; premature as a surface today.
- **Billing-window blocks (ccusage 5-hour blocks).** Niche; plain
  daily / per-session stats cover the need.
- **OpenTelemetry GenAI conventions.** Only relevant if Mori ever
  exports traces for interop; no current requirement.

## 6. Reject for now

- **Driving the agent** (claude-code-viewer's continue-conversation,
  message scheduling, commit/push from the viewer). Mori never starts
  or drives the agent; this is an identity boundary, not a gap.
- **Share links / hosted dashboards** (sniffly). Local-first; sharing
  stays `.mori` package export.
- **Cost-first framing.** Usage stats are context for the user's own
  review, never the product's headline. Mori is memory-first.
- **Session Board / pixel-view style multi-session visual analysis**
  (history-viewer). High surface cost, low fit with the calm bar;
  Mori's project synthesis already answers the underlying question.

## 7. Sources

- https://github.com/d-kimuson/claude-code-viewer
- https://github.com/jhlee0409/claude-code-history-viewer
- https://github.com/daaain/claude-code-log
- https://github.com/chiphuyen/sniffly
- https://github.com/ryoppippi/ccusage
- https://langfuse.com/docs/observability/overview
- https://www.langchain.com/langsmith/observability
- https://fuselabcreative.com/ui-design-for-ai-agents/
- https://wakatime.com/
- https://www.granola.ai/
