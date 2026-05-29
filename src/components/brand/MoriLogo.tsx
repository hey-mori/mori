import { useId } from "react";

/**
 * Mori brand mark + lockup.
 *
 * The mark is a guiding star over a soft focus beam: a calm AI companion
 * signal that still reads as a real app icon at favicon size.
 *
 *   - `mark`     — the rounded gradient tile only (app-icon shape).
 *   - `wordmark` — the lowercase `mori` wordmark only.
 *   - `lockup`   — mark + wordmark side by side (default).
 *
 * `tone="mono"` swaps the gradient tile for a flat `currentColor` mark with
 * no tile, for monochrome contexts (dark surfaces, print, dense chrome).
 */
type MoriLogoVariant = "mark" | "wordmark" | "lockup";
type MoriLogoTone = "brand" | "mono";

export function MoriLogo({
  variant = "lockup",
  tone = "brand",
  size = 30,
  className,
}: {
  variant?: MoriLogoVariant;
  tone?: MoriLogoTone;
  size?: number;
  className?: string;
}) {
  const showMark = variant !== "wordmark";
  const showWord = variant !== "mark";

  return (
    <span
      className={`mori-logo${className ? ` ${className}` : ""}`}
      data-variant={variant}
      data-tone={tone}
    >
      {showMark ? <MoriMark tone={tone} size={size} /> : null}
      {showWord ? <span className="mori-logo-word">mori</span> : null}
    </span>
  );
}

/** The brand mark's guiding-star path, on a 0 0 64 64 viewBox. Exported so other
 *  surfaces (e.g. the work-graph hub) can render the mark inline as SVG. */
export const MORI_STAR_PATH =
  "M32 14.125 C34.5 14.125 35.375 16.4375 36.5 21.0625 " +
  "C37.875 26.75 39.875 28.875 45.125 30.3125 " +
  "C49.1875 31.375 50.375 32.3125 50.375 33.5 " +
  "C50.375 35.0625 48.4375 35.75 44.625 36.75 " +
  "C39.375 38.125 37.5625 40.1875 36.1875 45.875 " +
  "C35.0625 50.5 34.5 52.25 32 52.25 " +
  "C29.5 52.25 28.9375 50.5 27.8125 45.875 " +
  "C26.4375 40.1875 24.625 38.125 19.375 36.75 " +
  "C15.5625 35.75 13.625 35.0625 13.625 33.5 " +
  "C13.625 32.3125 14.8125 31.375 18.875 30.3125 " +
  "C24.125 28.875 26.125 26.75 27.5 21.0625 " +
  "C28.625 16.4375 29.5 14.125 32 14.125 Z";

const MORI_BEAM_PATH =
  "M17.1 64 L25.9 38.1 C27.5 40.4 29.5 41.7 32 42.8 " +
  "C34.5 41.7 36.5 40.4 38.1 38.1 L46.9 64 Z";

function MoriMark({ tone, size }: { tone: MoriLogoTone; size: number }) {
  const tileGradientId = useId();
  const beamGradientId = useId();

  if (tone === "mono") {
    return (
      <svg
        className="mori-logo-mark"
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
      >
        <path d={MORI_STAR_PATH} fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      className="mori-logo-mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={tileGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5C52F4" />
          <stop offset="0.55" stopColor="#715DEB" />
          <stop offset="1" stopColor="#AA86F5" />
        </linearGradient>
        <linearGradient id={beamGradientId} x1="0" y1="0.45" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.38" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="9.5" fill={`url(#${tileGradientId})`} />
      <path d={MORI_BEAM_PATH} fill={`url(#${beamGradientId})`} />
      <path d={MORI_STAR_PATH} fill="#FFFFFF" />
    </svg>
  );
}
