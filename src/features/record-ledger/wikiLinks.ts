/**
 * Wiki-links (기록 v5) · [[제목]] links between notes, resolved from note text
 * rather than a persisted graph — the note body is the source of truth, so
 * forward links and backlinks are pure derivations (no relation rows to keep in
 * sync, no stale edges), matching how Obsidian reads a vault.
 */
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";

/** [[title]] — anything but brackets or a newline between the doubled brackets. */
const WIKI_LINK = /\[\[([^[\]\n]+)\]\]/g;

/**
 * Normalized comparison key for a wiki title. NFC first: WKWebView delivers
 * typed Hangul as decomposed NFD while stored titles are NFC, so a byte compare
 * of otherwise-identical Korean would miss. Then trim, collapse whitespace, and
 * lower-case so "[[다음 주]]" resolves "다음  주" and "Note"/"note" alike.
 */
export function wikiLinkKey(title: string): string {
  return title.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Every distinct [[title]] a body references, in first-seen order. */
export function parseWikiTitles(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(WIKI_LINK)) {
    const raw = match[1].trim();
    if (!raw) continue;
    const key = wikiLinkKey(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

/** Is this record a live note (a link target candidate)? */
function isLinkableNote(record: MoriRecord): boolean {
  return record.schemaId === "note" && record.status !== "discarded";
}

/**
 * Resolve a [[title]] to the best-matching note, or null. Titles are not unique
 * (the "새 기록" fallback, 80-char truncation), so the most recently touched
 * note wins the tie — the one the writer most likely meant.
 */
export function resolveNoteByTitle(title: string, records: MoriRecord[]): MoriRecord | null {
  const key = wikiLinkKey(title);
  if (!key) return null;
  let best: MoriRecord | null = null;
  for (const record of records) {
    if (!isLinkableNote(record) || wikiLinkKey(record.title) !== key) continue;
    if (!best || record.updatedAt > best.updatedAt) best = record;
  }
  return best;
}

/** Notes that link TO `note` through a [[title]] matching its title. Excludes
 *  the note itself and discarded notes. */
export function noteBacklinks(records: MoriRecord[], note: MoriRecord): MoriRecord[] {
  const targetKey = wikiLinkKey(note.title);
  if (!targetKey) return [];
  return records.filter(
    (record) =>
      record.id !== note.id &&
      isLinkableNote(record) &&
      parseWikiTitles(record.body).some((title) => wikiLinkKey(title) === targetKey),
  );
}
