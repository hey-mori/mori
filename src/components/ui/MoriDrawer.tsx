import { useEffect, useRef, type ReactNode } from "react";

export type MoriDrawerProps = {
  /** When false the drawer (and its children) are unmounted entirely. */
  open: boolean;
  /** Called on scrim click, Escape, or any child-driven dismiss. */
  onClose: () => void;
  /** Accessible name for the dialog. */
  ariaLabel: string;
  children: ReactNode;
};

/**
 * MoriDrawer — a right-side overlay panel for focused tasks (importing a
 * source, editing, confirming) so the surface behind it does not have to
 * reflow. The drawer owns the scrim, Escape-to-close, body scroll lock, and
 * initial focus; the caller owns the content (including its own header /
 * close button). Children unmount while closed so transient form state in
 * the drawer never lingers between openings.
 */
export function MoriDrawer({ open, onClose, ariaLabel, children }: MoriDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mori-drawer">
      <div className="mori-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="mori-drawer-panel mori-scroll"
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
