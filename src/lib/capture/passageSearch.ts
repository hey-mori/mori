/**
 * Finding a record by the words of the passage it was saved from, after its
 * body was rewritten. The passage text already lives on its kernel source
 * (the redacted form when the user hid part of it), so this adds no field and
 * no index: it reads the saved passages of live records and matches them the
 * way 기록 matches a title or body.
 */
import type { KernelSource, SourceLink } from "../record-kernel/kernelTypes";

const PASSAGE_KEY_PREFIX = "mori:session/";

export const PASSAGE_MATCH_LABEL = "저장한 구절에서 찾음";

/** The saved passage texts of each record, by record id. */
export function savedPassageTexts(
  sources: readonly KernelSource[],
  links: readonly SourceLink[],
): Map<string, string[]> {
  const textBySource = new Map<string, string>();
  for (const source of sources) {
    if (source.kind !== "agent-session" || !source.locator?.startsWith(PASSAGE_KEY_PREFIX)) continue;
    // Only what Mori still keeps; a source marked not captured holds nothing to find.
    if (source.retention !== "retained" && source.retention !== "redacted") continue;
    const text = source.rawBody?.trim();
    if (text) textBySource.set(source.id, text.normalize("NFC"));
  }
  const byRecord = new Map<string, string[]>();
  for (const link of links) {
    const text = textBySource.get(link.sourceId);
    if (!text) continue;
    const list = byRecord.get(link.recordId) ?? [];
    if (!list.includes(text)) list.push(text);
    byRecord.set(link.recordId, list);
  }
  return byRecord;
}

/** The first saved passage holding `needle` (already NFC and lower case). */
export function matchingPassage(texts: readonly string[] | undefined, needle: string): string | null {
  if (!texts || !needle) return null;
  return texts.find((text) => text.toLowerCase().includes(needle)) ?? null;
}

/** Text before the hit: none, since list rows are narrow and clip the end. */
const LEAD = 0;

/** A short window of `text` starting just before the first hit of `needle`,
 *  on one line, so the hit survives a narrow row clipping the end. */
export function passageSnippet(text: string, needle: string, width = 72): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = needle ? flat.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return flat.length <= width ? flat : `${flat.slice(0, width - 1)}…`;
  if (at <= LEAD && flat.length <= width) return flat;
  const start = Math.max(0, at - LEAD);
  const end = start + width;
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}
