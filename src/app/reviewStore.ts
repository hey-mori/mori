import { create } from "zustand";
import type { NormalizedImportCandidate } from "../lib/import";
import {
  buildAcceptedCandidate,
  createImportReviewDraft,
  editReviewEvent,
  isReviewApplyable,
  setAllItemsStatus,
  setReviewItemStatus,
  type ImportReviewDraft,
  type ReviewEventEdits,
  type ReviewItemKind,
  type ReviewItemStatus,
  type ReviewOrigin,
} from "../lib/review";

export type ApplyImportFn = (
  candidate: NormalizedImportCandidate,
) => { ok: true } | { ok: false; reason: string };

export type ApplyResult = { ok: true; appliedCount: number } | { ok: false; reason: string };

/**
 * Optional meta the boundary (Evidence Hub Connector JSONL import) passes
 * to Import Review so the Review surface can show "Skipped N duplicates"
 * alongside the source title. Today only the connector path produces
 * non-zero values; other import kinds pass nothing.
 */
export type ReviewDraftMeta = {
  newEventCount?: number;
  duplicateSkippedCount?: number;
  duplicateIncludedCount?: number;
  invalidLineCount?: number;
  includeDuplicates?: boolean;
  /**
   * Split of the duplicate count across detection sources so the Import
   * Review meta strip can show "Saved-session N" alongside the legacy
   * "Skipped duplicates" cell. Filled by the cross-session preview path.
   */
  currentSessionDuplicateCount?: number;
  savedSessionDuplicateCount?: number;
  inBatchDuplicateCount?: number;
  /**
   * False when the preview ran without saved-session history (browser
   * fallback). The meta strip uses this to render an honesty note instead
   * of pretending cross-session detection happened.
   */
  savedSessionHistoryAvailable?: boolean;
};

export type ImportReviewState = {
  draft: ImportReviewDraft | null;
  /** Optional meta surfaced by the Import Review header (skipped count etc.). */
  draftMeta: ReviewDraftMeta | null;
  /**
   * Set when the user just applied a draft. The Evidence Hub uses this to
   * surface a "Applied N items" status banner without keeping the modal open.
   */
  lastApplied: { sourceId: string; appliedCount: number; appliedAt: string } | null;
  startReview: (
    candidate: NormalizedImportCandidate,
    origin: ReviewOrigin,
    meta?: ReviewDraftMeta,
  ) => void;
  setItemStatus: (kind: ReviewItemKind, itemId: string, status: ReviewItemStatus) => void;
  setAllStatus: (status: ReviewItemStatus) => void;
  editEvent: (itemId: string, edits: ReviewEventEdits) => void;
  apply: (commit: ApplyImportFn) => ApplyResult;
  cancel: () => void;
  clearLastApplied: () => void;
};

export const useMoriReviewStore = create<ImportReviewState>((set, get) => ({
  draft: null,
  draftMeta: null,
  lastApplied: null,
  startReview: (candidate, origin, meta) => {
    set({
      draft: createImportReviewDraft(candidate, origin),
      draftMeta: meta ?? null,
    });
  },
  setItemStatus: (kind, itemId, status) => {
    const draft = get().draft;
    if (!draft) return;
    set({ draft: setReviewItemStatus(draft, kind, itemId, status) });
  },
  setAllStatus: (status) => {
    const draft = get().draft;
    if (!draft) return;
    set({ draft: setAllItemsStatus(draft, status) });
  },
  editEvent: (itemId, edits) => {
    const draft = get().draft;
    if (!draft) return;
    set({ draft: editReviewEvent(draft, itemId, edits) });
  },
  apply: (commit) => {
    const draft = get().draft;
    if (!draft) return { ok: false, reason: "No active review draft." };
    if (!isReviewApplyable(draft)) {
      return { ok: false, reason: "최소 1개 이상의 이벤트를 Accept해야 적용할 수 있습니다." };
    }
    const candidate = buildAcceptedCandidate(draft);
    if (!candidate) return { ok: false, reason: "Accepted events could not be built." };
    const outcome = commit(candidate);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };
    const appliedCount = candidate.events.length;
    set({
      draft: null,
      draftMeta: null,
      lastApplied: {
        sourceId: candidate.source.id,
        appliedCount,
        appliedAt: new Date().toISOString(),
      },
    });
    return { ok: true, appliedCount };
  },
  cancel: () => {
    set({ draft: null, draftMeta: null });
  },
  clearLastApplied: () => {
    set({ lastApplied: null });
  },
}));
