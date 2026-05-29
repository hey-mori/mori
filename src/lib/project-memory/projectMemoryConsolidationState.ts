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
 * The Consolidation Review Surface consumes the same shape so the UI
 * layer does not have to reverse-engineer proposal availability. Review
 * navigation and accepted-memory persistence live at the screen/apply
 * boundary; this module remains pure derivation.
 *
 * Boundaries:
 *   - Pure derivation. No IO, no LLM, no clock side-effects.
 *   - No persistence. Caller decides what to do with the state.
 *   - No raw source content. The state surfaces counts, kinds, and
 *     warnings — never raw event text.
 */
import {
  buildProjectMemoryConsolidationPreview,
  type MemoryProposal,
  type MemoryProposalKind,
  type ProjectMemoryConsolidationPreview,
} from "./consolidationProposals";
import { buildStaleMemoryProposals } from "./staleMemoryReview";
import { buildContradictionProposals } from "./contradictionReview";
import type {
  ProjectMemoryDataBasis,
  ProjectMemoryViewModel,
  ProjectMemoryWarning,
} from "./projectMemoryModel";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import type { ProductStateTone } from "../product-state/productState";

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

export type ProjectMemoryConsolidationStateOptions = {
  /**
   * Accepted project memories. When provided, Stale Memory Review and
   * Contradiction Review scan them and merge `staleMemory` /
   * `contradiction` proposals into the preview.
   */
  acceptedMemories?: readonly StoredAcceptedProjectMemory[];
  /** Reference time for the time-only stale signal. */
  now?: string;
};

/**
 * Derive the consolidation state from a `ProjectMemoryViewModel`.
 *
 * Pure: same input → same output (the helper's `generatedAt` follows
 * the view-model's own time-bearing fields where possible; otherwise
 * an epoch fallback is used so this function stays deterministic).
 *
 * When `options.acceptedMemories` is supplied, Stale Memory Review
 * and Contradiction Review proposals are merged into the preview so
 * the Memory page and Consolidation Review Surface surface stale and
 * contradiction candidates alongside the view-model-derived
 * proposals.
 *
 * The state is metadata-only — it does **not** open a review session,
 * persist proposals, or call out to an LLM.
 */
export function buildProjectMemoryConsolidationState(
  memory: ProjectMemoryViewModel,
  options: ProjectMemoryConsolidationStateOptions = {},
): ProjectMemoryConsolidationState {
  if (memory.dataBasis === "unavailable") {
    return {
      status: "unavailable",
      preview: null,
      proposalCount: 0,
      proposalCounts: zeroProposalCounts(),
      topProposalKinds: [],
      dataBasis: memory.dataBasis,
      warnings: memory.warnings,
      emptyReason: describeUnavailableReason(memory.warnings),
      nextStepLabel: "실제 세션을 시작하면 Project Memory가 쌓이기 시작합니다.",
      generatedAt: deriveGeneratedAt(memory),
    };
  }

  const basePreview = buildProjectMemoryConsolidationPreview(memory);
  const extraProposals: MemoryProposal[] = [];
  if (options.acceptedMemories) {
    extraProposals.push(
      ...buildStaleMemoryProposals(options.acceptedMemories, { now: options.now }),
      ...buildContradictionProposals(options.acceptedMemories),
    );
  }
  const preview = mergeExtraProposals(basePreview, extraProposals);
  const proposalCount = preview.proposals.length;
  const topProposalKinds = pickTopKinds(preview.proposalCounts, 3);

  if (proposalCount === 0) {
    return {
      status: "empty",
      preview,
      proposalCount: 0,
      proposalCounts: preview.proposalCounts,
      topProposalKinds: [],
      dataBasis: preview.dataBasis,
      warnings: preview.warnings,
      emptyReason: describeEmptyReason(memory),
      nextStepLabel: "Quick Pass를 실행하거나 세션을 더 가져오면 제안이 나타납니다.",
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
    dataBasis: preview.dataBasis,
    warnings: preview.warnings,
    emptyReason: null,
    nextStepLabel: partial
      ? "현재 집계 범위가 좁습니다 — 저장 세션을 더 불러오거나 Quick Pass를 실행하면 제안이 풍부해집니다."
      : "‘제안 검토’에서 각 제안을 검토할 수 있습니다. 승인하기 전까지는 어떤 메모리도 저장되지 않습니다.",
    generatedAt: deriveGeneratedAt(memory),
  };
}

// ─── helpers ──────────────────────────────────────────────────────────

/**
 * Append accepted-memory-derived proposals (Stale Memory Review +
 * Contradiction Review) to a view-model-derived preview. These
 * proposal ids are namespaced on accepted-memory ids, a namespace the
 * view-model helper never emits into, so there is no collision — they
 * are appended and the per-kind counts are updated.
 */
function mergeExtraProposals(
  preview: ProjectMemoryConsolidationPreview,
  extraProposals: MemoryProposal[],
): ProjectMemoryConsolidationPreview {
  if (extraProposals.length === 0) return preview;
  const proposalCounts = { ...preview.proposalCounts };
  for (const proposal of extraProposals) {
    proposalCounts[proposal.kind] += 1;
  }
  return {
    ...preview,
    proposals: [...preview.proposals, ...extraProposals],
    proposalCounts,
  };
}

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
    return "데모 세션입니다 — 실제 세션을 시작하기 전까지 통합은 비활성화됩니다.";
  }
  if (warnings.some((w) => w.kind === "storage-unavailable")) {
    return "로컬 저장소에 접근할 수 없어 통합이 프로젝트 메모리를 읽지 못합니다.";
  }
  return "현재 런타임에서는 프로젝트 메모리를 사용할 수 없습니다.";
}

function describeEmptyReason(memory: ProjectMemoryViewModel): string {
  if (memory.summaryStats.decisionCount === 0 && memory.summaryStats.issueCount === 0) {
    return "아직 기록된 결정이나 이슈가 없습니다. 가져온 세션에 Quick Pass를 실행하면 제안이 나타납니다.";
  }
  if (memory.recentSessions.every((session) => session.isCurrent)) {
    return "현재 세션만 보입니다. 세션을 더 저장하면 세션 간 제안이 생성됩니다.";
  }
  return "현재 view-model에서 도출된 제안이 없습니다.";
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

/**
 * Semantic tone for a `MemoryProposalKind`, drawn from the shared
 * product-state tone vocabulary so a kind chip uses the same scale as
 * `BaseStatusBadge`. A decision is a settled outcome (success), a
 * recurring issue wants attention (warning), key evidence is a
 * provenance anchor (accent), an unresolved risk / contradiction is
 * the most severe (danger), a next-session recommendation is
 * forward-looking (info), and a stale memory is receding (neutral).
 */
export function proposalKindTone(kind: MemoryProposalKind): ProductStateTone {
  switch (kind) {
    case "promotedDecision":
      return "success";
    case "recurringIssue":
      return "warning";
    case "keyEvidence":
      return "accent";
    case "unresolvedRisk":
    case "contradiction":
      return "danger";
    case "nextSessionRecommendation":
      return "info";
    case "staleMemory":
      return "neutral";
    default:
      return "neutral";
  }
}
