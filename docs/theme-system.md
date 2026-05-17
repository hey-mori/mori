# Mori Theme System

Mori uses a three-layer token system so future themes can land without
rewriting every surface CSS rule.

## Layers

```
┌────────────────────────────────────────────────────────────┐
│ Layer 1 — Raw values                  src/styles/tokens.css │
│   --bg, --panel, --text, --purple, --green, --shadow, ...  │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│ Layer 2 — Semantic roles              src/styles/theme.css  │
│   --mori-surface, --mori-text-muted, --mori-status-success │
│   --mori-trust-verified, --mori-radius-md, --mori-shadow-* │
│   --mori-space-1..12 (spacing scale)                        │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│ Layer 3 — Themes                                            │
│   [data-mori-theme="formal"]   — default (Mori product look)│
│   [data-mori-theme="forest"]   — token-only sage variant    │
│   [data-mori-theme="nightLake"] — Planned                   │
└────────────────────────────────────────────────────────────┘
```

## Adoption guideline

- **New CSS** should reference `--mori-*` variables (Layer 2), never the raw
  Layer-1 tokens. The point of Layer 2 is to make theme overrides cheap.
- **Component primitives** (`MoriCard`, `MoriStatusBadge`, `MoriTrustBadge`,
  `MoriFeatureStatusBadge`, `MoriPlannedAction`, `MoriScrollArea`,
  `MoriStatCard`, `MoriToolbar`, `MoriEmptyState`) all consume Layer 2 only.
- **Legacy CSS** still using Layer 1 keeps working — Layer 2 references the
  same values. Migrate opportunistically when the surface is being touched
  for other reasons.

## Spacing

The `--mori-space-{0..12}` ramp replaces hard-coded `px` paddings inside the
new primitives. The ramp values:

| Token | px |
|---|---|
| `--mori-space-0` | 0 |
| `--mori-space-1` | 4 |
| `--mori-space-2` | 6 |
| `--mori-space-3` | 8 |
| `--mori-space-4` | 10 |
| `--mori-space-5` | 12 |
| `--mori-space-6` | 14 |
| `--mori-space-7` | 16 |
| `--mori-space-8` | 20 |
| `--mori-space-9` | 24 |
| `--mori-space-10` | 32 |
| `--mori-space-12` | 40 |

## Themes today

### `formal` (default)

Calm white / soft-gray surfaces, purple accent, formal productivity feel.
The default Mori look. Token overrides are empty because the Layer-2 base
already describes it.

### `forest`

A sage variant. The selector `[data-mori-theme="forest"]` is active when
present. Selectable at runtime from Settings → 화면 (registry id
`settings.themeSwitcher`).

### `nightLake` (Planned)

Reserved selector with no token overrides. The Settings → 화면 switcher
renders it as a disabled, honestly-labelled Planned option — it is never
a valid stored preference, because selecting it would render nothing.
The selector exists so the future dark theme can ship without re-plumbing
every surface.

## Reusable theme-driven classes

| Class | Purpose |
|---|---|
| `.mori-scroll` | Subtle scrollbar styling matching `--mori-scrollbar-*`. |
| `.mori-status-badge` | Compact tone-colored pill (`data-mori-tone="success/info/warning/danger/accent/neutral"` or `"verified/observed/inferred"`). |
| `.mori-feature-status-chip` | Larger feature-status chip with a leading dot. |
| `.mori-card` | Surface container with semantic border + shadow tokens. Variants: `default`, `subtle`, `accent`, `outline`. |
| `.mori-stat-card` | KPI cell for surface honesty strips. |
| `.mori-toolbar` | Horizontal flex strip with calm spacing tokens. |
| `.mori-empty-state` | Calm empty-state surface. |
| `.mori-planned-action` | Disabled-with-tooltip button used by `MoriPlannedAction`. |

## The runtime switcher

The runtime theme switcher is **implemented** (registry id
`settings.themeSwitcher`). It lives at Settings → 화면 and switches
between `formal` and `forest`. The selected theme is a local-only
preference (`mori.themePreference` in browser storage); it never syncs
and never affects data access, capture, or memory. `applyThemeToDocument`
sets `data-mori-theme` on `<html>`, and `src/main.tsx` applies the saved
theme before the first paint so a non-default theme does not flash on
reload.

## Related

- [UX Reference](./ux-reference.md)
- [Modular Architecture](./modular-architecture.md)
- [Roadmap](./roadmap.md)
