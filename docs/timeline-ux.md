# Timeline UX

Mori's main screen is the Timeline and Flow Focus surface. This doc records
the layout contract, the view-model architecture, the focus interaction
model, the relationship line policy, and the honest catalog of which
controls are real today.

## Component structure

```
src/features/timeline/
  TimelineView.tsx        - thin orchestrator: builds the render model,
                            swaps Timeline / Flow chrome, picks the right
                            inspector. Owns no math.
  TimelineHeader.tsx      - compact one-row Timeline toolbar, filter popover,
                            planned-control honesty strip.
  TimelineCanvas.tsx      - scroll frame, sticky axis, sticky lane labels,
                            relationship layer, lane rows, time gridlines.
  TimelineAxis.tsx        - axis tick labels generated from time scale helpers.
  TimelineGridLines.tsx   - faint vertical line under each axis tick so
                            event cards read against a real time position.
  TimelineLane.tsx        - one lane row with a sticky-left label and a
                            list of display items.
  TimelineEventCard.tsx   - single event card UI: time, title, trust glyph,
                            calm meta footer.
  TimelineBundleCard.tsx  - dense-moment bundle card UI.
  TimelineMiniMap.tsx     - mini-map dots driven by the same focus state.
  RelationshipLineLayer.tsx - SVG connectors with tone classes.
  TimelineEmptyState.tsx  - demo-empty / no-imports / needs-quick-pass copies.
  EventInspector.tsx      - trust, evidence, linked items, hidden-relationship
                            note, real Actions row, Planned actions row.
  TimelineBundleInspector.tsx - bundle details + included events/evidence.

src/features/flow-focus/
  FlowFocusHeader.tsx     - legend + clear-focus + back-to-timeline.
  TracePanel.tsx          - upstream / downstream / linked relationships.
  TraceRelationshipList.tsx - one direction of the trace.
  FocusPathSummary.tsx    - cause → selected → result strip.

src/lib/timeline/
  layout.ts               - time range + percent helpers.
  displayItems.ts         - event vs bundle display model.
  bundleEvents.ts         - dense-moment bundle generation.
  collisionLayout.ts      - low-level frame coordinate engine.
  singleRowLaneLayout.ts  - product alias of computeTimelineLayout.
  timeScale.ts            - axis ticks + duration summary.
  focusState.ts           - selected / related / context state machine.
  timelineViewModel.ts    - the pure boundary between session/UI state and
                            the React components. The page's render-time
                            decisions live here.
  timelineControls.ts     - registry of which Timeline / Inspector controls
                            are implemented vs. planned.
  relationshipPolicy.ts   - relationship visibility + aggregation policy.

src/lib/relationships/
  traversal.ts            - direct / causal / result traversal.
  focusGraph.ts           - selected-event focus summary.
  relationshipDisplay.ts  - labels, tones, confidence buckets, trust display.

src/lib/session/
  sessionStatus.ts        - cross-page status labels.
  sessionTiming.ts        - real lifecycle + duration + start time labels
                            consumed by the Session Detail header and the
                            Sidebar session card.
```

Rules:

- Timeline math lives in `src/lib/timeline`. Components never compute axis
  ticks, bundle generation, focus states, or positions inline.
- The orchestrator (`TimelineView`) hands a finished `TimelineRenderModel`
  to the canvas. Components do not reach into `event.linkedIssueIds.length`
  style domain access.
- Relationship traversal and labeling lives in `src/lib/relationships`.
- Shared primitives (`Badge`, `Button`, `Toggle`, `MetricCard`,
  `SectionHeader`, `EmptyState`) live in `src/components/ui`.
- Mock data and domain data never live inside Timeline JSX. The active view
  is always `selectSessionView(state)` from the session store.

## Layout contract

The Timeline — the **흐름** tab inside the Session Detail workspace — has
stable zones. Each is documented in the React component that owns it.

| Zone | Owner | Sticky? |
|---|---|---|
| App sidebar | `Sidebar` | sticky to viewport (`position: sticky` since the original shell) |
| Session header + tab bar | `SessionDetailView` (`SessionDetailHeader`) | **pinned at the top of the workspace** |
| Timeline toolbar | `TimelineToolbar` | non-sticky (one tight row) |
| Scroll frame | `TimelineCanvas` | the **only** horizontally-scrolling element |
| Time ruler | `TimelineAxis` | **sticky to the top of the scroll frame** |
| Lane labels | `TimelineLane` | **sticky to the left edge of the scroll frame** |
| Relationship layer | `RelationshipLineLayer` | `z-index: 1` behind cards |
| Event card layer | `TimelineEventCard` / `TimelineBundleCard` | `z-index: 2` |
| Right inspector | `EventInspector` / `TimelineBundleInspector` | **sticky to the top of the session scroll area** at desktop widths |
| Bottom mini-map / overview rail | `TimelineMiniMap` | scrolls with the page |

Behavior:

- The Session Detail header and tab bar stay pinned above the canvas while the
  user scrolls; the live session badge lives in the sidebar session card and
  the event-search input lives in the Timeline toolbar.
- The time ruler pins to the top of the scrolling canvas so the time scale
  is always readable.
- Faint vertical gridlines drop from each ruler tick through the lane area
  (`TimelineGridLines`), so an event card can be read against a real time
  position instead of floating free. They are derived from the same ticks
  as the ruler — no extra data — and sit behind the cards and relationship
  lines so they ground the canvas without competing with it.
- Lane labels pin to the left edge of the scrolling canvas. Long horizontal
  sessions keep their category structure visible.
- The right inspector stays in view at desktop widths so the user can keep
  the selected event's evidence visible while scanning the lanes.
- At widths under 1180 px the inspector stacks below the lane grid and
  loses its sticky behavior; the canvas drops the inner horizontal padding
  to give cards more room.

## Category controls

- The Timeline toolbar is a single row with `Day / Week / Session`,
  zoom controls, an `Active lanes only` toggle, a `Filter` button that
  opens the category popover, and a `넓게 / 보통 / 조밀` density toggle.
- The time-range and density toggles both render through the shared
  `SegmentedControl` component (`src/components/ui/SegmentedControl.tsx`)
  rather than hand-rolled `<div className="segmented">` markup, so the
  Timeline toolbar and the Evidence Quick Pass provider switch stay one
  consistent control.
- Density stays a **three-tier** choice (`comfortable` / `compact` /
  `dense`) on purpose: each tier is a genuinely distinct card geometry
  tuned for a different scan distance, so it is a discrete segmented
  choice, not a continuous slider that would imply fake granularity.
- The canonical lane set is eight always-visible lanes: 대화, 명령, 코드·파일,
  리서치, 이슈, 검토, 핸드오프, 노트. Git diff / commit activity folds into the
  코드·파일 lane (there is no separate Git lane); diff vs commit stays a card
  badge, not its own swimlane, so a vibe coder reads one "what changed" lane.
- Every lane label shows its event count as a plain number, including `0` for
  an empty lane, and the filter popover lists the same lanes with the same
  counts. Lane labels carry the primary categorical structure; the popover is
  a focused control, not a permanent legend.
- The category filter **highlights, it never hides.** Selecting one or more
  lanes dims the rest at the lane level; every lane and event stays rendered
  and selectable, so the swimlane structure never collapses when a category
  is toggled. Only the search query narrows the rendered set, so a "no
  results" state can come from search alone, never from the category filter.
- `Day / Week / Zoom in / Zoom out` ship disabled today with explanatory
  tooltips from `timelineControls.ts`. The disabled time-range segments
  stay visible (not hidden) so the control honestly shows what is planned.
  The toolbar carries a single dashed honesty line confirming that
  Session is the only working scope.
- Active filters are visible on the toolbar via a `Filter · N` count
  badge. The popover's `Clear` button resets them.

## View model

`buildTimelineRenderModel(input)` returns a `TimelineRenderModel`:

| Field | Description |
|---|---|
| `emptyVariant` | `demo-empty` / `draft-no-imports` / `draft-needs-quick-pass`. Non-null short-circuits the canvas. |
| `visibleEvents` | After filter + search. |
| `visibleDisplayItems` | After bundle generation. |
| `lanes` | `{ type, eventCount, itemCount, items }[]` in lane order. |
| `range` | `{ start, end }` for the time scale. |
| `ticks` | Axis ticks for the ruler. |
| `layout` | Frame width / height plus absolute item coords. |
| `layoutIndex` / `eventAnchorIndex` | Direct lookup maps. |
| `selectedItem` / `selectedIsBundle` | Resolved selection. |
| `focusedSet` / `focusActive` | Focused entity ids and the visibility regime flag. |

The model also exposes `getActiveLanes(model)` for the "active lanes only"
toggle and `getFocusedRelationships` / `countHiddenRelationships` for the
inspector's hidden-relationship line.

The inspector's input comes from `buildInspectorViewModel(...)`. The
inspector component receives a finished bundle of `sources`, `issues`,
`decisions`, `artifacts`, `nextActions`, `confidencePct`, and
`hiddenRelationshipCount` instead of re-filtering domain arrays inline.

## Card design rules

The Timeline canvas is a calm reading surface. Cards follow strict visual
rules:

- **No left accent bar.** Tone is conveyed by the card body gradient
  (`card-purple`, `card-green`, …) and the time-row icon color. No `::before`
  side stripe is used on event cards or bundle cards — it looks AI-template-y
  and breaks the calm.
- **No hover lift.** Hover changes only the border tone and the soft shadow.
  `transform: translateY(...)` is **not** in either card's transition list.
- **Fixed slot heights.** The internal grid is `14px 1fr 13px` (header /
  title / footer) so the header always pins to the top, the title always
  occupies the middle, and the footer slot always sits at the bottom —
  whether or not the footer contains content. Cards never visually jitter
  when a neighbour has different optional metadata.
- **Constant card height per density.** Event cards and bundle cards share
  the same height per density mode (`68px` comfortable, `54px` compact).
  Lane rows therefore stay the same height regardless of the lane's
  event/bundle mix.
- **Uniform lane height, empty lanes included.** Every lane renders at one
  band height. An empty lane shows just its label in a de-emphasised
  full-height band (not a slim sliver), so the swimlane reads as an even grid
  rather than a jagged stack of sizes.
- **Cards never resize.** A card keeps its laid-out width on hover and on
  selection. Cards are positioned on the time axis with only a small gap
  between neighbours, so growing a card rightward would cover the next one.
  Hover changes only border tone and shadow (see No hover lift); selection
  adds a ring and opens the inspector. Detail-on-demand lives in the inspector
  and the tooltip, never in a widening card.
- **Constant trust-badge width.** The trust badge in the card header is a
  single icon pill — the confidence percent lives only in the tooltip and
  the inspector. This keeps the header alignment identical across cards.

## Split Lane Header And Plot

The base Timeline stays lane-based, but each row has two separate regions:

- the left lane header shows only the lane icon, label, and count;
- the right plot area owns the time axis, grid lines, event tokens, hover
  previews, and relationship anchors.

Mori should preserve the time axis first: a 10:06 event must stay visually
near 10:06, but the row should not grow into a transcript when many events
arrive in the same lane.

Dense periods are handled in two tiers:

- nearby events stay individual as compact one-row tokens in the plot area;
- bundles are a fallback for genuinely overfull secondary context, not the
  default answer for small bursts.

A display item is therefore one of:

- `event` — a raw timeline event that remains individually inspectable.
- `bundle` — a dense work moment summarized into one intentional card.

The layout engine operates on display items, not directly on raw events.

## Interval Events

Timeline events are intervals, not just dots:

- conversation events represent the time from the relevant turn/work unit's
  start to its observed end;
- code/file events represent the editing or command span when the source
  provides both endpoints;
- review/decision/research/note events follow the same `start` / `end`
  contract when the capture path can infer it.

The canvas treats card width as a duration hint. Width is clamped by density so
a long event does not swallow the whole lane, and an event with no known end
collapses to the minimum compact token. The exact start/end remains available
in the hover preview and inspector.

This is intentional: if events are close together, Mori must not invent a later
timestamp merely to avoid overlap. The time position stays honest; when there
is too much detail to read in one lane, the user should use hover, selection
focus, zoom/minimap, or the chronological list. Vertical stacking and bundling
remain fallback strategies, not the default reading model.

## Work-flow bundle model

`createTimelineBundles(events, relationships, options)` applies these rules:

1. Sort events by lane and start time.
2. Group nearby same-lane events inside a short time window.
3. Preserve important events as individual cards:
   - selected event
   - decision events
   - events linked to decisions
   - events with stronger evidence density
4. Keep normal bursts individual; compact tokens and hover previews absorb
   close timestamps without growing the lane.
5. Generate a title and summary from the dominant lane/type mix instead of
   collapsing to a generic count.
6. If a lane still becomes too dense, merge only secondary neighbors while
   keeping preserved items individual.

Bundle cards prioritise: time range, event count, a meaningful title, and the
dominant type mix. Long summary copy lives in the hover preview and inspector,
not inside the lane card.

## Focus interaction model

The Timeline has exactly three focus tiers:

| State     | Class            | Visual              |
| --------- | ---------------- | ------------------- |
| selected  | `focus-selected` | strong border + outline, full opacity, highest z |
| related   | `focus-related`  | full opacity, same surface treatment |
| context   | `focus-context`  | 55% opacity, hover restores full opacity |

- **Entry selects nothing.** The Timeline opens neutral: no card is
  auto-selected, auto-highlighted, or auto-expanded. `resolveSelectedItem`
  returns `null` for an empty or unmatched `selectedEventId` rather than
  defaulting to the first card, so a session that does not contain the
  persisted id opens with a clean canvas.
- **Hover** an event card → it becomes the focus pivot for as long as the
  pointer stays on it. Hover never resizes the card (see Card design rules).
- **Click** an event card → pins the selection. The Inspector and the
  relationship layer follow the pinned selection; selection draws a ring and
  opens the inspector, it does not widen the card.
- In Timeline mode, once a selected item has connected neighbours, unrelated
  cards fade back. The selected item and directly related items stay fully
  legible; the rest remains present as context.
- **Hover / click a bundle** → Mori focuses the bundle's member events and
  any directly related downstream/upstream entities.
- **Clear focus** on Flow Focus moves the selection back to the first event
  so the user can start fresh without leaving the page.

Unrelated context never drops below ~55% opacity — Flow Focus must remain
legible, not washed out.

## Relationship line policy

`relationshipPolicy.ts` makes the policy explicit so it can be tested
without rendering React.

`chooseRelationshipVisibility({ mode, focusedSet, focusActive })` returns:

- `always-hidden` — Timeline mode with no active focus (default). No
  connectors render. The canvas stays a calm reading surface.
- `focused-only` — Timeline mode with an active focus. Only relationships
  where **both** endpoints land in the focused set render. Lines are
  subtle, drawn behind cards, anchored to the right/left edges of the
  upstream/downstream items.
- `graph` — Flow Focus mode. Wider 2-hop subgraph; stronger, brighter
  lines; aggregation still applies so duplicate `(from, to)` pairs collapse
  to a single weighted connector.

`buildVisibleConnectors(...)` aggregates raw relationships into visible
connectors:

- Multiple raw relationships that share the same visible `(from, to)` pair
  collapse into one connector with `weight = N` and `contributingIds`.
- The connector cap defaults to 8 in Timeline focus mode and 16 in Flow
  Focus mode.
- If a bundle absorbs a relationship endpoint, the line anchors to the
  bundle. The inspector explains the hidden detail via its
  `+N hidden` note.

Lines never cover card text. Cards sit at `z-index: 2`; lines at
`z-index: 1`.

## Inspector

Sections, in order:

1. **Type / trust / confidence badges** — `Verified`, `Observed`, or
   `Inferred`. Inferred events get a confidence percentage. `User-modified`
   shows when applicable.
2. **Summary** — the event summary text.
3. **Evidence / trust** — short prose plus the sources list with capture
   method and raw-retention policy.
4. **Linked items** — counts and top titles for issues, decisions,
   files/artifacts, next actions. The section header carries a
   `+N hidden` hint when relationships are outside the focused set.
5. **Impact** — only shown when the event has decisions attached.
6. **Actions** — two real buttons: `Flow trace` (navigates to Flow mode)
   and `Copy summary` (clipboard).
7. **Planned actions** — explicit row of disabled buttons:
   `Edit event`, `Split`, `Merge`, `Create issue`, `Add note`. Each carries
   a tooltip from `timelineControls.ts` explaining what is planned.
8. **Memo / correction** — disabled textarea labeled as Planned.

Mori never shows fake working buttons.

## Bundle Inspector

When the selected display item is a bundle, the right inspector switches
to `TimelineBundleInspector`. It shows the bundle kind, the time range,
the bundling reason, the included events, the represented sources,
decisions, and issues, an `Open Flow Focus` action, and a disabled
`Expand bundle inline` action labeled as planned.

## Empty state policy

`TimelineEmptyState` has three variants that map cleanly to runtime
conditions:

- **demo-empty** — demo mock had no events (rare).
- **draft-no-imports** — real session, zero imports. CTA opens Evidence.
- **draft-needs-quick-pass** — real session, has imports, no analysis yet.
  CTA runs Quick Pass.

Once Quick Pass runs against a real session, the full Timeline + Flow
Focus renders the analyzed events with the same focus tiers.

## Session timing model

`deriveSessionTiming({ draft, demoSession, analysisStatus, now })` is the
single source of truth for session lifecycle + duration labels. It returns:

- `state`: `demo | active | analyzing | draft | ended`.
- `stateLabel`: human label for the badge.
- `stateTone`: visual tone.
- `startIso` / `endIso`: ISO timestamps (active sessions bind `endIso` to
  `now`).
- `durationSeconds` and `durationLabel`: zero-padded `HH:MM:SS`.
- `startTimeLabel`: `13:02` style start time.
- `isLive`: whether callers should re-render every second.

The Session Detail header and the Sidebar session card both consume this
snapshot and re-render once per second only when `isLive` is true. The sidebar
timer is no longer hard-coded; ended sessions show the stored duration
verbatim; demo mode shows the demo session's baked range.

## Responsive behavior

The Timeline prefers readable cards over squeezing.

| Width | Behavior |
|---|---|
| ≥ 1600 px | `timeline-main` gets roomier padding. |
| 1180 – 1599 px | Default layout: sticky inspector, single-row toolbar, sticky lane labels and axis. |
| ≤ 1380 px | Toolbar tightens its gaps; toggle buttons compact their padding. |
| ≤ 1180 px | Inspector stacks below the canvas (non-sticky). Toolbar wraps to a single column. The Start Session summary panel's source list wraps to two columns. |

At desktop app widths similar to the screenshots, the canvas grows with
the column. At narrower widths the canvas allows intentional horizontal
scroll instead of shrinking cards below readable density.

## Scroll behavior

- `.timeline-scroller` is the ONLY horizontally-scrolling element.
- The browser scrollbars on the scroller and the inspector are styled
  subtly via `::-webkit-scrollbar` to stay calm and thin.
- The inspector is sticky at desktop widths and uses its own
  `overflow-y: auto` so its content can scroll independently when long.
- The page itself scrolls vertically; nothing else creates a nested
  vertical-scroll trap.

## Control honesty (`timelineControls.ts`)

The registry is the single source of truth for which Timeline / Inspector
controls are real today vs. planned. Components read from it; no string
literal `"planned"` lives inside JSX.

| Implemented | Planned |
|---|---|
| Density (Comfortable / Compact) | Day view, Week view |
| Category filter (popover) | Zoom in / Zoom out |
| Active lanes only toggle | Session end + final report writeback |
| Event search (toolbar input) | Sidebar collapse |
| Flow trace (inspector) | Edit event, Split, Merge, Create issue, Add note |
| Copy summary (inspector) | Save event memo |
| Export report | — |

The toolbar carries a single dashed line confirming that `Day / Week /
Zoom` are Planned. The inspector carries an explicit `Planned actions`
row instead of mixing planned buttons into the live row.

## Known limitations

- The bottom mini-map shows event dots but does not yet drive horizontal
  viewport navigation; the viewport indicator stays decorative.
- Cross-lane workflow bundles are prepared in the type model but not yet
  generated automatically.
- Inline bundle expansion is intentionally deferred.
- The Inspector's correction note is read-only; persisting user
  corrections is a planned milestone.
- Manual relationship edits, event split/merge, manual issue creation,
  and Quick Pass re-runs from Flow Focus are all visible as disabled
  buttons.
- Active-lanes-only is a per-session UI toggle; the hidden-lane preference
  does not persist across reload yet.
- The timeline is per-session today. A project-level aggregate timeline (all
  sessions in a project merged onto one swimlane / flow) is planned, so a user
  can read a whole project's activity over time rather than one session at a
  time.
