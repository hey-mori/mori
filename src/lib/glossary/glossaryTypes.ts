/**
 * Glossary — surface the technical terms that recur in a session's
 * reviewed work, each linked to the evidence that mentions it. See
 * `docs/design/glossary-audit.md`.
 *
 * Slice 1 is deterministic extraction only (this file + `extractGlossaryTerms`):
 * pure, local, no LLM. Slice 2 layers an optional grounded definition over
 * each term via the Ask Mori LLM port. The glossary reads only reviewed
 * curated fields (event / source titles and summaries), never raw
 * transcripts or connector logs, and is a proposal, never durable memory.
 */

export type GlossaryTermKind =
  /** A code-shaped identifier: camelCase / snake_case / dotted / path. */
  | "code"
  /** An all-caps initialism: API, JWT, SQL, MCP, LLM. */
  | "acronym"
  /** A capitalized multi-word domain phrase: "Project Memory". */
  | "phrase";

/** A reviewed item that mentions a term. */
export type GlossaryEvidenceRef = {
  kind: "event" | "source";
  id: string;
  title: string;
};

export type GlossaryTerm = {
  /** Display form (the surface form of the first occurrence). */
  term: string;
  kind: GlossaryTermKind;
  /** Total mentions across all scanned text. */
  occurrences: number;
  /** Distinct reviewed items that mention the term. */
  evidenceRefs: GlossaryEvidenceRef[];
  /** Ranking weight (occurrences, biased by kind). Higher is more salient. */
  salience: number;
};

export type GlossaryResult = {
  terms: GlossaryTerm[];
  /** Distinct items scanned (events + sources). */
  scannedItemCount: number;
  /** Honest one-line description of what was scanned. */
  dataBasis: string;
};
