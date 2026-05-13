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
  TimelineLane.tsx        - one lane row, list of event cards
  TimelineEventCard.tsx   - single event card UI (no math)
  TimelineMiniMap.tsx     - mini-map dots driven by the same focus state
  RelationshipLineLayer.tsx - SVG connectors with tone classes
  TimelineEmptyState.tsx  - demo-empty / no-imports / needs-quick-pass copies
  EventInspector.tsx      - trust, evidence, linked items, correction notes

src/features/flow-focus/
  FlowFocusHeader.tsx     - legend + clear-focus + back-to-timeline
  TracePanel.tsx          - upstream / downstream / linked relationships
  TraceRelationshipList.tsx - one direction of the trace
  FocusPathSummary.tsx    - cause → selected → result strip

src/lib/timeline/
  layout.ts               - existing positioning helpers
  timeScale.ts            - axis ticks + duration summary, no UI
  focusState.ts           - selected / related / context state machine

src/lib/relationships/
  traversal.ts            - existing direct/causal/result traversal
  focusGraph.ts           - selected-event focus summary
  relationshipDisplay.ts  - labels, tones, confidence buckets, trust display
```

Rules:

- Timeline math lives in `src/lib/timeline`. Components never compute axis
  ticks, focus states, or positions inline.
- Relationship traversal and labeling lives in `src/lib/relationships`.
- Shared primitives (`Badge`, `Button`, `Toggle`, `MetricCard`,
  `SectionHeader`, `EmptyState`) live in `src/components/ui` and are reused
  across features.
- Domain data and mock data never live inside Timeline JSX. The active view
  is always `selectSessionView(state)` from the session store, which already
  switches between the demo mock and a composed real session.

## Focus interaction model

The Timeline has exactly three focus tiers:

| State     | Class            | Visual              |
| --------- | ---------------- | ------------------- |
| selected  | `focus-selected` | strong border + outline, full opacity, highest z |
| related   | `focus-related`  | full opacity, same surface treatment |
| context   | `focus-context`  | 55% opacity, hover restores full opacity |

The mapping is centralized in `getEventFocusState({ eventId, selectedEventId,
focusedSet })`. The mini-map dots use the same mapping so "dimmed" never
means three different things across two views.

- **Hover** an event card → it becomes the focus pivot for as long as the
  pointer stays on it (`onHover(eventId)` / `onHover(null)`).
- **Click** an event card → pins the selection. The Inspector and the
  relationship layer follow the pinned selection.
- **Clear focus** on Flow Focus moves the selection back to the first event
  so the user can start fresh without leaving the page.

Unrelated context never drops below ~55% opacity — Flow Focus must remain
legible, not washed out.

## Trust and evidence in the Inspector

The Event Inspector is the trust surface. Sections, in order:

1. **Type / trust / confidence badges** — `Verified`, `Observed`, or
   `Inferred`. Inferred events get an honest `NN% confidence` badge.
2. **Summary** — the event summary text.
3. **Trust** — short prose ("Verified evidence — source is a real, captured
   input." etc.) plus `Created by` and `(user-modified)` if applicable.
4. **Source evidence** — every linked source with kind + raw-retention
   policy.
5. **Linked items** — counts and top three titles for issues, decisions,
   files/artifacts, next actions.
6. **Correction** — a disabled note textarea labeled as a planned
   milestone. Mori never offers a save button it can't honor.
7. **Actions** — `Show flow trace` (real), `Copy summary` (real, copies
   ISO time range + title + summary to clipboard), plus disabled
   placeholders for `Edit`, `Create issue`, `Split`, `Merge`, `Add note`.

Every placeholder is `disabled` with a `title` tooltip explaining what's
planned. Mori does not show fake working buttons.

## Empty state policy

`TimelineEmptyState` only has three variants and they map cleanly to real
runtime conditions:

- **demo-empty** — demo mock had no events (rare; shouldn't ship empty).
- **draft-no-imports** — real session, zero imports. CTA opens Sources /
  Evidence.
- **draft-needs-quick-pass** — real session, has imports, no analysis yet.
  CTA runs Quick Pass.

Once Quick Pass runs against a real session, the full Timeline + Flow Focus
renders the analyzed events with the same focus tiers.

## Layout engine

Timeline card positions are produced by
`computeTimelineLayout(events, range, options)` in
[`src/lib/timeline/collisionLayout.ts`](../src/lib/timeline/collisionLayout.ts).
The algorithm:

1. Groups events by lane in the documented `laneOrder`.
2. Sorts each lane by start time.
3. Computes each card's intended `x` from the time range and clamps it so a
   card never starts past `frameWidth - cardWidth`.
4. Packs cards greedily into sub-rows: each new card lands on the lowest
   row whose previous card has cleared (`x + cardWidth + gap`). If no
   existing row fits, a new row is created.
5. Derives every lane's pixel height from its row count
   (`laneVerticalPadding * 2 + rows * cardHeight + (rows - 1) * rowGap`),
   so busy lanes grow taller and quiet lanes stay short.
6. Emits an absolute `(x, y, width, height)` plus `anchorLeft`,
   `anchorRight`, and `anchorCenter` for every card. The relationship line
   layer reads these anchors directly — no duplicate math, no rough
   approximations.

Two density modes ship today:

| Density        | Card size  | Notes |
| -------------- | ---------- | ----- |
| `comfortable`  | 220 × 110  | Default. Title + 2-line summary + footer. |
| `compact`      | 184 × 78   | Drops the summary, keeps title + footer. Useful for dense sessions. |

The mode lives in `useMoriAppStore.timelineDensity` and toggles via the
"Comfortable / Compact" button in the Timeline controls.

Rules the layout guarantees (covered by `collisionLayout.test.ts`):

- No two cards in the same lane visually overlap.
- Lane height grows monotonically with row count.
- Compact mode produces smaller cards but never breaks the no-overlap
  rule.
- Anchor points are stable and inside each card's bounding box.

## Relationship line rules

`RelationshipLineLayer` reads the same `LaidOutEvent` anchors:

- Lines enter / exit at the right edge of the upstream card and the left
  edge of the downstream card (whichever is forward in time).
- When focus is **active** (Flow Focus mode or a hovered/selected event in
  Timeline mode), only relationships where both endpoints are in the
  focused set render — unrelated lines are removed entirely, not just
  faded.
- Unrelated connectors in the static Timeline view stay at ~32% opacity so
  they don't compete with card text.
- The SVG sits at `z-index: 1`; cards at `z-index: 2`. Lines never cover
  card text.

## Known limitations

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
