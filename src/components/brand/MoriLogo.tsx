import { useId } from "react";

/**
 * Mori brand mark + lockup.
 *
 * The mark is a memory tag — a notched bookmark with a counter hole: the
 * shape you attach to a piece of work to mark and keep it. It expresses
 * `remembered work` and `continuity` (the point marks where you resume).
 * See docs/design/mori-logo-mark-exploration.md for the direction review.
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

/** The memory-tag path: a notched bookmark with a counter hole. */
const MORI_MARK_PATH =
  "M24 14 H40 a6 6 0 0 1 6 6 V50 L32 40 L18 50 V20 a6 6 0 0 1 6 -6 Z " +
  "M27 25.5 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 Z";

function MoriMark({ tone, size }: { tone: MoriLogoTone; size: number }) {
  const gradientId = useId();

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
        <path d={MORI_MARK_PATH} fill="currentColor" fillRule="evenodd" />
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
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7D5BFF" />
          <stop offset="1" stopColor="#B18CFF" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${gradientId})`} />
      <path d={MORI_MARK_PATH} fill="#FFFFFF" fillRule="evenodd" />
    </svg>
  );
}
