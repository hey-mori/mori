# Frontend Architecture

Mori's frontend should stay semantic and local-first: UI code should describe
product concepts, while tokens and small CSS files carry the visual decisions.
This document records the migration away from the former single large
`src/styles.css` file, which has now been fully dissolved.

Current status: the monolith is gone. Global reset/base rules live in
`src/styles/reset.css`, the application shell/sidebar/settings-sheet styles live
in `src/styles/app-shell.css`, a reusable component layer lives under
`src/components/ui/*.css`, and the feature-screen CSS lives in
`src/styles/features/*.css`. `globals.css` is the single import entry that
orders all of these.

The feature sheets were carved out by a byte-identical, brace-depth-zero split,
so they preserve the original cascade exactly but are not yet feature-pure: some
sheets still contain secondary, interleaved rules (e.g. `memory-settings.css`
holds account/settings/memory/consolidation). The next refinement is to migrate
stray rules toward their owning sheet, one move at a time, under the
cascade-order discipline below.

### Realized component layer

These reusable primitives have been lifted out of `styles.css` into colocated
component sheets, imported by `globals.css` after `app-shell.css` and before
`styles.css` so the component layer always precedes feature overrides:

- `components/ui/Button.css`: `.btn`, `.btn-sm`, `.btn-primary`, `.btn-ghost`,
  `.btn-icon`.
- `components/ui/InfoHint.css`: `.info-hint*` and the `info-hint-in` keyframe.
- `components/ui/BaseTooltip.css`: `.base-tooltip-anchor`, `.base-tooltip-bubble*`.
- `components/ui/base-objects.css`: `.base-list-row*`, `.base-object-row*`,
  `.base-search-field*`, `.base-section-header*`, `.base-metric-strip*`,
  `.base-action-cluster*`, `.base-metadata-*`.
- `components/ui/layout-components.css`: `.inspector-panel*`,
  `.layout-empty-state*`, `.notice-banner*`.
- `components/ui/Modal.css`: `.base-modal*`, `.project-modal*`.

### Cascade-order discipline (non-negotiable)

`styles.css` is a single large sheet where feature selectors are deeply
interleaved, so CSS source order is load-bearing. Before relocating any rule:

1. Confirm the block is contiguous and every external reference to its
   selectors is either a higher-specificity contextual override (wins
   regardless of order) or absent. Then the move is provably safe.
2. Re-import the relocated sheet in `globals.css` so its position in the
   cascade is unchanged or earlier-but-non-conflicting.
3. Verify with `npm run style:check`, `npm run build`, and a browser check
   that the affected screens render unchanged.

## Styling Direction

Keep the current design-token model:

- `src/styles/tokens.css`: raw color, spacing, radius, shadow values.
- `src/styles/theme.css`: semantic theme roles and theme overrides.
- `src/styles/globals.css`: import order and truly global setup.
- Feature CSS files: screen-specific selectors such as `timeline-*`,
  `reports-*`, `memory-*`.
- Component CSS files: reusable primitive selectors such as `base-*`, `btn-*`,
  `badge-*`, `tooltip-*`.

Tailwind remains available in the build pipeline, but Mori should not migrate
to utility-first JSX by default. Dense workbench screens are easier to maintain
when class names carry product meaning.

## Target Layout

```txt
src/styles/
  globals.css
  reset.css
  tokens.css
  theme.css
  app-shell.css

src/components/ui/
  Button.tsx
  Button.css
  BaseTooltip.tsx
  BaseTooltip.css

src/features/timeline/
  TimelineView.tsx
  timeline.css

src/features/reports/
  ReportBuilderPanel.tsx
  reports.css
```

## Migration Rules

1. Move CSS by ownership, not by visual similarity.
2. Preserve selector names during moves unless a component is being rewritten.
3. Update `src/styles/globals.css` import order after each extraction.
4. Run targeted tests for the moved feature and `npm run build`.
5. Do not run repository-wide formatting during feature refactors.

## Tooling Policy

- `npm run lint` is advisory at first. It reports hooks and unused-code warnings
  without blocking the existing baseline.
- `npm run format` intentionally formats only tooling config files. A
  repository-wide Prettier baseline should be a separate explicit commit.
- `npm run style:check` validates CSS syntax and relaxed maintainability rules.
  Now that the monolith is split, it can be tightened sheet by sheet.
- `npm run unused` runs Knip in advisory mode. Treat output as a backlog, not an
  automatic deletion list.

## Extraction Order

1. `reset.css`: `:root`, universal box sizing, body, button/input defaults.
   Done.
2. `app-shell.css`: `.app-shell`, `.workspace`, `.sidebar-*`,
   `.settings-sheet-*`. Done.
3. Component layer in `components/ui/*.css`: tooltips, buttons, base rows,
   layout components, modal. Done (see Realized component layer above).
4. Feature CSS split into `src/styles/features/*.css`: `timeline`,
   `start-session`, `session-shell`, `home`, `review-evidence`,
   `notifications`, `memory-settings`, `settings-tools`, `timeline-responsive`,
   `connections`, `command-palette`, `project-page`, `sources`. Done by a
   byte-identical split.

The next step is feature purity: the sheets were cut on position, not ownership,
because the selectors were interleaved across the original file. Migrate stray
rules toward their owning sheet one move at a time, each gated by the
cascade-order discipline above and verified in the browser. Do not attempt a
single bulk reorder.
