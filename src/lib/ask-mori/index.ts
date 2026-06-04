/**
 * Ask Mori — natural-language query over reviewed project memory.
 * See `docs/design/ask-mori-audit.md`. Slice 1: pure lib (no UI yet).
 */
export { answerFromMemory } from "./askMoriAnswer";
export type { AnswerFromMemoryInput, AnswerFromMemoryDeps } from "./askMoriAnswer";
export { buildAskMoriContext, extractQueryTerms } from "./askMoriContext";
export type { AskMoriContext, AskMoriContextInput } from "./askMoriContext";
export { createAskMoriLlm, createAskMoriLlmFromSettings } from "./askMoriLlm";
export type {
  AskMoriAnswer,
  AskMoriBasis,
  AskMoriCitation,
  AskMoriCitationKind,
  AskMoriLlm,
  AskMoriPrompt,
} from "./askMoriTypes";
