# Mori Development Continuity Guide

> **When to read this:** on onboarding or handoff, when you need the judgment
> context behind Mori, not on every turn. It is deliberately **not** in
> CLAUDE.md's mandatory read list, so it does not cost tokens each session. Its
> sharpest value is cross-machine: the auto-memory lives on one machine, but
> this doc is version-controlled and travels with the repo, so it carries the
> product direction and judgment flow where local memory does not. On a machine
> where memory is intact it overlaps with CLAUDE.md and the memory notes, so
> skim, do not re-read in full.
>
> **This is context, not a checklist.** Its purpose is not "do only what is
> written here." Its purpose is to let you understand *how to keep judging*, not
> *what to be told to do*. The examples and candidate tasks below explain the
> direction taken so far, they do not constrain you. If you see a better
> direction, prefer product completeness over this document, and leave a short
> note explaining why you judged that way.

Related canonical docs (do not duplicate them, build on them):
- [`mori-project-goal.md`](mori-project-goal.md): what Mori is, implemented vs planned.
- [`product-flow.md`](product-flow.md): the canonical product loop and its typed model.
- [`frontend-architecture.md`](frontend-architecture.md): CSS layering and migration rules.
- [`commit-format.md`](commit-format.md): the authoritative commit spec.
- [`../CLAUDE.md`](../CLAUDE.md): the non-negotiable project rules (commit format, no em dash, UI/UX conventions, do-not list).

---

## 1. Mori's product identity

Mori is a **local-first AI work memory app** for **evidence-based session
reconstruction and continuation**. A *session* is one AI conversation (the
spine) plus its evidence (the ribs: git changes, files, notes, terminal,
imported transcripts).

Mori is **not** a log viewer and **not** a chat client. It reconstructs what
happened in a piece of AI-assisted work from real evidence, shows the flow,
extracts the issues and decisions, keeps the grounds for each, surfaces what is
unresolved, proposes next actions, produces a shareable report, and hands a
resume prompt to the next session.

Two principles hold everywhere:
- **Evidence is the source of truth. AI output is a reviewable proposal.** The
  timeline events are deterministic parses of real data. Analysis (issues,
  decisions, next actions) is a proposal layer the user reviews and confirms;
  confirmation is what carries forward into project memory.
- **Local-first and privacy-respecting.** Mori reads explicitly-connected
  agent logs and user-imported material. It does not do invasive capture
  (camera, screen, keylog, scanning unconnected apps). The real line is three
  rails: scope, review-gate, transparency. See the memory note on the
  surveillance line for the precise A-vs-B distinction.

---

## 2. Core value and the questions a user must be able to answer

When a user opens a session in Mori, these are the questions the product exists
to answer. Every screen should move at least one of them forward:

1. **What was this session about, and where did I leave off?** (context
   restoration on reopen, the single highest priority)
2. **How did the work actually progress?** (flow)
3. **What issues and decisions came out of it, and can I trust them?**
   (extraction with grounds)
4. **What is still unresolved, and what should I do next?** (forward motion)
5. **Can I hand this off?** (a real report)
6. **Can I continue this work in a new AI session?** (resume / 이어가기)

If a change does not help answer one of these, question whether it belongs.

---

## 3. Current product flow

The session workspace is a set of tabs. Korean labels are the canonical UI
vocabulary:

```
개요 (Overview)  →  활동 (Activity / 흐름)  →  자료 (Evidence)  →  검토 (Review)  →  공유 (Share)
```

- **개요 (Overview)**: at-a-glance orientation: a one-line work summary, the
  work-shape bar, the reopen anchor ("마지막으로 진행한 작업"), scale metrics,
  touched files, and items needing attention. No outputs here.
- **활동 (Activity)**: three reading modes of the same events:
  - **원본 (stream)**: the honest raw conversation, tool runs folded, requests
    segmented (`is-request`).
  - **타임라인 (swimlane)**: the time-axis activity map (absolutely positioned).
  - **AI 흐름 (workflow)**: the AI's reading of HOW work progressed, as
    decision-led, time-grounded phases. This is the default reading mode.
- **자료 (Evidence)**: the evidence hub: a composition band, source rows
  promoted to evidence cards (trust + what each source contributed), and a path
  into 검토.
- **검토 (Review)**: one calm Kanban of 이슈 / 결정 / 다음 액션, each card
  opening a context inspector that carries the correction actions.
- **공유 (Share)**: the handoff surface: 이어가기 (resume prompt) first, then
  the report builder (document-styled preview), then the `.mori` package export.

The deeper loop (capture, normalize, store, review, extract, summarize, report,
project memory, next session) is documented in [`product-flow.md`](product-flow.md).

---

## 4. Major product judgments made so far

These are the standing judgments that shape the surface. They come from
repeated, direct user feedback. Treat them as direction, not as immutable law.

- **Copy-diet.** Keep on-screen prose minimal. Move "why / how" into an
  `InfoHint` tooltip the user reveals on hover, not always-visible paragraphs or
  inline note boxes.
- **No AI-cliche accents.** Never mark a selected card / row / tab with a
  left-border bar. Use a calm tint or a full border. Brand purple is identity
  and accent only; status colours stay semantic.
- **Retire, do not delete.** When a surface stops being used, unwire it from
  navigation but keep the code reachable. Only delete provably dead code.
- **No internal vocabulary on user surfaces.** Hide trust levels, raw-retention,
  confidence percentages from cards. Do not rename trust into action-language.
- **Lead with what works now.** Fold planned / secondary items behind a
  `<details>` disclosure, never as peer cards competing with the actionable ones.
- **The right panel is a Context Inspector**, not a second workspace. The main
  canvas must stand alone. All inspectors share `BaseInspectorPanel` + the
  `ins-*` kit.
- **Empty states must be honest.** "Not analyzed yet" must read differently from
  "analyzed, found nothing." Do not paper over an empty surface with one generic
  placeholder.
- **Korean-first UI copy.** Relative time reads "3시간 전". The product-state
  vocabulary is the one deliberate exception.
- **Capture scope is global.** Mori aims to capture all Claude/AI work across
  every project, not one repo.

---

## 5. How recent work was judged (snapshot, not a changelog)

> **This is a point-in-time snapshot to illustrate the *judgment style*, not a
> maintained log.** `git log` is the authoritative history. Do not grow this
> into a changelog; when it goes stale, prune it back to the durable thread
> below. Read it for the *pattern* (each change framed by what it did for the
> flow), not for an accurate list of the latest commits.

**The durable thread:** connect 자료 → 분석 → 검토 → 공유 → 이어가기 into one
evidence-based flow, and make every surface honest about its state. Recent work
followed two moves that are worth repeating:

- **Each surface should earn its place in the flow.** Example framing: source
  rows were promoted to evidence cards so 자료 reads as an evidence hub (trust +
  what each source contributed), not a bare list; the resume prompt was raised
  to a first-class 이어가기 action so the core "continue in a new session" value
  is a direct action, not a buried report section.
- **Empty and overflow states must be honest.** Example framing: the
  not-yet-analyzed board was separated from an "analyzed, found nothing" board;
  the default 활동 view got a real empty state instead of a blank div; dead
  "+N건 더" truncation was replaced with real disclosures so nothing is hidden
  behind an unreachable label.

When you finish a meaningful unit, you may replace the examples above with a
fresher one in the same "what it did for the flow" style. Keep it to a couple of
lines, not a running list.

---

## 6. The quality bar that matters most right now

The user holds a high bar for a **calm, dense, finished surface**. In priority
order, the things that most affect whether Mori feels like a finished product:

1. Context restoration on reopen (개요).
2. The 증거 → 분석 → 검토 → 공유 flow actually connecting.
3. 자료 acting as a real evidence hub.
4. 활동 explaining the session flow.
5. 검토 showing issues / decisions / next actions with trust.
6. 공유 looking like a real report.
7. Stable height / spacing / scroll / panels.
8. Clear data provenance.
9. Honest empty / error / overflow states.
10. Typecheck / build / lint / style stability.

Then: UX polish, microcopy, badge removal, information architecture, docs,
component structure, performance. Deferred for now: heavy analytics, complex
charts, collaboration / team, billing, public launch, mobile, excessive
settings, decorative UI.

---

## 7. Per-screen judgment criteria

Use these as the lens when touching each screen. They are how to judge, not a
list of tasks.

- **개요**: orientation only, no outputs. Does it answer "what is this, where did
  I leave off, what needs attention" in one glance? Do not duplicate the other
  tabs; link into them.
- **활동**: the three reading modes serve different readers. 원본 = what happened
  (works without analysis). 타임라인 = the time map. AI 흐름 = how it progressed
  (needs analysis). Each must have an honest empty state.
- **자료**: every source should read as evidence that fed the analysis, with its
  trust and contribution visible. Provenance must be clear.
- **검토**: one calm Kanban. AI output is a proposal to review, not a verdict.
  The inspector carries the correction actions. Confirming is what matters.
- **공유**: two distinct outputs. 이어가기 (resume prompt, for a new AI session)
  leads. The report and `.mori` export (for humans / archive) follow. Keep it
  clean; this surface drew "looks messy" feedback before.

---

## 8. Directions to keep improving (opportunities, not requirements)

These are open and valuable. They are **not** a backlog you must clear, and not
a limit on what else you may do.

- Tighten the connective tissue across 자료 → 검토 → 공유 → 이어가기 without
  adding navigation chrome the user dislikes.
- Continue the empty / loading / error / overflow consistency pass across any
  surface that still papers over its state.
- Improve microcopy toward the copy-diet and Korean-first conventions.
- Strengthen provenance: make it always obvious where a piece of data came from
  and how it was captured.
- Improve analysis *trust* presentation (issues / decisions reading as grounded
  proposals) without surfacing internal vocabulary.
- Watch for layout / height / scroll regressions; the height chain has been
  fragile before.

If a better opportunity appears that is not listed here, take it, and leave a
short note on why.

---

## 9. Risky work to approach carefully (with the reasoning so far)

These are **not** "do not touch." They are "set a verification strategy before
you change them." The standing analysis is also kept in the memory note
`project_deferred_risky_work`.

> Snapshot caveat: the specific items below are current as of this writing. If
> one gets done (for example the gantt ships), remove it; if a new risky area
> appears, add it with the same "why it is risky + how to verify" shape. The
> durable point is the *general rule* at the end of this section, not the list.

- **Timeline swimlane request gantt** (요청 단위 간트). Important and repeatedly
  requested, but the swimlane is absolutely positioned and a request band needs
  changing the layout *model* (`laneOffsetPx`, lane `top`, `frameHeight` in
  `src/lib/timeline/layout.ts` and `timelineViewModel.ts`). Changing absolute
  coordinates without a browser to verify them risks breaking the whole
  timeline. Note that request-level flow is **already served** by the 원본
  stream (request dividers) and the AI 흐름 phases, so only the swimlane variant
  is missing, and it is the risky one. Approach: get visual verification first,
  or derive the band as a pure, testable function before touching render.
- **Rule-based nextAction duplicating issues.** In
  `deterministicQuickPassProvider.ts`, next actions are built 1:1 from
  unresolved issues, so 다음 액션 cards echo 이슈 cards. This echo is *inherent*
  to rule-based extraction (the action is about that issue); the LLM path
  already produces distinct actions, and the provider notes this and steers
  users to the local LLM. Changing extraction risks the `analysis.test.ts`
  invariants and real-data behavior. Approach: validate against real tool-heavy
  JSONL before reworking the logic.

General rule learned the hard way: **build-green is not correct.** The real bugs
in this product surface have been caught by a real-data visual check, not by the
compiler. When you cannot verify visually, prefer lower-regression-risk changes
and say so.

---

## 10. Validation and commit principles

Before committing code changes (see [`../CLAUDE.md`](../CLAUDE.md) for the
authoritative version):

- `npm run check:full`
- `npm run build`
- `git diff --check`
- `git status --short`
- If `src-tauri/` changed, also `cargo check` and `cargo test` there.

Known environment caveat: the `localCaptureGeneratedSmoke` and
`moriCliGeneratedSmoke` tests spawn external `python3` / `mori` CLIs and fail
with `ENOENT` on machines without them. That is an environment gap, not a
regression; the rest of the suite should be green.

Commit hygiene:
- Follow [`commit-format.md`](commit-format.md) exactly: `<type>: <imperative
  lower-case summary>`, blank line, then a bullet-only body. Types: `feat`,
  `fix`, `refactor`, `test`, `docs`, `chore`. No scope.
- Commit per validated unit of work. Do not batch unrelated changes.
- No emoji, no AI footer, no `Co-Authored-By`, no "Generated with" lines.
- **Never use the em dash `—`** anywhere (UI, code, docs, commits). Use `,` or
  `·`, or split the sentence.
- The autonomous loop may move `HEAD` mid-session; stage only your own files by
  name.
- **Do not push.** The user pushes manually.

---

## 11. Reading order when starting work

1. [`../CLAUDE.md`](../CLAUDE.md): the non-negotiable rules.
2. This document: the judgment model and current context.
3. [`mori-project-goal.md`](mori-project-goal.md): product direction, what is
   implemented vs planned.
4. [`product-flow.md`](product-flow.md): the canonical loop and typed model.
5. [`frontend-architecture.md`](frontend-architecture.md) before any CSS change.
6. The auto-memory index `MEMORY.md` (outside the repo), then the relevant
   `project_*` / `feedback_*` notes for the area you are touching.
7. The current code and `git log` for the surface you are about to change.

Then decide the next most valuable work from the *current* state of the product,
not from a fixed list.

---

## 12. How to use this document

- Read it for **context and judgment criteria**, not for a task list.
- The examples and candidate work here describe the direction taken so far. They
  are references, not constraints.
- When you complete a meaningful unit, consider adding a short line to section 5
  (what changed and why, in flow terms) so the thread stays continuous.
- When you judge a risky item is ready to approach, update section 9 with the
  verification strategy you used.
- Keep this document honest and short. If it starts reading like a frozen
  checklist, prune it back toward "how to keep judging."

---

> This document does not exist to constrain Mori's development. It exists to
> carry the product direction and the flow of judgment forward. A new LLM or a
> new session should use it as context, and is free to make a better judgment
> based on product completeness and the current state of the code. If you do,
> leave a short note on why.
