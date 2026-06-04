/**
 * Glossary — recurring technical terms in a session, linked to evidence.
 * See `docs/design/glossary-audit.md`. Slice 1: deterministic extraction.
 */
export { extractGlossaryTerms } from "./extractGlossaryTerms";
export type { ExtractGlossaryInput } from "./extractGlossaryTerms";
export type {
  GlossaryEvidenceRef,
  GlossaryResult,
  GlossaryTerm,
  GlossaryTermKind,
} from "./glossaryTypes";
