/**
 * The floating 이해하기 affordance: a small portal chip anchored above the
 * current text selection. Clicking it hands the selected text to the
 * Understand panel; it never acts on its own.
 *
 * Placement follows InfoHint's pattern (body portal, fixed position, flip to
 * below when there is no headroom, clamp horizontally) so it is never clipped
 * by an overflow ancestor and takes no layout space.
 */
import { createPortal } from "react-dom";
import { Languages } from "lucide-react";
import type { SelectionSnapshot } from "./useTextSelection";

const CHIP_HEIGHT = 30;
const GAP = 8;
const EDGE = 8;

export function UnderstandChip({
  selection,
  onUnderstand,
}: {
  selection: SelectionSnapshot;
  onUnderstand: (text: string) => void;
}) {
  if (typeof document === "undefined") return null;

  const { rect } = selection;
  const above = rect.top - CHIP_HEIGHT - GAP >= EDGE;
  const top = above ? rect.top - CHIP_HEIGHT - GAP : rect.top + rect.height + GAP;
  const centerX = rect.left + rect.width / 2;
  const left = Math.min(Math.max(centerX, EDGE + 60), window.innerWidth - EDGE - 60);

  return createPortal(
    <button
      type="button"
      className="understand-chip"
      style={{ top, left }}
      // The selection collapses on mousedown before click fires; capture the
      // text at mousedown so the click handler still has it.
      onMouseDown={(event) => {
        event.preventDefault();
        onUnderstand(selection.text);
      }}
    >
      <Languages size={13} aria-hidden="true" />
      이해하기
    </button>,
    document.body,
  );
}
