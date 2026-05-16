/**
 * Memory Audit Trail — view-model helper.
 *
 * Turns the append-only `StoredMemoryReviewAction[]` log (written by
 * the Consolidation Review apply path) into a grouped, sorted,
 * display-ready structure for the Memory page.
 *
 * This module is **pure**:
 *
 *   - No IO. No `Date.now()`. Timestamps come from the records.
 *   - No mutation of the input.
 *   - No raw source content. The view-model exposes only the action
 *     type, timestamp, affected-memory count, an optional reviewer
 *     note, and the reversible flag — never the `before` / `after`
 *     snapshots, never local paths, never connector text.
 *   - Tolerant of legacy / missing fields: an unknown `actionType`
 *     keeps a readable fallback label, a missing `targetMemoryIds`
 *     counts as zero, an unparseable timestamp groups under an
 *     "unknown date" bucket instead of throwing.
 *
 * Date and time labels are derived in UTC so the output is
 * deterministic and testable regardless of the host timezone.
 */
import type { StoredMemoryReviewAction } from "../storage/storageTypes";

export type MemoryAuditActionType = StoredMemoryReviewAction["actionType"];

/** Stable list of the known action types, in display order. */
export const MEMORY_AUDIT_ACTION_TYPES: readonly MemoryAuditActionType[] = [
  "apply",
  "accept",
  "edit",
  "watch",
  "defer",
  "discard",
  "reset",
  "revert",
];

export type MemoryAuditActionFilter = MemoryAuditActionType | "all";

/**
 * A status transition captured by an audit row's before/after
 * snapshot. `from` is null when the action created a new memory (no
 * prior status); `to` is null when the action wrote no memory (e.g.
 * a discard). Only the `status` string is read from the snapshots —
 * never raw evidence content.
 */
export type MemoryAuditStatusChange = {
  from: string | null;
  to: string | null;
};

export type MemoryAuditTrailEntry = {
  id: string;
  actionType: MemoryAuditActionType;
  /** Human label for the action type (falls back to the raw value). */
  actionLabel: string;
  /** Raw ISO timestamp from the record (may be empty / invalid). */
  timestamp: string;
  /** `HH:MM` UTC, or `—` when the timestamp could not be parsed. */
  timeLabel: string;
  /** Number of accepted-memory records the action touched. */
  targetMemoryCount: number;
  /** Originating proposal id, when the action came from a proposal. */
  sourceProposalId: string | null;
  /**
   * Memory status transition derived from the before/after snapshot,
   * when the snapshots carry a `status`. Null when neither side does.
   */
  statusChange: MemoryAuditStatusChange | null;
  /** Reviewer note, when present. */
  note: string | null;
  /** Whether the action advertises one-click undo (reserved). */
  reversible: boolean;
};

export type MemoryAuditTrailGroup = {
  /** `YYYY-MM-DD` (UTC), or `unknown` when the timestamp was invalid. */
  dateKey: string;
  dateLabel: string;
  entries: MemoryAuditTrailEntry[];
};

export type MemoryAuditTrailViewModel = {
  /** Total actions before filtering. */
  totalCount: number;
  /** Actions remaining after the action-type filter. */
  filteredCount: number;
  /** Whether the cap trimmed the rendered list. */
  truncated: boolean;
  groups: MemoryAuditTrailGroup[];
  /** Count per action type across ALL actions (drives filter chips). */
  actionTypeCounts: Record<MemoryAuditActionType, number>;
  /** True when there are no actions at all (independent of the filter). */
  isEmpty: boolean;
  filter: MemoryAuditActionFilter;
};

export type BuildMemoryAuditTrailOptions = {
  /** Action-type filter. Defaults to `"all"`. */
  filter?: MemoryAuditActionFilter;
  /** Max entries to render after filtering. Defaults to 60. */
  maxEntries?: number;
};

const DEFAULT_MAX_ENTRIES = 60;

const ACTION_LABELS: Record<MemoryAuditActionType, string> = {
  apply: "Applied",
  accept: "Accepted",
  edit: "Edited",
  watch: "Kept watching",
  defer: "Deferred",
  discard: "Discarded",
  reset: "Reset",
  revert: "Reverted",
};

/** Readable label for an action type; tolerant of unknown legacy values. */
export function describeMemoryAuditAction(actionType: string): string {
  const known = ACTION_LABELS[actionType as MemoryAuditActionType];
  if (known) return known;
  if (!actionType) return "Unknown action";
  return actionType.charAt(0).toUpperCase() + actionType.slice(1);
}

export function buildMemoryAuditTrailViewModel(
  actions: readonly StoredMemoryReviewAction[],
  options: BuildMemoryAuditTrailOptions = {},
): MemoryAuditTrailViewModel {
  const filter = options.filter ?? "all";
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;

  const actionTypeCounts = emptyActionTypeCounts();
  for (const action of actions) {
    const type = action.actionType;
    if (isKnownActionType(type)) actionTypeCounts[type] += 1;
  }

  // Newest first. Unparseable timestamps sort to the end.
  const sorted = [...actions].sort((a, b) => toTime(b.timestamp) - toTime(a.timestamp));

  const filtered = filter === "all"
    ? sorted
    : sorted.filter((action) => action.actionType === filter);

  const capped = filtered.slice(0, Math.max(0, maxEntries));
  const groups = groupByDate(capped.map(toEntry));

  return {
    totalCount: actions.length,
    filteredCount: filtered.length,
    truncated: filtered.length > capped.length,
    groups,
    actionTypeCounts,
    isEmpty: actions.length === 0,
    filter,
  };
}

// ─── internals ────────────────────────────────────────────────────────

function toEntry(action: StoredMemoryReviewAction): MemoryAuditTrailEntry {
  const { dateKey: _dateKey, timeLabel } = parseTimestamp(action.timestamp);
  const note = typeof action.note === "string" && action.note.trim().length > 0
    ? action.note.trim()
    : null;
  const targetMemoryCount = Array.isArray(action.targetMemoryIds)
    ? action.targetMemoryIds.length
    : 0;
  return {
    id: action.id,
    actionType: action.actionType,
    actionLabel: describeMemoryAuditAction(action.actionType),
    timestamp: action.timestamp ?? "",
    timeLabel,
    targetMemoryCount,
    sourceProposalId:
      typeof action.sourceProposalId === "string" && action.sourceProposalId.length > 0
        ? action.sourceProposalId
        : null,
    statusChange: deriveStatusChange(action.before, action.after),
    note,
    reversible: action.reversible === true,
  };
}

function groupByDate(entries: MemoryAuditTrailEntry[]): MemoryAuditTrailGroup[] {
  const groups: MemoryAuditTrailGroup[] = [];
  let current: MemoryAuditTrailGroup | null = null;
  for (const entry of entries) {
    const { dateKey, dateLabel } = parseTimestamp(entry.timestamp);
    if (!current || current.dateKey !== dateKey) {
      current = { dateKey, dateLabel, entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  }
  return groups;
}

/**
 * Derive a status transition from an audit row's before/after
 * snapshots. Reads only the `status` string field — the snapshots may
 * also carry `title` / `summary`, which the audit trail never renders.
 */
function deriveStatusChange(before: unknown, after: unknown): MemoryAuditStatusChange | null {
  const from = readStatus(before);
  const to = readStatus(after);
  if (from === null && to === null) return null;
  return { from, to };
}

function readStatus(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const status = (value as { status?: unknown }).status;
  return typeof status === "string" && status.length > 0 ? status : null;
}

function parseTimestamp(iso: string): {
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
} {
  const ms = iso ? new Date(iso).getTime() : Number.NaN;
  if (Number.isNaN(ms)) {
    return { dateKey: "unknown", dateLabel: "Unknown date", timeLabel: "—" };
  }
  const isoNormalised = new Date(ms).toISOString();
  const dateKey = isoNormalised.slice(0, 10);
  return { dateKey, dateLabel: dateKey, timeLabel: isoNormalised.slice(11, 16) };
}

function toTime(iso: string): number {
  const ms = iso ? new Date(iso).getTime() : Number.NaN;
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

function isKnownActionType(value: string): value is MemoryAuditActionType {
  return (MEMORY_AUDIT_ACTION_TYPES as readonly string[]).includes(value);
}

function emptyActionTypeCounts(): Record<MemoryAuditActionType, number> {
  return { apply: 0, accept: 0, edit: 0, watch: 0, defer: 0, discard: 0, reset: 0, revert: 0 };
}
