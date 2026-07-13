/**
 * Auto-organize memory: the foreground trigger that makes memory accumulate
 * without a review queue.
 *
 * When a project's consolidation proposals are computed (viewing its memory),
 * this partitions them by the governance policy and persists the safe,
 * additive, high-confidence bucket as provisional memory. Exceptions
 * (mutations, low confidence) stay for review; non-memory proposals (next
 * actions) are skipped. Idempotent: the pure builder skips proposals already
 * turned into memory, and a per-signature guard stops the effect re-running
 * for the same proposal set. Foreground only, no daemon; it rides normal
 * navigation exactly like the rest of Mori's reading.
 *
 * Returns the count auto-organized on the last run so the surface can show an
 * honest "Mori가 N개를 정리했습니다" line instead of a queue of cards.
 */
import { useEffect, useRef, useState } from "react";
import type { MemoryProposal } from "../../lib/project-memory/consolidationProposals";
import {
  DEFAULT_MEMORY_GOVERNANCE_MODE,
  partitionProposalsByGovernance,
  type MemoryGovernanceMode,
} from "../../lib/project-memory/memoryGovernance";
import { buildProvisionalMemoriesFromProposals } from "../../lib/project-memory/provisionalMemory";
import { getAcceptedMemoryRepository } from "../../lib/project-memory/acceptedMemoryRepository";

export type AutoOrganizeResult = {
  /** Provisional memories created on the most recent run. */
  organizedCount: number;
};

export function useAutoOrganizeMemory(args: {
  projectId: string;
  proposals: readonly MemoryProposal[];
  /** Bump to signal the memories changed so the effect re-checks. */
  memoriesRevision: number;
  mode?: MemoryGovernanceMode;
  /** Called after provisional memory is written, so the caller reloads. */
  onOrganized: () => void;
}): AutoOrganizeResult {
  const { projectId, proposals, memoriesRevision, onOrganized } = args;
  const mode = args.mode ?? DEFAULT_MEMORY_GOVERNANCE_MODE;
  const [organizedCount, setOrganizedCount] = useState(0);
  // One run per (project, proposal set, memory revision, mode): re-runs when
  // new proposals appear or memory changes, never in a tight loop.
  const lastRunKey = useRef<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (mode !== "auto") return;
    const { auto } = partitionProposalsByGovernance(proposals, { mode });
    if (auto.length === 0) return;

    const key = `${projectId}::${memoriesRevision}::${auto.map((p) => p.id).join(",")}`;
    if (lastRunKey.current === key || running.current) return;

    let cancelled = false;
    running.current = true;
    void (async () => {
      try {
        const repository = getAcceptedMemoryRepository();
        const existing = await repository.listAcceptedProjectMemories(projectId);
        if (cancelled) return;
        const built = buildProvisionalMemoriesFromProposals({
          projectId,
          proposals: auto,
          at: new Date().toISOString(),
          existingMemories: existing.data,
        });
        lastRunKey.current = key;
        if (built.memoriesToSave.length === 0) {
          setOrganizedCount(0);
          return;
        }
        await repository.saveAcceptedProjectMemories(projectId, built.memoriesToSave);
        await repository.appendMemoryReviewActions(projectId, built.reviewActionsToAppend);
        if (cancelled) return;
        setOrganizedCount(built.memoriesToSave.length);
        onOrganized();
      } catch {
        // A failed write leaves the guard unset so a later render retries;
        // the repository already reports its own fallback.
      } finally {
        running.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
    // onOrganized identity is not part of the run key on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, proposals, memoriesRevision, mode]);

  return { organizedCount };
}
