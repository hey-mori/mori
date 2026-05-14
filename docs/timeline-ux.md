# Timeline UX

Mori's main screen is the Timeline and Flow Focus surface. This doc records
the component structure, focus interaction model, and trust display
principles so they don't drift.

## Component structure

```
src/features/timeline/
  TimelineView.tsx        - thin orchestrator: chooses empty state / canvas /
                            inspector / flow trace, owns no math
  TimelineHeader.tsx      - session title, data-source badge, analysis badge,
                            metric cards (events / sources / open issues /
                            decisions)
  TimelineFilters.tsx     - lane filter chips
  TimelineCanvas.tsx      - frame, axis, relationship layer, lanes, mini-map
  TimelineAxis.tsx        - axis ticks generated from time scale helpers
  TimelineLane.tsx        - one lane row, list of display items
  TimelineEventCard.tsx   - single event card UI (no math)
  TimelineBundleCard.tsx  - dense-moment bundle card UI
  TimelineMiniMap.tsx     - mini-map dots driven by the same focus state
  RelationshipLineLayer.tsx - SVG connectors with tone classes
  TimelineEmptyState.tsx  - demo-empty / no-imports / needs-quick-pass copies
  EventInspector.tsx      - trust, evidence, linked items, correction notes
  TimelineBundleInspector.tsx - bundle details + included events/evidence

src/features/flow-focus/
  FlowFocusHeader.tsx     - legend + clear-focus + back-to-timeline
  TracePanel.tsx          - upstream / downstream / linked relationships
  TraceRelationshipList.tsx - one direction of the trace
  FocusPathSummary.tsx    - cause ??selected ??result strip

src/lib/timeline/
  layout.ts               - existing positioning helpers
  displayItems.ts         - event vs bundle display model
  bundleEvents.ts         - dense-moment bundle generation
  timeScale.ts            - axis ticks + duration summary, no UI
  focusState.ts           - selected / related / context state machine

src/lib/relationships/
  traversal.ts            - existing direct/causal/result traversal
  focusGraph.ts           - selected-event focus summary
  relationshipDisplay.ts  - labels, tones, confidence buckets, trust display
```

Rules:

- Timeline math lives in `src/lib/timeline`. Components never compute axis
  ticks, bundle generation, focus states, or positions inline.
- Relationship traversal and labeling lives in `src/lib/relationships`.
- Shared primitives (`Badge`, `Button`, `Toggle`, `MetricCard`,
  `SectionHeader`, `EmptyState`) live in `src/components/ui` and are reused
  across features.
- Domain data and mock data never live inside Timeline JSX. The active view
  is always `selectSessionView(state)` from the session store, which already
  switches between the demo mock and a composed real session.

## Single-row lane model

The base Timeline stays lane-based and mostly single-row. Mori should feel
close to the reference: stable lanes, readable cards, secondary
relationships, and a right inspector that does the explanatory work.

That means dense periods are **not** solved with unlimited lane stacking,
and they are **not** solved with a generic `+N more` cluster. Dense moments
must be represented as meaningful **work-flow bundles**.

A display item is therefore one of:

- `event` ??a raw timeline event that remains individually inspectable
- `bundle` ??a dense work moment summarized into one intentional card

The layout engine operates on display items, not directly on raw events.

## Work-flow bundle model

Bundles are the first-layer compression strategy for dense periods.

Current implementation supports **same-lane sequence bundles** and prepares
the type model for richer bundle kinds later:

- `sequence`
- `cross-lane`
- `decision-burst`
- `issue-burst`
- `evidence-burst`
- `code-burst`

Each bundle records:

- time range
- bundle title
- summary
- member event ids
- event-type counts
- source count
- represented decisions
- represented issues
- trust level
- bundle reason

### Bundle generation rules

`createTimelineBundles(events, relationships, options)` applies these rules:

1. Sort events by lane and start time.
2. Group nearby same-lane events inside a short time window.
3. Preserve important events as individual cards:
   - selected event
   - decision events
   - events linked to decisions
   - events with stronger evidence density
4. Bundle low-importance secondary context when those events would make the
   lane unreadable.
5. Generate a title and summary from the dominant lane/type mix instead of
   collapsing to a generic count.
6. If a lane still becomes too dense, merge only secondary neighbors while
   keeping preserved items individual.

Examples from the sample session:

- web research around Dayflow / screenpipe / SpecStory / Pieces becomes a
  research-flow bundle
- selected positioning decision remains an individual card
- dense AI context around the same moment may become an AI work-flow bundle

### Product-quality bundle card policy

Bundle cards must explain a work moment without becoming another dense debug
panel. The card surface prioritizes time range, event count, a meaningful
title, dominant type mix, and evidence/decision/issue counts. Long summary
copy lives in the inspector, not inside the lane card. The full type mix,
member event list, represented issues/decisions, sources, and bundling reason
live in the Bundle Inspector. This keeps the lane readable while preserving
the exact events Mori used to create the bundle.

## Focus interaction model

The Timeline has exactly three focus tiers:

| State     | Class            | Visual              |
| --------- | ---------------- | ------------------- |
| selected  | `focus-selected` | strong border + outline, full opacity, highest z |
| related   | `focus-related`  | full opacity, same surface treatment |
| context   | `focus-context`  | 55% opacity, hover restores full opacity |

The mapping is centralized in
`getEventFocusState({ itemId, itemEntityIds, selectedItemId, focusedSet })`.
The mini-map dots use the same mapping so "dimmed" never means three
different things across two views.

- **Hover** an event card ??it becomes the focus pivot for as long as the
  pointer stays on it (`onHover(eventId)` / `onHover(null)`).
- **Click** an event card ??pins the selection. The Inspector and the
  relationship layer follow the pinned selection.
- **Hover / click a bundle** ??Mori focuses the bundle's member events and
  any directly related downstream/upstream entities. The bundle itself is
  treated as the visible anchor, but the reasoning still comes from real
  member events.
- **Clear focus** on Flow Focus moves the selection back to the first event
  so the user can start fresh without leaving the page.

Unrelated context never drops below ~55% opacity ??Flow Focus must remain
legible, not washed out.

## Trust and evidence in the Inspector

The Event Inspector is the trust surface. Sections, in order:

1. **Type / trust / confidence badges** ??`Verified`, `Observed`, or
   `Inferred`. Inferred events get an honest `NN% confidence` badge.
2. **Summary** ??the event summary text.
3. **Trust** ??short prose ("Verified evidence ??source is a real, captured
   input." etc.) plus `Created by` and `(user-modified)` if applicable.
4. **Source evidence** ??every linked source with kind + raw-retention
   policy.
5. **Linked items** ??counts and top three titles for issues, decisions,
   files/artifacts, next actions.
6. **Correction** ??a disabled note textarea labeled as a planned
   milestone. Mori never offers a save button it can't honor.
7. **Actions** ??`Show flow trace` (real), `Copy summary` (real, copies
   ISO time range + title + summary to clipboard), plus disabled
   placeholders for `Edit`, `Create issue`, `Split`, `Merge`, `Add note`.

Every placeholder is `disabled` with a `title` tooltip explaining what's
planned. Mori does not show fake working buttons.

## Bundle Inspector

When the selected display item is a bundle, the right inspector switches to
`TimelineBundleInspector`.

It shows:

1. bundle kind, trust, and lane badges
2. bundle title and time range
3. a short explanation of why the events were bundled
4. the included events list
5. represented sources, decisions, and issues
6. `Open Flow Focus` action
7. a disabled `Expand bundle inline` action labeled as planned

Inline expansion is intentionally not shipped yet. The bundle must be
inspectable before it becomes expandable.

## Empty state policy

`TimelineEmptyState` only has three variants and they map cleanly to real
runtime conditions:

- **demo-empty** ??demo mock had no events (rare; shouldn't ship empty).
- **draft-no-imports** ??real session, zero imports. CTA opens Sources /
  Evidence.
- **draft-needs-quick-pass** ??real session, has imports, no analysis yet.
  CTA runs Quick Pass.

Once Quick Pass runs against a real session, the full Timeline + Flow Focus
renders the analyzed events with the same focus tiers.

## Layout engine

Timeline display-item positions are produced by
`computeSingleRowLaneLayout(items, range, options)` in
[`src/lib/timeline/singleRowLaneLayout.ts`](../src/lib/timeline/singleRowLaneLayout.ts).
It wraps the collision-aware implementation in
[`src/lib/timeline/collisionLayout.ts`](../src/lib/timeline/collisionLayout.ts)
so components use the product language of single-row lanes.
The algorithm:

1. Groups display items by lane in the documented `laneOrder`.
2. Sorts each lane by start time.
3. Computes each item's intended `x` from the time range and clamps it so a
   card never starts past `frameWidth - itemWidth`.
4. Keeps the lane mostly single-row by applying limited left-shift
   backpressure before falling back to extra height.
5. Uses bundle generation as the primary density control; stacking is no
   longer the first answer to crowded time windows.
6. Emits an absolute `(x, y, width, height)` plus `anchorLeft`,
   `anchorRight`, and `anchorCenter` for every display item. Raw event ids
   are also indexed back to their visible anchor so relationship lines can
   point at a bundle when needed.
7. Keeps the axis, lanes, relationship layer, and cards in one frame
   coordinate system so the Timeline does not create an inner vertical
   scrolling viewport.

Two density modes ship today:

| Density        | Event size | Bundle size | Notes |
| -------------- | ---------- | ----------- | ----- |
| `comfortable`  | 184 x 68   | 216 x 76    | Default. Time, title, trust, and metadata remain readable. |
| `compact`      | 158 x 54   | 184 x 62    | Tighter scan mode with the same single-row-first rules. |

The mode lives in `useMoriAppStore.timelineDensity` and toggles via the
"Comfortable / Compact" button in the Timeline controls.

Card summaries are intentionally suppressed in the lane grid. The Timeline is
for scanning chronology; the inspector is the place for event prose, evidence,
and correction context. This keeps the lane rhythm closer to the product
reference and avoids clipped text at 1440px and 1280px desktop widths.

Rules the layout guarantees (covered by `collisionLayout.test.ts` and
`bundleEvents.test.ts`):

- No two visible display items in the same lane visually overlap.
- Selected / important events can remain individual while nearby secondary
  events bundle around them.
- Compact mode produces smaller cards but never breaks the no-overlap rule.
- Anchor points are stable and inside each visible item's bounding box.

## Relationship line rules

`RelationshipLineLayer` reads the same visible-item anchors:

- Lines enter / exit at the right edge of the upstream card and the left
  edge of the downstream card (whichever is forward in time).
- If multiple raw relationships resolve to the same bundle/item pair, Mori
  aggregates them to one visible connector instead of drawing parallel
  spaghetti.
- If an event inside a bundle is related to the current focus, the line
  anchors to the bundle card. The inspector explains the hidden detail.
- When focus is **active** (Flow Focus mode or a hovered/selected event in
  Timeline mode), only relationships where both endpoints are in the
  focused set render ??unrelated lines are removed entirely, not just
  faded.
- Timeline-mode connectors are hidden by default. Flow Focus is the graph
  surface and can show a larger focused subgraph with stronger lines.
- The SVG sits at `z-index: 1`; cards at `z-index: 2`. Lines never cover
  card text.

## Responsive behavior

The Timeline prefers readable cards over squeezing. At wide desktop sizes the
frame grows with the available column. Around 1440px, the inspector and
sidebar remain stable and the lane frame allows intentional horizontal scroll
instead of shrinking cards below readable density. The mini-map remains the
orientation surface below the lanes and shows a viewport highlight plus the
selected item marker.

## Known limitations

- Cross-lane workflow bundles are prepared in the type model but not yet
  generated automatically.
- Inline bundle expansion is intentionally deferred; this milestone focuses
  on readable single-row lanes plus inspectable bundles.
- The Inspector's correction note is read-only; persisting user
  corrections is a planned milestone.
- Manual relationship edits, event split/merge, manual issue creation, and
  Quick Pass re-runs from Flow Focus are all visible as disabled buttons
  with planning tooltips.
- The mini-map shows event dots but does not yet act as a viewport
  navigator.
- Lanes with zero events still allocate one row of vertical space; this is
  intentional so the structural rhythm stays steady but could be hidden in
  a future "active lanes only" toggle.


