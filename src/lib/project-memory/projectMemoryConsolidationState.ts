/**
 * Project Memory Consolidation State.
 *
 * The Consolidation Proposal Preview helper
 * (`buildProjectMemoryConsolidationPreview`) derives a typed
 * `ProjectMemoryConsolidationPreview` from any `ProjectMemoryViewModel`.
 * This module is the thin **state layer** on top of that helper. Its
 * job is to give the Memory page a single, typed value it can read to
 * answer:
 *
 *   - Is consolidation runnable right now?
 *   - Is the view-model "data-rich" enough to be useful?
 *   - How many proposals are there, broken down by kind?
 *   - What's the most useful next user action?
 *   - What warnings should be surfaced alongside the consolidation
 *     affordance?
 *
 * The Consolidation Review Surface will consume the same shape — the
 * goal here is to land the *contract* now so the UI layer does not
 * have to reverse-engineer it. Accepted Memory Persistence,
 * accept/edit/discard handlers, and Review navigation are all
 * separate capabilities that land later.
 *
 * Boundaries:
 *   - Pure derivation. No IO, no LLM, no clock side-effects.
 *   - No persistence. Caller decides what to do with the state.
 *   - No raw source content. The state surfaces counts, kinds, and
 *     warnings — never raw event text.
 *   - `canOpenReview` is `false` today because the Consolidation
 *     Review Surface does not exist yet. It flips when the route
 *     lands.
 */
import {
  buildProjectMemoryConsolidationPreview,
  type MemoryProposalKind,
  type ProjectMemoryConsolidationPreview,
} from "./consolidationProposals";
import type {
  ProjectMemoryDataBasis,
  ProjectMemoryViewModel,
  ProjectMemoryWarning,
} from "./projectMemoryModel";

// ─── public types ─────────────────────────────────────────────────────

export type ProjectMemoryConsolidationStatus =
  | "ready"        // proposals exist; affordance is useful (UI still planned)
  | "empty"        // basis is fine but the view-model has nothing worth proposing
  | "partial"      // basis is narrow (active-only / metadata-only / partial load)
  | "unavailable"; // demo / no storage / nothing to derive against

export type ProjectMemoryConsolidationState = {
  status: ProjectMemoryConsolidationStatus;
  /** Underlying preview when status !== "unavailable". */
  preview: ProjectMemoryConsolidationPreview | null;
  /** Total proposals. Always 0 when `status !== "ready"`. */
  proposalCount: number;
  /** Counts per kind. Zero-filled for kinds the helper doesn't emit yet. */
  proposalCounts: Record<MemoryProposalKind, number>;
  /** Up to three kinds, most-numerous first; ties broken by stable kind order. */
  topProposalKinds: MemoryProposalKind[];
  /**
   * Whether the Consolidation Review Surface can be opened right now.
   * **False** today — the Review surface does not exist yet. Flips to
   * `true` when the route lands.
   */
  canOpenReview: boolean;
  /** Echo of the underlying view-model's data basis. */
  dataBasis: ProjectMemoryDataBasis;
  /** Warnings sourced from the preview (which already echoes the view-model). */
  warnings: ProjectMemoryWarning[];
  /** Human-readable reason when status is `empty` or `unavailable`. */
  emptyReason: string | null;
  /** Suggested next-step copy for the Memory page affordance. */
  nextStepLabel: string;
  /** Stable derivation timestamp — never wall-clock, see notes. */
  generatedAt: string;
};

// ─── public entry point ───────────────────────────────────────────────

/**
 * Derive the consolidation state from a `ProjectMemoryViewModel`.
 *
 * Pure: same input → same output (the helper's `generatedAt` follows
 * the view-model's own time-bearing fields where possible; otherwise
 * an epoch fallback is used so this function stays deterministic).
 *
 * The state is metadata-only — it does **not** open a review session,
 * persist proposals, or call out to an LLM.
 */
export function buildProjectMemoryConsolidationState(
  memory: ProjectMemoryViewModel,
): ProjectMemoryConsolidationState {
  if (memory.dataBasis === "unavailable") {
    return {
      status: "unavailable",
      preview: null,
      proposalCount: 0,
      proposalCounts: zeroProposalCounts(),
      topProposalKinds: [],
      canOpenReview: false,
      dataBasis: memory.dataBasis,
      warnings: memory.warnings,
      emptyReason: describeUnavailableReason(memory.warnings),
      nextStepLabel: "Start a real session to begin building Project Memory.",
      generatedAt: deriveGeneratedAt(memory),
    };
  }

  const preview = buildProjectMemoryConsolidationPreview(memory);
  const proposalCount = preview.proposals.length;
  const topProposalKinds = pickTopKinds(preview.proposalCounts, 3);

  if (proposalCount === 0) {
    return {
      status: "empty",
      preview,
      proposalCount: 0,
      proposalCounts: preview.proposalCounts,
      topProposalKinds: [],
      // Empty state still locks the review surface; nothing to review.
      canOpenReview: false,
      dataBasis: preview.dataBasis,
      warnings: preview.warnings,
      emptyReason: describeEmptyReason(memory),
      nextStepLabel: "Run Quick Pass or import more sessions to surface proposals.",
      generatedAt: deriveGeneratedAt(memory),
    };
  }

  const partial = isPartialBasis(memory.dataBasis);
  return {
    status: partial ? "partial" : "ready",
    preview,
    proposalCount,
    proposalCounts: preview.proposalCounts,
    topProposalKinds,
    // Hard-coded false today — the Consolidation Review Surface does
    // not exist yet. Flips to `true` when the route lands.
    canOpenReview: false,
    dataBasis: preview.dataBasis,
    warnings: preview.warnings,
    emptyReason: null,
    nextStepLabel: partial
      ? "Consolidation Review Surface is planned. Reach is narrow today — load more saved sessions or run Quick Pass for richer proposals."
      : "Consolidation Review Surface is planned. No memory is written until you approve proposals.",
    generatedAt: deriveGeneratedAt(memory),
  };
}

// ─── helpers ──────────────────────────────────────────────────────────

function pickTopKinds(
  counts: Record<MemoryProposalKind, number>,
  limit: number,
): MemoryProposalKind[] {
  const order: MemoryProposalKind[] = [
    "promotedDecision",
    "recurringIssue",
    "keyEvidence",
    "unresolvedRisk",
    "contradiction",
    "staleMemory",
    "nextSessionRecommendation",
  ];
  return order
    .map((kind) => ({ kind, count: counts[kind] ?? 0, ordinal: order.indexOf(kind) }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.ordinal - b.ordinal;
    })
    .slice(0, limit)
    .map((entry) => entry.kind);
}

function isPartialBasis(basis: ProjectMemoryDataBasis): boolean {
  return (
    basis === "activeSessionOnly" ||
    basis === "partialSavedSessionLoad" ||
    basis === "savedSessionMetadataOnly"
  );
}

function describeUnavailableReason(warnings: ProjectMemoryWarning[]): string {
  if (warnings.some((w) => w.kind === "demo-mode")) {
    return "Demo session — consolidation is disabled until a real session starts.";
  }
  if (warnings.some((w) => w.kind === "storage-unavailable")) {
    return "Local storage is unreachable — consolidation cannot read project memory.";
  }
  return "Project memory is unavailable in this runtime.";
}

function describeEmptyReason(memory: ProjectMemoryViewModel): string {
  if (memory.summaryStats.decisionCount === 0 && memory.summaryStats.issueCount === 0) {
    return "No decisions or issues recorded yet. Run Quick Pass on an imported session to surface proposals.";
  }
  if (memory.recentSessions.every((session) => session.isCurrent)) {
    return "Only the active session is visible. Save more sessions for cross-session proposals.";
  }
  return "No proposals were derived from the current view-model.";
}

/**
 * Derivation timestamp. Falls back to a stable epoch when the view-
 * model carries no time-bearing field — keeps the function pure so
 * test snapshots don't need clock-mocking. Callers that want the
 * real wall-clock time should record it at *render* time, not
 * derivation time.
 */
function deriveGeneratedAt(memory: ProjectMemoryViewModel): string {
  const latestReimport = memory.reimportSummary.latestReimportAt;
  if (latestReimport) return latestReimport;
  const latestSession = memory.recentSessions
    .map((session) => session.savedAt ?? session.startedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop();
  if (latestSession) return latestSession;
  return "1970-01-01T00:00:00.000Z";
}

function zeroProposalCounts(): Record<MemoryProposalKind, number> {
  return {
    promotedDecision: 0,
    recurringIssue: 0,
    keyEvidence: 0,
    unresolvedRisk: 0,
    contradiction: 0,
    staleMemory: 0,
    nextSessionRecommendation: 0,
  };
}

/** Human label for a `MemoryProposalKind` — used by the Memory page card. */
export function describeProposalKind(kind: MemoryProposalKind): string {
  switch (kind) {
    case "promotedDecision":
      return "Decisions";
    case "recurringIssue":
      return "Recurring issues";
    case "keyEvidence":
      return "Key evidence";
    case "unresolvedRisk":
      return "Risks";
    case "contradiction":
      return "Contradictions";
    case "staleMemory":
      return "Stale memories";
    case "nextSessionRecommendation":
      return "Next session";
    default:
      return kind;
  }
}
