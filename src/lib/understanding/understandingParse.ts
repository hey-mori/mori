/**
 * Parse and VERIFY a model's reading of a document.
 *
 * The verification is the point. The model is asked for an exact `quote` from
 * the document, never for character offsets (which it cannot count). We then
 * locate that quote in the body ourselves:
 *
 *   - found     → the output is anchored to a real span, and is kept
 *   - not found → the model described something the document does not say, and
 *                 the output is DROPPED
 *
 * That is provenance by construction (v7 §4). A hallucinated insight cannot
 * survive, because it cannot name a span that exists. Nothing here trusts the
 * model's word for anything a reader could check.
 */
import {
  SUMMARY_MIN_CHARS,
  isLogNature,
  type DocumentInsight,
  type DocumentNature,
  type DocumentUnderstanding,
  type GlossedTerm,
  type SourceSpan,
  type UnderstandingItem,
} from "./understandingTypes";

const NATURES: readonly DocumentNature[] = [
  "journal",
  "meeting",
  "retro",
  "study",
  "essay",
  "clipping",
];

/** Cheap, stable body identity so a reading can be detected as stale. */
export function hashBody(body: string): string {
  let hash = 0;
  for (let i = 0; i < body.length; i += 1) {
    hash = (hash << 5) - hash + body.charCodeAt(i);
    hash |= 0;
  }
  return `${body.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

/** Whitespace-insensitive locate: a model reproduces wording faithfully but
 *  reflows spaces and line breaks, and that should not cost a true output. */
function locate(body: string, quote: string): SourceSpan | null {
  const needle = quote.trim();
  if (needle.length < 2) return null;

  const direct = body.indexOf(needle);
  if (direct !== -1) return { start: direct, end: direct + needle.length };

  // Build a whitespace-flexible pattern from the quote's non-space runs.
  const parts = needle.split(/\s+/).filter(Boolean).map(escapeRegex);
  if (parts.length === 0) return null;
  const match = new RegExp(parts.join("\\s+")).exec(body);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function coerceNature(value: unknown): DocumentNature | null {
  const raw = asString(value);
  return raw && (NATURES as string[]).includes(raw) ? (raw as DocumentNature) : null;
}

export type ParseUnderstandingArgs = {
  raw: unknown;
  body: string;
  now: string;
  /** Schema ids the registry actually knows, so a model cannot mint a type. */
  knownSchemaIds: readonly string[];
};

/**
 * Turn a model reply into a verified reading, or null when it is unusable.
 * Every list is independently verified: one bad insight never sinks a good
 * summary.
 */
export function parseUnderstanding(args: ParseUnderstandingArgs): DocumentUnderstanding | null {
  const { raw, body, now, knownSchemaIds } = args;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const nature = coerceNature(record.nature);
  if (!nature) return null;

  const confidenceRaw = typeof record.natureConfidence === "number" ? record.natureConfidence : 0.5;
  const natureConfidence = Math.min(1, Math.max(0, confidenceRaw));

  // The length floor is ours to enforce, not the model's to honour: a short
  // journal gets no summary even if the model volunteers one.
  const summaryText = asString(record.summary);
  const summary = body.length >= SUMMARY_MIN_CHARS && summaryText ? summaryText : undefined;

  const terms: GlossedTerm[] = [];
  for (const entry of asArray(record.terms)) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const term = asString(item.term);
    const gloss = asString(item.gloss);
    if (!term || !gloss) continue;
    // A term must appear in the document. A gloss for a word that is not there
    // is a dictionary entry, not a reading of this note.
    const span = locate(body, term);
    if (!span) continue;
    if (terms.some((existing) => existing.term === term)) continue;
    terms.push({ term, gloss, span });
  }

  const insights: DocumentInsight[] = [];
  for (const entry of asArray(record.insights)) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const text = asString(item.text);
    const quote = asString(item.quote);
    if (!text || !quote) continue;
    const span = locate(body, quote);
    if (!span) continue;
    insights.push({ text, span });
  }

  // 남길 기록 exists only for a document that logs something. For a study note
  // or an article the true answer is none, so the model's items are discarded
  // rather than shown (v7 §5).
  const items: UnderstandingItem[] = [];
  if (isLogNature(nature)) {
    for (const entry of asArray(record.items)) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const schemaId = asString(item.schemaId);
      const title = asString(item.title);
      const quote = asString(item.quote);
      if (!schemaId || !title || !quote) continue;
      if (!knownSchemaIds.includes(schemaId)) continue;
      const span = locate(body, quote);
      if (!span) continue;
      items.push({ schemaId, title, span });
    }
  }

  return {
    bodyHash: hashBody(body),
    nature,
    natureConfidence,
    summary,
    terms,
    insights,
    items,
    readAt: now,
  };
}
