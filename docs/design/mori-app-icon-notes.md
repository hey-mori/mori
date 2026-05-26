# Mori App Icon — Packaging Notes

How Mori's packaged platform app icons are produced and why each platform gets
a different composition. For the brand mark itself (the guiding star over a
focus beam, the purple-gradient tile, the colour contract) see
[`mori-brand-identity-reference.md`](mori-brand-identity-reference.md).

Preview / contact sheet (all generated sizes, Windows shown at 1:1 actual
pixels):
[`mori-icon-size-preview.png`](../assets/screenshots/mori-icon-size-preview.png).

## Source of truth

There is no binary master. All packaged icons are rendered procedurally from
the same vector geometry as the on-screen mark
([`src/components/brand/MoriLogo.tsx`](../../src/components/brand/MoriLogo.tsx),
[`public/favicon.svg`](../../public/favicon.svg)) by
[`scripts/generate-icons.cjs`](../../scripts/generate-icons.cjs). The script is
dependency-free Node so it runs anywhere, including CI.

Regenerate after any geometry change:

```
npm run generate:icons
```

The generated files are checked in (Tauri reads them at build time):

| File | Size(s) | Used by |
|---|---|---|
| `public/apple-touch-icon.png` | 180 | iOS web-clip |
| `src-tauri/icons/icon.png` | 1024 | source / Linux |
| `src-tauri/icons/32x32.png` | 32 | Tauri / Linux |
| `src-tauri/icons/128x128.png` | 128 | Tauri / Linux |
| `src-tauri/icons/128x128@2x.png` | 256 | Tauri / Linux HiDPI |
| `src-tauri/icons/icon.icns` | 16–1024 | macOS |
| `src-tauri/icons/icon.ico` | 16–256 | Windows |

## The packaged icon is not the in-product mark

The CSS/SVG mark in the UI is a flat rounded tile. A packaged *app* icon needs
platform-native composition, so the generator places the same artwork into a
per-platform tile:

- **macOS (`.icns`)** — a continuous-corner *squircle* (superellipse, exponent
  5) on Apple's icon grid: the tile body is ~80% of the canvas with a ~9.8%
  transparent safe-area margin and a corner radius ~22.5% of the body. macOS
  does not mask the icon, so the squircle and the safe area are baked in.
- **Windows (`.ico`)** — a near-full-bleed rounded tile (small margin) because
  Windows does not mask either, and a padded icon looks tiny in the taskbar.
- **Linux / generic (`.png`)** — a balanced margin between the two.
- **iOS web-clip** — a full-bleed, fully opaque square; iOS applies its own
  rounded mask, so transparent corners would show a fringe.

## Level of detail by size

Small icons are not just downscaled — detail is dropped so the silhouette
survives:

- **Beam** is drawn only at ≥ 64px. Below that it turns to grey mud and muddies
  the star, so it is omitted and the star is recentred.
- **Star** is enlarged at small sizes (≈ 1.08× at ≤ 32px, ≈ 1.16× at ≤ 20px) so
  the four concave points stay legible instead of collapsing into a plus sign.

Anti-aliasing is supersampled (up to 24×24 samples per output pixel at small
sizes), so edges and the squircle stay clean at 16px.

## Windows `.ico` encoding

The `.ico` carries the full set Windows asks for across DPI scales: 16, 20, 24,
32, 40, 48, 64, 128, 256. Missing intermediate sizes force Windows to scale a
neighbour, which is the usual cause of a blurry taskbar icon.

Entries ≤ 64px are stored as uncompressed 32-bit BMP/DIB with a derived 1-bit
AND mask. Some Windows shell surfaces (small Explorer views, older code paths)
render PNG-in-`.ico` poorly at small sizes, so BMP is the safe choice there.
128 and 256 stay PNG — they only appear in large views that handle PNG fine,
and PNG keeps the file small.

## Windows icon cache

If a rebuilt Windows binary still shows the old icon, suspect the Windows icon
cache, not the asset. Confirm the `.ico` first (open it, check all nine sizes
render), then clear the cache:

```
ie4uinit.exe -show
```

or delete `%LOCALAPPDATA%\IconCache.db` / `%LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache_*.db`
and restart Explorer.
