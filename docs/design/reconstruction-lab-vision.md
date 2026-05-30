# 재구성 Reconstruction Lab · Vision and Power-Up Plan

Forward-looking design note for the 재구성 (reconstruction) surface inside a
session. It is a planning document, not an implementation spec. It records an
honest read of what the lab is today, where it falls short of the product
thesis, and a prioritized set of genuinely powerful, low-coupling, visually
strong features to build next. It draws on the product goal, the brand and
frontend rules, the domain model, and external reference research into
information-visualization techniques and how leading tools present causal,
temporal, and reasoning structures.

Companion reading: [`mori-project-goal.md`](../mori-project-goal.md),
[`mori-brand-identity-reference.md`](mori-brand-identity-reference.md),
[`../frontend-architecture.md`](../frontend-architecture.md),
[`../domain-model.md`](../domain-model.md),
[`mori-timeline-view-strategy.md`](mori-timeline-view-strategy.md).

---

## 1. What 재구성 is for

Mori's durable unit of value is "a reviewed, source-linked understanding of what
happened, why it mattered, what evidence supports it, what was decided, what
remains unresolved, and what to carry into the next session." The 흐름 swimlane
answers "what happened, by category, on a clock." It is a dense scan-and-edit
surface. 재구성 answers the harder question the user kept hitting: "I can't
follow the *flow* from the raw view."

So the two timelines have distinct jobs, and the line between them is
load-bearing:

- **흐름** = the clock-accurate scan and edit surface. Lanes, the Trace panel,
  the Event Inspector, per-event editing. Ground truth.
- **재구성** = the readable, reasoned reconstruction. It never edits; it
  *reprojects* the reviewed session into shapes the eye can read.

Keeping that line clean is also what keeps 재구성 low-coupling. Every lens today
is a pure function `build*(view: MockSession)` into a visual. Nothing reaches
outside the session it was handed. That pattern is the single most important
constraint to preserve: **a new feature is "safe" when it derives from the
session already in hand and renders something visual, and does not wire into
other surfaces.**

---

## 2. The lab today (honest gap analysis)

The lab currently has five lenses, a cross-lens filter (shared search + a kind
filter popover matching 흐름), and a 맥동→서사 drill-down. Several of the
power-ups below have since shipped; the bullets reflect the current state:

- **서사** (`NarrativeStoryView`) · a vertical story spine. Pivotal moments lead
  as full cards with the causal reason threaded between them; routine runs fold
  behind a quiet disclosure. Closes with an 이어가기 block.
- **국면** (`PhaseFlowView`) · the work arc read as time-ordered chapters (a
  stage may recur), each weighted by moment count and labeled with its clock
  range, with a grouped fallback when timestamps are missing.
- **인과** (`CausalMapView`) · a layered cause→effect DAG with hover/pin chain
  tracing, the causal backbone (longest chain), roots and outcomes, typed and
  confidence-weighted edges, contradiction-as-tension, and a 핵심 경로 toggle.
- **맥동** (`PulseView`) · a vital-signs dashboard: counts, phase mix, trust
  mix, issue resolution, activity momentum, carry-forward with resume copy.
- **계보** (`DecisionLineageView`) · the decisions as ADR-style cards: rationale,
  rejected alternatives, impact, motivations and consequences, and a 예상 vs 실제
  block when a stated impact and real downstream both exist.

What is genuinely strong: the pure-derivation architecture, the trust-tone
contract, the cross-lens filter, and the fact that 맥동 already answers "what
kind of session was this" at a glance. The gaps below are about reaching higher,
not fixing breakage.

### 2.1 The lenses are siloed projections, not one instrument

Switching lens today feels like switching app, not changing camera angle. A
decision you found in 서사 is lost when you move to 인과. There is no shared
"what am I looking at" that survives a lens switch. The reference research is
blunt about this: the strongest products (Sentry breadcrumbs ↔ Replay, Datadog
waterfall ↔ flame ↔ map) are *one object model re-projected into different
geometries*, with a decision/issue/artifact looking identical in every view.

### 2.2 국면 is not actually temporal

`buildPhases` buckets moments by *kind* (every decision lands in 결정, every
code event in 구현), so 국면 is really 맥동's phase distribution redrawn as
columns. It cannot show the real arc over time, and it cannot show revisits
(explore → build → back to explore → verify). The cheapest legibility win in the
whole reference set is "time on a shared axis," which 국면 currently throws away.

### 2.3 인과 flattens the relationship vocabulary

The domain model has ten typed relationships (`caused`, `ledTo`,
`contradicted`, `resolvedIssue`, `influencedDecision`, `producedArtifact`,
`supported`, ...), each carrying a `reason` and a `confidence`. The map renders
them all as the same curved arrow. `contradicted` is a *tension* in the work and
should never look like `caused`. Edge type, confidence, and trust are exactly
the "operational context" that separates a legible causal map from a hairball.

### 2.4 The reconstruction underuses the richest data Mori owns

The lab reads titles and summaries but ignores fields that are the entire point
of a memory product:

- `Decision.rejectedOptions`, `Decision.decision` (distinct from title),
  `Decision.impact`, `Decision.confirmed`. The most valuable part of a decision,
  per every ADR reference, is the alternatives considered and the consequences.
  None of it surfaces.
- `Issue.suggestedNextAction`, `Issue.status` lifecycle, `Issue.priority`,
  `Issue.relatedDecisionIds`. There is no view of an issue's journey from
  appearance to resolution.
- `event.confidence` and per-relationship `confidence` and `trustLevel`. The
  reconstruction could show *how grounded* each claim is; instead trust is a
  single chip tone in 서사 only.
- `artifacts` barely appear outside the causal map. "What did this session
  produce" has no home.

### 2.5 No way to read at scale, and no way out to the source

서사 is a flat list: a 6-moment session and a 600-moment session render the
same way, with no minimap, no folding of routine runs, no importance-driven
emphasis. And the reconstruction is sealed: there is no path from a reconstructed
moment back to the evidence behind it. The latter is real, but the fix must
respect the 흐름/재구성 line (see §6, deliberately a low priority).

---

## 3. Design principles for the lab

Distilled from the brand rules, the frontend rules, and the reference research.
These govern every feature below.

1. **One vocabulary, five (or six) lenses.** A decision, an issue, an artifact,
   a moment must look and read identically in every lens. The lens-switcher
   changes the *camera angle* on one shared session model, never the language.

2. **Focused and local by default; global on intent.** Never lead with the
   whole graph (the Obsidian "beautiful and useless hairball" warning). Lead
   with the headline beats (서사), the dominant phase (국면), a focused subject
   and its neighbors (인과), the few big numbers (맥동). Breadth lives behind
   expand controls and disclosures.

3. **Time on a shared axis is the cheapest legibility win.** Use a real time
   spine wherever the data is temporal (foremost in 국면).

4. **Typed, weighted edges and items, never equal ones.** Encode relationship
   *type*, *confidence*, and *trust* visually. Equal-weight everything is what
   makes a causal view unreadable.

5. **Encode importance and uncertainty with weight, opacity, and border style
   before reaching for color.** This is both calmer and mandatory here: color is
   already spoken for. Purple is brand-only; trust is green/blue/purple; work
   items are red/blue/green. A new signal must use weight/opacity/dash, not a
   new hue (brand rule §6).

6. **Calm is subtraction plus one disciplined accent, not flatness.** Dim the
   chrome (lens-switcher, toolbar); let the active lens carry full contrast. One
   warm neutral, one capped accent, semantic status color. Avoid over-flattening
   into "unfinished gray."

7. **Overview → zoom/filter → details-on-demand.** Detail lives in `InfoHint`
   tooltips and disclosures, never in always-on prose (copy-diet rule). The lab
   should explain itself by *shape*, not paragraphs.

8. **No game-like register.** No confetti, streaks, badges, "top 1%," animated
   reveals, or decorative glows. This includes the tempting "glowing critical
   path": use stroke weight and opacity, not a purple halo.

---

## 4. The plan · powerful, low-coupling features

Organized as: a cross-cutting foundation, then per-lens power-ups, then the new
계보 capability, then the visual system. Each item names the pure helper it
needs, the domain data it finally exploits, and a calm visual treatment. Every
item stays inside the `build*(view)` → visual pattern.

### 4.0 Foundation · one shared session model and vocabulary

Before piling features on, lift the shared language the lenses already imply
into one place:

- A single `momentKind`/icon/tone vocabulary (already mostly in `narrative.ts`)
  used by every lens, so a decision is the same glyph + tone in 서사, 인과,
  국면, 계보.
- A shared, optional **focused subject** (an event/decision/issue id) held by
  `TimelineLabView` and passed to every lens. Selecting a subject in one lens
  and switching lens keeps it focused: 서사 scrolls to it, 인과 centers and
  traces it, 국면 marks its phase, 맥동 points at its bucket, 계보 opens its
  card. This is the connective tissue that turns four toys into one instrument
  (principle 1). It is pure local state in the lab, so it stays low-coupling.
  *(This was floated earlier and deferred; the research makes a strong enough
  case that it is worth reconsidering as the backbone of everything else.)*

### 4.1 인과 · the causal map becomes a real causal instrument · SHIPPED

Highest visual payoff, and it finally uses the relationship vocabulary.
Implemented; see [`causal-critical-path-spec.md`](causal-critical-path-spec.md)
for the as-built design.

- **핵심 경로 (critical path / backbone).** Compute the longest cause→effect
  chain from a root cause to an outcome (linear-time longest-path over the
  topological order already implied by `layer`). Render it as the visual spine:
  heavier 1.5–2px stroke and full-opacity nodes on the path, everything else
  quieter. Use weight, not a halo, and not alarm red (this is a "main thread,"
  not an error). New pure helper output on `buildCausalGraph`:
  `criticalPath: string[]`.
- **출발점·결과 (roots and outcomes).** Mark in-degree-0 nodes as origins and
  out-degree-0 nodes as outcomes with one calm glyph (a left cap, or filled vs
  hollow node), so "where did this start, what did it produce" reads instantly.
- **Typed, weighted edges.** Distinguish relationship types: `contradicted`
  rendered as a tension (a distinct dashed/colored-by-semantics stroke),
  `resolvedIssue`/`producedArtifact` quietly different from plain `caused`.
  Encode `confidence` as stroke weight and `inferred` trust as a dashed edge.
- **Layout quality.** Keep the layered (Sugiyama-style) layout, add barycenter
  crossing reduction so layers order by the average position of their neighbors.
  Stable, deterministic, no physics jitter.

### 4.2 국면 · re-found on a real time axis · SHIPPED

Turn the kind-buckets into the cheapest legibility win available.

- **Proportional time spine (waterfall, de-profiler-ized).** Replace the
  kind-grouped columns with phase bands laid along a real wall-clock axis, each
  band sized by its time span (or event-count weight). The longest band is the
  visual hotspot: where the session actually spent itself. Detect phase
  boundaries from the *sequence* of moments over time, so revisits show as
  multiple bands, not one merged bucket. Pure helper `buildPhaseTimeline(view)`
  with an honest fallback to the current kind-grouping when timestamps are
  missing.
- **Expand on intent.** A band expands to reveal its moments as nested rows;
  collapsed by default. No thermal coloring, no sub-second precision.

### 4.3 서사 · readable at any scale

The original pain was "follow the flow." Make the story read like a story.

- **중요도 3-tier emphasis.** Score each moment (decision made, issue opened,
  artifact produced, verified outcome) into pivotal / notable / routine, encoded
  with type size and weight, not color. Pivotal moments are full cards; routine
  moments are one muted line.
- **Routine folding.** Collapse consecutive routine runs into one disclosure
  ("작업 12개 더 ▶"), reusing the `<details>` convention. Pivotal moments never
  fold.
- **미니맵 / scroll rail.** A slim right-edge column of kind-colored ticks
  (length = importance), faint phase bands, and a draggable viewport box; click
  to jump. Monochrome, calm, no thumbnails.
- **Sticky focus+context.** The current phase header stays `position: sticky`
  while its moments scroll under it; the focused moment is gently emphasized.
  Single input (scroll), via `IntersectionObserver`.

### 4.4 맥동 · the calm "how did this session go" verdict

It is already the best lens. Two restrained additions:

- **One directional health/trust meter** (a single low-chroma bar: grounded vs
  inferred, or resolved vs open), borrowed from the "consensus meter" idea, as
  the at-a-glance verdict above the stat tiles. De-gamified: no streaks, no
  badges.
- **Confidence-aware stats.** Where a number is itself uncertain (mostly
  inferred), suppress its emphasis (toward neutral) rather than showing a bold
  figure that overclaims. Keep the precise value in the tooltip.

### 4.5 계보 · decision lineage (the one new lens) · SHIPPED

The most on-thesis capability, and the one that finally uses
`rejectedOptions` / `impact` / `confirmed`. A fifth lens, labeled **계보**.

- **ADR/IBIS-compact decision cards.** Each key decision as a scannable card:
  the question/context (one line), the decision, the chosen path marked, the
  **rejected alternatives** (muted, with a quiet 기각 tag), and the consequences
  (`impact`, one line each). Status as a calm dot (confirmed / proposed /
  superseded). New pure helper `buildDecisionLineage(view)` over `decisions` +
  `relationships`.
- **Lineage chain.** Where `relationships` record supersession/influence between
  decisions, render a simple left→right chain (A → refined by B), not a graph.
- **Motivation and consequence links.** Show what motivated each decision
  (linked issues/events via `relatedIssueIds`/`sourceEventIds`) and what it led
  to (downstream events/artifacts). Selecting a card focuses that subject across
  the other lenses (§4.0).
- **Predicted vs actual (uniquely Mori).** Because the lab owns the whole
  session history, a quiet slot can compare a decision's stated `impact` against
  what later events actually show. A genuinely differentiating, on-thesis touch.

### 4.6 Visual system · make five lenses feel like one instrument

Pure presentation, no logic, lowest coupling.

- **Shell discipline.** Dim the lens-switcher and toolbar; let the active lens
  carry full contrast. Cap purple to identity only; keep trust/issue color
  semantic and low-chroma.
- **Shared gestalt header.** One quiet line above all lenses (from
  `summary.sessionSummary`) so the user always has the session's one-sentence
  identity, regardless of lens.
- **Cross-fade on lens switch.** A 120ms opacity transition so switching reads
  as "changing angle," not "reloading."
- **Unified trust encoding.** Verified = solid border/full opacity, observed =
  lighter, inferred = dashed, applied identically to 서사 cards, 인과 nodes and
  edges, and 계보 cards. One system, every lens.
- **Calmer sparse/empty states.** Lavender icon chip, one calm line (brand
  rule), never a hard sell.

---

## 5. My independent take · "one instrument, five projections"

If I were designing 재구성 fresh, the organizing idea would not be "four
separate visualizations plus a dashboard." It would be **one session model, one
object vocabulary, one focused subject, re-projected through five cameras.**

- The session is a graph of typed objects (events, decisions, issues, artifacts)
  linked by typed relationships. Each lens is a *projection*: 서사 projects onto
  a time-ordered spine, 국면 onto a phase-banded time axis, 인과 onto causal
  depth, 계보 onto the decision sub-graph, 맥동 onto aggregate statistics.
- A single **focused subject** is the through-line. The lens-switcher then feels
  like orbiting one thing to see it from another side, which is exactly the
  Sentry/Datadog lesson (same spans, re-projected).
- Everything reads by *shape and weight*, not prose. The lab's job is to make a
  long session legible in seconds and trustworthy on inspection. Detail is
  always one hover away, never on the page by default.

Concretely, that reframes the four power-ups above from "improvements to four
views" into "one connective spine (§4.0) plus four cameras tuned to it." It is
the difference between a toolbox and an instrument.

Two honest cautions on my own enthusiasm:

- The shared-focused-subject (§4.0) adds internal coordination between lenses.
  It is still pure lab-local state (low external coupling), but it is the one
  item here that touches all lenses at once, so it should be built deliberately
  and tested, not bolted on.
- 계보's "predicted vs actual" is the most exciting idea and the fuzziest. It
  must degrade honestly: if the evidence to compare is not there, the slot
  simply does not render. No invented verdicts.

---

## 6. Deliberately low priority (and why)

- **Navigate from a reconstructed moment out to the 흐름 Event Inspector.** The
  store already supports it (`setSelectedEventId` + `setSessionTab("flow")`).
  But it couples the lab to the swimlane and risks turning 재구성 into a launcher
  for 흐름, smudging the line in §1. If built, prefer surfacing evidence *inside*
  the lab (a peek drawer) over jumping out. Park it until the in-lab lenses are
  excellent on their own.
- **Cross-session reconstruction.** Powerful, but it is Project Memory's job, not
  the single-session lab's. Out of scope here.
- **Edge bundling and value-suppressing uncertainty palettes.** Real techniques,
  but only worth it once data density demands them. The focus + critical-path +
  typed-edge work solves clutter perceptually first.

---

## 7. Suggested sequencing

Cheapest-and-most-visual first, the connective spine and the new lens once the
ground is solid, polish last so it harmonizes a finished set. Each ships as its
own validated, tested, committed increment (no big-bang).

1. **인과 핵심 경로 + roots/outcomes + typed/weighted edges.** Biggest visual
   payoff, pure algorithm, low risk.
2. **서사 미니맵 + 중요도 접기 + sticky focus.** Biggest usability win; answers
   the original pain directly.
3. **국면 real time spine.** Recovers the cheapest legibility win; medium risk
   (heuristic boundaries), guarded by tests and an honest fallback.
4. **계보 decision lineage (new lens).** The most on-thesis capability; larger
   build.
5. **§4.0 shared focused subject + §4.6 visual system.** Connective spine and
   harmonizing polish, done last so they tie the finished set together.
6. **맥동 health meter + confidence-aware stats.** Small, restrained, anytime.

A note on ordering: §4.0 (the shared subject) is sequenced late so each lens is
independently excellent first, but it is the conceptual center (§5). If we commit
to the "one instrument" framing, it could move earlier and the lenses tune to it.
That is the main open decision.

---

## 8. Open questions

- **Is the "one instrument, one focused subject" framing (§5) the direction**,
  or do we keep the lenses fully independent? This is the single biggest fork.
- **계보 scope:** full ADR cards with predicted-vs-actual, or start with
  compact IBIS cards + rejected alternatives and add the predictive slot later?
- **국면 boundaries:** is a temporal re-segmentation worth the heuristic
  instability, or is the predictable kind-grouping plus a time axis overlay
  enough?
- **Evidence access (§6):** never leave the lab (peek drawer), or allow an
  explicit jump to 흐름 for the full Inspector?

---

## 9. References

Internal: product goal, brand identity, frontend architecture, domain model,
timeline view strategy (linked at the top).

External technique and product research (synthesized, not copied): Furnas,
*Generalized Fisheye Views* (degree-of-interest); Sugiyama et al. layered layout
with barycenter crossing reduction; longest-path-in-a-DAG via topological sort;
Shneiderman's Visual Information-Seeking Mantra; Correll et al.,
*Value-Suppressing Uncertainty Palettes*; Kunz & Rittel's IBIS; Nygard's ADR
template. Product patterns from distributed-tracing UIs (Datadog/Jaeger/Honeycomb
waterfall, flame graph, service map, critical path), Sentry breadcrumb trails,
Linear's calm-and-dense refresh, the Obsidian global-graph critique, React
Flow / n8n DAG presentation, GitHub blame/PR timelines, and de-gamified
"wrapped"/consensus-meter summary styling.
