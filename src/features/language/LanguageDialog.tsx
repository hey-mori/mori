/**
 * Language tool dialog · the in-app HOST for the shared composer.
 *
 * This is a Mori-side shell only. Everything with product meaning
 * (`LanguageComposer`, `useLanguageAction`, `LanguageResultView`, the action and
 * provider contracts) lives outside it, so the global mini overlay hosts the
 * same parts in its own shell rather than reimplementing them. Keeping the shell
 * this thin is what makes the global surface a reuse instead of a rewrite.
 *
 * Overlay behaviour is borrowed, not reinvented (issue #17): the scrim and
 * z-index come from the shared tokens, and the focus trap is
 * `components/ui/focusTrap`. This dialog was the sixth divergent overlay stack;
 * it is now the first one on the shared pieces rather than the seventh off them.
 *
 * Ephemeral by construction: closing unmounts the composer, so nothing is kept
 * and a completed request can never resurface in a later one.
 */
import { useEffect, useRef } from "react";
import { Languages, X } from "lucide-react";
import { useAppStore } from "../../app/store";
import { focusFirstElement, trapTabKey } from "../../components/ui/focusTrap";
import { LanguageComposer } from "./LanguageComposer";

export function LanguageDialog() {
  const open = useAppStore((state) => state.languageToolOpen);
  const close = useAppStore((state) => state.closeLanguageTool);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Remembered before focus moves, so closing returns the user to whatever
    // they were on rather than dumping them at the top of the document.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      trapTabKey(event, panelRef.current);
    };
    window.addEventListener("keydown", onKeyDown);

    // The textarea is the point of the dialog, so it wins over the generic
    // first-focusable rule when it is present.
    const textarea = panelRef.current?.querySelector("textarea");
    if (textarea) textarea.focus();
    else focusFirstElement(panelRef.current);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="language-dialog-layer">
      <div className="language-dialog-backdrop" onClick={close} aria-hidden="true" />
      <div
        className="language-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="언어 도구"
        ref={panelRef}
      >
        <header className="language-dialog-head">
          <span className="language-dialog-title">
            <Languages size={15} aria-hidden="true" />
            언어 도구
          </span>
          <button type="button" className="language-dialog-close" aria-label="닫기" onClick={close}>
            <X size={14} aria-hidden="true" />
          </button>
        </header>
        <div className="language-dialog-body base-scroll">
          {/* Remounted per open · a stale result never leaks into a new session. */}
          <LanguageComposer />
        </div>
      </div>
    </div>
  );
}
