/**
 * Document understanding (기록 v7) · the contract for what Mori reads out of one
 * note.
 *
 * v7's inversion: understanding is the product. "What the writer did" is ONE
 * output of it, emitted only when the document is the kind that has one. The old
 * shape asked "what did you do?" of every document, which is a meeting-transcript
 * question; research across 13 AI note tools found none of them ask it of prose,
 * and the four that extract action items do it only from transcripts where a
 * diarization channel says who committed to what.
 *
 * Every field here is machine-produced and must be able to say "nothing". An
 * empty region is honest; an invented one is the lie v6 was written to remove.
 */

/** What kind of document this is. Inferred, never asked (v7 §6). */
export type DocumentNature =
  | "journal"
  | "meeting"
  | "retro"
  | "study"
  | "essay"
  | "clipping";

/** The natures whose documents actually contain "things the writer did", and so
 *  are the only ones 남길 기록 may be emitted for (v7 §5). */
export const LOG_NATURES: readonly DocumentNature[] = ["journal", "meeting"];

export function isLogNature(nature: DocumentNature): boolean {
  return LOG_NATURES.includes(nature);
}

/**
 * A span of the document an output came from, as `[start, end)` character
 * offsets into the note body.
 *
 * Provenance by construction (Heptabase's mechanic, v7 §4): an output that must
 * name the span it came from cannot be hallucinated, because a span that is not
 * in the document fails validation. This is the mechanical form of "a note tool
 * earns trust by never lying".
 */
export type SourceSpan = { start: number; end: number };

/** A term the document uses without defining, glossed IN THIS DOCUMENT'S context:
 *  `문법` in a Kotlin article means syntax, not English grammar. */
export type GlossedTerm = {
  term: string;
  gloss: string;
  span: SourceSpan;
};

/** One thing worth taking away, anchored to where it was said. */
export type DocumentInsight = {
  text: string;
  span: SourceSpan;
};

/** A candidate record, only ever produced for a log-nature document. */
export type UnderstandingItem = {
  schemaId: string;
  title: string;
  span: SourceSpan;
};

export type DocumentUnderstanding = {
  /** The body this was read from, so a stale reading can be detected without
   *  keeping the text twice. */
  bodyHash: string;
  nature: DocumentNature;
  /** Margin between the best and second-best nature. Low means the chip says
   *  "학습 노트?" and nothing else changes. It NEVER gates or folds (v6 §3). */
  natureConfidence: number;
  /** Absent when the document is under the length floor: a three-line journal
   *  does not need a summary, and summarizing one strips its stance (v7 §2). */
  summary?: string;
  terms: GlossedTerm[];
  insights: DocumentInsight[];
  items: UnderstandingItem[];
  readAt: string;
};

/** Documents under this many characters get no summary. Length is observable
 *  where nature is guessed, so gating on it cannot hide a true record (v7 §2). */
export const SUMMARY_MIN_CHARS = 400;
