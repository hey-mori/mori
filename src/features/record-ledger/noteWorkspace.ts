/**
 * Note workspace model (기록 v4 · note-first) · pure derivations.
 *
 * 기록 is a note editor: you write a note freely, and Mori extracts the typed
 * records it can pull out of the text (운동 · 할 일 · 결정 · …). The note is the
 * first-class, user-owned artifact (a `note` record whose body is the raw text);
 * the extractions are a derived layer shown beside it, confirmed one by one into
 * records linked back to the note with a `derived-from` relation.
 *
 * This module holds the pure pieces: the note title derivation and the live
 * extraction preview (a pure function of the current body), so the editor holds
 * no interpretation and everything is unit-testable.
 */
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordProposal } from "../../lib/capture/captureTypes";
import { proposeRecords } from "../../lib/capture";

/** Strips inline markdown syntax for plain-text surfaces (titles, extraction
 *  records): the note keeps its raw markdown, but derived text never carries
 *  `**` / `#` / `` ` `` tokens into lists and records. */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

/** A note's title is its first non-empty line (Bear / Apple Notes model): you
 *  write, and the first line names the note. Empty until the user types. */
export function deriveNoteTitle(body: string): string {
  for (const rawLine of body.split(/\r?\n/)) {
    const line = stripInlineMarkdown(rawLine).trim();
    if (line) return line.length > 80 ? `${line.slice(0, 80)}…` : line;
  }
  return "";
}

/** A single thing Mori pulled out of a note: a typed record candidate. Pure and
 *  ephemeral — recomputed from the current body, never persisted here. */
export type NoteExtraction = {
  /** Stable within one body so React keys and confirm-dedup are consistent. */
  key: string;
  schemaId: string;
  title: string;
  /** The full proposal, carried so confirming it writes the same record. */
  proposal: RecordProposal;
};

/**
 * Live extraction preview for a note body. Runs the deterministic proposer and
 * keeps only the typed records — the plain `note` fallback is dropped, because
 * the note itself already IS the note record. Short / empty / pure-prose bodies
 * extract nothing.
 */
export function extractFromNote(body: string, now: Date = new Date()): NoteExtraction[] {
  // Extraction reads the note as prose: markdown syntax is presentation, so it
  // is stripped before the proposer runs and never leaks into record titles.
  const trimmed = stripInlineMarkdown(body).trim();
  if (trimmed.length < 2) return [];
  let proposals: RecordProposal[];
  try {
    proposals = proposeRecords({ kind: "text", content: trimmed }, { now: () => now });
  } catch {
    return [];
  }
  const seen = new Map<string, number>();
  const out: NoteExtraction[] = [];
  for (const proposal of proposals) {
    if (proposal.schemaId === "note") continue;
    const base = `${proposal.schemaId}:${proposal.title}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    out.push({
      key: count > 0 ? `${base}#${count}` : base,
      schemaId: proposal.schemaId,
      title: proposal.title,
      proposal,
    });
  }
  return out;
}

/** Normalized identity for matching a live preview against an already-confirmed
 *  extraction, so a confirmed record is never offered again as a fresh preview. */
export function extractionIdentity(schemaId: string, title: string): string {
  return `${schemaId}:${title.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

/**
 * The extraction panel's items for a note: the already-confirmed derived records
 * first (durable, user-owned), then the live previews that are not yet
 * confirmed. Confirmed items are matched out of the preview list by identity so
 * the same extraction never appears twice.
 */
export type NoteExtractionPanel = {
  confirmed: MoriRecord[];
  pending: NoteExtraction[];
};

export function buildNoteExtractionPanel(
  body: string,
  confirmedRecords: MoriRecord[],
  now: Date = new Date(),
): NoteExtractionPanel {
  // Multiset matching: confirming ONE of two same-titled extractions must
  // consume exactly one preview, leaving the other still confirmable.
  const confirmedCounts = new Map<string, number>();
  for (const record of confirmedRecords) {
    const id = extractionIdentity(record.schemaId, record.title);
    confirmedCounts.set(id, (confirmedCounts.get(id) ?? 0) + 1);
  }
  const pending = extractFromNote(body, now).filter((item) => {
    const id = extractionIdentity(item.schemaId, item.title);
    const remaining = confirmedCounts.get(id) ?? 0;
    if (remaining > 0) {
      confirmedCounts.set(id, remaining - 1);
      return false;
    }
    return true;
  });
  return { confirmed: confirmedRecords, pending };
}
