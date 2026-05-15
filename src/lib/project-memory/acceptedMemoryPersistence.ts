/**
 * Accepted Memory Persistence — review-draft-to-storage converter.
 *
 * The Consolidation Review Surface keeps every user action in a
 * local immutable `ConsolidationReviewState`. When the user clicks
 * "Apply accepted memories" the surface needs to translate that
 * draft into:
 *
 *   1. `StoredAcceptedProjectMemory` records — one per
 *      accepted / edited / watching / deferred entry.
 *   2. `StoredMemoryReviewAction` rows — one per non-no-op entry in
 *      the draft, plus an `apply` row that bookends the pass.
 *
 * This module is **pure**:
 *
 *   - No IO. No `Date.now()` unless the caller injects an `appliedAt`.
 *   - No id generation unless the caller injects an `idFactory`.
 *   - No mutation of the input draft or proposals.
 *   - No raw connector content. Evidence refs are typed pointers
 *     only.
 *
 * The repository layer (`BrowserDraftRepository.saveAcceptedProjectMemories`
 * + `appendMemoryReviewAction`) writes the produced records to
 * localStorage. SQLite Accepted Memory Storage will consume the same
 * shape when that capability lands.
 */
import type {
  MemoryProposalAction,
  MemoryProposal,
} from "./consolidationProposals";
import {
  effectiveSummary,
  effectiveTitle,
  type ConsolidationReviewEntry,
  type ConsolidationReviewState,
} from "./consolidationReviewState";
import type {
  StoredAcceptedProjectMemory,
  StoredAcceptedProjectMemoryConfidence,
  StoredAcceptedProjectMemoryStatus,
  StoredMemoryEvidenceRef,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";

export type AcceptedMemoryApplySummary = {
  acceptedCount: number;
  editedCount: number;
  watchingCount: number;
  deferredCount: number;
  discardedCount: number;
  /**
   * Number of accepted / edited / watching / deferred entries that
   * produced a `StoredAcceptedProjectMemory` record (i.e. not
   * `discarded`, not `proposed`).
   */
  savedMemoryCount: number;
  /** Total `StoredMemoryReviewAction` rows the helper emitted. */
  reviewActionCount: number;
};

export type BuildAcceptedMemoriesFromReviewDraftResult = {
  /** Records to pass to `saveAcceptedProjectMemories`. */
  memoriesToSave: StoredAcceptedProjectMemory[];
  /**
   * Audit rows to pass to `appendMemoryReviewAction` (one at a
   * time — the adapter is append-only).
   */
  reviewActionsToAppend: StoredMemoryReviewAction[];
  /**
   * Entries that were intentionally skipped: `discarded` (audit-only)
   * and `proposed` (no decision taken). Caller may want to inform
   * the user.
   */
  skippedEntries: ConsolidationReviewEntry[];
  summary: AcceptedMemoryApplySummary;
};

export type BuildAcceptedMemoriesFromReviewDraftInput = {
  projectId: string;
  reviewState: ConsolidationReviewState;
  appliedAt: string;
  /** Single-user product today — kept as a slot for future. */
  actor?: "local-user";
  /** Existing accepted memories (used to skip duplicates if needed). */
  existingMemories?: readonly StoredAcceptedProjectMemory[];
  /** Optional ConsolidationRun id; included on every emitted audit row. */
  runId?: string;
  /**
   * Inject an id factory for deterministic tests. Defaults to a
   * counter-based id derived from the proposal id + apply timestamp.
   */
  idFactory?: (purpose: "memory" | "action", seed: string) => string;
};

// ─── public entry point ───────────────────────────────────────────────

export function buildAcceptedMemoriesFromReviewDraft(
  input: BuildAcceptedMemoriesFromReviewDraftInput,
): BuildAcceptedMemoriesFromReviewDraftResult {
  const { projectId, reviewState, appliedAt } = input;
  const actor = input.actor ?? "local-user";
  const idFactory = input.idFactory ?? defaultIdFactory(appliedAt);
  const existingByProposalId = new Map<string, StoredAcceptedProjectMemory>();
  const existingByMemoryId = new Map<string, StoredAcceptedProjectMemory>();
  for (const memory of input.existingMemories ?? []) {
    existingByMemoryId.set(memory.id, memory);
    for (const origin of memory.originProposalIds) {
      existingByProposalId.set(origin, memory);
    }
  }

  const memoriesToSave: StoredAcceptedProjectMemory[] = [];
  const reviewActionsToAppend: StoredMemoryReviewAction[] = [];
  const skippedEntries: ConsolidationReviewEntry[] = [];
  let acceptedCount = 0;
  let editedCount = 0;
  let watchingCount = 0;
  let deferredCount = 0;
  let discardedCount = 0;

  for (const proposalId of reviewState.order) {
    const entry = reviewState.entries[proposalId];
    if (!entry) continue;

    // Lifecycle proposals (`staleMemory` / `contradiction`) act *on*
    // existing accepted memories — they transition the referenced
    // memory's status rather than creating a new memory. Discarded /
    // proposed lifecycle entries fall through to the normal switch
    // (audit-only / skip), which is correct for them.
    if (
      isLifecycleProposalKind(entry.proposal.kind) &&
      (entry.status === "accepted" ||
        entry.status === "edited" ||
        entry.status === "watching" ||
        entry.status === "deferred")
    ) {
      if (entry.status === "accepted") acceptedCount += 1;
      if (entry.status === "edited") editedCount += 1;
      if (entry.status === "watching") watchingCount += 1;
      if (entry.status === "deferred") deferredCount += 1;

      if (entry.status === "accepted" || entry.status === "edited") {
        // Commit the lifecycle transition on every referenced memory.
        const nextStatus: StoredAcceptedProjectMemoryStatus =
          entry.proposal.kind === "staleMemory" ? "stale" : "contradicted";
        for (const targetId of entry.proposal.targetMemoryIds ?? []) {
          const target = existingByMemoryId.get(targetId);
          if (!target) continue; // cannot transition a memory we do not hold
          if (target.status === nextStatus) continue; // already there — no-op
          const action: StoredMemoryReviewAction = {
            id: idFactory("action", `${proposalId}:lifecycle:${targetId}`),
            projectId,
            actionType: actionTypeForStatus(entry.status),
            actor,
            timestamp: appliedAt,
            sourceProposalId: proposalId,
            targetMemoryIds: [targetId],
            before: snapshotMemory(target),
            after: { ...snapshotMemory(target), status: nextStatus },
            note: entry.note ?? undefined,
            reversible: true,
            schemaVersion: 1,
            adapter: "browser-local-storage",
          };
          memoriesToSave.push({
            ...target,
            status: nextStatus,
            updatedAt: appliedAt,
            reviewActionIds: [...target.reviewActionIds, action.id],
          });
          reviewActionsToAppend.push(action);
        }
      } else {
        // Keep-watching / defer a lifecycle proposal: record the
        // review decision in the audit trail, but do not transition
        // the referenced memory.
        reviewActionsToAppend.push({
          id: idFactory("action", `${proposalId}:status`),
          projectId,
          actionType: actionTypeForStatus(entry.status),
          actor,
          timestamp: appliedAt,
          sourceProposalId: proposalId,
          targetMemoryIds: [...(entry.proposal.targetMemoryIds ?? [])],
          before: { proposalTitle: entry.proposal.title, proposalStatus: "proposed" },
          after: undefined,
          note: entry.note ?? undefined,
          reversible: true,
          schemaVersion: 1,
          adapter: "browser-local-storage",
        });
        skippedEntries.push(entry);
      }
      continue;
    }

    switch (entry.status) {
      case "accepted":
      case "edited":
      case "watching":
      case "deferred": {
        if (entry.status === "accepted") acceptedCount += 1;
        if (entry.status === "edited") editedCount += 1;
        if (entry.status === "watching") watchingCount += 1;
        if (entry.status === "deferred") deferredCount += 1;

        const existing = existingByProposalId.get(proposalId);
        // For now we always re-write the record; supersession lands
        // with Stale Memory Review and Memory Audit Trail UI.
        const memoryId = existing?.id ?? idFactory("memory", proposalId);
        const memory = buildAcceptedMemory({
          memoryId,
          projectId,
          entry,
          appliedAt,
          actor,
          // Carry prior `reviewActionIds` forward; the apply action
          // we emit below appends to that list.
          priorReviewActionIds: existing?.reviewActionIds ?? [],
        });

        // Per-proposal action row (mirrors the entry's final status).
        const proposalAction: StoredMemoryReviewAction = {
          id: idFactory("action", `${proposalId}:status`),
          projectId,
          actionType: actionTypeForStatus(entry.status),
          actor,
          timestamp: appliedAt,
          sourceProposalId: proposalId,
          targetMemoryIds: [memoryId],
          before: existing
            ? snapshotMemory(existing)
            : { proposalTitle: entry.proposal.title, proposalStatus: "proposed" },
          after: snapshotMemory(memory),
          note: entry.note ?? undefined,
          reversible: true,
          schemaVersion: 1,
          adapter: "browser-local-storage",
        };
        memory.reviewActionIds = [...memory.reviewActionIds, proposalAction.id];
        memoriesToSave.push(memory);
        reviewActionsToAppend.push(proposalAction);
        break;
      }
      case "discarded": {
        discardedCount += 1;
        const action: StoredMemoryReviewAction = {
          id: idFactory("action", `${proposalId}:discard`),
          projectId,
          actionType: "discard",
          actor,
          timestamp: appliedAt,
          sourceProposalId: proposalId,
          targetMemoryIds: [],
          before: { proposalTitle: entry.proposal.title },
          after: undefined,
          note: entry.note ?? undefined,
          reversible: true,
          schemaVersion: 1,
          adapter: "browser-local-storage",
        };
        reviewActionsToAppend.push(action);
        skippedEntries.push(entry);
        break;
      }
      case "proposed":
      default: {
        // User left the entry untouched. No record, no audit row.
        skippedEntries.push(entry);
        break;
      }
    }
  }

  // Bookend `apply` action covering the whole pass.
  const applyAction: StoredMemoryReviewAction = {
    id: idFactory("action", `apply:${reviewState.draftId}`),
    projectId,
    actionType: "apply",
    actor,
    timestamp: appliedAt,
    sourceProposalId: undefined,
    targetMemoryIds: memoriesToSave.map((memory) => memory.id),
    before: undefined,
    after: {
      acceptedCount,
      editedCount,
      watchingCount,
      deferredCount,
      discardedCount,
      savedMemoryCount: memoriesToSave.length,
      runId: input.runId,
    },
    note: undefined,
    reversible: false,
    schemaVersion: 1,
    adapter: "browser-local-storage",
  };
  reviewActionsToAppend.push(applyAction);

  return {
    memoriesToSave,
    reviewActionsToAppend,
    skippedEntries,
    summary: {
      acceptedCount,
      editedCount,
      watchingCount,
      deferredCount,
      discardedCount,
      savedMemoryCount: memoriesToSave.length,
      reviewActionCount: reviewActionsToAppend.length,
    },
  };
}

// ─── internal builders ────────────────────────────────────────────────

function buildAcceptedMemory(args: {
  memoryId: string;
  projectId: string;
  entry: ConsolidationReviewEntry;
  appliedAt: string;
  actor: "local-user";
  priorReviewActionIds: string[];
}): StoredAcceptedProjectMemory {
  const { memoryId, projectId, entry, appliedAt, actor, priorReviewActionIds } = args;
  const proposal = entry.proposal;
  const status: StoredAcceptedProjectMemoryStatus = mapStatusForStorage(entry.status);
  const confidence: StoredAcceptedProjectMemoryConfidence = {
    label: confidenceLabel(proposal.confidence),
    score: proposal.confidence,
  };
  const evidenceRefs: StoredMemoryEvidenceRef[] = proposal.evidenceRefs.map(
    (ref): StoredMemoryEvidenceRef => {
      if (ref.kind === "session") {
        return { kind: "session", sessionId: ref.sessionId, sessionTitle: ref.sessionTitle };
      }
      if (ref.kind === "event") {
        return { kind: "event", sessionId: ref.sessionId, eventId: ref.eventId };
      }
      return { kind: "source", sessionId: ref.sessionId, sourceId: ref.sourceId };
    },
  );
  // Default sensitivity = `normal`. Once Resume Prompt /
  // Reports Memory Integration ships, the review surface will
  // surface a sensitivity picker; today we don't ask the user, so
  // the default is the least-restrictive value.
  return {
    id: memoryId,
    projectId,
    kind: proposal.kind,
    title: effectiveTitle(entry),
    summary: effectiveSummary(entry),
    status,
    importance: proposal.importance,
    confidence,
    evidenceRefs,
    sourceSessionIds: [...proposal.sourceSessionIds],
    originProposalIds: [proposal.id],
    relatedIssueIds: [...proposal.relatedIssueIds],
    relatedDecisionIds: [...proposal.relatedDecisionIds],
    proposedAction: proposal.proposedAction,
    reviewNote: entry.note ?? undefined,
    sensitivity: "normal",
    resumeEligible: status === "accepted" || status === "edited",
    reportEligibility: status === "accepted" || status === "edited" ? "personal" : "excluded",
    createdAt: proposal.createdAt,
    updatedAt: appliedAt,
    acceptedAt: appliedAt,
    acceptedBy: actor,
    reviewActionIds: [...priorReviewActionIds],
    schemaVersion: 1,
    adapter: "browser-local-storage",
  };
}

function mapStatusForStorage(
  status: ConsolidationReviewEntry["status"],
): StoredAcceptedProjectMemoryStatus {
  switch (status) {
    case "accepted":
      return "accepted";
    case "edited":
      return "edited";
    case "watching":
      return "watching";
    case "deferred":
      return "deferred";
    case "discarded":
    case "proposed":
    default:
      // Caller already screens these out, but `accepted` is the
      // safest fallback if the function is misused.
      return "accepted";
  }
}

function confidenceLabel(score: number): StoredAcceptedProjectMemoryConfidence["label"] {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function actionTypeForStatus(
  status: "accepted" | "edited" | "watching" | "deferred",
): StoredMemoryReviewAction["actionType"] {
  switch (status) {
    case "accepted":
      return "accept";
    case "edited":
      return "edit";
    case "watching":
      return "watch";
    case "deferred":
      return "defer";
    default:
      return "accept";
  }
}

/**
 * Lifecycle proposals act on existing accepted memories — accepting
 * one transitions the referenced memory's status instead of creating
 * a new memory record.
 */
function isLifecycleProposalKind(kind: MemoryProposal["kind"]): boolean {
  return kind === "staleMemory" || kind === "contradiction";
}

function snapshotMemory(memory: StoredAcceptedProjectMemory): {
  title: string;
  status: StoredAcceptedProjectMemoryStatus;
  summary: string;
} {
  return { title: memory.title, status: memory.status, summary: memory.summary };
}

function defaultIdFactory(appliedAt: string) {
  let counter = 0;
  return (purpose: "memory" | "action", seed: string): string => {
    counter += 1;
    return `${purpose}::${seed}::${appliedAt}::${counter}`;
  };
}

// re-export for callers that want to compose actions outside of apply
export const __testing = { defaultIdFactory };

// Suppress unused import in declaration-only builds.
void (null as MemoryProposalAction | MemoryProposal | null);
