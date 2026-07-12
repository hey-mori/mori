# Reference Synthesis · Competitive Landscape and Positioning, 2026-07

| Field | Value |
| ----- | ----- |
| Method | Direct web survey (GitHub repos, product docs, HN threads, vendor blogs, Korean community threads), public sources only. |
| Analysis date | 2026-07-12 |
| Companion docs | [`agent-session-viewer-landscape.md`](agent-session-viewer-landscape.md) (2026-07-10) covers the viewer family in depth; this synthesis extends it with memory products, capture products, native-agent capability drift, and positioning. [`../production-program.md`](../production-program.md) is the roadmap that consumes this synthesis. |

This file reconciles the mid-2026 market against Mori's implementation
state, across four families: session viewers / orchestrators, AI memory
products, personal capture products, and the anchor agents' own native
capabilities. Like the other reference syntheses, it extracts what Mori
should adopt, what stays background knowledge, and what it should
explicitly reject.

---

## 1. The landscape in four families

### 1.1 Session viewers and orchestration GUIs

The viewer family is covered in depth by
[`agent-session-viewer-landscape.md`](agent-session-viewer-landscape.md).
What changed or sharpened since that survey:

- **[claude-code-history-viewer](https://github.com/jhlee0409/claude-code-history-viewer)**
  (~1.8k stars, commits daily) is the most direct structural threat:
  same stack (Tauri v2 + Rust + React), Korean author, **28 assistants**
  supported, live file-watch monitoring, token / cost analytics with a
  billing-vs-conversation split, global cross-provider search, one-click
  resume commands. It has no memory layer, no evidence gates, no handoff
  outputs, but it has a plausible path to adding them.
- **[claude-view](https://github.com/tombelieber/claude-view)** (new):
  "mission control" live dashboard of every running session with
  sub-agent visibility, hooks, and cost. Direct overlap with Mori's
  라이브 세션 surface.
- **Search-and-resume is fully commoditized.** claude-replay (scrub-through
  session replay), Claudebin (share + resume via link), ccrider,
  raine/claude-history, CmdTrace (Korean, macOS) and more ship weekly.
- **Orchestration GUIs** operate one tier up (running agents, not
  remembering work): [Vibe Kanban](https://vibekanban.com/) (~27k stars,
  company defunct, community-maintained), Conductor (closed-source Mac),
  Crystal → Nimbalyst (visual workspace + iOS companion),
  opcode (~22k stars, **abandoned since 2025-10**).
- **Category churn is severe.** opcode abandoned, sniffly dormant,
  Crystal deprecated, Vibe Kanban's company shut down. Users are wary of
  adopting yet another session tool; longevity and data durability are
  themselves selling points.

### 1.2 AI memory products

- **[mem0](https://mem0.ai/)** (~60k stars, $24M raised 2025-10) now
  explicitly targets coding agents (Claude Code / Cursor / Codex
  persistence) and ships OpenMemory, a local-first cross-tool memory
  dashboard. Delivery mechanism is MCP. The winning UX pattern it
  proves: a **visible, editable memory list the user controls**.
- **[Letta](https://github.com/letta-ai/letta)** (MemGPT lineage,
  ~24k stars): agent runtime with self-edited memory blocks; more
  framework than product.
- **Zep / Graphiti**: bitemporal knowledge graph; strong at
  "what was true as of last Tuesday", but heavy (reported ~600k token
  footprints) and retrieval lags ingestion.
- **ChatGPT memory ("Dreaming", 2026-06)**: rebuilt around background
  synthesis and drew public criticism for **limiting the audit trail**;
  users can no longer fully see why the model knows something. The
  market visibly punishes opaque memory. Mori's review-before-apply +
  append-only audit trail is the exact counter-position.
- **Claude Code native memory**: auto-memory on by default (Claude
  writes its own MEMORY.md next to user CLAUDE.md), plus /rewind
  checkpoints, /resume with branching and forking. Native memory now
  owns the easy 80% of single-tool, single-machine continuity.
- **Adjacent memory products**: Pieces for Developers (MCP server, 39
  tools over long-term workstream memory), Hivemind (team memory for
  Claude Code, cloud / SSO), Windsurf Cascade memories (workspace-scoped,
  does not retain conversation substance), Cursor memories (per-project
  facts, no cross-project transfer).
- **Naming collision**: [fjwood69/mori](https://github.com/fjwood69/mori)
  (2026-05) describes itself as a "governed memory layer for AI coding
  agents" with hook-based capture and human promotion of candidate
  memories to canon: near-identical language to Mori's review gates, and
  the same name. Small today (~21 stars) but a real discoverability and
  identity risk if either project grows.

### 1.3 Personal capture products

- **Rewind / Limitless → Meta** (acquired 2025-12): the Rewind Mac app
  shut down, service killed in EU / UK / Korea, users forced onto
  Meta's terms or deletion. **Cloud-dependent "life memory" died with
  the company.** Local-first is no longer a marketing phrase; it is a
  differentiator with a fresh, famous proof point.
- **[Screenpipe](https://github.com/screenpipe/screenpipe)** (YC S26,
  MIT): 24/7 local screen capture into SQLite, repositioned as
  "workflow memory for AI agents", aggressively harvesting Rewind
  refugees. Its capture model (always-on screen recording) is Mori's
  explicit "A" non-goal; its traction shows the demand for the
  *outcome* (work memory), not the method.
- **Granola** ($125M Series C at $1.5B, 2026-03): pivoted from
  notetaker to "meetings as enterprise AI context" with team Spaces.
  The two lessons: the winning surface was the **calm reviewed
  artifact** (not the raw stream), and the monetization step was making
  individual memory **shareable to a team**.

### 1.4 Native agent capabilities and the remaining gap

Claude Code natively ships: session persistence, /resume with picker /
branching / forking, /rewind checkpoints, /export, auto-memory, and
Agent Teams with an audit trail. What users still complain about
publicly:

- /resume search matches titles only; "that auth session from 3 weeks
  ago" is a top pain (a cottage industry of search tools exists because
  of it).
- Resuming an old session re-bills the expired prompt cache; the
  community best practice is a hand-rolled **HANDOFF file** (project
  state, decisions, TODOs, gotchas in a few hundred tokens). Korean
  users build `/handover` custom commands for exactly this
  (gpters.org threads).
- Everything native is **single-tool and single-machine**: no
  cross-agent continuity, no teammate handoff, no evidence links from a
  memory back to the session that produced it.

## 2. What the landscape confirms about Mori's direction

- **The moat is real and unoccupied.** No session viewer has durable
  memory; no memory product has session evidence. Evidence-linked,
  review-gated memory with handoff outputs sits on an empty
  intersection. The ChatGPT Dreaming backlash independently validates
  the review-gate posture.
- **The handoff report is a proven, unproductized need.** The
  community's own best practice (HANDOFF.md, `/handover`) is exactly
  Mori's resume prompt, done by hand. Granola proved the
  reviewed-artifact surface is what scales to teams and revenue.
- **Local-first now sells itself.** Post-Rewind, explicit capture +
  local-only storage is a defensible identity, not a constraint.
- **Korean-first is an open lane.** Korean demand is visible (gpters
  `/handover` threads, CmdTrace, wikidocs guides); the only serious
  Korean-authored player ships an English-first generic viewer.

## 3. Table stakes Mori is missing

Users judge every tool in this category against these within the first
minutes. All are also named in
[`agent-session-viewer-landscape.md`](agent-session-viewer-landscape.md) §3:

1. **Global title + content search** across all sessions (Cmd+K).
2. **One-click resume command** (`claude --resume <id>`).
3. **Token / cost statistics** (the Rust boundary already parses them;
   no surface shows them).
4. **Automatic session discovery** on launch (라이브 세션 partially
   covers this now; the session list does not).
5. **File-diff rendering** from the already-stored `structuredPatch`.

## 4. What Mori should adopt (priority order)

1. **Ship the handoff as the headline.** Promote the session-end →
   review → resume-prompt / `.mori` handoff flow to a first-class,
   first-screen affordance. This is the moat made visible.
2. **Close the five table-stakes gaps** (Section 3) so the moat is
   ever reached by a comparing user.
3. **A local MCP memory service** (design pass required): serve
   accepted memory read-only over MCP so anchor agents can query it at
   session start. This is the automation of the resume prompt, the
   delivery mechanism mem0 / Pieces proved, and it stays local-first
   and review-gated (serving is read-only; writing stays behind
   consolidation review). Needs an explicit design doc and user
   approval before any build.
4. **Cross-tool reconstruction** as a differentiating surface: "what
   actually happened to this repo this week, across Claude + Codex +
   Cursor, with receipts". No one owns this.
5. **A weekly digest** (Granola-style one paragraph on Home, linking
   decisions and unresolved items). The distillation machinery already
   exists; only the calm digest surface is missing.

## 5. Keep as background (not now)

- **Error-pattern analytics** (sniffly's "where the agent fails"):
  interesting once the LLM understanding layer matures.
- **Team memory with cloud / SSO** (Hivemind, Granola Spaces): team
  stays `.mori` handoff per the non-goals; watch how demand shapes it.
- **Provider breadth for its own sake** (28 assistants): add anchors on
  demand through the existing `agentRegistry` seam, not for parity.
- **Orchestration** (running / driving agents): a different product
  tier; Mori observes and remembers, it does not drive.

## 6. Reject for now

- **Always-on screen capture** (Screenpipe's model): the "A" ban in
  `mori-project-goal.md` §6 holds regardless of that market's traction.
- **Opaque background memory synthesis** (ChatGPT Dreaming): the
  market itself is punishing it; review-before-apply is the identity.
- **Cloud share links / hosted dashboards**: sharing stays `.mori`
  package export.
- **Cost-first framing**: usage stats are context, never the headline;
  Mori is memory-first.

## 7. Strategic threats to monitor

1. **Native commoditization by Anthropic.** Auto-memory, checkpoints,
   branching, and Agent Teams shipped in roughly a year; transcript
   search or session sharing could land any release. Mitigation:
   cross-tool and team surfaces the vendor will not build, plus the
   evidence-gate identity.
2. **A faster horizontal competitor adding memory.**
   claude-code-history-viewer has the stack, the pace, and the
   audience; mem0 / OpenMemory has the gravity to come down-market.
   Mitigation: ship distribution and the handoff headline before the
   gap closes.
3. **Category fatigue and the naming collision.** The graveyard is
   fresh and users know it; a same-named project with near-identical
   positioning language (fjwood69/mori) muddies search results.
   Mitigation: durability signals (installer, updater, data safety)
   and a naming / brand decision before any public launch.

## 8. Sources

- https://github.com/jhlee0409/claude-code-history-viewer
- https://github.com/tombelieber/claude-view
- https://github.com/d-kimuson/claude-code-viewer
- https://github.com/chiphuyen/sniffly
- https://github.com/daaain/claude-code-log
- https://github.com/ryoppippi/ccusage
- https://github.com/winfunc/opcode
- https://vibekanban.com/
- https://www.conductor.build/
- https://nimbalyst.com/
- https://github.com/johnfkoo951/CmdTrace
- https://mem0.ai/
- https://mem0.ai/blog/introducing-the-openmemory-chrome-extension
- https://github.com/letta-ai/letta
- https://help.openai.com/en/articles/8590148-memory-faq
- https://www.techtimes.com/articles/317840/20260605/chatgpt-memory-dreaming-update-openai-rewrites-personalization-engine-limits-audit-trail.htm
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/sessions
- https://github.com/pieces-app/pro_tips
- https://github.com/fjwood69/mori
- https://techcrunch.com/2025/12/05/meta-acquires-ai-device-startup-limitless/
- https://github.com/screenpipe/screenpipe
- https://techcrunch.com/2026/03/25/granola-raises-125m-hits-1-5b-valuation-as-it-expands-from-meeting-notetaker-to-enterprise-ai-app/
- https://docs.bswen.com/blog/2026-06-29-claude-handoff-file-vs-compact/
- https://www.gpters.org/dev/post/claude-code-how-fix-5C23eWKWsG2yqwH
- https://github.com/anthropics/claude-code/issues/394
- https://deeplake.ai/answers/team-sharing-claude-code-learnings
- https://news.ycombinator.com/item?id=47128630
