import { useId } from "react";

/**
 * Mori brand mark + lockup.
 *
 * The mark is an abstract pair of stacked, ascending chevrons — a focus beam
 * rising through layers of memory. It deliberately avoids the decorative
 * "AI sparkle" of the source concept board: Mori is a calm work tool, not a
 * chatbot toy. See docs/design/mori-brand-identity-reference.md.
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
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 32 L32 19 L45 32" />
          <path d="M19 47 L32 35 L45 47" opacity="0.5" />
        </g>
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
      <g
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 32 L32 19 L45 32" />
        <path d="M19 47 L32 35 L45 47" opacity="0.55" />
      </g>
    </svg>
  );
}
