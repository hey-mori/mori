# Mori Feature Status

The Mori UI surfaces dozens of buttons, toggles, and capability rows. Every
one of them is registered in `src/app/featureStatus.ts` so the app can
never accidentally ship a fake-active control.

This document is the policy. The registry is the source of truth.

## Statuses

| Status | Meaning | UI behavior |
|---|---|---|
| `implemented` | Fully works today in the current runtime. | Renders active. |
| `partial` | Core works, some sub-capabilities are still Planned. | Renders active with a status badge that surfaces what's missing. |
| `planned` | Designed and documented; not yet implemented. | Renders disabled with the registry's `disabledReason` as tooltip. Never hidden · the surface stays legible. |
| `unavailable` | Runtime-blocked (e.g. desktop-only features in the browser build). | Renders disabled with the runtime explanation. |

## Registry shape

```ts
type FeatureCapability = {
  id: FeatureId;                  // namespaced "surface.capability"
  label: string;                  // human label
  status: FeatureStatus;
  description: string;            // one sentence
  userFacingStatus?: string;      // overrides the default status copy
  actionEnabled: boolean;         // derived: implemented | partial → true
  disabledReason?: string;        // tooltip when disabled
  nextStep?: string;              // concrete next move (optional)
  docsPath?: string;              // deep-dive doc path (optional)
  runtime?: "any" | "desktop" | "browser";
};
```

## Honesty contract

1. **No fake active controls.** Every visible button reads its enabled flag
   from `getFeatureControlProps(id).enabled` (or
   `getFeatureControlPropsInRuntime(id, runtime)` when the capability is
   runtime-gated). Hand-rolling `disabled={true}` without a registry row is
   not allowed.
2. **Planned controls render, but disabled.** Hiding planned controls makes
   the product surface dishonest. The user can see the catalogue; the
   tooltip explains the gap.
3. **The registry is the only place the tooltip lives.** UI strings like
   "다음 마일스톤" or "PDF는 아직 지원하지 않습니다" must come through
   `disabledReason`. Tests assert that every `planned` row carries a
   `disabledReason`.
4. **Surface rollups, not invented categories.** The Reports / Settings /
   Memory honesty strips read counts from `countFeaturesByStatus()` or
   `getSurfaceStatus(id).counts`. They never invent new categories.
5. **Connector capabilities live alongside features.** Claude Code hook,
   Codex CLI wrapper, VS Code / Cursor / Terminal / Browser extensions, and
   GitHub PR import all have `connector.*` ids in the registry. Mori
   advertises them as planned; never as active.

## Coverage

The registry covers (this is updated alongside `featureStatus.ts`):

- Timeline controls + Inspector actions (17)
- App shell (sidebar collapse, end session) (2)
- Evidence Hub source imports + Quick Pass (8)
- Review write actions (4)
- Reports export formats + resume prompt + Quick Pass rerun (6)
- Project Memory (4)
- Start Session (2)
- Settings (Local AI / Storage / Repositories / Theme / Privacy) (12)
- Surface-level rollups (`rollup.*`) (18)
- Connector capabilities (`connector.*`) (10)

`countFeaturesByStatus()` returns the live counts; the test suite asserts
the counts sum to the registry total.

## Adoption checklist for a new capability

1. Add the `FeatureId` to the union in `src/app/featureStatus.ts`.
2. Add a row to `REGISTRY_DATA` with the right `status` and (for `planned`)
   a clear `disabledReason`.
3. Add a test in `src/app/featureStatus.test.ts` if the row carries a
   non-obvious tooltip.
4. Bind the UI to `getFeatureControlProps(id)` (or `MoriPlannedAction` for
   disabled buttons, or `MoriFeatureStatusBadge` for status chips).
5. Update `PRODUCT_SURFACES` in `src/app/productFlow.ts` if the capability
   belongs to a surface rollup.
6. Update this file's "Coverage" section if you added a new bucket.

## Related

- [Product flow](./product-flow.md)
- [Data pipeline](./data-pipeline.md)
- [Modular architecture](./modular-architecture.md)
