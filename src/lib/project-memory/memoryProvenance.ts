/**
 * Per-memory provenance view-model for the Project Memory surface.
 *
 * `buildMemoryProvenance` takes a single accepted memory plus the full
 * audit-action list and derives everything the accepted-memory detail
 * drawer needs to answer the user's "why does this memory exist?" /
 * "what changed?" / "can I undo this?" questions — without touching
 * storage or running any IO.
 *
 * Pure module:
 *   - No `Date.now()`, no mutation of inputs.
 *   - Reads only the structural fields on the memory and audit rows.
 *   - Eligibility for the "Undo last change" affordance is delegated
 *     to `planMemoryReviewRevert` so the rules stay in one place.
 */
import type {
  StoredAcceptedProjectMemory,
  StoredAcceptedProjectMemoryStatus,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";
import {
  classifyMemoryLifecycle,
  type MemoryLifecycleGroup,
} from "./memoryLifecycle";
import { planMemoryReviewRevert } from "./memoryReviewRevert";

/** A single audit row attributed to one accepted memory. */
export type MemoryProvenanceAuditEntry = {
  action: StoredMemoryReviewAction;
  /** Eligible-to-revert plan if this action can be safely undone. */
  revertible: boolean;
  /** Reason the action cannot be reverted; null when eligible. */
  ineligibleReason: string | null;
};

/** Provenance view-model for one accepted memory. */
export type MemoryProvenance = {
  memoryId: string;
  status: StoredAcceptedProjectMemoryStatus;
  lifecycleGroup: MemoryLifecycleGroup;
  evidenceCount: number;
  sessionCount: number;
  relatedIssueCount: number;
  relatedDecisionCount: number;
  /** Audit rows that touched this memory, newest-first. */
  auditEntries: MemoryProvenanceAuditEntry[];
  /**
   * Newest action whose status change can be reverted from its
   * snapshot. Drives the drawer's "Undo last change" affordance.
   */
  lastRevertibleAction: StoredMemoryReviewAction | null;
  /** Pointer to a newer record when this one was superseded. */
  supersededBy: string | null;
  /** Whether Resume Prompt may include this record as guidance. */
  resumeEligible: boolean;
};

/**
 * Compute the per-memory provenance view-model. `allActions` should be
 * the full project audit log; this function filters and sorts it for
 * the target memory and does not mutate the input array.
 */
export function buildMemoryProvenance(
  memory: StoredAcceptedProjectMemory,
  allActions: readonly StoredMemoryReviewAction[],
): MemoryProvenance {
  const auditActions = allActions
    .filter((action) => action.targetMemoryIds.includes(memory.id))
    .slice()
    .sort((a, b) => compareTimestampDesc(a.timestamp, b.timestamp));

  const auditEntries: MemoryProvenanceAuditEntry[] = auditActions.map((action) => {
    const plan = planMemoryReviewRevert(action, [memory]);
    return {
      action,
      revertible: plan.eligible,
      ineligibleReason: plan.ineligibleReason,
    };
  });

  const lastRevertibleAction =
    auditEntries.find((entry) => entry.revertible)?.action ?? null;

  return {
    memoryId: memory.id,
    status: memory.status,
    lifecycleGroup: classifyMemoryLifecycle(memory.status),
    evidenceCount: memory.evidenceRefs.length,
    sessionCount: memory.sourceSessionIds.length,
    relatedIssueCount: memory.relatedIssueIds.length,
    relatedDecisionCount: memory.relatedDecisionIds.length,
    auditEntries,
    lastRevertibleAction,
    supersededBy: memory.supersededBy ?? null,
    resumeEligible: memory.resumeEligible,
  };
}

/**
 * Plain-English explanation of what each lifecycle group means and what
 * the user can do next. The drawer surfaces this so the user never has
 * to guess what "stale" or "superseded" implies for guidance.
 */
export function describeMemoryLifecycleMeaning(group: MemoryLifecycleGroup): string {
  switch (group) {
    case "current":
      return "활성 메모리 — Resume Prompt와 Report에 가이드 신호로 포함됩니다.";
    case "advisory":
      return "관찰 중 — 메모리로 유지되지만 가이드 비중은 낮습니다.";
    case "attention":
      return "확인 필요 — Stale 또는 contradicted 신호가 잡혔습니다. 재검토 후 supersede 또는 retire 하세요.";
    case "archived":
      return "보관됨 — Resume Prompt에는 더 이상 포함되지 않으며 기록만 유지됩니다.";
    default:
      return "";
  }
}

function compareTimestampDesc(a: string, b: string): number {
  // ISO-8601 strings compare correctly lexicographically; fall back to 0
  // when either side is missing so the sort stays stable.
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a < b) return 1;
  if (a > b) return -1;
  return 0;
}
