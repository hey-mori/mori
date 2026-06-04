/**
 * Memory API — Mori's public memory capability layer.
 * See `docs/design/memory-as-a-service.md`. Consumers import from here.
 */
export {
  memorySearch,
  memoryAsk,
  memoryGlossary,
  memoryDefineTerm,
  type MemorySearchResult,
  type MemoryGlossaryOptions,
} from "./memoryApi";
export { EMPTY_MEMORY_INPUT } from "./memoryApiTypes";
export type { MemoryCapabilityInput } from "./memoryApiTypes";
