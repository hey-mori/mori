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
  type ReviewDraftMeta,
  type ReviewEventEdits,
  type ReviewItemKind,
  type ReviewItemStatus,
  type ReviewOrigin,
} from "../lib/review";

export type ApplyImportFn = (
  candidate: NormalizedImportCandidate,
) => { ok: true } | { ok: false; reason: string };

export type ApplyResult = { ok: true; appliedCount: number } | { ok: false; reason: string };

// `ReviewDraftMeta` now lives in `lib/review` so the storage layer can persist
// it without an upward dependency on this app store. Re-exported here so
// existing importers (e.g. ImportReviewView) keep their import path.
export type { ReviewDraftMeta };

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

export const useReviewStore = create<ImportReviewState>((set, get) => ({
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
      return { ok: false, reason: "최소 1개 이상의 이벤트를 Accept해야 반영할 수 있습니다." };
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
