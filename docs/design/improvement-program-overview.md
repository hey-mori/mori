# Mori · Improvement Program Overview

The index and cross-cutting roadmap for the current planning set. Five design
notes were written to think hard about what Mori can become, functionally and
visually, without padding features or raising coupling. This document ties them
together, sequences the work across them, and is the entry point for deciding
where to start.

**Status.** The planning set is committed and build is underway. Shipped and
browser-verified so far: the 인과 critical-path (Phase 3), the 흐름-aligned
재구성 toolbar (shared search + filter popover), the temporal 국면 lens (Phase 4),
and 서사 readability (tiering + folding; minimap pending), and the 계보
decision-lineage lens (Phase 4; chain rail and peek pending). Items marked
**SHIPPED** are implemented; the rest are specs ready to build.

---

## 1. The planning set

| Doc | Scope | Core thesis |
|---|---|---|
| [`reconstruction-lab-vision.md`](reconstruction-lab-vision.md) | The 재구성 lab | One session model, re-projected through lenses; deeper use of the data Mori owns (decisions, causal types, trust). |
| [`timeline-flow-improvement-plan.md`](timeline-flow-improvement-plan.md) | The 흐름 timeline | Separate clear wins from real tensions; fix perceived-completeness, discoverability, density. |
| [`product-improvement-plan.md`](product-improvement-plan.md) | The whole app | Core loop is mature; make surfaces feel connected and finished. |
| [`interaction-navigation-model.md`](interaction-navigation-model.md) | Cross-cutting behavior | Three moves (deep-link / peek / lens-switch) and one shared focused subject. |
| [`visual-system-direction.md`](visual-system-direction.md) | Cross-cutting visuals | Calm by subtraction; encode with weight before color; one vocabulary. |

North-star context for this set:
[`agent-work-visibility-vision.md`](agent-work-visibility-vision.md) · the
user-set direction (connect agents, record the work flow reliably, make it
legible and durable) with the file-provenance foundation the visual work builds
on.

---

## 2. The through-lines

Three ideas recur across all five docs and are the real spine of the program:

1. **One instrument, one product.** The lab's lenses, the two timelines, and the
   broader surfaces should feel like one tool seen from different angles, not a
   pile of screens. Realized by the shared *focused subject* (interaction model)
   and the shared *object vocabulary* (visual system).
2. **Power from the data Mori already owns, at zero coupling.** The biggest
   untapped value is in fields the UI ignores (decision alternatives and
   consequences, typed causal relationships, per-item confidence/trust, the full
   session history for predicted-vs-actual). Pure derivations, no new
   dependencies.
3. **Calm by subtraction, encode with weight before color.** The visual lever
   across every surface: dim chrome, reserve color for a small semantic
   vocabulary, signal with weight/opacity/shape first.

---

## 3. The one decision that unblocks the most

The **interaction/navigation model** (deep-link vs peek vs lens-switch, on a
shared focused subject) is referenced by all three surface docs as their open
fork. Settling it first makes the lab's shared-subject, the timeline's
discoverability fixes, and the product-wide drill-through all consistent instead
of three bespoke solutions. Recommended starting point for alignment, even
before any feature code.

---

## 4. Cross-cutting phased roadmap

A suggested order *across* the docs, optimized for broad polish first,
connective tissue next, then the genuinely new capabilities, then large builds.
Each item ships as its own validated, tested, browser-checked increment. Order
is a recommendation; the user has the final say, and each phase should be
re-verified against repo state before starting.

**Phase 1 · Foundations and broad polish (low risk, wide reach)**
- Visual shell discipline: dim chrome, calm the timeline toolbar and lab
  lens-switcher (visual §5).
- Narrative empty-state component + the unified trust/attention marker as
  component-layer primitives (visual §7, §10; product §4).
- Timeline: consolidate the Inspector's disabled-button grid into one honest
  planned line; truth-check the density toggle (timeline §3.1, §5).

**Phase 2 · The shared spine (connective tissue)**
- Converge the focused-subject shape; add the reusable peek drawer primitive
  (interaction §3, §8).
- Apply the focused subject inside the lab so lens-switches preserve place
  (lab §4.0).
- Cross-surface deep-links: Project synthesis to Memory, Home heatmap to
  sessions (product §2).

**Phase 3 · Lens and timeline power-ups (the visible wins)**
- 인과 critical path + roots/outcomes + typed/weighted edges (lab §4.1).
  **SHIPPED.**
- 서사 minimap + importance folding + sticky focus (lab §4.3).
- Timeline: Flow Focus + keyboard discoverability + the 관계 보기 toggle
  (timeline §3.3, §3.4).
- Evidence: inline Git-diff viewer; Memory search snippets (product §2, §3).

**Phase 4 · New capabilities**
- 국면 re-founded on a real time axis (lab §4.2).
- 계보 decision-lineage lens (lab §4.5), the most on-thesis new build.
- Timeline: minimap made real + brushed zoom (timeline §3.2, §3.5).

**Phase 5 · Larger builds (decide scope first)**
- Project-aggregate timeline (timeline §6; also a Project-surface question).
- Reports HTML then PDF; OS-native notifications (product §2).
- Session comparison; the Graph's role vs the 인과 lens (product §12).

---

## 5. Standing guardrails (apply to every phase)

- Stay inside the non-goals (product §5): no cloud, accounts, email, team beyond
  `.mori`, background capture, hard deletes, gamification, or a second
  everything-graph.
- Keep the 흐름/재구성 line: 흐름 scans and verifies; 재구성 reasons. Neither
  duplicates the other.
- Brand and visual rules are non-negotiable: purple is brand only, status color
  is semantic, no left-accent bars, no decorative motion, copy-diet via
  `InfoHint`, Korean-first UI copy, no em dash in any copy or code.
- Every increment: pure helpers tested, `check:full` + build + `style:check`
  green, browser-verified at the affected widths, its own clean commit, no push
  unless asked.

---

## 6. Deep specs (buildable, written)

The roadmap has been planned down to concrete, buildable specs, grouped by the
phase they serve. Each is a pure-helper signature + data shapes + visual
treatment + test plan, ready to implement against.

**Phase 1 (foundations / polish)**
- [`phase1-visual-pass-checklist.md`](phase1-visual-pass-checklist.md) ·
  per-surface shell-discipline checklist, narrative empty-state, unified
  trust/attention marker.

**Phase 2 (shared spine)**
- [`focused-subject-migration-spec.md`](focused-subject-migration-spec.md) ·
  converging the store's ad-hoc focus fields onto one typed subject,
  incrementally and backward-compatibly.
- [`peek-drawer-primitive-spec.md`](peek-drawer-primitive-spec.md) · the Move B
  peek primitive: contract, behavior, a11y focus-return, first consumers.

**Phase 3 (lens / timeline power-ups)**
- [`causal-critical-path-spec.md`](causal-critical-path-spec.md) · 인과
  backbone, roots/outcomes, typed and weighted edges. **SHIPPED.**
- [`narrative-readability-spec.md`](narrative-readability-spec.md) · 서사
  importance tiering, routine folding, shape minimap. **SHIPPED** (tiering,
  folding, and the click-to-jump minimap; sticky phase header deferred).
- [`pulse-enrichment-spec.md`](pulse-enrichment-spec.md) · 맥동 health meter,
  confidence-aware stats, carry-forward reusing `buildResumePrompt`.
- [`git-diff-viewer-spec.md`](git-diff-viewer-spec.md) · Evidence inline diff
  with the rawRetention honesty gate.

**Phase 4 (new capabilities)**
- [`decision-lineage-lens-spec.md`](decision-lineage-lens-spec.md) · the 계보
  lens: ADR/IBIS cards, rejected-alternatives, predicted-vs-actual. **SHIPPED**
  (chain rail and peek deferred).
- [`phase-timeline-spec.md`](phase-timeline-spec.md) · 국면 re-founded as
  chapters over time with a grouped fallback. **SHIPPED.**
- [`timeline-minimap-zoom-spec.md`](timeline-minimap-zoom-spec.md) · minimap
  made real + brushed zoom, retiring the disabled controls.

**Phase 5 (larger builds)**
- [`project-aggregate-timeline-spec.md`](project-aggregate-timeline-spec.md) ·
  the project timeline: collapsed-gap axis, pure builder, `dataBasis` honesty.

**Decisions**
- [`graph-vs-causal-decision.md`](graph-vs-causal-decision.md) · resolves the
  two-graphs tension: 인과 owns single-session causality, the workspace Graph
  owns cross-session topology (or is retired), and the timeline is the safer
  first cross-session build.

Still open to spec when a direction is chosen: the cross-surface drill-through
wiring points (which deep-links to add first), and the Reports HTML/PDF export
and OS-native notification details (both already planned, mostly engineering).
