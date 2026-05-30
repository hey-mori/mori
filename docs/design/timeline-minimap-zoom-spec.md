# 흐름 · Minimap-Driven Zoom (spec)

A buildable spec for the Phase 4 timeline headline: make the decorative minimap
a real navigator and give the timeline honest zoom through it, retiring the
disabled Day / Week / Zoom controls. It also resolves the short-session
time-compression tension. Design spec, not yet implemented.

Parent: [`timeline-flow-improvement-plan.md`](timeline-flow-improvement-plan.md)
(§3.2, §3.5, §4.3), [`../timeline-ux.md`](../timeline-ux.md). Code:
`TimelineMiniMap.tsx`, `TimelineCanvas.tsx`, `src/lib/timeline/timeScale.ts`,
`timelineViewModel.ts`.

---

## 1. Why

The bottom minimap is documented as decorative: it draws dots and an inert
viewport box but does not drive navigation. Meanwhile Day / Week / Zoom ship
disabled. The cleanest, most honest way to give real zoom is to make the minimap
do it: a brushed minimap *is* a zoom-and-pan control. This removes several
"planned" controls in favor of one working gesture and fixes the short-session
compression problem (a 15-minute session can be expanded by brushing).

---

## 2. Behavior

- **Brush to zoom.** Drag a region on the minimap to set the canvas viewport to
  that time range; the canvas frame width scales so the brushed span fills the
  scroller. The minimap viewport box reflects the current canvas scroll/zoom and
  is now live, not decorative.
- **Drag the box to pan.** Dragging the existing viewport box scrolls the canvas
  in sync.
- **Reset.** A double-click on the minimap (or a small "맞춤" affordance) returns
  to fit-the-session.
- **Two-way sync.** Scrolling/zooming the canvas updates the minimap box;
  brushing the minimap updates the canvas. One source of truth (a `viewport:
  { startFraction, endFraction }`), both views derive from it.

---

## 3. State and model

A single viewport state, owned by `TimelineView`, threaded to both the canvas
and the minimap:

```ts
type TimelineViewport = { startFraction: number; endFraction: number }; // 0..1 of the session span
```

- `endFraction - startFraction` is the zoom (1 = whole session). A minimum span
  (`MIN_BRUSH_FRACTION`, already hinted in the minimap) caps max zoom so a single
  instant cannot fill the screen.
- The canvas frame width = `baseWidth / (endFraction - startFraction)`, clamped
  to the existing `MIN_FRAME_WIDTH`; scroll offset derives from `startFraction`.
- Axis ticks (`timeScale.ts`) recompute density for the zoomed span so the ruler
  stays readable rather than crowding (the short-session readability fix).

The viewport is per-session UI state; it does not persist across reload (matches
the active-lanes toggle today). Reset on session change.

---

## 4. Honesty: retire the disabled controls

With real zoom via the minimap:

- Remove `Zoom in` / `Zoom out` from the disabled set, or wire them as
  coarse steps over the same `viewport` state.
- `Day` / `Week` remain a *separate* question (they imply a multi-session or
  calendar scope, which is the project-aggregate timeline's job, not session
  zoom). Keep them honest: either leave as planned with the registry tooltip, or
  remove from the session toolbar entirely and let the project-aggregate
  timeline own calendar scope. Recommendation: remove Day/Week from the session
  toolbar (they belong to the project surface), so the toolbar stops advertising
  a scope this surface will never have.
- Update `timelineControls.ts` so the registry matches reality (the honesty
  contract: no control claims a capability it lacks, and none stays "planned"
  once shipped or relocated).

---

## 5. Minimap as a real overview (pairs with zoom)

While making it interactive, also make it informative (timeline plan §3.2):

- **Density encoding:** size dots by event/bundle count, or render a per-lane
  micro-bar, so busy vs quiet regions are scannable, not a flat dot field.
- **Affordance:** `cursor: grab` on the box, a brush cursor on the track, a
  one-time hint so the gesture is discoverable.

---

## 6. Honesty and edge cases

- Short session: brushing expands it; the axis re-densifies; no invented
  timestamps (time-honesty preserved, the cards just get more room).
- Single-instant session (zero span): zoom disabled, minimap shows the single
  cluster, no crash.
- Very dense session: density encoding makes the heavy region visible before the
  user zooms into it.

---

## 7. Test plan

- `viewport` math: frame width and scroll offset derive correctly from
  `startFraction`/`endFraction`; min-span clamp respected.
- axis tick density recomputes for a zoomed span (pure `timeScale` test).
- two-way sync: a canvas scroll updates the box fraction; a brush updates the
  canvas frame (logic-level, not pixel).
- reset returns to fit-the-session.
- `timelineControls.ts` registry matches the shipped/relocated controls (a
  registry test already asserts honesty; update it).

Interaction (drag/brush) gets light RTL/logic coverage; no screenshot tests.

---

## 8. Open questions

- **Day/Week:** remove from the session toolbar (recommended) or keep as planned
  pointing at the project-aggregate timeline? Decide alongside that spec.
- **Zoom step size** for coarse zoom-in/out buttons, if kept: x1.5 per step?
- **Persist viewport** across lens/tab switches within a session? (Lean: keep
  within the session view's lifetime, reset on session change.)
