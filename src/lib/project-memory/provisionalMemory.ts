/**
 * Provisional memory builder: turns the governance policy's `auto` bucket
 * into stored provisional memory without a review pass.
 *
 * The user asked memory to accumulate as they work, not to be gated behind a
 * queue they must clear. `partitionProposalsByGovernance` decides which
 * proposals are safe to keep automatically; this pure function renders those
 * into `StoredAcceptedProjectMemory` records at status `provisional` plus one
 * `autoOrganize` audit row per record (actor `auto-policy`), so every
 * automatic write is inspectable and reversible exactly like a reviewed one.
 *
 * Honesty rails baked in:
 *   - status `provisional`; `resumeEligible = false`, `reportEligibility =
 *     excluded`, so provisional memory never crosses an external boundary.
 *   - already-persisted proposals (matched by `originProposalIds`) are
 *     skipped, so re-running is idempotent and never duplicates or downgrades
 *     a memory the user has since confirmed.
 *   - pure: no IO, no clock, no id randomness unless the caller injects them.
 */
import type { MemoryProposal } from "./consolidationProposals";
import { isAutoMemoryKind } from "./memoryGovernance";
import type {
  StoredAcceptedProjectMemory,
  StoredAcceptedProjectMemoryConfidence,
  StoredMemoryEvidenceRef,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";

export type BuildProvisionalMemoriesInput = {
  projectId: string;
  proposals: readonly MemoryProposal[];
  /** ISO timestamp for the write + audit rows. */
  at: string;
  /** Existing memories, so already-known proposals are not re-created. */
  existingMemories?: readonly StoredAcceptedProjectMemory[];
  /** Injectable for deterministic tests. */
  idFactory?: (purpose: "memory" | "action", seed: string) => string;
};

export type BuildProvisionalMemoriesResult = {
  memoriesToSave: StoredAcceptedProjectMemory[];
  reviewActionsToAppend: StoredMemoryReviewAction[];
  /** Proposals skipped because a memory from them already exists. */
  alreadyKnownCount: number;
};

export function buildProvisionalMemoriesFromProposals(
  input: BuildProvisionalMemoriesInput,
): BuildProvisionalMemoriesResult {
  const { projectId, proposals, at } = input;
  const idFactory = input.idFactory ?? defaultIdFactory(at);

  const knownProposalIds = new Set<string>();
  for (const memory of input.existingMemories ?? []) {
    for (const origin of memory.originProposalIds) knownProposalIds.add(origin);
  }

  const memoriesToSave: StoredAcceptedProjectMemory[] = [];
  const reviewActionsToAppend: StoredMemoryReviewAction[] = [];
  let alreadyKnownCount = 0;

  for (const proposal of proposals) {
    if (knownProposalIds.has(proposal.id)) {
      alreadyKnownCount += 1;
      continue;
    }
    const memoryId = idFactory("memory", proposal.id);
    const action: StoredMemoryReviewAction = {
      id: idFactory("action", `${proposal.id}:auto`),
      projectId,
      actionType: "autoOrganize",
      actor: "auto-policy",
      timestamp: at,
      sourceProposalId: proposal.id,
      targetMemoryIds: [memoryId],
      before: { proposalTitle: proposal.title, proposalStatus: "proposed" },
      after: { title: proposal.title, status: "provisional" },
      note: undefined,
      reversible: true,
      schemaVersion: 1,
      adapter: "browser-local-storage",
    };
    memoriesToSave.push(buildProvisionalMemory({ memoryId, projectId, proposal, at, actionId: action.id }));
    reviewActionsToAppend.push(action);
  }

  return { memoriesToSave, reviewActionsToAppend, alreadyKnownCount };
}

export type ProvisionalReconcileResult = {
  memoriesToSave: StoredAcceptedProjectMemory[];
  reviewActionsToAppend: StoredMemoryReviewAction[];
};

/**
 * Retire provisional memory that a broader earlier policy created but the
 * current policy no longer auto-organizes (e.g. key-evidence pointers that
 * were never a durable asset). Only touches `provisional` records, never
 * user-confirmed memory, and retires rather than deletes, so the change is
 * audited and reversible. This is how the store heals itself after the policy
 * is tightened, so the user is not left staring at junk they never chose.
 */
export function buildProvisionalReconcileRetires(input: {
  existingMemories: readonly StoredAcceptedProjectMemory[];
  at: string;
  idFactory?: (purpose: "memory" | "action", seed: string) => string;
}): ProvisionalReconcileResult {
  const idFactory = input.idFactory ?? defaultIdFactory(input.at);
  const memoriesToSave: StoredAcceptedProjectMemory[] = [];
  const reviewActionsToAppend: StoredMemoryReviewAction[] = [];
  for (const memory of input.existingMemories) {
    if (memory.status !== "provisional") continue;
    if (isAutoMemoryKind(memory.kind)) continue;
    const action: StoredMemoryReviewAction = {
      id: idFactory("action", `${memory.id}:reconcile-retire`),
      projectId: memory.projectId,
      actionType: "autoOrganize",
      actor: "auto-policy",
      timestamp: input.at,
      sourceProposalId: undefined,
      targetMemoryIds: [memory.id],
      before: { title: memory.title, status: "provisional" },
      after: { title: memory.title, status: "retired" },
      note: "정책 변경: 이 종류는 더 이상 자동 메모리가 아닙니다.",
      reversible: true,
      schemaVersion: 1,
      adapter: "browser-local-storage",
    };
    memoriesToSave.push({
      ...memory,
      status: "retired",
      updatedAt: input.at,
      reviewActionIds: [...memory.reviewActionIds, action.id],
    });
    reviewActionsToAppend.push(action);
  }
  return { memoriesToSave, reviewActionsToAppend };
}

function buildProvisionalMemory(args: {
  memoryId: string;
  projectId: string;
  proposal: MemoryProposal;
  at: string;
  actionId: string;
}): StoredAcceptedProjectMemory {
  const { memoryId, projectId, proposal, at, actionId } = args;
  const confidence: StoredAcceptedProjectMemoryConfidence = {
    label: confidenceLabel(proposal.confidence),
    score: proposal.confidence,
  };
  const evidenceRefs: StoredMemoryEvidenceRef[] = proposal.evidenceRefs.map((ref) => {
    if (ref.kind === "session") {
      return { kind: "session", sessionId: ref.sessionId, sessionTitle: ref.sessionTitle };
    }
    if (ref.kind === "event") {
      return { kind: "event", sessionId: ref.sessionId, eventId: ref.eventId };
    }
    return { kind: "source", sessionId: ref.sessionId, sourceId: ref.sourceId };
  });
  return {
    id: memoryId,
    projectId,
    kind: proposal.kind,
    title: proposal.title,
    summary: proposal.summary,
    status: "provisional",
    importance: proposal.importance,
    confidence,
    evidenceRefs,
    sourceSessionIds: [...proposal.sourceSessionIds],
    originProposalIds: [proposal.id],
    relatedIssueIds: [...proposal.relatedIssueIds],
    relatedDecisionIds: [...proposal.relatedDecisionIds],
    proposedAction: proposal.proposedAction,
    reviewNote: undefined,
    sensitivity: "normal",
    // Provisional memory is recallable in personal surfaces but never leaves
    // the machine as confirmed truth.
    resumeEligible: false,
    reportEligibility: "excluded",
    createdAt: proposal.createdAt,
    updatedAt: at,
    acceptedAt: at,
    acceptedBy: "local-user",
    reviewActionIds: [actionId],
    schemaVersion: 1,
    adapter: "browser-local-storage",
  };
}

function confidenceLabel(score: number): StoredAcceptedProjectMemoryConfidence["label"] {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function defaultIdFactory(at: string) {
  let counter = 0;
  return (purpose: "memory" | "action", seed: string): string => {
    counter += 1;
    return `${purpose}::auto::${seed}::${at}::${counter}`;
  };
}
