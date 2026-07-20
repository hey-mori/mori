/**
 * Language tool dialog · the in-app HOST for the shared composer.
 *
 * This is a Mori-side shell only. Everything with product meaning
 * (`LanguageComposer`, `useLanguageAction`, `LanguageResultView`, the action and
 * provider contracts) lives outside it, so the Windows mini overlay hosts the
 * same parts in its own shell rather than reimplementing them. Keeping the shell
 * this thin is what makes the global surface a reuse instead of a rewrite.
 *
 * Ephemeral by construction: closing unmounts the composer, so nothing is kept
 * and a completed request can never resurface in a later one.
 */
import { useEffect, useRef } from "react";
import { Languages, X } from "lucide-react";
import { useAppStore } from "../../app/store";
import { LanguageComposer } from "./LanguageComposer";

export function LanguageDialog() {
  const open = useAppStore((state) => state.languageToolOpen);
  const close = useAppStore((state) => state.closeLanguageTool);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    // Move focus into the panel so the dialog is keyboard-usable immediately.
    panelRef.current?.querySelector("textarea")?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
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
