/**
 * The source references inside a continuation pack, found again in its text so
 * the preview can open what each item cites.
 *
 * The pack's text is what leaves Mori and is never changed here. Only refs the
 * pack itself issued, where the pack wrote them, are linked: a ref-shaped
 * string inside a title stays text, so a link leads to the item it ends.
 */
import type { ProjectContinuationPack } from "./projectContinuation";

export type ContinuationRef = { kind: "session" | "record"; id: string };

export type ContinuationSegment = { text: string; ref?: ContinuationRef };

// The pack writes each ref in parentheses at the END of its item line
// (`itemLine`). Anchoring there means a ref quoted inside a title, even one
// naming another item of the pack, stays text.
const REF = /\((mori:(session|record)\/[^()\s]+)\)$/gm;

/** Every ref the pack's own items carry. */
export function packRefs(pack: Pick<ProjectContinuationPack, "sessions" | "decisions" | "openTasks" | "notes">): Set<string> {
  return new Set([...pack.sessions, ...pack.decisions, ...pack.openTasks, ...pack.notes].map((item) => item.ref));
}

/** Splits the text into plain runs and the pack's own refs, losslessly. */
export function splitContinuationRefs(text: string, issued: ReadonlySet<string>): ContinuationSegment[] {
  const segments: ContinuationSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(REF)) {
    const ref = match[1]!;
    if (!issued.has(ref)) continue;
    const at = (match.index ?? 0) + 1;
    if (at > last) segments.push({ text: text.slice(last, at) });
    const kind = match[2] as ContinuationRef["kind"];
    segments.push({ text: ref, ref: { kind, id: ref.slice(`mori:${kind}/`.length) } });
    last = at + ref.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
