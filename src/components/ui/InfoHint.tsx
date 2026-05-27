import { Info } from "lucide-react";
import type { ReactNode } from "react";

export type InfoHintProps = {
  /** Short explanation revealed on hover / focus. */
  children: ReactNode;
  /** Accessible name for the trigger. */
  label?: string;
  /** Which edge of the icon the bubble aligns to (avoids viewport clipping). */
  align?: "start" | "end" | "center";
  className?: string;
};

/**
 * A quiet info icon that reveals a short explanation on hover / focus — the
 * copy-diet primitive for dense surfaces. Keep the always-visible UI terse and
 * move the "why / how" into the bubble. CSS-only show/hide (no state); the
 * trigger is a focusable button so keyboard users get the same hint.
 */
export function InfoHint({
  children,
  label = "설명",
  align = "start",
  className = "",
}: InfoHintProps) {
  return (
    <span className={`info-hint info-hint-${align} ${className}`.trim()}>
      <button type="button" className="info-hint-trigger" aria-label={label}>
        <Info size={13} aria-hidden="true" />
      </button>
      <span className="info-hint-bubble" role="tooltip">
        {children}
      </span>
    </span>
  );
}
