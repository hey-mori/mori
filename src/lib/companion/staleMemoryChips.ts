/**
 * Resolve a `stale_memory` Companion signal's `linkedItemIds` into
 * chip-ready records the Companion Inbox can render. Each chip carries
 * the accepted memory's title, status, and lifecycle group so the user
 * can recognise the item before opening its provenance drawer.
 *
 * Pure module:
 *   - No IO, no mutation of inputs.
 *   - Memory ids absent from the supplied accepted-memory list are
 *     dropped (consistent with the "no phantom link" policy used by
 *     the accepted-memory link-out resolver).
 */
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import {
  classifyMemoryLifecycle,
  type MemoryLifecycleGroup,
} from "../project-memory/memoryLifecycle";

export type StaleMemoryChip = {
  memoryId: string;
  title: string;
  status: StoredAcceptedProjectMemory["status"];
  lifecycleGroup: MemoryLifecycleGroup;
};

/**
 * Build chip view-models for the stale-memory signal. The output
 * preserves the input id order so the Companion Inbox renders chips in
 * the same order the signal carries — stale first when the caller used
 * the convention from `useCompanionSignals`.
 */
export function buildStaleMemoryChips(
  linkedItemIds: readonly string[],
  memories: readonly StoredAcceptedProjectMemory[],
): StaleMemoryChip[] {
  if (linkedItemIds.length === 0) return [];
  const byId = new Map(memories.map((memory) => [memory.id, memory]));
  const chips: StaleMemoryChip[] = [];
  const seen = new Set<string>();
  for (const id of linkedItemIds) {
    if (seen.has(id)) continue;
    const memory = byId.get(id);
    if (!memory) continue;
    seen.add(id);
    chips.push({
      memoryId: memory.id,
      title: memory.title,
      status: memory.status,
      lifecycleGroup: classifyMemoryLifecycle(memory.status),
    });
  }
  return chips;
}
