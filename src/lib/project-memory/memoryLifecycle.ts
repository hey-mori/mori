/**
 * Lifecycle grouping for accepted Project Memory records.
 *
 * `StoredAcceptedProjectMemoryStatus` has eight values; on their own
 * they are eight equally-weighted badges with no sense of memory
 * *health*. This collapses them into four lifecycle groups so the
 * Memory surface can show "how much of my memory is still current"
 * at a glance, and so non-current records can be visually
 * de-emphasised without being hidden (Mori never deletes silently).
 *
 *  - `current`   — carries guidance weight (accepted, edited).
 *  - `advisory`  — durable but advisory (watching, deferred).
 *  - `attention` — review outcomes that need awareness (stale,
 *                  contradicted).
 *  - `archived`  — transitioned without deletion (superseded,
 *                  retired).
 */

import type { StoredAcceptedProjectMemoryStatus } from "../storage/storageTypes";
import type { ProductStateTone } from "../product-state/productState";

export type MemoryLifecycleGroup = "current" | "advisory" | "attention" | "archived";

export interface MemoryLifecycleSummary {
  current: number;
  advisory: number;
  attention: number;
  archived: number;
  total: number;
}

/** Map one durable memory status to its lifecycle group. */
export function classifyMemoryLifecycle(
  status: StoredAcceptedProjectMemoryStatus,
): MemoryLifecycleGroup {
  switch (status) {
    case "accepted":
    case "edited":
      return "current";
    case "watching":
    case "deferred":
      return "advisory";
    case "stale":
    case "contradicted":
      return "attention";
    case "superseded":
    case "retired":
      return "archived";
    default:
      return "advisory";
  }
}

/** Count accepted-memory statuses by lifecycle group. */
export function summarizeMemoryLifecycle(
  statuses: readonly StoredAcceptedProjectMemoryStatus[],
): MemoryLifecycleSummary {
  const summary: MemoryLifecycleSummary = {
    current: 0,
    advisory: 0,
    attention: 0,
    archived: 0,
    total: statuses.length,
  };
  for (const status of statuses) {
    summary[classifyMemoryLifecycle(status)] += 1;
  }
  return summary;
}

/** Korean label for a lifecycle group. */
export function describeMemoryLifecycleGroup(group: MemoryLifecycleGroup): string {
  switch (group) {
    case "current":
      return "현재 메모리";
    case "advisory":
      return "관찰 중";
    case "attention":
      return "확인 필요";
    case "archived":
      return "보관됨";
    default:
      return group;
  }
}

/**
 * Lifecycle-group tone, drawn from the shared product-state tone
 * vocabulary (`ProductStateTone`) so the Memory surface uses the same
 * scale as `MoriStatusBadge` and the `data-mori-tone` theme tokens.
 */
export function memoryLifecycleGroupTone(
  group: MemoryLifecycleGroup,
): ProductStateTone {
  switch (group) {
    case "current":
      return "success";
    case "advisory":
      return "info";
    case "attention":
      return "warning";
    case "archived":
      return "neutral";
    default:
      return "neutral";
  }
}

/**
 * Sort weight so a bounded preview list shows current memory first
 * and archived memory last — non-current records never crowd out
 * guidance-bearing ones.
 */
export function memoryLifecycleSortWeight(
  status: StoredAcceptedProjectMemoryStatus,
): number {
  switch (classifyMemoryLifecycle(status)) {
    case "current":
      return 0;
    case "attention":
      return 1;
    case "advisory":
      return 2;
    case "archived":
      return 3;
    default:
      return 2;
  }
}
