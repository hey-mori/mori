import { ArrowLeft, CheckCheck, ListChecks, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useMoriSessionStore } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { useMoriReviewStore, type ReviewDraftMeta } from "../../app/reviewStore";
import {
  getReviewCounts,
  isReviewApplyable,
  type ImportReviewDraft,
  type ReviewOrigin,
} from "../../lib/review";
import { SourceSummaryCard } from "./SourceSummaryCard";
import { ExtractedEventCard } from "./ExtractedEventCard";
import { GeneratedItemsPanel } from "./GeneratedItemsPanel";

const ORIGIN_LABEL: Record<ReviewOrigin, string> = {
  "ai-transcript": "AI Transcript",
  "git-diff": "Git Diff",
  "manual-note": "Manual Note",
  url: "URL",
  "connector-jsonl": "Connector JSONL",
  other: "Source",
};

export function ImportReviewView() {
  const draft = useMoriReviewStore((state) => state.draft);
  const draftMeta = useMoriReviewStore((state) => state.draftMeta);
  const setItemStatus = useMoriReviewStore((state) => state.setItemStatus);
  const setAllStatus = useMoriReviewStore((state) => state.setAllStatus);
  const editEvent = useMoriReviewStore((state) => state.editEvent);
  const apply = useMoriReviewStore((state) => state.apply);
  const cancel = useMoriReviewStore((state) => state.cancel);
  const addImport = useMoriSessionStore((state) => state.addImport);
  const setSelectedEventId = useMoriAppStore((state) => state.setSelectedEventId);

  const [statusBanner, setStatusBanner] = useState<{
    tone: "ok" | "error" | "info";
    message: string;
  } | null>(null);

  if (!draft) {
    // EvidenceView guards this, but keep a sane fallback for safety.
    return null;
  }

  const counts = getReviewCounts(draft);
  const applyable = isReviewApplyable(draft);

  function handleApply() {
    setStatusBanner(null);
    const outcome = apply((candidate) => {
      const stored = addImport(candidate);
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
    setStatusBanner({
      tone: "ok",
      message: `${outcome.appliedCount}개의 이벤트를 세션에 적용했습니다.`,
    });
  }

  return (
    <div className="page review-page">
      <header className="review-header">
        <Button icon={ArrowLeft} onClick={cancel}>
          Evidence로 돌아가기
        </Button>
        <div className="review-header-title">
          <h1>Import Review</h1>
          <p>
            가져온 자료에서 Mori가 추출한 항목을 확인하고 Apply 전에 Accept / Discard를 결정하세요.
            적용 전까지 세션 메모리에는 추가되지 않습니다.
          </p>
        </div>
        <div className="review-header-meta">
          <Badge tone="purple">{ORIGIN_LABEL[draft.origin] ?? draft.origin}</Badge>
          <Badge tone="gray">{draft.id}</Badge>
        </div>
      </header>

      {draftMeta ? <ReviewDraftMetaStrip meta={draftMeta} /> : null}

      {statusBanner ? (
        <div className={`review-status tone-${statusBanner.tone}`}>{statusBanner.message}</div>
      ) : null}

      <div className="review-layout">
        <SourceSummaryCard source={draft.source} />

        <section className="review-events" aria-label="Extracted timeline events">
          <header className="review-events-head">
            <div>
              <h2>추출된 Timeline 이벤트</h2>
              <p>각 항목은 Apply 시점에 세션 타임라인에 추가됩니다. Discard한 항목은 제외됩니다.</p>
            </div>
            <div className="review-events-actions">
              <Button
                icon={CheckCheck}
                onClick={() => setAllStatus("accepted")}
                disabled={draft.events.length === 0 || draft.events.every((item) => item.status === "accepted")}
              >
                전부 Accept
              </Button>
              <Button
                icon={Trash2}
                onClick={() => setAllStatus("discarded")}
                disabled={draft.events.length === 0 || draft.events.every((item) => item.status === "discarded")}
              >
                전부 Discard
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
        onCancel={cancel}
      />
    </div>
  );
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
          <strong>{counts.accepted}</strong> accepted · <strong>{counts.discarded}</strong> discarded ·
          <strong> {counts.pending}</strong> pending
        </span>
      </div>
      <div className="review-footer-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          icon={CheckCheck}
          onClick={onApply}
          disabled={!applyable}
          title={
            applyable
              ? `${counts.accepted}개의 이벤트를 세션에 적용`
              : "최소 1개 이상의 이벤트를 Accept해야 적용할 수 있습니다."
          }
        >
          Apply to Timeline ({counts.accepted})
        </Button>
      </div>
      {!applyable ? (
        <p className="review-footer-hint">
          {draft.origin === "ai-transcript"
            ? "AI Transcript는 1개의 요약 이벤트를 생성합니다. Accept를 누른 뒤 Apply 하세요."
            : "Apply 하려면 적어도 1개의 추출 이벤트를 Accept하세요."}
        </p>
      ) : null}
    </footer>
  );
}

function EmptyEventList() {
  return (
    <div className="review-events-empty">
      <h3>추출된 이벤트가 없습니다</h3>
      <p>이 가져오기에서는 Timeline 이벤트 후보가 생성되지 않았습니다. Cancel을 눌러 Evidence Hub로 돌아가거나 다른 소스를 가져오세요.</p>
    </div>
  );
}

function ReviewDraftMetaStrip({ meta }: { meta: ReviewDraftMeta }) {
  const cells: Array<{ tone: "green" | "orange" | "blue" | "gray"; label: string; value: number }> = [];
  if (typeof meta.newEventCount === "number") {
    cells.push({ tone: "green", label: "New events", value: meta.newEventCount });
  }
  if (typeof meta.currentSessionDuplicateCount === "number" && meta.currentSessionDuplicateCount > 0) {
    cells.push({
      tone: "orange",
      label: "Already in current session",
      value: meta.currentSessionDuplicateCount,
    });
  }
  if (typeof meta.savedSessionDuplicateCount === "number" && meta.savedSessionDuplicateCount > 0) {
    cells.push({
      tone: "orange",
      label: "Already in saved sessions",
      value: meta.savedSessionDuplicateCount,
    });
  }
  if (typeof meta.inBatchDuplicateCount === "number" && meta.inBatchDuplicateCount > 0) {
    cells.push({
      tone: "orange",
      label: "Repeated in this file",
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
    cells.push({ tone: "orange", label: "Skipped duplicates", value: meta.duplicateSkippedCount });
  }
  if (typeof meta.duplicateIncludedCount === "number" && meta.duplicateIncludedCount > 0) {
    cells.push({ tone: "blue", label: "Included duplicates", value: meta.duplicateIncludedCount });
  }
  if (typeof meta.invalidLineCount === "number" && meta.invalidLineCount > 0) {
    cells.push({ tone: "gray", label: "Invalid lines", value: meta.invalidLineCount });
  }
  if (cells.length === 0) return null;
  return (
    <section className="review-meta-strip" role="status" aria-label="Import meta">
      {cells.map((cell) => (
        <span key={cell.label} className={`review-meta-cell tone-${cell.tone}`}>
          <strong>{cell.value}</strong>
          <small>{cell.label}</small>
        </span>
      ))}
      {meta.includeDuplicates ? (
        <span className="review-meta-note">
          Include duplicates 가 활성화되어 있어, 이미 가져온 connector 이벤트도 Apply 시 Timeline에 추가됩니다.
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
