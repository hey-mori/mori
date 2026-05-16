/**
 * Memory Audit Trail — reviewed revert flow (eligibility planner).
 *
 * `planMemoryReviewRevert` decides whether a single `StoredMemoryReviewAction`
 * can be reverted and describes the restore it would perform. It is the
 * foundation of the reviewed revert flow: the plan is read-only and the
 * actual review/apply path lives in a later slice.
 *
 * This module is **pure**:
 *
 *   - No IO. No `Date.now()`. No mutation of the input.
 *   - Reads only the `status` string from the action's `before`
 *     snapshot — never raw evidence, titles, or summaries.
 *   - Tolerant of legacy / missing fields: a missing snapshot, a
 *     missing target, or an unknown status yields an ineligible plan
 *     with a readable reason instead of throwing.
 *
 * A revert is itself review-before-apply: producing a plan never
 * writes memory. Imported `.mori` audit rows are history and are not
 * reverted either — callers pass only the local project's actions.
 */
import type {
  StoredAcceptedProjectMemory,
  StoredAcceptedProjectMemoryStatus,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";

/** Action types whose status change can be reverted from a snapshot. */
export const REVERTIBLE_ACTION_TYPES: readonly StoredMemoryReviewAction["actionType"][] = [
  "accept",
  "edit",
  "apply",
  "watch",
  "defer",
  "reset",
];

const KNOWN_MEMORY_STATUSES: readonly StoredAcceptedProjectMemoryStatus[] = [
  "accepted",
  "edited",
  "watching",
  "deferred",
  "stale",
  "contradicted",
  "superseded",
  "retired",
];

export type MemoryReviewRevertPlan = {
  /** Audit action the plan was computed for. */
  actionId: string;
  /** Whether the action can be reverted. */
  eligible: boolean;
  /** Reason the revert cannot proceed; null when eligible. */
  ineligibleReason: string | null;
  /** Memory the revert would restore; null when ineligible. */
  targetMemoryId: string | null;
  /** Status to restore from the `before` snapshot; null when ineligible. */
  restoreStatus: StoredAcceptedProjectMemoryStatus | null;
  /** The target memory's current status; null when the target is missing. */
  currentStatus: StoredAcceptedProjectMemoryStatus | null;
};

/**
 * Decide whether `action` can be reverted against the current accepted
 * memories. Never mutates and never writes — the returned plan is a
 * read-only description of the restore.
 */
export function planMemoryReviewRevert(
  action: StoredMemoryReviewAction,
  acceptedMemories: readonly StoredAcceptedProjectMemory[],
): MemoryReviewRevertPlan {
  const base: MemoryReviewRevertPlan = {
    actionId: action.id,
    eligible: false,
    ineligibleReason: null,
    targetMemoryId: null,
    restoreStatus: null,
    currentStatus: null,
  };

  if (!isRevertibleActionType(action.actionType)) {
    return {
      ...base,
      ineligibleReason: `A "${action.actionType}" action cannot be reverted.`,
    };
  }

  const restoreStatus = readSnapshotStatus(action.before);
  if (restoreStatus === null) {
    return {
      ...base,
      ineligibleReason: "Action has no before snapshot to restore from.",
    };
  }

  const targetIds = Array.isArray(action.targetMemoryIds) ? action.targetMemoryIds : [];
  if (targetIds.length === 0) {
    return { ...base, ineligibleReason: "Action records no target memory." };
  }
  if (targetIds.length > 1) {
    return {
      ...base,
      ineligibleReason: "Action touched multiple memories; per-memory revert is not supported yet.",
    };
  }

  const targetMemoryId = targetIds[0];
  const memory = acceptedMemories.find((entry) => entry.id === targetMemoryId);
  if (!memory) {
    return {
      ...base,
      targetMemoryId,
      ineligibleReason: "Target memory no longer exists.",
    };
  }

  return {
    actionId: action.id,
    eligible: true,
    ineligibleReason: null,
    targetMemoryId,
    restoreStatus,
    currentStatus: memory.status,
  };
}

// ─── internals ────────────────────────────────────────────────────────

function isRevertibleActionType(
  value: StoredMemoryReviewAction["actionType"],
): boolean {
  return (REVERTIBLE_ACTION_TYPES as readonly string[]).includes(value);
}

/**
 * Read a recognised memory status from a `before` / `after` snapshot.
 * Only the `status` string is read — the snapshot may also carry
 * `title` / `summary`, which the revert flow never touches.
 */
function readSnapshotStatus(
  snapshot: unknown,
): StoredAcceptedProjectMemoryStatus | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const status = (snapshot as { status?: unknown }).status;
  if (typeof status !== "string") return null;
  return (KNOWN_MEMORY_STATUSES as readonly string[]).includes(status)
    ? (status as StoredAcceptedProjectMemoryStatus)
    : null;
}
