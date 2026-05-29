import { useEffect, useRef, type ReactNode } from "react";
import { focusFirstElement, trapTabKey } from "./focusTrap";

export type BaseDrawerProps = {
  /** When false the drawer (and its children) are unmounted entirely. */
  open: boolean;
  /** Called on scrim click, Escape, or any child-driven dismiss. */
  onClose: () => void;
  /** Accessible name for the dialog. */
  ariaLabel: string;
  children: ReactNode;
};

/**
 * BaseDrawer — a right-side overlay panel for focused tasks (importing a
 * source, editing, confirming) so the surface behind it does not have to
 * reflow. The drawer owns the scrim, Escape-to-close, body scroll lock, and
 * initial focus; the caller owns the content (including its own header /
 * close button). Children unmount while closed so transient form state in
 * the drawer never lingers between openings.
 */
export function BaseDrawer({ open, onClose, ariaLabel, children }: BaseDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      trapTabKey(event, panelRef.current);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => focusFirstElement(panelRef.current));
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="base-drawer">
      <div className="base-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="base-drawer-panel base-scroll"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
