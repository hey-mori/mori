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

/**
 * A reviewable revert proposal. Built from an eligible
 * `MemoryReviewRevertPlan`, it describes a status restore that must be
 * accepted through the normal review path before any memory is
 * written. It is deliberately a dedicated type — reverts originate
 * from the audit trail, not the consolidation preview, so they do not
 * belong in the `MemoryProposal` union that the preview machinery
 * (counts, ranking, dedupe) is coupled to.
 */
export type MemoryRevertProposal = {
  /** Stable id for review tracking. */
  id: string;
  /** Audit action this revert would undo. */
  sourceActionId: string;
  /** Accepted memory the revert restores. */
  targetMemoryId: string;
  /** The memory's current status. */
  currentStatus: StoredAcceptedProjectMemoryStatus;
  /** Status to restore from the action's `before` snapshot. */
  restoreStatus: StoredAcceptedProjectMemoryStatus;
  title: string;
  summary: string;
  rationale: string;
  /** Always `proposed` — a freshly built proposal is never pre-applied. */
  status: "proposed";
};

/**
 * Convert an eligible revert plan into a reviewable proposal. Pure:
 * never writes memory and never mutates its inputs. Throws when the
 * plan is ineligible — the planner's eligibility gate is authoritative,
 * so a caller must check `plan.eligible` first.
 */
export function buildMemoryRevertProposal(
  plan: MemoryReviewRevertPlan,
  action: StoredMemoryReviewAction,
  memory: StoredAcceptedProjectMemory,
): MemoryRevertProposal {
  if (
    !plan.eligible ||
    plan.targetMemoryId === null ||
    plan.restoreStatus === null ||
    plan.currentStatus === null
  ) {
    throw new Error(
      `Cannot build a revert proposal from an ineligible plan: ${plan.ineligibleReason ?? "unknown reason"}`,
    );
  }

  return {
    id: `proposal::memoryRevert::${action.id}`,
    sourceActionId: action.id,
    targetMemoryId: plan.targetMemoryId,
    currentStatus: plan.currentStatus,
    restoreStatus: plan.restoreStatus,
    title: `Revert "${memory.title}" to ${plan.restoreStatus}`,
    summary:
      `Restore this memory from "${plan.currentStatus}" back to ` +
      `"${plan.restoreStatus}", the status it held before the ` +
      `"${action.actionType}" review action.`,
    rationale:
      `Undoes the "${action.actionType}" review action recorded at ` +
      `${action.timestamp || "an unknown time"}. The revert is itself ` +
      `reviewed: accepting this proposal applies the status restore.`,
    status: "proposed",
  };
}

export type ApplyMemoryRevertOptions = {
  /** Timestamp written to the reverted memory and the audit action. */
  appliedAt: string;
  /** Id for the new audit action. Defaults to a deterministic value. */
  actionId?: string;
};

export type MemoryRevertApplyResult = {
  /** The memory with its status restored and `updatedAt` bumped. */
  memory: StoredAcceptedProjectMemory;
  /** The `revert` audit row recording the restore. */
  reviewAction: StoredMemoryReviewAction;
};

/**
 * Apply an accepted `MemoryRevertProposal`: produce the memory write
 * (status restored, `updatedAt` bumped, audit id linked) and the new
 * `revert` audit row. Pure — never touches storage and never mutates
 * its inputs; a caller persists the result through the normal
 * repository path. Throws when the proposal does not target the
 * supplied memory.
 */
export function applyMemoryRevertProposal(
  proposal: MemoryRevertProposal,
  memory: StoredAcceptedProjectMemory,
  options: ApplyMemoryRevertOptions,
): MemoryRevertApplyResult {
  if (proposal.targetMemoryId !== memory.id) {
    throw new Error(
      `Revert proposal targets "${proposal.targetMemoryId}" but was applied to "${memory.id}".`,
    );
  }

  const { appliedAt } = options;
  const actionId =
    options.actionId ?? `action::revert::${proposal.id}::${appliedAt}`;

  const reviewAction: StoredMemoryReviewAction = {
    id: actionId,
    projectId: memory.projectId,
    actionType: "revert",
    actor: "local-user",
    timestamp: appliedAt,
    sourceProposalId: proposal.id,
    targetMemoryIds: [memory.id],
    before: snapshotMemoryStatus(memory, memory.status),
    after: snapshotMemoryStatus(memory, proposal.restoreStatus),
    note: `Reverted to "${proposal.restoreStatus}" via audit action ${proposal.sourceActionId}.`,
    reversible: true,
    schemaVersion: 1,
    adapter: memory.adapter,
  };

  return {
    memory: {
      ...memory,
      status: proposal.restoreStatus,
      updatedAt: appliedAt,
      reviewActionIds: [...memory.reviewActionIds, actionId],
    },
    reviewAction,
  };
}

// ─── internals ────────────────────────────────────────────────────────

/**
 * Compact before/after snapshot — `{ title, status, summary }`,
 * matching the shape written by the consolidation apply path. Only the
 * `status` field is read back by the audit-trail view-model.
 */
function snapshotMemoryStatus(
  memory: StoredAcceptedProjectMemory,
  status: StoredAcceptedProjectMemoryStatus,
): { title: string; status: StoredAcceptedProjectMemoryStatus; summary: string } {
  return { title: memory.title, status, summary: memory.summary };
}

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
