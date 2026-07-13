# Mori Redesign — Session-Centric Product Plan

> **Doctrine status (2026-07-14): historical.** The session-centric
> center this plan established ("one AI conversation = one session, the
> spine") is superseded by the record-ledger identity in
> [`mori-context-workspace-architecture.md`](mori-context-workspace-architecture.md)
> and the rewritten [`mori-project-goal.md`](../mori-project-goal.md).
> Sessions remain the deep unit inside the agent world only. Keep this
> document as the record of the 2026-05 reset; do not follow it for new
> work.

This is the durable plan for the 2026-05 redesign. It supersedes the
scattered, page-per-feature shape Mori grew into. Future passes follow this
document; update it when a decision actually changes, not speculatively.

Why the reset: implementation outran planning. The app became ~10 separate
card-heavy pages with a weak, recording-style session model, redundant
surfaces, heavy explanatory copy, and no single screen that makes the product
legible. The user's verdict: hard to scan, unconvincing per page, unclear what
a session even is. We re-plan around one clear idea.

## 1. Product definition

> Mori is a local-first desktop app that turns your **AI-agent work** into
> understandable, durable work memory.

You run AI agents (Claude Code, Codex, …) that do real work — prompts, tool
calls, file edits, decisions. That work is scattered and ephemeral. Mori
**captures it, makes it understandable, and carries context forward** so you
can resume, report, and see how you actually work with AI.

Mori is **not** a recorder, a surveillance tool, a generic PM app, a chatbot,
or a log viewer. Local-first, explicit-import, review-before-apply,
evidence-based, provenance-visible — unchanged from the project goal.

## 2. What a session IS (the definition that was missing)

> A **session** is the captured record of one unit of work — most commonly an
> **AI-agent run**, and extensible to other local work sources.

Invariants:
- **Captured or live-tracked, not user-recorded.** You do not press "start
  recording". A session comes from importing an agent run or (future) Mori
  tracking one live. Pressing "새 세션" is a rare edge case, not the front door.
- **One run = one session.** One Claude Code conversation / Codex run is one
  session. Multiple agents running = multiple sessions (some live, some
  captured).
- **Rich, not a duration.** A session holds: source (which agent/tool),
  project, time span, the **work stream** (prompts → agent actions → tool
  calls → file changes → decisions), an outcome summary, and a state
  (`live` / `captured` / `reviewed` / `archived`).
- **Extensible source.** AI-agent runs are first-class but not the only kind.
  The model must accommodate terminal sessions, git history, notes, and
  pasted transcripts as session sources without rework. Do not hard-code
  "AI agent" as the only origin.
- **Rolls up into Project Memory.** Sessions are the unit; project memory is
  the durable cross-session understanding built from them.

This kills the misleading "X시간 분량" lower-left framing — a session is *what
an agent did and why it matters*, not a stopwatch.

## 3. Information architecture — collapse to session-centric

Before: ~10 scattered top-level pages. After: ~5 coherent destinations.

| Destination | Role |
|-------------|------|
| **홈 (Home / Dashboard)** | The landing. "What have I worked on · what needs attention · what's next · how am I using AI." Recent + live sessions, attention items framed as value, insights, key actions (가져오기 / 이어가기 / 리포트). |
| **세션 (Sessions)** | Browse captured sessions by project → open one → **Session Detail**. Timeline / Evidence / Review / Flow live as **views inside a session**, not separate pages. |
| **메모리 (Memory)** | Durable cross-session project memory + consolidation. |
| **리포트 (Reports / 이어가기)** | Resume prompts, reports, `.mori` export, handoff. |
| **설정 (Settings)** | Demo toggle, connectors, privacy & local data. |

Folded in (no longer top-level nav):
- **Timeline / Evidence / Review / Flow** → tabs/views *inside* Session Detail.
- **Connections (import)** → a "가져오기" action on Home and Sessions.
- **Companion / notifications** → a **global attention layer** (top-right
  indicator → panel), reachable everywhere, framed as value — never
  "검토할 후보 3개".

## 4. Layout & visual direction

- **No redundant page-title header.** The left nav already says where you are.
  Drop the big h1 + subtitle band; keep a thin action bar only where actions
  exist. Reclaims vertical space, fixes the "font too big" feel.
- **Tighter type scale.** Smaller, denser, desktop-app hierarchy. Use weight /
  colour for hierarchy, not just size.
- **One inspector system.** A single defined right-panel pattern (when to use,
  fixed width, behaviour) — not ad-hoc per screen.
- **Demo is a toggle**, not a permanent banner. Lives in Settings.
- **Cards only for genuine summaries.** Dense operational data → lists/tables.
  Stop stacking card layers.
- **Copy diet.** Cut explanation; let layout, hierarchy, and status carry
  meaning. Reframe every surface around what the user *gains*, in concise,
  professional Korean — not AI-sounding reassurance.

## 5. What to cut or question

- "보관 범위" in session create — premature; remove from the create flow.
- Planned-connector / planned-integration cards that do nothing — hide or make
  actionable; do not show dead options as if live.
- Redundant surfaces (Timeline vs Flow; multiple review-ish lists) — merge.
- "새 세션" as a primary action — demote to edge case.
- Review framed as "decision candidates to check" — reframe around the value of
  reviewing (what understanding / memory the user gets).

## 6. Phased plan (step by step, value-first)

Each phase is a coherent, shippable, validated commit. Keep the reusable
foundation already built (shell primitives, honest work-context, sessions
browser logic, token parsing) — it folds in; nothing is wasted.

- **P1 — IA skeleton + header removal + type scale** *(in progress)*: add a Home
  destination + make it the landing; collapse nav to 5; remove redundant page
  titles; tighten the type scale. Routes for folded pages stay alive.
- **P2 — Home / Dashboard**: the landing that makes the product legible —
  recent/live sessions, attention-as-value, insights, key actions.
- **P3 — Session Detail**: collapse Timeline / Evidence / Review / Flow into one
  session workspace with views/tabs. The big de-fragmentation.
- **P4 — Global attention layer**: notifications/companion reframed as value,
  reachable everywhere; severity + category + routing; read-only.
- **P5 — Memory + Reports** refit into the new shell and framing.
- **P6 — Demo toggle, copy diet, visual polish sweep**; cut the questioned bits.

## 7. Longer-horizon product thinking (not yet built, do not block)

The vision the redesign should not paint itself out of:
- **Live multi-agent tracking.** Several agents running in parallel, each a
  live session; Mori tracks what each is doing in real time, makes it legible,
  and notifies on meaningful agent choices.
- **Insight.** "What work have I done, how am I using AI" — patterns across
  sessions, not just per-session detail.
- **Continuity.** Carrying context into the next session/run as durable memory.
- **Sharing / handoff.** Local-private by default; selected summaries/reports
  shareable via `.mori`. Architecture and naming must not block future
  collaboration, but no collaboration backend ships now.

Out of scope until explicitly approved: team/cloud collaboration, always-on
capture by default, account scraping.
