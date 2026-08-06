# Mori Logo Mark

Mori's production mark is a clean vector version of the guiding-light app
icon: a rounded purple gradient tile, a soft upward focus beam, and a white
four-point star.

## Production Assets

- [favicon.svg](../../public/favicon.svg) · web favicon source.
- [mori-mark.svg](../../public/mori-mark.svg) · full-color app-icon tile.
- [mori-mark-mono.svg](../../public/mori-mark-mono.svg) · single-color mark
  for monochrome contexts.
- [mori-logo-lockup.svg](../../public/mori-logo-lockup.svg) · icon + wordmark.
- `src/components/brand/MoriLogo.tsx` · React implementation used in product
  chrome.
- `src-tauri/icons/` · raster desktop icon outputs generated from
  `scripts/generate-icons.cjs`.

## Usage Notes

The SVG files intentionally do not include a white background. Transparent
corners come from the rounded tile geometry itself, so the mark can sit cleanly
on macOS, Windows, browser tabs, and product surfaces.

Use the full gradient tile only for app identity moments: favicon, desktop app
icon, sidebar brand, and lockup. In dense UI, use the monochrome mark or the
shared Lucide icon vocabulary instead of introducing extra brand decoration.
