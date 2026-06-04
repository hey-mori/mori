/**
 * Memory API — the canonical input contract for Mori's memory service.
 * See `docs/design/memory-as-a-service.md`.
 *
 * Every memory capability runs against one shaped input. This is the
 * contract each consumer produces: a UI binding hook, a notification
 * producer, or (later) a read-only MCP server building it from SQLite.
 * The operations over it live in `memoryApi.ts`.
 */
import type { SourceRef, TimelineEvent } from "../../domain/types";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";

export type MemoryCapabilityInput = {
  /** Durable, reviewed project memory. */
  acceptedMemories: StoredAcceptedProjectMemory[];
  /** Memory audit-trail review actions (their notes are searchable). */
  reviewActions: StoredMemoryReviewAction[];
  /** Active-session evidence: reviewed timeline events. */
  events: TimelineEvent[];
  /** Active-session evidence: reviewed sources. */
  sources: SourceRef[];
};

/** An empty input, e.g. before data has loaded. */
export const EMPTY_MEMORY_INPUT: MemoryCapabilityInput = {
  acceptedMemories: [],
  reviewActions: [],
  events: [],
  sources: [],
};
