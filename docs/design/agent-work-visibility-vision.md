# Mori · Agent Work Visibility Vision

A north-star direction note. It captures, in one place, the product direction
the user set for Mori: connect many AI agents, record their work flow reliably,
and make that work legible, controllable, and durable. It is deliberately a
*vision and open-questions* document, not an implementation spec. Each theme
states the intent, the honest current state in the repo, the open questions,
and the direction. Build specs live in the sibling docs this note links to.

This note is durable direction set by the user (2026-06-08). It does not record
implementation status that can drift; for that, read
[`mori-project-goal.md`](../mori-project-goal.md) §4–5, which stays the
authority on Implemented vs Planned.

---

## 0. The one sentence

Mori should make AI-agent work **visible**: when you hand work to Claude / Codex
/ another agent, you usually see only the result and lose the issues, the
terminology, and the reasoning along the way. Mori keeps that flow, explains it,
and turns it into a durable, manageable asset, so adopting Mori feels like
gaining a helpful tool, not carrying one more complex work layer.

## 1. Two pillars

Everything below hangs off two pillars the user named, in order:

1. **Reliable connection and collection.** Integrate with the agents and ingest
   their work flow stably. *This is foundational: nothing downstream can be
   better than the data it stands on.*
2. **Analysis, visual presentation, and user control.** Analyze what was
   collected, show it clearly and even beautifully, and let the user manage it
   without friction.

A finding that reframes pillar 1: the *capture* layer is already solid (seven
agent readers exist), but *normalization throws away most of what was captured*.
The raw Claude Code JSONL carries `thinking` / `text` / `tool_use` /
`tool_result` blocks, exact file paths, and full edit diffs
(`old_string` / `new_string` / `structuredPatch`), yet the reader flattens every
tool call to a `"🔧 Edit: …"` string before the frontend sees it. So the first
reliability work is not "scrape more"; it is "stop discarding what we already
read." See §2 and the file-provenance milestone status under Sequencing.

## 2. File and document tracking

**Intent.** Track the files and documents an agent used while it worked, let the
user open them immediately, detect when a file has moved and still open it, and
show how a file changed.

**Current state.** Partial and lossy. Connector JSONL carries structured file
paths; the Claude path renders tool calls to text and the frontend regex-scrapes
file names out of summaries (`workBundle`). There is no first-class file model,
no move / rename detection, and the `Artifact` domain type is never populated by
a normalizer.

**Direction (in progress).**
- A faithful, source-agnostic `FileTouch` (`path`, `tool`, `changeKind`, `at`),
  preserved at the Rust boundary and carried onto `SourceRef.fileTouches`.
  *(Shipped: Claude Code reader + import wiring; see Section 6.)*
- A pure per-file rollup (`rollUpFileTouches`) and a filesystem reconciliation
  (`reconcileFileProvenance`) that marks each file present / moved / missing and
  exposes the path to open. *(Shipped as pure helpers; the Tauri resolver and
  the UI are next.)*
- "How it changed": correlate a `tool_use` with its `toolUseResult.structuredPatch`
  for accurate per-file added / removed line counts, and a diff peek.

**Open questions.** How aggressively to track reads (consulted files) vs only
changes. How to detect a move reliably (basename + content hash? git rename?
last-known directory?). How to surface a deleted-then-recreated file honestly.

## 3. Visual presentation of the work flow

**Intent.** The visual layer is core, not decoration. The timeline today shows
work by time with text summaries, but it is hard to read and does not draw the
eye. The user wants a clean, legible surface that also conveys, in real time and
professionally, that AI work is happening, using motion and live elements where
they earn their place. Beyond a timeline, a genuinely new way to show a work
flow would be welcome, going past a "pixel agent" toy toward a real depiction of
the work: what the agent is doing now, what is being changed, why a decision was
made, and an explanation of the terminology that came up.

**Current state.** The timeline is mature in machinery (15 activity lanes,
duration-aware cards, bundling, a minimap, and 재구성 lenses: 서사 / 국면 / 인과 /
계보 / 맥동). The readability gap is upstream of rendering: one turn collapses to
one card with the ask as title and the reply as summary, so "which files did this
turn touch, what did it decide" lives behind a hover or the inspector instead of
on the card. Live Follow polls in the foreground but surfaces no "working now"
treatment.

**Direction.**
- Let provenance (Section 2) feed the card: a turn carries action glyphs
  ("Edit×3 · `commandSpace.ts`") so the scan answers *what happened*, not just
  *when*. This is the cheapest large readability win and the first place
  pillar 1 pays pillar 2 back.
- A live treatment for in-progress work: a new event slides in, pulses, then
  settles; a calm "작업 중" presence rather than a fake spinner. Honest with the
  product principle "no fake AI-thinking spinners while nothing runs."
- Explain in place: terminology and decision rationale revealed on demand via
  the existing `InfoHint`, not always-on prose.
- A possible non-timeline lens that shows the flow as the agent moving through
  files / the codebase, professional rather than game-like (the brand bans
  game-like core surfaces; see [`mori-brand-identity-reference.md`](mori-brand-identity-reference.md)).

**Open questions.** What the elemental unit of a conversation-as-timeline should
be (turn? message? action?). How much motion is professional vs distracting. The
right "new" visualization metaphor, and whether it replaces or sits beside the
timeline. Related: [`mori-timeline-view-strategy.md`](mori-timeline-view-strategy.md),
[`timeline-flow-improvement-plan.md`](timeline-flow-improvement-plan.md),
[`reconstruction-lab-vision.md`](reconstruction-lab-vision.md),
[`visual-system-direction.md`](visual-system-direction.md).

## 4. Local LLM harness robustness

**Intent.** Analysis will likely lean on a local LLM (Ollama) or a rule base.
Output quality should not swing wildly with model strength: the harness must be
strong, well tuned, structured to keep getting smarter, and improvable through
user customization.

**Current state.** A three-tier provider exists: a deterministic rule-based
provider (always available), Ollama, and an OpenAI-compatible endpoint, with a
capability check that grades whether an engine returns Mori-shaped JSON. The
harness validates shape, not yet robustness across weak models. See
[`quick-pass-analysis.md`](../quick-pass-analysis.md),
[`local-llm-understanding-and-live-follow.md`](local-llm-understanding-and-live-follow.md).

**Direction.** Decompose extraction into small, checkable steps (per file, per
decision) rather than one large JSON ask; let the rule base do a confident first
pass and use the LLM to enrich, not to originate; make the harness easier to
tune now that structured provenance (Section 2) gives it cleaner inputs; expose
user-tunable prompts / presets. *Structured inputs are a precondition; this is
why file provenance leads.*

**Open questions.** Where rule-base ends and LLM begins per extraction type. How
to measure "is the harness getting smarter" without brittle tests. How far user
customization should reach (prompts, weights, vocabularies).

## 5. Durability, sharing, and the knowledge asset

**Intent.** Move beyond a single device. Back up, share to another machine, and
work per account; eventually share and collaborate on AI work with other users,
with later community expansion kept in mind but not built now. The aim is to turn
ephemeral AI work into durable history and knowledge, a personal or company
asset showing how AI is actually used across a team. Borrow from Obsidian's
wiki-like, text-first knowledge management as a reference while keeping Mori's
own differentiation.

**Current state.** Local-first only. `.mori v0` zip export / import round-trips
(including accepted memory + audit trail). Account, sync, and backup are
placeholders ("계정과 동기화는 예정입니다"). See
[`team-shared-memory.md`](../team-shared-memory.md),
[`memory-as-a-service.md`](memory-as-a-service.md),
[`mori-package-v0.md`](../mori-package-v0.md).

**Direction.** Keep local-first as the default and trust anchor; treat sync as
an explicit, opt-in layer over the existing `.mori` package, not a cloud
dependency. Differentiation vs Obsidian: structured, evidence-linked,
provenance-carrying records of *AI work*, not free-form notes.

**Open questions.** Backup target and cadence. The account / identity model
without breaking local-first. The team privacy boundary (client-safe filtering
already specified). How far toward community to design now vs defer.

## 6. Integrated agent environment, and staying differentiated

**Intent.** Connect Claude / Codex and provide such a well-built integrated
environment that the user can send requests from inside Mori, CLI-like. And: if
the agent vendors themselves ship work-history surfaces, keep asking what Mori
can still do that they will not.

**Current state.** Capture / continue is explicit; Mori never starts or drives
the agent. A `mori` CLI scaffold wraps `claude` / `codex` to emit connector
JSONL. There is no in-app "send a request to the agent" surface, by design
today.

**Direction / open questions.** Whether and how to offer an in-app request lane
without becoming an autonomous driver (the non-goal). The durable
differentiator is cross-agent, evidence-linked memory and provenance that a
single vendor's history view will not span. Related:
[`anchor-agents.md`](../anchor-agents.md),
[`mori-connector-capture-flow-reference.md`](mori-connector-capture-flow-reference.md).

## 7. Background proactive intelligence

**Intent.** Once a local LLM is attached, the accumulated knowledge should keep
working for the user in the background: analyze relations across projects,
surface things it found, auto-look-up terminology that came up in agent work,
report in real time what the agent is doing now, judge and warn on risky work,
and turn how the agent worked into an asset. A centralized, ever-smarter store
of one's AI work.

**Current state.** A Companion layer derives evidence-based signals from already
reviewed data; an in-app Notification Center composes them. All foreground and
on-demand; no background process. See
[`live-project-intelligence.md`](../live-project-intelligence.md).

**Direction.** This lives squarely inside the Surveillance line "B" rail
(reading explicitly connected logs while the app runs, review before durable),
never "A" invasive capture. Proactive signals must stay evidence-linked,
review-gated, and transparent. See the Surveillance line A-vs-B note in
[`mori-project-goal.md`](../mori-project-goal.md) §6.

**Open questions.** Which background signals are genuinely useful vs noise. How
to do risk judgment without false alarms. Where "B" background reading is worth
the always-visible "watching" cost vs staying foreground-only.

## 8. Notifications

**Intent.** Notifications are an area to deepen: OS-native (Windows / macOS) plus
possibly other channels, and a more developed in-app notification surface.

**Current state.** In-app Notification Center shipped (sidebar bell + 알림 page,
honest unread count, five producers). OS-native notifications are absent (no
Tauri notification call exists).

**Direction.** Add OS-native delivery for the few signals that deserve to
interrupt (work finished, risky action), keep the in-app feed calm and never a
toast storm (brand: "never push toasts competing for attention"). Tie the
"working now" / "finished" signals to Live Follow and Section 7.

---

## Sequencing

The themes depend on each other; the spine is data first.

1. **File and change provenance (Section 2)** is the foundation. Visualization
   (3), the LLM harness (4), risk signals (7), and OS notifications (8) are all
   starved without it.
2. Then **visualization** consumes provenance on the timeline card.
3. Then **harness robustness** tunes against structured inputs.
4. **Durability / sharing (5)**, **integrated environment (6)**, and deeper
   **background intelligence (7)** follow, each its own opt-in layer.

### File-provenance milestone status

- **Shipped, validated, user-visible:**
  - `ClaudeFileTouch` + `fileTouches` on the Claude Code reader
    (`src-tauri/src/claude/code.rs`), mirrored in `src/lib/claude/types.ts`.
  - Source-agnostic `FileTouch` on `SourceRef` (`src/domain/types.ts`), carried
    through import (`src/lib/claude/claudeImport.ts`).
  - Pure rollup + filesystem reconciliation + common-ancestor helpers
    (`src/lib/file-provenance/fileProvenance.ts`).
  - Tauri `resolve_file_locations` (present / moved / missing, move detected by
    a bounded basename search) and `reveal_path_in_os` (`src-tauri/src/files.rs`),
    bridged in `src/lib/file-provenance/fileProvenanceBridge.ts`.
  - Per-file **line counts**: each `tool_use` is correlated with its
    `toolUseResult.structuredPatch` (matched by `tool_use_id`) to count exact
    added / removed lines (`additions` / `deletions` on `FileTouch`), summed per
    file and shown as `+N / -M`.
  - The **"이 세션이 만진 파일" panel** in Session 개요
    (`src/features/session/SessionFilesPanel.tsx`): changed files first, per-file
    edit / write / read counts, `+N / -M` line deltas, 이동됨 / 사라짐 badges,
    and a reveal-in-OS action.
  - cargo + full Vitest suite + production build green; extraction verified
    against a real session (115 touches → 32 files; 22 changed files, +977 / -202
    lines). The panel is desktop + real-data gated (it reads
    `SourceRef.fileTouches`, populated only by the Rust agent read), so it
    renders nothing in the browser prototype / demo.
- **Next:** timeline card action glyphs (this is where provenance feeds the
  visualization, §3) — needs per-turn touch attribution first; a diff peek
  (view the actual hunk lines, already captured in the result); persisting
  `fileTouches` so browser-saved sessions keep the panel after reload (today it
  is live-read on desktop).
