/**
 * Glossary extraction (pure, deterministic, local).
 *
 * Scans a session's reviewed timeline events and evidence sources for
 * technical terms in three shapes: code identifiers, all-caps acronyms,
 * and capitalized multi-word phrases. Each term carries its occurrence
 * count and the distinct reviewed items that mention it. No LLM, no
 * network, no raw transcript: only curated title / summary / detail
 * fields are read. Same input → same output.
 */
import type { SourceRef, TimelineEvent } from "../../domain/types";
import type {
  GlossaryEvidenceRef,
  GlossaryResult,
  GlossaryTerm,
  GlossaryTermKind,
} from "./glossaryTypes";

export type ExtractGlossaryInput = {
  events?: readonly TimelineEvent[];
  sources?: readonly SourceRef[];
  /** Cap on returned terms (default 30). */
  maxTerms?: number;
};

const DEFAULT_MAX_TERMS = 30;
const MIN_OCCURRENCES = 1;

// Code identifiers: camelCase / PascalCase (an internal case change), or
// snake_case, or dotted / path / filename shapes with at least one letter.
const CAMEL_RE = /\b[A-Za-z][A-Za-z0-9]*[a-z][A-Z][A-Za-z0-9]*\b/g;
const SNAKE_RE = /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b/g;
const DOTTED_RE = /\b[A-Za-z0-9-]+(?:[./][A-Za-z0-9-]+)+\b/g;
const ACRONYM_RE = /\b[A-Z]{2,6}\b/g;
const PHRASE_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g;

// Acronyms that are not domain terms.
const ACRONYM_STOP = new Set(["OK", "NO", "ID", "TODO", "FIXME", "AND", "THE", "FOR"]);
// Words that should not lead a captured phrase (sentence-start artifacts).
const PHRASE_LEAD_STOP = new Set([
  "The", "A", "An", "This", "That", "These", "Those", "We", "It", "Our",
  "Your", "When", "Then", "If", "And", "But", "For", "So", "To", "In", "On",
]);

const KIND_BIAS: Record<GlossaryTermKind, number> = {
  acronym: 1.3,
  code: 1.2,
  phrase: 1.0,
};

const KIND_ORDER: Record<GlossaryTermKind, number> = {
  acronym: 0,
  code: 1,
  phrase: 2,
};

type Accumulator = {
  display: string;
  kind: GlossaryTermKind;
  occurrences: number;
  refs: Map<string, GlossaryEvidenceRef>;
};

export function extractGlossaryTerms(input: ExtractGlossaryInput): GlossaryResult {
  const events = input.events ?? [];
  const sources = input.sources ?? [];
  const maxTerms = input.maxTerms ?? DEFAULT_MAX_TERMS;

  const acc = new Map<string, Accumulator>();

  for (const event of events) {
    const ref: GlossaryEvidenceRef = { kind: "event", id: event.id, title: event.title };
    scanText(`${event.title} ${event.summary}`, ref, acc);
  }
  for (const source of sources) {
    const ref: GlossaryEvidenceRef = { kind: "source", id: source.id, title: source.title };
    scanText(`${source.title} ${source.detail}`, ref, acc);
  }

  const terms: GlossaryTerm[] = [];
  for (const entry of acc.values()) {
    if (entry.occurrences < MIN_OCCURRENCES) continue;
    terms.push({
      term: entry.display,
      kind: entry.kind,
      occurrences: entry.occurrences,
      evidenceRefs: [...entry.refs.values()],
      salience: entry.occurrences * KIND_BIAS[entry.kind],
    });
  }
  terms.sort(compareTerms);

  const scannedItemCount = events.length + sources.length;
  return {
    terms: terms.slice(0, maxTerms),
    scannedItemCount,
    dataBasis: `${scannedItemCount} reviewed ${
      scannedItemCount === 1 ? "item" : "items"
    } scanned · local-only · curated fields, no transcripts.`,
  };
}

function scanText(text: string, ref: GlossaryEvidenceRef, acc: Map<string, Accumulator>): void {
  collect(text, CAMEL_RE, "code", ref, acc, isCodeToken);
  collect(text, SNAKE_RE, "code", ref, acc, isCodeToken);
  collect(text, DOTTED_RE, "code", ref, acc, isDottedToken);
  collect(text, ACRONYM_RE, "acronym", ref, acc, isAcronymToken);
  collect(text, PHRASE_RE, "phrase", ref, acc, isPhraseToken);
}

function collect(
  text: string,
  pattern: RegExp,
  kind: GlossaryTermKind,
  ref: GlossaryEvidenceRef,
  acc: Map<string, Accumulator>,
  accept: (raw: string) => string | null,
): void {
  for (const match of text.matchAll(pattern)) {
    const display = accept(match[0]);
    if (display === null) continue;
    const key = `${kind}:${normalizeKey(display)}`;
    const existing = acc.get(key);
    if (existing) {
      existing.occurrences += 1;
      if (!existing.refs.has(refKey(ref))) existing.refs.set(refKey(ref), ref);
    } else {
      acc.set(key, {
        display,
        kind,
        occurrences: 1,
        refs: new Map([[refKey(ref), ref]]),
      });
    }
  }
}

// ─── token acceptance ─────────────────────────────────────────────────

function isCodeToken(raw: string): string | null {
  return raw.length >= 3 ? raw : null;
}

const DOTTED_STOP = new Set(["e.g", "i.e", "etc"]);

function isDottedToken(raw: string): string | null {
  // Must carry a letter (drop "3.14", "1.0.0") and look like a path / file
  // / dotted identifier, not a sentence fragment.
  if (!/[A-Za-z]/.test(raw)) return null;
  if (raw.length < 3) return null;
  if (DOTTED_STOP.has(raw.toLowerCase())) return null;
  return raw;
}

function isAcronymToken(raw: string): string | null {
  if (ACRONYM_STOP.has(raw)) return null;
  return raw;
}

function isPhraseToken(raw: string): string | null {
  const words = raw.split(/\s+/);
  while (words.length > 0 && PHRASE_LEAD_STOP.has(words[0]!)) words.shift();
  if (words.length < 2) return null;
  return words.join(" ");
}

// ─── helpers ──────────────────────────────────────────────────────────

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function refKey(ref: GlossaryEvidenceRef): string {
  return `${ref.kind}:${ref.id}`;
}

function compareTerms(a: GlossaryTerm, b: GlossaryTerm): number {
  if (b.salience !== a.salience) return b.salience - a.salience;
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  return a.term.localeCompare(b.term);
}
