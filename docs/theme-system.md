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

Token-only sage variant. The selector
`[data-mori-theme="forest"]` is active when present. The runtime switcher
is Planned (`settings.themeSwitcher`); today the only way to preview it is
to set the attribute manually in DevTools.

### `nightLake` (Planned)

Reserved selector with no token overrides. The selector exists so the
future switcher can ship without re-plumbing every surface. Until the
switcher lands, the selector is intentionally inert — half-themed surfaces
never ship.

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

## Honesty about the switcher

The runtime theme switcher itself is **Planned** (registry id
`settings.themeSwitcher`). The token layer is **implemented** — adopters
can confidently reference `--mori-*` knowing the switcher won't break their
surfaces when it lands.

## Related

- [UX Reference](./ux-reference.md)
- [Modular Architecture](./modular-architecture.md)
- [Roadmap](./roadmap.md)
