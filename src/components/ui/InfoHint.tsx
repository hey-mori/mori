import { Info } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type InfoHintProps = {
  /** Short explanation revealed on hover / focus. */
  children: ReactNode;
  /** Accessible name for the trigger. */
  label?: string;
  /**
   * Deprecated. Positioning is now automatic (the bubble floats above the icon
   * and flips below near the top of the viewport). Kept only so existing call
   * sites that still pass it keep compiling.
   */
  align?: "start" | "end" | "center";
  className?: string;
};

type Coords = { top: number; left: number; placement: "top" | "bottom" };

const MAX_W = 280;
const GAP = 8;

/**
 * A quiet info icon that reveals a short explanation on hover / focus, the
 * copy-diet primitive for dense surfaces. The bubble renders into a portal at
 * document.body with fixed positioning, so it floats on top of everything,
 * never gets clipped by an overflow:hidden ancestor, and never takes layout
 * space. It prefers to sit above the icon and flips below when there is no room
 * above. The trigger is a focusable button so keyboard users get the same hint.
 */
export function InfoHint({ children, label = "설명", className = "" }: InfoHintProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<Coords | null>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    const placement: "top" | "bottom" = r.top >= 150 ? "top" : "bottom";
    const half = MAX_W / 2;
    const left = Math.min(
      Math.max(r.left + r.width / 2, half + GAP),
      window.innerWidth - half - GAP,
    );
    const top = placement === "top" ? r.top - GAP : r.bottom + GAP;
    setCoords({ top, left, placement });
  }, []);

  const hide = useCallback(() => setCoords(null), []);

  // While open, hide on scroll / resize so the bubble never drifts off its
  // anchor (cheaper and calmer than continuously repositioning a hover hint).
  useEffect(() => {
    if (!coords) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [coords, hide]);

  return (
    <span className={`info-hint ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="info-hint-trigger"
        aria-label={label}
        onPointerEnter={place}
        onPointerLeave={hide}
        onFocus={place}
        onBlur={hide}
      >
        <Info size={13} aria-hidden="true" />
      </button>
      {coords && typeof document !== "undefined"
        ? createPortal(
            <span
              className={`info-hint-bubble is-${coords.placement}`}
              role="tooltip"
              style={{ top: coords.top, left: coords.left }}
            >
              {children}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
