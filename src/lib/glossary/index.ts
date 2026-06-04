/**
 * Glossary — recurring technical terms in a session, linked to evidence.
 * See `docs/design/glossary-audit.md`. Slice 1: deterministic extraction.
 */
export { extractGlossaryTerms } from "./extractGlossaryTerms";
export type { ExtractGlossaryInput } from "./extractGlossaryTerms";
export { buildGlossaryDefinitionPrompt, defineGlossaryTerm } from "./glossaryDefinition";
export type {
  DefineGlossaryTermDeps,
  GlossaryDefinition,
  GlossaryDefinitionBasis,
} from "./glossaryDefinition";
export type {
  GlossaryEvidenceRef,
  GlossaryResult,
  GlossaryTerm,
  GlossaryTermKind,
} from "./glossaryTypes";
