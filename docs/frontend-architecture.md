# Frontend Architecture

Mori's frontend should stay semantic and local-first: UI code should describe
product concepts, while tokens and small CSS files carry the visual decisions.
This document is the migration plan away from the current single large
`src/styles.css` file.

Current status: global reset/base rules live in `src/styles/reset.css`, and the
application shell/sidebar/settings-sheet styles live in
`src/styles/app-shell.css`. The remaining `src/styles.css` file should continue
to shrink by feature ownership.

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
  It should become stricter after `src/styles.css` is split.
- `npm run unused` runs Knip in advisory mode. Treat output as a backlog, not an
  automatic deletion list.

## First Extraction Order

1. `reset.css`: `:root`, universal box sizing, body, button/input defaults.
2. `app-shell.css`: `.app-shell`, `.workspace`, `.sidebar-*`,
   `.settings-sheet-*`.
3. `primitives/*.css`: `.btn-*`, `.badge-*`, `.base-*`, `.info-hint-*`.
4. Feature files in this order: `reports`, `evidence`, `review`, `timeline`,
   `memory`, `sources`.
