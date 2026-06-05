import { AlertTriangle, CheckCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useSessionStore } from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { useReviewStore, type ReviewDraftMeta } from "../../app/reviewStore";
import {
  buildImportReviewSummary,
  getReviewCounts,
  isReviewApplyable,
} from "../../lib/review";
import { buildImportDigest, type ImportDigest } from "../../lib/import/importDigest";
import { SourceSummaryCard } from "./SourceSummaryCard";
import { ExtractedEventCard } from "./ExtractedEventCard";

/**
 * Import Review — the explicit accept / discard gate before evidence reaches the
 * session. Shown in place of the Evidence Hub whenever a review draft is in
 * flight. `embedded` is accepted so the Session Detail's 자료 tab can host it
 * inside the unified workspace; the layout is the same self-contained
 * `.page review-page` block in both modes (it never used `PageShell`).
 *
 * The screen is deliberately spare: a one-line digest of what is coming in, the
 * source it came from, the extracted events, and one primary action. The former
 * four-tile status panel, the generated-items column (always empty here), the
 * bulk-accept callout + confirm modal, the origin badge, and the header back
 * button were all chrome that hid the single thing the user is here to do —
 * confirm the import. AI transcripts (the common path) land already accepted so
 * 반영 is one click; anything can still be discarded first.
 */
export function ImportReviewView(_props: { embedded?: boolean } = {}) {
  const draft = useReviewStore((state) => state.draft);
  const draftMeta = useReviewStore((state) => state.draftMeta);
  const setItemStatus = useReviewStore((state) => state.setItemStatus);
  const setAllStatus = useReviewStore((state) => state.setAllStatus);
  const editEvent = useReviewStore((state) => state.editEvent);
  const apply = useReviewStore((state) => state.apply);
  const cancel = useReviewStore((state) => state.cancel);
  const addImport = useSessionStore((state) => state.addImport);
  const commitPendingNewSession = useSessionStore(
    (state) => state.commitPendingNewSession,
  );
  const abandonPendingNewSessionIfEmpty = useSessionStore(
    (state) => state.abandonPendingNewSessionIfEmpty,
  );
  const setSelectedEventId = useAppStore((state) => state.setSelectedEventId);

  const draftId = draft?.source.id ?? null;
  const allPending = Boolean(draft) && draft!.events.length > 0 &&
    draft!.events.every((item) => item.status === "pending");

  // AI transcripts are the common path and produce already-trusted summary
  // turns, so land the screen ready-to-apply (one obvious 반영) instead of
  // forcing a per-event accept first. Still reversible — any item can be
  // discarded before 반영. Other origins keep per-event review on.
  useEffect(() => {
    if (draft?.origin === "ai-transcript" && allPending) {
      setAllStatus("accepted");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  if (!draft) {
    // EvidenceView guards this, but keep a sane fallback for safety.
    return null;
  }

  const counts = getReviewCounts(draft);
  const applyable = isReviewApplyable(draft);
  const digest = useMemo(
    () => buildImportDigest(draft.events.map((item) => item.event), [draft.source]),
    [draft.events, draft.source],
  );
  const reviewSummary = buildImportReviewSummary({
    eventCount: draft.events.length,
    acceptedCount: counts.accepted,
    discardedCount: counts.discarded,
    pendingCount: counts.pending,
    meta: draftMeta,
  });
  const attention = useMemo(() => buildAttentionNote(draftMeta), [draftMeta]);

  const allAccepted =
    draft.events.length > 0 && draft.events.every((item) => item.status === "accepted");
  const allDiscarded =
    draft.events.length > 0 && draft.events.every((item) => item.status === "discarded");

  function handleApply() {
    if (!draft) return;
    const summary = draftMeta?.sourceImportSummary;
    const outcome = apply((candidate) => {
      const stored = addImport(candidate, summary ? { importSummary: summary } : undefined);
      if (!stored) {
        return { ok: false, reason: "세션을 찾을 수 없어 반영하지 못했습니다." };
      }
      const firstEventId = stored.events[0]?.id;
      if (firstEventId) setSelectedEventId(firstEventId);
      return { ok: true };
    });
    if (!outcome.ok) return;
    // Applied work means a pending import-created session is now real — keep
    // it and clear the empty-session cleanup bookkeeping.
    commitPendingNewSession();
  }

  function handleCancel() {
    cancel();
    // If this review was for a freshly-created import session and nothing
    // was applied, discard the empty session and restore the prior one so
    // we never leave an empty "제목 없는 세션" behind.
    abandonPendingNewSessionIfEmpty();
  }

  return (
    <div className="page review-page">
      <header className="review-header review-header-tight">
        <h1>가져오기 검토</h1>
      </header>

      <ImportDigestStrip digest={digest} />

      {attention ? (
        <p className="review-attention" role="status">
          <AlertTriangle size={14} aria-hidden="true" />
          {attention}
        </p>
      ) : null}

      <SourceSummaryCard source={draft.source} />

      <section className="review-events" aria-label="추출된 타임라인 이벤트">
        <header className="review-events-head">
          <h2>{reviewSummary.headline}</h2>
          {draft.events.length > 0 ? (
            <div className="review-events-actions">
              <Button
                icon={CheckCheck}
                size="sm"
                onClick={() => setAllStatus("accepted")}
                disabled={allAccepted}
              >
                전부 수락
              </Button>
              <Button
                icon={Trash2}
                size="sm"
                onClick={() => setAllStatus("discarded")}
                disabled={allDiscarded}
              >
                전부 폐기
              </Button>
            </div>
          ) : null}
        </header>

        {draft.events.length === 0 ? (
          <EmptyEventList />
        ) : (
          <ul className="review-events-list">
            {draft.events.map((item) => (
              <li key={item.id}>
                <ExtractedEventCard
                  item={item}
                  onAccept={() => setItemStatus("event", item.id, "accepted")}
                  onDiscard={() => setItemStatus("event", item.id, "discarded")}
                  onEdit={(edits) => editEvent(item.id, edits)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="review-footer" role="region" aria-label="검토 반영">
        <span className="review-footer-counts">
          {counts.discarded > 0
            ? `${counts.accepted}개 반영 · ${counts.discarded}개 폐기`
            : `${counts.accepted}개 반영 예정`}
        </span>
        <div className="review-footer-actions">
          <Button onClick={handleCancel}>취소</Button>
          <Button
            variant="primary"
            icon={CheckCheck}
            onClick={handleApply}
            disabled={!applyable}
            title={
              applyable
                ? `${counts.accepted}개의 이벤트를 세션에 반영`
                : "최소 1개 이상의 이벤트를 수락해야 반영할 수 있습니다."
            }
          >
            Timeline에 반영 ({counts.accepted})
          </Button>
        </div>
      </footer>
    </div>
  );
}

/**
 * A compact "this is what's going in" strip: a per-lane breakdown
 * (대화 / 명령 / 코드·파일 / 리서치 / 빌드 …) and the span, so the review leads
 * with insight. Uses the same lane classifier as the timeline.
 */
function ImportDigestStrip({ digest }: { digest: ImportDigest }) {
  if (digest.eventCount === 0) return null;
  return (
    <div className="import-digest">
      {digest.lanes.map((lane) => (
        <Badge key={lane.lane} tone="gray">
          {lane.label} {lane.count}
        </Badge>
      ))}
      {digest.span.durationLabel ? (
        <span className="import-digest-span">· {digest.span.durationLabel}</span>
      ) : null}
    </div>
  );
}

/**
 * One short attention line, shown only when there is something the user should
 * know before applying: skipped duplicates or unparseable lines. Everything
 * clean (the common case) renders nothing.
 */
function buildAttentionNote(meta: ReviewDraftMeta | null): string | null {
  if (!meta) return null;
  const duplicates =
    (meta.currentSessionDuplicateCount ?? 0) +
      (meta.savedSessionDuplicateCount ?? 0) +
      (meta.inBatchDuplicateCount ?? 0) || (meta.duplicateSkippedCount ?? 0);
  const invalid = meta.invalidLineCount ?? 0;
  const parts: string[] = [];
  if (duplicates > 0 && !meta.includeDuplicates) parts.push(`이미 가져온 중복 ${duplicates}개는 제외됩니다`);
  if (invalid > 0) parts.push(`읽을 수 없는 줄 ${invalid}개는 건너뜁니다`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function EmptyEventList() {
  return (
    <div className="review-events-empty">
      <h3>추출된 이벤트가 없습니다</h3>
      <p>이 가져오기에서는 타임라인 이벤트가 생성되지 않았습니다. ‘취소’를 눌러 다른 자료를 가져오세요.</p>
    </div>
  );
}
