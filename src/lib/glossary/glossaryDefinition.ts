/**
 * Glossary definitions (Slice 2).
 *
 * Produces a short, Korean definition of a glossary term, grounded in how
 * the term appears in the session's reviewed evidence and reusing the Ask
 * Mori Local LLM port. Unlike Ask Mori (which forbids outside knowledge),
 * a glossary definition may use the model's general knowledge for the
 * term's standard meaning, then tie it to the work via the occurrence
 * titles. With no LLM (or on error) it degrades honestly to listing where
 * the term appears. Pure except for the injected LLM port; nothing is
 * persisted.
 */
import type { AskMoriLlm, AskMoriPrompt } from "../ask-mori/askMoriTypes";
import type {
  GlossaryEvidenceRef,
  GlossaryTerm,
  GlossaryTermKind,
} from "./glossaryTypes";

export type GlossaryDefinitionBasis = "llm" | "deterministicFallback";

export type GlossaryDefinition = {
  term: string;
  kind: GlossaryTermKind;
  text: string;
  basis: GlossaryDefinitionBasis;
  usedLlm: boolean;
  evidenceRefs: GlossaryEvidenceRef[];
  dataBasis: string;
};

export type DefineGlossaryTermDeps = {
  /** Optional Local LLM. Absent or throwing → deterministic fallback. */
  llm?: AskMoriLlm;
};

const SYSTEM_PROMPT = `You are Mori's glossary assistant. Define one technical term for a developer reading back over their work.

Rules:
- Answer in Korean, in 2 to 4 short sentences. No markdown, no lists.
- You may use general knowledge for the term's standard meaning.
- Then tie it to THIS work using the provided occurrence titles (where it appears).
- If the term looks project-specific and you are not confident of a general meaning, say so plainly rather than guessing.`;

export function buildGlossaryDefinitionPrompt(term: GlossaryTerm): AskMoriPrompt {
  const occurrences = term.evidenceRefs.map((ref) => `- ${ref.title}`).join("\n");
  const userPrompt = [
    `Term: ${term.term}`,
    `Shape: ${term.kind}`,
    `Mentions: ${term.occurrences}`,
    "",
    "Appears in:",
    occurrences || "(no titles)",
    "",
    "Define the term per the system rules.",
  ].join("\n");
  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}

export async function defineGlossaryTerm(
  term: GlossaryTerm,
  deps: DefineGlossaryTermDeps = {},
): Promise<GlossaryDefinition> {
  const base = {
    term: term.term,
    kind: term.kind,
    evidenceRefs: term.evidenceRefs,
  };

  if (deps.llm) {
    try {
      const text = (await deps.llm(buildGlossaryDefinitionPrompt(term))).trim();
      if (text.length === 0) throw new Error("empty LLM response");
      return {
        ...base,
        text,
        basis: "llm",
        usedLlm: true,
        dataBasis: `Defined by Local LLM · grounded in ${term.evidenceRefs.length} occurrence(s).`,
      };
    } catch {
      // fall through to the honest fallback.
    }
  }

  return {
    ...base,
    text: fallbackText(term),
    basis: "deterministicFallback",
    usedLlm: false,
    dataBasis: `No LLM · ${term.evidenceRefs.length} occurrence(s) listed.`,
  };
}

function fallbackText(term: GlossaryTerm): string {
  const where = term.evidenceRefs.map((ref) => ref.title).join(", ");
  if (where.length === 0) {
    return "로컬 LLM이 연결되어 있지 않아 정의를 생성하지 못했습니다.";
  }
  return `로컬 LLM이 연결되어 있지 않아 정의를 생성하지 못했습니다. 이 용어는 다음에서 등장합니다: ${where}.`;
}
