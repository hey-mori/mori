import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

/**
 * Per-memory categorisation against the client-safe export filter, plus the
 * roll-up counts a UI surface needs to explain *why* an export drops what it
 * drops.
 *
 * The filter rules mirror `buildClientSafeMoriPackage` exactly:
 *   - `included` — `reportEligibility === "clientSafe"` AND
 *     `sensitivity === "normal"`.
 *   - `excludedSensitive` — `sensitivity` is anything but `normal`. Sensitive
 *     memory is always dropped, even when the report tier would otherwise
 *     allow it.
 *   - `excludedTier` — `sensitivity === "normal"` but the report tier is
 *     `personal` or `team`.
 *
 * Keeping the categorisation in one place stops the Reports surface from
 * re-deriving the same filter and silently drifting from the actual export
 * pipeline.
 */
export type MemoryClientSafeCategory =
  | "included"
  | "excludedSensitive"
  | "excludedTier";

export type MemoryClientSafeBreakdown = {
  included: number;
  excludedSensitive: number;
  excludedTier: number;
  totalExcluded: number;
};

export function classifyMemoryForClientSafe(
  memory: StoredAcceptedProjectMemory,
): MemoryClientSafeCategory {
  if (memory.sensitivity !== "normal") return "excludedSensitive";
  if (memory.reportEligibility === "clientSafe") return "included";
  return "excludedTier";
}

export function buildMemoryClientSafeBreakdown(
  memories: ReadonlyArray<StoredAcceptedProjectMemory>,
): MemoryClientSafeBreakdown {
  let included = 0;
  let excludedSensitive = 0;
  let excludedTier = 0;
  for (const memory of memories) {
    switch (classifyMemoryForClientSafe(memory)) {
      case "included":
        included += 1;
        break;
      case "excludedSensitive":
        excludedSensitive += 1;
        break;
      case "excludedTier":
        excludedTier += 1;
        break;
    }
  }
  return {
    included,
    excludedSensitive,
    excludedTier,
    totalExcluded: excludedSensitive + excludedTier,
  };
}
