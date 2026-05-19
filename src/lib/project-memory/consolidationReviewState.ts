/**
 * Consolidation Review draft state.
 *
 * The Consolidation Review Surface needs a place to keep per-
 * proposal user actions (accept / discard / keep watching / defer /
 * inline edit) while the user works through a review. This state is
 * intentionally draft-only; the separate apply boundary converts the
 * reviewed draft into accepted memories and audit rows in local storage.
 *
 * The state is pure and immutable:
 *   - `initializeConsolidationReviewState(proposals)` returns a fresh
 *     draft keyed by `proposal.id`.
 *   - Every transition returns a *new* draft; the input draft is
 *     never mutated. This matches the existing `useState` /
 *     `useReducer` pattern in the codebase.
 *   - Unknown proposal ids are no-ops (return the draft unchanged)
 *     so the UI never has to guard for stale ids before dispatching.
 *
 * Edits are lightweight: the user can override `title` / `summary`
 * inline. The original proposal is preserved on the entry so an
 * "undo edit" affordance can compare against it.
 */
import type { MemoryProposal } from "./consolidationProposals";

export type ConsolidationReviewStatus =
  | "proposed"
  | "accepted"
  | "edited"
  | "discarded"
  | "watching"
  | "deferred";

export type ConsolidationReviewEntry = {
  /** Mirror of the source proposal. Read-only. */
  proposal: MemoryProposal;
  /** Current review status; defaults to `"proposed"`. */
  status: ConsolidationReviewStatus;
  /** Inline edits — `null` until the user opens the editor. */
  edits: {
    title: string | null;
    summary: string | null;
  };
  /** Free-text reviewer note from the audit-trail design. */
  note: string | null;
  /** Bumped on every transition for the entry; useful for keys. */
  revision: number;
};

export type ConsolidationReviewState = {
  /** Stable identifier (e.g. proposal `runId` when ConsolidationRun
   *  lands; today we derive a transient id at initialize time). */
  draftId: string;
  /** Entries keyed by `proposal.id`. */
  entries: Record<string, ConsolidationReviewEntry>;
  /** Stable insertion order of `proposal.id`. */
  order: string[];
  /** When the draft was initialized. Deterministic per session. */
  initializedAt: string;
};

export type ConsolidationReviewCounts = {
  total: number;
  proposed: number;
  accepted: number;
  edited: number;
  discarded: number;
  watching: number;
  deferred: number;
};

const EMPTY_DRAFT_ID = "consolidation-review-empty";

// ─── construction ───────────────────────────────────────────────────────

/**
 * Build a fresh review draft from a proposal list. `initializedAt`
 * defaults to a stable epoch so the function stays deterministic;
 * callers can override at the call site if they want wall-clock
 * timestamps in the UI.
 */
export function initializeConsolidationReviewState(
  proposals: readonly MemoryProposal[],
  options: { draftId?: string; initializedAt?: string } = {},
): ConsolidationReviewState {
  const draftId = options.draftId ?? makeDraftId(proposals);
  const initializedAt = options.initializedAt ?? "1970-01-01T00:00:00.000Z";
  const entries: Record<string, ConsolidationReviewEntry> = {};
  const order: string[] = [];
  for (const proposal of proposals) {
    if (entries[proposal.id]) continue; // dedupe defensive
    entries[proposal.id] = {
      proposal,
      status: "proposed",
      edits: { title: null, summary: null },
      note: null,
      revision: 0,
    };
    order.push(proposal.id);
  }
  return { draftId, entries, order, initializedAt };
}

/**
 * Re-initialise from a fresh proposal list (e.g. when the user
 * re-runs preview or switches projects). Drops any prior review
 * actions — local-only draft, no persistence.
 */
export function resetConsolidationReviewState(
  proposals: readonly MemoryProposal[],
  options: { draftId?: string; initializedAt?: string } = {},
): ConsolidationReviewState {
  return initializeConsolidationReviewState(proposals, options);
}

// ─── transitions ────────────────────────────────────────────────────────

export function acceptProposal(
  state: ConsolidationReviewState,
  proposalId: string,
): ConsolidationReviewState {
  return transitionStatus(state, proposalId, "accepted");
}

export function discardProposal(
  state: ConsolidationReviewState,
  proposalId: string,
): ConsolidationReviewState {
  return transitionStatus(state, proposalId, "discarded");
}

export function keepWatchingProposal(
  state: ConsolidationReviewState,
  proposalId: string,
): ConsolidationReviewState {
  return transitionStatus(state, proposalId, "watching");
}

export function deferProposal(
  state: ConsolidationReviewState,
  proposalId: string,
): ConsolidationReviewState {
  return transitionStatus(state, proposalId, "deferred");
}

export function resetProposal(
  state: ConsolidationReviewState,
  proposalId: string,
): ConsolidationReviewState {
  // Goes back to the original `proposed` status and clears edits / note.
  const existing = state.entries[proposalId];
  if (!existing) return state;
  const next: ConsolidationReviewEntry = {
    proposal: existing.proposal,
    status: "proposed",
    edits: { title: null, summary: null },
    note: null,
    revision: existing.revision + 1,
  };
  return { ...state, entries: { ...state.entries, [proposalId]: next } };
}

/**
 * Apply an inline edit to title and/or summary. The entry's status
 * becomes `"edited"` so the UI can render the changed copy
 * distinctly and the apply step (when persistence lands) knows to
 * use the edited form instead of the original.
 *
 * Passing `null` for a field clears that edit override (revert to
 * original proposal text); passing `undefined` leaves the prior edit
 * in place.
 */
export function editProposal(
  state: ConsolidationReviewState,
  proposalId: string,
  edits: { title?: string | null; summary?: string | null },
): ConsolidationReviewState {
  const existing = state.entries[proposalId];
  if (!existing) return state;
  const nextTitle = edits.title === undefined ? existing.edits.title : edits.title;
  const nextSummary = edits.summary === undefined ? existing.edits.summary : edits.summary;
  // If both edits clear to null and the original was already proposed,
  // collapse back to `proposed`. Otherwise mark as edited.
  const hasEdit =
    (nextTitle !== null && nextTitle !== existing.proposal.title) ||
    (nextSummary !== null && nextSummary !== existing.proposal.summary);
  const next: ConsolidationReviewEntry = {
    ...existing,
    edits: { title: nextTitle, summary: nextSummary },
    status: hasEdit ? "edited" : existing.status === "edited" ? "proposed" : existing.status,
    revision: existing.revision + 1,
  };
  return { ...state, entries: { ...state.entries, [proposalId]: next } };
}

export function setReviewerNote(
  state: ConsolidationReviewState,
  proposalId: string,
  note: string | null,
): ConsolidationReviewState {
  const existing = state.entries[proposalId];
  if (!existing) return state;
  const next: ConsolidationReviewEntry = {
    ...existing,
    note: note === null || note.length === 0 ? null : note,
    revision: existing.revision + 1,
  };
  return { ...state, entries: { ...state.entries, [proposalId]: next } };
}

// ─── selectors ──────────────────────────────────────────────────────────

export function getReviewEntry(
  state: ConsolidationReviewState,
  proposalId: string,
): ConsolidationReviewEntry | null {
  return state.entries[proposalId] ?? null;
}

/**
 * Compute counts per status. Useful for the header "N accepted",
 * footer "Apply N", and the per-group counts on the proposal list.
 */
export function countConsolidationReviewStatuses(
  state: ConsolidationReviewState,
): ConsolidationReviewCounts {
  const counts: ConsolidationReviewCounts = {
    total: state.order.length,
    proposed: 0,
    accepted: 0,
    edited: 0,
    discarded: 0,
    watching: 0,
    deferred: 0,
  };
  for (const id of state.order) {
    const entry = state.entries[id];
    if (!entry) continue;
    counts[entry.status] += 1;
  }
  return counts;
}

/**
 * Effective title for an entry: use the edit if present, otherwise
 * fall back to the original proposal title.
 */
export function effectiveTitle(entry: ConsolidationReviewEntry): string {
  return entry.edits.title ?? entry.proposal.title;
}

export function effectiveSummary(entry: ConsolidationReviewEntry): string {
  return entry.edits.summary ?? entry.proposal.summary;
}

// ─── helpers ────────────────────────────────────────────────────────────

function transitionStatus(
  state: ConsolidationReviewState,
  proposalId: string,
  status: ConsolidationReviewStatus,
): ConsolidationReviewState {
  const existing = state.entries[proposalId];
  if (!existing) return state;
  if (existing.status === status) return state;
  const next: ConsolidationReviewEntry = {
    ...existing,
    status,
    revision: existing.revision + 1,
  };
  return { ...state, entries: { ...state.entries, [proposalId]: next } };
}

function makeDraftId(proposals: readonly MemoryProposal[]): string {
  if (proposals.length === 0) return EMPTY_DRAFT_ID;
  // Stable derivation from the proposal set so the same set produces
  // the same draftId — useful for memoised consumers.
  const head = proposals[0].id;
  return `consolidation-review::${head}::${proposals.length}`;
}
