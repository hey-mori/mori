# 흐름 Timeline · Improvement Plan

Forward-looking design note for the 흐름 (flow) timeline, the per-session
swimlane that is Mori's main reading surface. It is a planning document, not an
implementation spec. It records an honest read of where the compact timeline
strains, separates clear wins from genuine design tensions, and proposes a
prioritized set of functional and visual improvements that respect the
timeline's deliberate decisions.

Companion reading: [`../timeline-ux.md`](../timeline-ux.md) (the layout
contract and the honest control catalog), [`mori-timeline-view-strategy.md`](mori-timeline-view-strategy.md),
[`reconstruction-lab-vision.md`](reconstruction-lab-vision.md) (the 재구성
surface, which must stay distinct from 흐름),
[`mori-brand-identity-reference.md`](mori-brand-identity-reference.md).

---

## 1. What 흐름 is, and what it is for

흐름 is the clock-accurate scan and edit surface: eight always-visible lanes
(대화, 명령, 코드·파일, 리서치, 이슈, 검토, 핸드오프, 노트) over a real time
axis, with bundles for dense moments, a focus model (selected / related /
context), a Flow Focus trace mode, and a right-hand Event Inspector. It is
ground truth. The 재구성 lab reprojects the same reviewed session into readable
shapes; 흐름 is where the user verifies and (eventually) edits the underlying
events. Keeping that line clean matters: improvements here should make 흐름 a
better *scan-and-verify* surface, not duplicate 재구성's reasoning views.

The architecture is sound. Timeline math lives in `src/lib/timeline`, the
orchestrator hands a finished render model to the canvas, relationship policy is
testable in isolation. The gaps below are about **perceived completeness,
discoverability, and density legibility**, not structural rework.

---

## 2. The core tensions (name them before fixing them)

Several rough edges are not bugs; they are the visible cost of deliberate
design choices. Each is a real tradeoff to resolve consciously, not a clear
win:

- **Time-honesty vs readability.** Cards sit at their true time position, so a
  short session compresses to a sliver and a dense burst crowds one spot. The
  doc is explicit that Mori must not invent later timestamps to spread cards.
  The fix space is zoom and overview, not fake spacing.
- **Calm vs discoverability.** Relationship lines are hidden until an event is
  selected, and the canvas auto-selects nothing on entry. This keeps the
  surface calm, but it also means a first-time user sees a flat set of lanes and
  never learns that the timeline is a graph, that Flow Focus exists, or that
  keyboard navigation works.
- **Even grid vs wasted space.** Empty lanes render at full band height on
  purpose, so the swimlane reads as an even grid. On a session that only touches
  three lanes, that is half the canvas spent on faded labels.
- **Honesty vs clutter.** Planned controls render disabled (the honesty
  contract forbids hiding them). Done well this is honest; done as a grid of
  greyed buttons in the Inspector it reads as broken or unfinished.

The plan below picks a side on each, in line with the brand rules.

---

## 3. Clear wins (low risk, high polish payoff)

These improve the surface without touching the deliberate tradeoffs.

### 3.1 Consolidate the Inspector's disabled-button grid into one honest note

Today the Inspector shows a grid of disabled `Edit / Split / Merge / Create
issue / Add note` buttons. Five greyed buttons read as "broken," not "planned."
Replace the grid with a single calm "planned actions" line using the existing
`MoriPlannedAction` / feature-status pattern (the registry already owns the
tooltips). One quiet line, not five dead buttons. This is the single highest
polish-per-effort fix.

### 3.2 Make the minimap earn its space (or retire it honestly)

The bottom minimap is documented as decorative: it shows dots but does not drive
viewport navigation, and its viewport indicator is inert. Two honest options:

- **Make it real:** wire the drag-to-pan/zoom it already half-implements, give
  it a `grab` cursor and a hover state, and encode density (dot size or a
  per-lane micro-bar) so it becomes a genuine overview-and-scan tool. This also
  unlocks the planned zoom story (a brushed minimap *is* zoom).
- **Retire it:** if zoom is not coming soon, drop the inert rail rather than
  show a control that does nothing.

Recommendation: make it real, because it is also the cleanest path to zoom (see
3.5). A decorative navigator violates the "no fake controls" spirit.

### 3.3 Surface Flow Focus and keyboard navigation

Flow Focus is powerful but reachable only via select-event then Inspector then
"흐름 추적." Keyboard navigation (arrow keys across lanes) works but is
invisible. Both are hidden features. Fixes, all calm:

- A `Flow` affordance in the toolbar that enters Flow Focus for the selected
  event (or a gentle hint when an event is selected).
- A visible focus ring on the keyboard-navigated card (accessibility win too).
- A `?` shortcuts overlay listing the few real shortcuts.

### 3.4 Resolve relationship invisibility with a toggle, not always-on lines

The calm "lines hidden until focus" default is right and should stay. But the
user never learns the graph exists. Add a single toolbar toggle ("관계 보기")
that, when on, renders the focused-relationship lines at low emphasis without
requiring a selection. Off by default, so calm is preserved; on by intent, so
the graph is discoverable. Do not turn on always-on lines globally.

### 3.5 Zoom, via the minimap brush

`Day / Week / Zoom` ship disabled. The most honest, lowest-surface way to give
real zoom is the minimap brush (3.2): drag a viewport region to zoom the canvas
to it, which also fixes the short-session compression (2, time-honesty) by
letting the user expand a 15-minute session manually. This retires several
disabled toolbar controls in favor of one working gesture.

---

## 4. Density legibility (the genuine tensions)

### 4.1 A flooding conversation lane

A conversation-heavy session can fill the 대화 lane with dozens of compact
tokens or opaque bundles, pushing other lanes far down. Options, in calm order:

- A **per-lane collapse** affordance on the lane label (the lane shows a
  one-line "N개" summary band when collapsed). Reversible, discoverable, keeps
  the even-grid intent.
- A **lane density badge** so the user sees which lane is heavy before
  scrolling.
- Avoid a separate "conversation thread view" inside 흐름; that is 재구성's job
  (서사). Keep 흐름 a swimlane.

### 4.2 Empty lanes: even grid vs wasted space

The even-grid decision is defensible, but on sparse sessions it dominates.
Rather than break the grid or hide lanes (both lose structure), prefer a
**slim collapsed band** for zero-event lanes (label + count + a quiet expand
affordance), so the structure stays legible but the active lanes get the room.
This is a conscious revision of the current full-height empty band, worth a
side-by-side browser check before committing.

### 4.3 Short-session time compression

Covered by zoom (3.5). Additionally, a quiet "시간 압축됨" cue when the session
span is very short would set expectations honestly. Keep it a calm hint, not a
banner.

---

## 5. Visual improvements

- **Calm the chrome.** The toolbar carries time-range segments, zoom, an
  active-lanes toggle, a filter button, a density toggle, search, and a dashed
  honesty line. That is a lot for "one tight row." Group the planned/disabled
  controls behind the honesty line or a small overflow, so the live controls
  (filter, density, search) lead. Dim chrome; let the canvas carry contrast
  (the Linear discipline, and the 재구성 vision's principle 6).
- **Reading-mode switch legibility.** The 타임라인 / 목록 toggle is a real,
  useful mode switch but reads as just another pill. Give it a hair more
  prominence (a subtle label or grouping) so users discover the list view.
- **Density toggle truth-check.** The doc lists density as an implemented
  three-tier control, but the orchestrator appears to pin `compact`. Verify
  whether the toggle is actually wired; if not, either wire it or move it to the
  planned set. A control that looks live but does nothing is the exact thing the
  honesty contract forbids.
- **Attention signaling, brand-safe.** Where the canvas or Inspector marks
  "needs your attention" (unconfirmed decision, open issue), use a calm dot or a
  semantic tint, never a left-accent bar and never purple (brand rules). One
  consistent attention treatment across card and Inspector.
- **Relationship curve legibility.** When lines do render (focused or toggled),
  bold the hovered connector and quiet the rest, so a dense focus subgraph stays
  traceable.

---

## 6. Bigger opportunities (after the polish pass)

- **Minimap-driven navigation + zoom** (3.2 + 3.5) is the headline functional
  upgrade and should anchor a second pass.
- **Project-aggregate timeline** is already planned: all sessions in a project
  merged onto one flow, so a user reads a whole project's activity over time.
  High value, larger build, belongs to the Project surface as much as 흐름.
- **Inline bundle expansion** (planned): click a bundle to reveal members in
  place rather than round-tripping through the Inspector. Medium effort, real
  workflow win.
- **A relationship/dependency reading mode** is tempting but risks overlapping
  재구성's 인과 lens. If built, it belongs in 재구성, not 흐름. Noted here only
  to keep the line clean.

---

## 7. What to preserve (do not "fix" these)

- Time position stays honest. No invented timestamps to spread cards.
- Cards never resize on hover or selection; no left accent bar; no hover lift
  (the documented card rules and brand rules).
- The category filter highlights, never hides; only search narrows the set.
- Planned controls stay visible-but-disabled with registry tooltips. The fix is
  to *consolidate and calm* them, not hide them.
- 흐름 stays a scan-and-verify swimlane. Reasoning views (story, causal,
  lineage) live in 재구성.

---

## 8. Suggested sequencing

1. **Inspector planned-actions consolidation** (3.1) and **chrome calming** (5).
   Pure polish, low risk, immediate "finished" feel.
2. **Flow Focus + keyboard discoverability + focus ring** (3.3) and the
   **관계 보기 toggle** (3.4). Unlocks hidden features without breaking calm.
3. **Density legibility:** per-lane collapse (4.1) and slim empty-lane bands
   (4.2), each browser-verified.
4. **Minimap made real + brushed zoom** (3.2, 3.5, 4.3). The functional
   headline; retires several disabled controls.
5. **Inline bundle expansion** (6), then the **project-aggregate timeline** (6)
   as its own milestone.

Each ships as its own validated, tested increment, browser-checked at the
affected widths, never a big-bang.

---

## 9. Open questions

- **Minimap:** make it real (recommended) or retire it? This decides the zoom
  story.
- **Empty lanes:** slim collapsed bands (recommended) or keep the full-height
  even grid?
- **Density toggle:** is it actually wired today? (Truth-check before anything
  else in §5.)
- **Project-aggregate timeline:** does it live as a mode inside 흐름, or as a
  distinct surface on the Project page?
