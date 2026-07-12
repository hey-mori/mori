/**
 * Watch the document for a text selection inside an opted-in scope
 * (`data-understand-scope` on a container) and report its text + anchor rect
 * so a floating 이해하기 chip can appear near it.
 *
 * Deliberately conservative: hides on scroll or resize (the rect goes stale,
 * matching InfoHint's behavior), ignores selections that cross out of the
 * scope, and ignores noise selections (`isUnderstandableSelection`). Pure DOM
 * observation; acting on the selection is the caller's job.
 */
import { useEffect, useState } from "react";
import { isUnderstandableSelection } from "../../lib/understand";

export type SelectionSnapshot = {
  text: string;
  /** Viewport rect of the selection's last range, for chip placement. */
  rect: { top: number; left: number; width: number; height: number };
};

function readScopedSelection(): SelectionSnapshot | null {
  if (typeof window === "undefined") return null;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const text = selection.toString();
  if (!isUnderstandableSelection(text)) return null;

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element =
    container instanceof Element ? container : container.parentElement;
  if (!element?.closest("[data-understand-scope]")) return null;

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    text,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
  };
}

export function useTextSelection(): SelectionSnapshot | null {
  const [snapshot, setSnapshot] = useState<SelectionSnapshot | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      // Debounce with a timer (not requestAnimationFrame: rAF pauses in
      // background windows) so the selection has settled after mouseup/keyup
      // and drag-selection does not flicker the chip on every extension.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setSnapshot(readScopedSelection()), 120);
    };
    const hide = () => setSnapshot((current) => (current ? null : current));

    document.addEventListener("selectionchange", refresh);
    document.addEventListener("mouseup", refresh);
    document.addEventListener("keyup", refresh);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("selectionchange", refresh);
      document.removeEventListener("mouseup", refresh);
      document.removeEventListener("keyup", refresh);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  return snapshot;
}

/** Collapse the live selection (after the chip consumed it). */
export function clearTextSelection(): void {
  if (typeof window === "undefined") return;
  window.getSelection()?.removeAllRanges();
}
