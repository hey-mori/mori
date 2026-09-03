import { AlertTriangle, CheckCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useSessionStore } from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import type { ReviewDraftMeta, ReviewEventItem } from "../../lib/review";
import {
  buildImportReviewSummary,
  getReviewCounts,
  isReviewApplyable,
} from "../../lib/review";
import {
  DISCLOSURE_LABELS,
  projectEventRequestSummary,
  type DisclosureLevel,
} from "../../lib/disclosure";
import type { EventActor } from "../../domain/types";
import { formatTime } from "../../lib/formatting/time";
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
export function ImportReviewView({ embedded = false }: { embedded?: boolean } = {}) {
  const pendingReview = useSessionStore((state) => state.pendingReview);
  const setItemStatus = useSessionStore((state) => state.setPendingReviewItemStatus);
  const setAllStatus = useSessionStore((state) => state.setAllPendingReviewStatus);
  const editEvent = useSessionStore((state) => state.editPendingReviewEvent);
  const applyPendingReview = useSessionStore((state) => state.applyPendingReview);
  const cancelPendingReview = useSessionStore((state) => state.cancelPendingReview);
  const disclosureLevel = useSessionStore(
    (state) => state.analysisSettings.requestDisclosureLevel,
  );
  const setSelectedEventId = useAppStore((state) => state.setSelectedEventId);

  const draft = pendingReview?.draft ?? null;
  const draftMeta = pendingReview?.meta ?? null;
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

  async function handleApply() {
    // The store owns the apply path: accepted events become a persisted import,
    // the pending review is cleared, and a pending import-created session is
    // promoted to real. We only reflect the first applied event in the inspector.
    const outcome = await applyPendingReview();
    if (!outcome.ok) return;
    if (outcome.firstEventId) setSelectedEventId(outcome.firstEventId);
  }

  function handleCancel() {
    // The store clears the persisted pending review and, if this was a
    // freshly-created import session with nothing applied, discards the empty
    // session and restores the prior one.
    cancelPendingReview();
  }

  return (
    <div className={embedded ? "review-page review-embedded" : "page review-page"}>
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

      <OriginalConversation events={draft.events} level={disclosureLevel} />

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

const ORIGINAL_ACTOR_LABEL: Partial<Record<EventActor, string>> = {
  user: "나",
  assistant: "AI",
};

const ORIGINAL_PREVIEW_CAP = 60;

/**
 * A read-only preview of the imported conversation itself, distinct from the
 * accept / discard event rows below. It renders the user / assistant turns as a
 * transcript, projected through the user's disclosure level
 * (`analysisSettings.requestDisclosureLevel`), so what is shown follows the
 * same "store everything, show by setting" rule as every other surface: at 원문
 * the user's own requests show in full, at 요약 / 요지 they are condensed, at
 * 숨김 they are withheld. Folded behind a `<details>` so the curation list stays
 * the lead, and capped so a huge import does not render thousands of nodes.
 */
function OriginalConversation({
  events,
  level,
}: {
  events: ReviewEventItem[];
  level: DisclosureLevel;
}) {
  const turns = events.filter(
    (item) => item.event.actor === "user" || item.event.actor === "assistant",
  );
  if (turns.length === 0) return null;
  const shown = turns.slice(0, ORIGINAL_PREVIEW_CAP);
  const hiddenCount = turns.length - shown.length;

  return (
    <details className="review-original">
      <summary>
        <span className="review-original-title">원본 대화 {turns.length}턴</span>
        <span className="review-original-scope">표시 범위 · {DISCLOSURE_LABELS[level]}</span>
      </summary>
      <ol className="review-original-turns">
        {shown.map((item) => {
          const projection = projectEventRequestSummary(item.event, level);
          const actor = item.event.actor ?? "assistant";
          return (
            <li key={item.id} className={`review-original-turn actor-${actor}`}>
              <span className="review-original-turn-meta">
                {formatTime(item.event.start)} · {ORIGINAL_ACTOR_LABEL[actor] ?? "기타"}
              </span>
              <p className="review-original-turn-body">
                {projection.text || (level === "hidden" ? "(공개 설정에 따라 숨김)" : "(내용 없음)")}
              </p>
            </li>
          );
        })}
      </ol>
      {hiddenCount > 0 ? (
        <p className="review-original-more">
          전체 {turns.length}턴 중 {shown.length}턴 표시 · 나머지 {hiddenCount}턴은 아래 목록에서 확인
        </p>
      ) : null}
    </details>
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
