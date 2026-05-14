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

export type ImportReviewState = {
  draft: ImportReviewDraft | null;
  /**
   * Set when the user just applied a draft. The Evidence Hub uses this to
   * surface a "Applied N items" status banner without keeping the modal open.
   */
  lastApplied: { sourceId: string; appliedCount: number; appliedAt: string } | null;
  startReview: (candidate: NormalizedImportCandidate, origin: ReviewOrigin) => void;
  setItemStatus: (kind: ReviewItemKind, itemId: string, status: ReviewItemStatus) => void;
  setAllStatus: (status: ReviewItemStatus) => void;
  editEvent: (itemId: string, edits: ReviewEventEdits) => void;
  apply: (commit: ApplyImportFn) => ApplyResult;
  cancel: () => void;
  clearLastApplied: () => void;
};

export const useMoriReviewStore = create<ImportReviewState>((set, get) => ({
  draft: null,
  lastApplied: null,
  startReview: (candidate, origin) => {
    set({ draft: createImportReviewDraft(candidate, origin) });
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
      lastApplied: {
        sourceId: candidate.source.id,
        appliedCount,
        appliedAt: new Date().toISOString(),
      },
    });
    return { ok: true, appliedCount };
  },
  cancel: () => {
    set({ draft: null });
  },
  clearLastApplied: () => {
    set({ lastApplied: null });
  },
}));
