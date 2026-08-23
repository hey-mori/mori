/**
 * The behaviour every modal overlay owes, in one place.
 *
 * Escape closes, Tab stays inside, the page behind stops scrolling, and focus
 * goes back where it came from when the overlay leaves. None of that is
 * optional for a dialog, and all of it is easy to forget.
 *
 * Issue #17 records the state this is answering: the focus-trap plus
 * scroll-lock effect is copy-pasted into 7 overlays and missing from 8 more,
 * even though `focusTrap.ts` has existed the whole time. A primitive nobody can
 * reach for is how that happens, so this is the reach-for-able version.
 *
 * Deliberately behaviour only. The scrim colour and the z-index are the other
 * half of #17 and they cannot be unified without seeing the result: flattening
 * `.base-drawer` at 120 and `.settings-sheet-layer` at 60 onto one step changes
 * which covers which when a drawer opens over a sheet. This hook can be adopted
 * by an overlay without touching how it looks.
 */
import { useEffect, useRef, type RefObject } from "react";
import { focusFirstElement, trapTabKey } from "./focusTrap";

export type OverlayShell = {
  /** Put this on the dialog element, not on the scrim or the layer. */
  ref: RefObject<HTMLDivElement | null>;
};

export function useOverlayShell(input: { open: boolean; onClose: () => void }): OverlayShell {
  const { open, onClose } = input;
  const ref = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      trapTabKey(event, ref.current);
    };
    document.addEventListener("keydown", onKey);

    // Restored rather than cleared, because an overlay opened over another
    // overlay must not hand scrolling back while the first one is still up.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // After paint: the element does not exist to focus into on the same frame
    // the effect runs.
    window.requestAnimationFrame(() => focusFirstElement(ref.current));

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  return { ref };
}
