import { ArrowLeft, CheckCheck, ListChecks, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useMoriSessionStore } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { useMoriReviewStore, type ReviewDraftMeta } from "../../app/reviewStore";
import {
  describeConnectorSourceImportBadge,
  getConnectorSourceImportBadgeTone,
} from "../../lib/connectors";
import {
  buildImportReviewSummary,
  getReviewCounts,
  isReviewApplyable,
  type ImportReviewDraft,
  type ImportReviewSummaryItem,
  type ImportReviewSummaryStatus,
  type ReviewOrigin,
} from "../../lib/review";
import { SourceSummaryCard } from "./SourceSummaryCard";
import { ExtractedEventCard } from "./ExtractedEventCard";
import { GeneratedItemsPanel } from "./GeneratedItemsPanel";

const ORIGIN_LABEL: Record<ReviewOrigin, string> = {
  "ai-transcript": "AI 대화",
  "git-diff": "Git Diff",
  "manual-note": "직접 입력",
  url: "URL",
  "connector-jsonl": "Connector JSONL",
  other: "출처",
};

/**
 * Import Review — the explicit accept/discard gate before evidence reaches the
 * session. Shown in place of the Evidence Hub whenever a review draft is in
 * flight. `embedded` is accepted so the Session Detail's 증거 tab can host it
 * inside the unified workspace; the layout is the same self-contained
 * `.page review-page` block in both modes (it never used `PageShell`).
 */
export function ImportReviewView(_props: { embedded?: boolean } = {}) {
  const draft = useMoriReviewStore((state) => state.draft);
  const draftMeta = useMoriReviewStore((state) => state.draftMeta);
  const setItemStatus = useMoriReviewStore((state) => state.setItemStatus);
  const setAllStatus = useMoriReviewStore((state) => state.setAllStatus);
  const editEvent = useMoriReviewStore((state) => state.editEvent);
  const apply = useMoriReviewStore((state) => state.apply);
  const cancel = useMoriReviewStore((state) => state.cancel);
  const addImport = useMoriSessionStore((state) => state.addImport);
  const commitPendingNewSession = useMoriSessionStore(
    (state) => state.commitPendingNewSession,
  );
  const abandonPendingNewSessionIfEmpty = useMoriSessionStore(
    (state) => state.abandonPendingNewSessionIfEmpty,
  );
  const setSelectedEventId = useMoriAppStore((state) => state.setSelectedEventId);

  const [statusBanner, setStatusBanner] = useState<
    { tone: "error" | "info"; message: string } | null
  >(null);
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);

  if (!draft) {
    // EvidenceView guards this, but keep a sane fallback for safety.
    return null;
  }

  const counts = getReviewCounts(draft);
  const applyable = isReviewApplyable(draft);
  const reviewSummary = buildImportReviewSummary({
    eventCount: draft.events.length,
    acceptedCount: counts.accepted,
    discardedCount: counts.discarded,
    pendingCount: counts.pending,
    meta: draftMeta,
  });

  // Bulk-accept is only meaningful for Claude / Claude Code transcripts:
  // the AI already produced a single observed-trust summary turn per
  // exchange, and the user just wants to ingest the whole conversation.
  // For connector JSONL or manual notes we keep per-event review on so
  // the user can actually inspect what's being written.
  const isAiTranscript = draft.origin === "ai-transcript";
  const hasPendingEvents = counts.pending > 0;

  function handleApply() {
    if (!draft) return;
    setStatusBanner(null);
    const summary = draftMeta?.sourceImportSummary;
    const outcome = apply((candidate) => {
      const stored = addImport(candidate, summary ? { importSummary: summary } : undefined);
      if (!stored) {
        return { ok: false, reason: "세션을 찾을 수 없어 적용하지 못했습니다." };
      }
      const firstEventId = stored.events[0]?.id;
      if (firstEventId) setSelectedEventId(firstEventId);
      return { ok: true };
    });
    if (!outcome.ok) {
      setStatusBanner({ tone: "error", message: outcome.reason });
      return;
    }
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
      <header className="review-header">
        <Button icon={ArrowLeft} onClick={handleCancel}>
          증거로 돌아가기
        </Button>
        <div className="review-header-title">
          <h1>가져오기 검토</h1>
          <p>
            추출한 항목을 적용 전에 수락 또는 폐기로 정리하세요. 적용 전까지 세션 메모리에는
            추가되지 않습니다.
          </p>
        </div>
        <div className="review-header-meta">
          <Badge tone="purple">{ORIGIN_LABEL[draft.origin] ?? draft.origin}</Badge>
        </div>
      </header>

      {draftMeta ? <ReviewDraftMetaStrip meta={draftMeta} /> : null}

      {statusBanner ? (
        <div className={`review-status tone-${statusBanner.tone}`}>{statusBanner.message}</div>
      ) : null}

      <ImportReviewSummaryPanel summary={reviewSummary} />

      {isAiTranscript && hasPendingEvents && draft.events.length > 0 ? (
        <BulkAcceptCallout
          eventCount={draft.events.length}
          onAccept={() => setConfirmBulkOpen(true)}
        />
      ) : null}

      <div className="review-layout">
        <SourceSummaryCard source={draft.source} />

        <section className="review-events" aria-label="추출된 타임라인 이벤트">
          <header className="review-events-head">
            <div>
              <h2>추출된 타임라인 이벤트</h2>
              <p>각 항목은 적용 시 세션 타임라인에 추가되고, 폐기한 항목은 제외됩니다.</p>
            </div>
            <div className="review-events-actions">
              <Button
                icon={CheckCheck}
                onClick={() => setAllStatus("accepted")}
                disabled={draft.events.length === 0 || draft.events.every((item) => item.status === "accepted")}
              >
                전부 수락
              </Button>
              <Button
                icon={Trash2}
                onClick={() => setAllStatus("discarded")}
                disabled={draft.events.length === 0 || draft.events.every((item) => item.status === "discarded")}
              >
                전부 폐기
              </Button>
            </div>
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

        <GeneratedItemsPanel draft={draft} />
      </div>

      <ReviewFooter
        counts={counts}
        applyable={applyable}
        draft={draft}
        onApply={handleApply}
        onCancel={handleCancel}
      />

      <BulkAcceptConfirm
        open={confirmBulkOpen}
        eventCount={draft.events.length}
        onCancel={() => setConfirmBulkOpen(false)}
        onConfirm={() => {
          setAllStatus("accepted");
          setConfirmBulkOpen(false);
        }}
      />
    </div>
  );
}

function BulkAcceptCallout({
  eventCount,
  onAccept,
}: {
  eventCount: number;
  onAccept: () => void;
}) {
  return (
    <section className="review-bulk-accept" role="region" aria-label="Claude 대화 전체 수락">
      <div className="review-bulk-accept-copy">
        <span className="review-bulk-accept-kicker">
          <Sparkles size={14} aria-hidden="true" />
          Claude 대화
        </span>
        <strong>{eventCount}개 이벤트를 한 번에 수락할 수 있습니다.</strong>
        <p>
          AI 대화에서 추출된 항목입니다. 한 항목씩 검토하는 대신 전체를 일괄 수락하고
          적용한 뒤, Quick Pass로 이슈 · 결정 · 액션을 추출하는 것이 일반적인 흐름입니다.
        </p>
      </div>
      <Button variant="primary" icon={CheckCheck} onClick={onAccept}>
        Claude 대화 전체 수락
      </Button>
    </section>
  );
}

function BulkAcceptConfirm({
  open,
  eventCount,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  eventCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="review-confirm-modal" role="dialog" aria-modal="true" aria-label="전체 수락 확인">
      <div className="review-confirm-scrim" onClick={onCancel} aria-hidden="true" />
      <div className="review-confirm-panel">
        <header className="review-confirm-head">
          <h2>전체 수락하시겠습니까?</h2>
          <button
            type="button"
            className="review-confirm-close"
            aria-label="닫기"
            onClick={onCancel}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <p>
          {eventCount}개 이벤트를 모두 수락합니다. AI 출처에서 가져온 항목은 검증된
          데이터(observed)로 표시됩니다.
        </p>
        <p className="review-confirm-secondary">
          적용한 뒤 Quick Pass를 실행하면 이슈 · 결정 · 다음 액션을 추출할 수 있습니다.
        </p>
        <footer className="review-confirm-actions">
          <Button onClick={onCancel}>취소</Button>
          <Button variant="primary" icon={CheckCheck} onClick={onConfirm}>
            전체 수락
          </Button>
        </footer>
      </div>
    </div>
  );
}

function ImportReviewSummaryPanel({
  summary,
}: {
  summary: ReturnType<typeof buildImportReviewSummary>;
}) {
  return (
    <section className="import-review-summary" aria-label="Import review summary">
      <header>
        <div>
          <span className="import-review-summary-kicker">적용 전 검토</span>
          <h2>{summary.headline}</h2>
          <p>{summary.detail}</p>
        </div>
      </header>
      <div className="import-review-summary-grid">
        {summary.items.map((item) => (
          <ImportReviewSummaryTile key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function ImportReviewSummaryTile({ item }: { item: ImportReviewSummaryItem }) {
  return (
    <article className={`import-review-summary-tile status-${item.status}`}>
      <header>
        <strong>{item.title}</strong>
        <Badge tone={reviewSummaryTone(item.status)}>{item.statusLabel}</Badge>
      </header>
      <p>{item.detail}</p>
    </article>
  );
}

function reviewSummaryTone(status: ImportReviewSummaryStatus): "green" | "orange" | "gray" | "red" {
  switch (status) {
    case "ready":
      return "green";
    case "attention":
      return "orange";
    case "blocked":
      return "red";
    case "waiting":
    default:
      return "gray";
  }
}

function ReviewFooter({
  counts,
  applyable,
  draft,
  onApply,
  onCancel,
}: {
  counts: ReturnType<typeof getReviewCounts>;
  applyable: boolean;
  draft: ImportReviewDraft;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <footer className="review-footer" role="region" aria-label="Apply review">
      <div className="review-footer-counts">
        <ListChecks size={14} aria-hidden="true" />
        <span>
          수락 <strong>{counts.accepted}</strong> · 폐기 <strong>{counts.discarded}</strong> ·
          대기 <strong>{counts.pending}</strong>
        </span>
      </div>
      <div className="review-footer-actions">
        <Button onClick={onCancel}>취소</Button>
        <Button
          variant="primary"
          icon={CheckCheck}
          onClick={onApply}
          disabled={!applyable}
          title={
            applyable
              ? `${counts.accepted}개의 이벤트를 세션에 적용`
              : "최소 1개 이상의 이벤트를 수락해야 적용할 수 있습니다."
          }
        >
          Timeline에 적용 ({counts.accepted})
        </Button>
      </div>
      {!applyable ? (
        <p className="review-footer-hint">
          {draft.origin === "ai-transcript"
            ? "AI Transcript는 1개의 요약 이벤트를 생성합니다. 수락을 누른 뒤 적용하세요."
            : "적용하려면 적어도 1개의 추출 이벤트를 수락하세요."}
        </p>
      ) : null}
    </footer>
  );
}

function EmptyEventList() {
  return (
    <div className="review-events-empty">
      <h3>추출된 이벤트가 없습니다</h3>
      <p>이 가져오기에서는 타임라인 이벤트가 생성되지 않았습니다. ‘증거로 돌아가기’를 눌러 다른 소스를 가져오세요.</p>
    </div>
  );
}

function ReviewDraftMetaStrip({ meta }: { meta: ReviewDraftMeta }) {
  const cells: Array<{ tone: "green" | "orange" | "blue" | "gray"; label: string; value: number }> = [];
  if (typeof meta.newEventCount === "number") {
    cells.push({ tone: "green", label: "새 이벤트", value: meta.newEventCount });
  }
  if (typeof meta.currentSessionDuplicateCount === "number" && meta.currentSessionDuplicateCount > 0) {
    cells.push({
      tone: "orange",
      label: "현재 세션에 이미 있음",
      value: meta.currentSessionDuplicateCount,
    });
  }
  if (typeof meta.savedSessionDuplicateCount === "number" && meta.savedSessionDuplicateCount > 0) {
    cells.push({
      tone: "orange",
      label: "저장 세션에 이미 있음",
      value: meta.savedSessionDuplicateCount,
    });
  }
  if (typeof meta.inBatchDuplicateCount === "number" && meta.inBatchDuplicateCount > 0) {
    cells.push({
      tone: "orange",
      label: "이 파일에서 반복됨",
      value: meta.inBatchDuplicateCount,
    });
  }
  // Fallback to the legacy aggregated skip count when the cross-session
  // split was not provided (other import kinds, or older import paths).
  const splitProvided =
    (meta.currentSessionDuplicateCount ?? 0) +
      (meta.savedSessionDuplicateCount ?? 0) +
      (meta.inBatchDuplicateCount ?? 0) >
    0;
  if (!splitProvided && typeof meta.duplicateSkippedCount === "number" && meta.duplicateSkippedCount > 0) {
    cells.push({ tone: "orange", label: "건너뛴 중복", value: meta.duplicateSkippedCount });
  }
  if (typeof meta.duplicateIncludedCount === "number" && meta.duplicateIncludedCount > 0) {
    cells.push({ tone: "blue", label: "포함된 중복", value: meta.duplicateIncludedCount });
  }
  if (typeof meta.invalidLineCount === "number" && meta.invalidLineCount > 0) {
    cells.push({ tone: "gray", label: "잘못된 줄", value: meta.invalidLineCount });
  }
  const summary = meta.sourceImportSummary;
  if (cells.length === 0 && !summary) return null;
  return (
    <section className="review-meta-strip" role="status" aria-label="Import meta">
      {summary ? (
        <span
          className={`review-meta-source-status tone-${getConnectorSourceImportBadgeTone(summary)}`}
        >
          <Badge tone={getConnectorSourceImportBadgeTone(summary)}>
            {describeConnectorSourceImportBadge(summary)}
          </Badge>
          <small>{summary.detailMessage}</small>
        </span>
      ) : null}
      {cells.map((cell) => (
        <span key={cell.label} className={`review-meta-cell tone-${cell.tone}`}>
          <strong>{cell.value}</strong>
          <small>{cell.label}</small>
        </span>
      ))}
      {meta.includeDuplicates ? (
        <span className="review-meta-note">
          '중복 포함'이 활성화되어 있어, 이미 가져온 connector 이벤트도 Apply 시 Timeline에 추가됩니다.
        </span>
      ) : null}
      {meta.savedSessionHistoryAvailable === false ? (
        <span className="review-meta-note">
          저장 세션 기록을 이 모드에서는 사용할 수 없어, 현재 세션 + 이 파일 내부 중복만 검사했습니다.
        </span>
      ) : null}
    </section>
  );
}
