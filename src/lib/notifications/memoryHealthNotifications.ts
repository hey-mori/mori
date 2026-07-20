import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import { buildStaleMemoryProposals } from "../project-memory/staleMemoryReview";
import { buildContradictionProposals } from "../project-memory/contradictionReview";
import type { CompanionNotification } from "./notification";

/**
 * Surface memory-health proposals as Mori 노트 notifications.
 *
 * Builds on the existing pure detectors:
 *   - `buildStaleMemoryProposals` — supersession / explicit note / time-only
 *   - `buildContradictionProposals` — two current decisions with the same
 *     normalised title but different summaries
 *
 * The notifications are *summaries* — one row per detected category — so
 * the panel doesn't drown the user. Clicking a row deep-links into the
 * 통합 (consolidation) review where the per-memory action lives.
 *
 * Stable ids (`memory-health:stale` / `memory-health:contradiction`) mean
 * the dedupe in `composeNotifications` keeps the row to a single entry
 * even if another producer ever raises the same kind.
 */

export type BuildMemoryHealthNotificationsInput = {
  acceptedMemories: ReadonlyArray<StoredAcceptedProjectMemory>;
  /** Reference time for the stale-memory time-only branch. */
  now?: string;
};

export function buildMemoryHealthNotifications(
  input: BuildMemoryHealthNotificationsInput,
): CompanionNotification[] {
  const stale = buildStaleMemoryProposals(input.acceptedMemories, {
    now: input.now,
  });
  const contradictions = buildContradictionProposals(input.acceptedMemories);

  const notifications: CompanionNotification[] = [];

  if (stale.length > 0) {
    notifications.push({
      id: "memory-health:stale",
      kind: "memory_stale_detected",
      severity: "review",
      title: `오래된 메모리 ${stale.length}건`,
      message:
        stale.length === 1
          ? stale[0]!.title
          : "통합 검토에서 최신 내용으로 바꾸거나 보관 처리할 수 있습니다.",
      basis: "mixed",
      linkedItemIds: stale.flatMap((proposal) => proposal.targetMemoryIds ?? []),
      evidenceRefs: [],
      actionLabel: "통합 검토",
      actionTarget: { kind: "view", view: "consolidation" },
    });
  }

  if (contradictions.length > 0) {
    notifications.push({
      id: "memory-health:contradiction",
      kind: "memory_contradiction_detected",
      severity: "review",
      title: `상충 메모리 ${contradictions.length}건`,
      message:
        contradictions.length === 1
          ? contradictions[0]!.title
          : "같은 결정에 다른 결론이 남아 있습니다. 통합 검토에서 정리하세요.",
      basis: "mixed",
      linkedItemIds: contradictions.flatMap((p) => p.targetMemoryIds ?? []),
      evidenceRefs: [],
      actionLabel: "통합 검토",
      actionTarget: { kind: "view", view: "consolidation" },
    });
  }

  return notifications;
}
