/**
 * Ask Mori — types for the natural-language query layer over reviewed
 * memory. See `docs/design/ask-mori-audit.md`.
 *
 * Ask Mori answers a free-form question from the project's *already
 * reviewed* memory (accepted memories + the active session's evidence),
 * optionally using the user's Local LLM. The answer is a cited proposal,
 * never durable memory. No new capture, no network primitive of its own:
 * the LLM call is an injected port so the core stays pure and testable.
 */

/** How an answer was produced. Always surfaced honestly to the user. */
export type AskMoriBasis =
  /** A configured, reachable Local LLM produced the prose answer. */
  | "llm"
  /** No / unreachable LLM: the retrieved memories are shown as-is. */
  | "deterministicFallback"
  /** Retrieval found nothing relevant in reviewed memory. */
  | "noMemory";

export type AskMoriCitationKind =
  | "acceptedMemory"
  | "timelineEvent"
  | "evidenceSource"
  | "reviewAction";

/** A back-link from the answer to the reviewed item it was grounded on. */
export type AskMoriCitation = {
  kind: AskMoriCitationKind;
  /** memoryId / event id / source id / review-action id. */
  refId: string;
  /** Short tag used inside the grounded prompt, e.g. "M1" / "R2". */
  tag: string;
  /** Human-readable title of the cited item. */
  label: string;
  /** Curated snippet (title / summary only, never raw transcript). */
  snippet: string;
  /**
   * True only for current accepted memory (`accepted` / `edited`).
   * Non-current memory and active-session references are `false` so the
   * caller never presents them as settled guidance.
   */
  isCurrent: boolean;
  /**
   * True when the cited memory is provisional: auto-organized by the
   * governance policy and not yet user-confirmed. Distinct from the broader
   * `isCurrent === false` (which also covers stale / watching / references),
   * so the surface can disclose specifically that an answer leaned on
   * unconfirmed automatic memory.
   */
  provisional: boolean;
  /** Short context label: memory kind, event type, source kind, action. */
  contextLabel: string;
};

export type AskMoriPrompt = {
  systemPrompt: string;
  userPrompt: string;
};

/**
 * Injected LLM port. Takes the grounded prompt, returns raw model text.
 * Absent → the orchestrator uses the deterministic fallback. A thrown
 * error also degrades to the fallback (honestly labeled).
 */
export type AskMoriLlm = (prompt: AskMoriPrompt) => Promise<string>;

export type AskMoriAnswer = {
  question: string;
  /** The answer prose (LLM) or the deterministic fallback explanation. */
  text: string;
  /** Every reviewed item the answer was grounded on. */
  citations: AskMoriCitation[];
  basis: AskMoriBasis;
  usedLlm: boolean;
  /**
   * True when an LLM was configured and attempted but errored, so the answer
   * fell back to the deterministic listing. Distinct from "no LLM configured"
   * — the message and status must not claim the LLM is simply not connected.
   */
  llmFailed: boolean;
  /** True when at least one citation is non-current (stale / reference). */
  containsNonCurrent: boolean;
  /** True when the answer leaned on at least one provisional (auto-organized,
   *  unconfirmed) memory, so the surface can disclose it honestly. */
  containsProvisional: boolean;
  /** Honest one-line description of what was searched and how answered. */
  dataBasis: string;
};
