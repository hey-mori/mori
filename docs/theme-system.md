# Mori Theme System

Mori uses a layered theme system so each screen can share one color contract
instead of carrying page-specific light/dark overrides.

## Runtime Flow

1. `src/lib/settings/themePreference.ts` owns selectable theme ids, display
   metadata, color scheme, storage parsing, persistence, and DOM attributes.
2. `src/main.tsx` calls `applyThemePreferenceToDocument(loadThemePreference())`
   before React mounts, so the saved color theme and font scale are present
   before first paint.
3. `src/app/themeStore.ts` hydrates the same preference into Zustand and applies
   changes immediately when Settings changes theme or font scale.
4. `src/styles/tokens.css` provides the default raw token values.
5. `src/styles/theme.css` maps raw tokens to semantic and component role tokens.
6. `src/styles/theme-application.css` loads last and remaps legacy hard-coded
   surfaces onto the role tokens.

The document root receives:

- `data-base-theme="formal | forest | nightLake"`
- `data-mori-theme="formal | forest | nightLake"` as a compatibility alias
- `data-color-scheme="light | dark"`
- `data-font-scale="small | normal | large | xlarge"`

## Token Layers

Layer 1, raw compatibility tokens:

- `--bg`, `--panel`, `--panel-soft`
- `--line`, `--line-strong`
- `--text`, `--muted`, `--muted-2`
- `--purple`, `--green`, `--blue`, `--orange`, `--red`, `--cyan`

Layer 2, semantic base tokens:

- `--base-bg`
- `--base-surface`, `--base-surface-subtle`, `--base-surface-overlay`
- `--base-text`, `--base-text-muted`, `--base-text-muted-2`
- `--base-border`, `--base-border-strong`, `--base-border-focus`
- `--base-accent`, `--base-accent-soft`, `--base-accent-strong`
- `--base-status-*`, `--base-trust-*`, `--base-shadow-*`

Layer 3, canonical role tokens for new CSS:

- `--color-app-bg`, `--color-app-foreground`
- `--color-surface-*`
- `--color-text-*`
- `--color-border-*`
- `--color-accent-*`
- `--color-success-*`, `--color-warning-*`, `--color-danger-*`, `--color-info-*`
- `--button-*`, `--input-*`, `--card-*`, `--popover-*`, `--modal-*`
- `--sidebar-*`, `--timeline-*`

New CSS should prefer Layer 3. Layer 1 remains for old stylesheets, and theme
presets update it so older screens still change consistently.

## Theme Presets

`formal` is the default light theme. Its values come from `tokens.css`.

`forest` is a light sage/spruce variant. It updates both raw and semantic tokens,
which keeps older `var(--panel)` and newer `var(--color-surface-base)` users in
sync.

`nightLake` is the dark theme. It updates raw, semantic, and dark-specific role
tokens such as primary button foreground and modal scrim.

## Migration Rule

When touching CSS:

- Use role tokens such as `--color-surface-base`, `--color-text-primary`,
  `--color-border-default`, `--button-primary-background`, and
  `--timeline-event-background`.
- Do not add new `white`, slate/gray hex values, or theme-specific selectors
  inside feature stylesheets unless the color is genuine content data.
- If a legacy hard-coded selector affects many surfaces, add the bridge in
  `src/styles/theme-application.css` instead of patching only the visible page.
- Keep brand gradient usage limited to the Mori mark and brand-only surfaces.
