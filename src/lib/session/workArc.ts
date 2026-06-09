/**
 * Split an analysis session summary into an ordered set of work-phase steps.
 *
 * The Quick Pass summary for a real session is already a chronological
 * narrative: the Ollama chunk merge joins each pass's summary with " / ", and
 * the model separates stages with sentences. Rendered as a paragraph it reads
 * as a wall of text; split into ordered steps it becomes a scannable arc of how
 * the work actually progressed — the first slice of the AI work-flow view.
 *
 * Returns `[]` when the summary has no usable multi-step structure, so the
 * caller can fall back to showing the plain paragraph. Pure and deterministic:
 * it only reshapes text the analysis already produced, with no new model call.
 */
export function buildWorkArc(summary: string | null | undefined, max = 6): string[] {
  const text = (summary ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];

  // Primary split on the explicit " / " separator the chunk merge writes.
  let parts = splitClean(text, /\s*\/\s*/);
  // No explicit separator (single-chunk or deterministic summary): fall back to
  // sentence boundaries so one long narrative still breaks into steps.
  if (parts.length < 2) {
    parts = splitClean(text, /[.!?。]+\s+/);
  }

  // An arc needs at least two steps; otherwise the caller shows the paragraph.
  if (parts.length < 2) return [];
  return parts.slice(0, max);
}

function splitClean(text: string, separator: RegExp): string[] {
  return text
    .split(separator)
    .map((part) =>
      part
        .trim()
        // Drop a leading bullet / separator and any trailing sentence
        // punctuation so each step reads as a clean phase label.
        .replace(/^[\s·\-–—]+/, "")
        .replace(/[\s.!?。]+$/, ""),
    )
    .filter((part) => part.length > 0);
}
