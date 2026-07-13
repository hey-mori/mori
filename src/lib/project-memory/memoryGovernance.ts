/**
 * Memory governance policy: the pure rules that decide how a consolidation
 * proposal enters memory: automatically (as provisional), through review, or
 * not as durable memory at all.
 *
 * This replaces the review-first default. The old flow required the user to
 * accept every proposal before any memory existed, and it mixed durable
 * memory (decisions, evidence) with things that are really project activity
 * (a next-session to-do) or lifecycle mutations (a contradiction against an
 * existing memory). This module encodes three separations:
 *
 *   1. **Durability**: is a proposal kind durable memory at all? A
 *      `nextSessionRecommendation` is a next action, not something to
 *      remember long-term, so it is never a durable-memory proposal.
 *   2. **Disposition**: given the mode, does a durable proposal land
 *      automatically (safe, additive, high-confidence) or wait for review
 *      (mutations of existing memory, low confidence)?
 *   3. **Mode**: the user's standing choice: `auto` (Mori organizes, review
 *      is the exception), `review` (the old behavior, nothing lands without a
 *      decision), or `captureOnly` (evidence only, no derivation).
 *
 * Pure and deterministic: no IO, no clock, no LLM. The safety of automation
 * lives here and in the provisional status (recallable but marked, never
 * crossing an external boundary, always reversible), never in hidden writes.
 */
import type { MemoryProposal, MemoryProposalKind } from "./consolidationProposals";

export type MemoryGovernanceMode = "auto" | "review" | "captureOnly";

/** The default: Mori organizes safe memory itself; review is for exceptions. */
export const DEFAULT_MEMORY_GOVERNANCE_MODE: MemoryGovernanceMode = "auto";

/**
 * What a proposal kind *is*, independent of the mode:
 *  - `durable`:   a reusable knowledge asset (a decision, a genuinely
 *                 recurring issue, a standing risk).
 *  - `lifecycle`: acts on an existing memory (contradiction, staleness); a
 *                 mutation, so it always needs a human.
 *  - `activity`:  current project state / next actions, not durable memory.
 *  - `evidence`:  a pointer to a source / session. Evidence, not a distilled
 *                 memory asset; it lives in the Evidence layer, never memory.
 */
export type MemoryProposalDurability = "durable" | "lifecycle" | "activity" | "evidence";

export const MEMORY_PROPOSAL_DURABILITY: Record<MemoryProposalKind, MemoryProposalDurability> = {
  promotedDecision: "durable",
  recurringIssue: "durable",
  unresolvedRisk: "durable",
  // Evidence, not memory: a source/session pointer, kept in the Evidence layer.
  keyEvidence: "evidence",
  contradiction: "lifecycle",
  staleMemory: "lifecycle",
  nextSessionRecommendation: "activity",
};

/**
 * The kinds that auto-organize into provisional memory (mode `auto`, high
 * confidence). Kept deliberately narrow to what is unambiguously a durable,
 * high-quality asset: a **decision**. A recurring issue is durable memory too,
 * but its cross-session detection still mislabels single-session issues, so it
 * goes to review until that is trustworthy; a standing risk always gets a
 * human glance. Everything else is review, evidence, activity, or lifecycle.
 */
export const AUTO_MEMORY_KINDS = new Set<MemoryProposalKind>(["promotedDecision"]);

/** Whether a memory kind is one the policy auto-organizes. Used to reconcile
 *  provisional memory created by an earlier, broader policy. */
export function isAutoMemoryKind(kind: MemoryProposalKind): boolean {
  return AUTO_MEMORY_KINDS.has(kind);
}

/** Confidence at or above this auto-accepts (matches the "high" label floor). */
export const AUTO_ACCEPT_CONFIDENCE_MIN = 0.75;

export type MemoryProposalDisposition = "auto" | "review" | "skip";

export type MemoryGovernanceContext = {
  mode?: MemoryGovernanceMode;
  /**
   * Whether this proposal conflicts with or mutates an existing memory. A
   * conflicting proposal always goes to review even if its kind is
   * auto-eligible. Callers that cannot compute this leave it false.
   */
  conflictsWithExisting?: boolean;
};

export type MemoryDispositionResult = {
  disposition: MemoryProposalDisposition;
  /** Short machine reason, for honest UI copy and audit ("low-confidence"). */
  reason: string;
};

/**
 * Decide how one proposal enters memory. See the module doc for the model.
 */
export function classifyProposalDisposition(
  proposal: MemoryProposal,
  context: MemoryGovernanceContext = {},
): MemoryDispositionResult {
  const mode = context.mode ?? DEFAULT_MEMORY_GOVERNANCE_MODE;
  if (mode === "captureOnly") {
    return { disposition: "skip", reason: "capture-only" };
  }

  const durability = MEMORY_PROPOSAL_DURABILITY[proposal.kind];
  if (durability === "evidence") {
    return { disposition: "skip", reason: "evidence-not-memory" };
  }
  if (durability === "activity") {
    return { disposition: "skip", reason: "not-durable-memory" };
  }
  if (durability === "lifecycle") {
    return { disposition: "review", reason: "mutates-existing-memory" };
  }

  // Durable proposal from here on.
  if (mode === "review") {
    return { disposition: "review", reason: "review-mode" };
  }
  if (context.conflictsWithExisting) {
    return { disposition: "review", reason: "conflicts-with-existing" };
  }
  if (!AUTO_MEMORY_KINDS.has(proposal.kind)) {
    return { disposition: "review", reason: "needs-glance" };
  }
  if (proposal.confidence < AUTO_ACCEPT_CONFIDENCE_MIN) {
    return { disposition: "review", reason: "low-confidence" };
  }
  return { disposition: "auto", reason: "safe-additive-high-confidence" };
}

export type PartitionedProposals = {
  /** Safe, additive, high-confidence: land automatically as provisional. */
  auto: MemoryProposal[];
  /** Exceptions the user should see: mutations, low confidence, review mode. */
  review: MemoryProposal[];
  /** Not durable memory (activity / next actions) or capture-only mode. */
  skipped: MemoryProposal[];
};

/** Split a proposal set into the three governance buckets, order preserved. */
export function partitionProposalsByGovernance(
  proposals: readonly MemoryProposal[],
  context: MemoryGovernanceContext = {},
): PartitionedProposals {
  const auto: MemoryProposal[] = [];
  const review: MemoryProposal[] = [];
  const skipped: MemoryProposal[] = [];
  for (const proposal of proposals) {
    const { disposition } = classifyProposalDisposition(proposal, context);
    if (disposition === "auto") auto.push(proposal);
    else if (disposition === "review") review.push(proposal);
    else skipped.push(proposal);
  }
  return { auto, review, skipped };
}
