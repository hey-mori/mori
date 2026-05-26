import { ArchiveX, Check, Clock, Eye, Pencil, RotateCcw } from "lucide-react";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { Button } from "../../components/ui/Button";
import type { ProductStateTone } from "../../lib/product-state/productState";
import type { MemoryProposal } from "../../lib/project-memory/consolidationProposals";
import {
  effectiveSummary,
  effectiveTitle,
  type ConsolidationReviewEntry,
  type ConsolidationReviewStatus,
} from "../../lib/project-memory/consolidationReviewState";

/**
 * One proposal card in the Consolidation Review Surface.
 *
 * Renders the proposal's current effective title / summary, the
 * rationale, confidence + importance + action chips, and the per-
 * proposal review actions (Accept / Discard / Keep watching / Defer
 * / Reset). Edit is wired via `onEdit` which the parent surface
 * handles in an inline editor.
 *
 * No raw connector content or transcript text ever flows through
 * here — the proposal's `summary` is already a curated string from
 * the helper.
 */
export function ConsolidationProposalCard({
  entry,
  isSelected,
  onSelect,
  onAccept,
  onDiscard,
  onKeepWatching,
  onDefer,
  onReset,
  onEdit,
}: {
  entry: ConsolidationReviewEntry;
  isSelected: boolean;
  onSelect: () => void;
  onAccept: () => void;
  onDiscard: () => void;
  onKeepWatching: () => void;
  onDefer: () => void;
  onReset: () => void;
  onEdit: () => void;
}) {
  const title = effectiveTitle(entry);
  const summary = effectiveSummary(entry);
  const status = entry.status;
  return (
    <article
      className={`consolidation-card status-${status} ${isSelected ? "is-selected" : ""}`}
      aria-current={isSelected ? "true" : undefined}
    >
      <button type="button" className="consolidation-card-body" onClick={onSelect}>
        <header>
          <strong title={title}>{title}</strong>
          <ConsolidationStatusBadge status={status} />
        </header>
        <p className="consolidation-card-summary">{summary}</p>
        {entry.proposal.rationale ? (
          <small className="consolidation-card-rationale">{entry.proposal.rationale}</small>
        ) : null}
        <dl className="consolidation-card-meta">
          <span>
            <dt>중요도</dt>
            <dd>
              <ImportanceBadge importance={entry.proposal.importance} />
            </dd>
          </span>
          <span>
            <dt>신뢰도</dt>
            <dd>{describeConfidence(entry.proposal.confidence)}</dd>
          </span>
          <span>
            <dt>제안 액션</dt>
            <dd>{describeProposedAction(entry.proposal.proposedAction)}</dd>
          </span>
          <span>
            <dt>출처</dt>
            <dd>{entry.proposal.sourceSessionIds.length}개 세션 · {entry.proposal.evidenceRefs.length}개 참조</dd>
          </span>
        </dl>
        {entry.edits.title !== null || entry.edits.summary !== null ? (
          <small className="consolidation-card-edited">사용자 편집 반영됨</small>
        ) : null}
        {entry.note ? <small className="consolidation-card-note">메모: {entry.note}</small> : null}
      </button>
      <footer className="consolidation-card-actions">
        <Button
          icon={Check}
          onClick={(event) => {
            event.stopPropagation();
            onAccept();
          }}
          variant={status === "accepted" ? "primary" : undefined}
          title="이 제안을 수락 예정으로 표시합니다. 메모리 적용을 누르기 전까지는 저장되지 않습니다."
        >
          수락
        </Button>
        <Button
          icon={Pencil}
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          title="제목과 요약을 인라인으로 수정합니다."
        >
          편집
        </Button>
        <Button
          icon={Eye}
          onClick={(event) => {
            event.stopPropagation();
            onKeepWatching();
          }}
          title="중요하지만 지금은 확정하지 않습니다 — 다음 검토 때 다시 확인합니다."
        >
          관찰
        </Button>
        <Button
          icon={Clock}
          onClick={(event) => {
            event.stopPropagation();
            onDefer();
          }}
          title="다음 검토까지 미룹니다."
        >
          연기
        </Button>
        <Button
          icon={ArchiveX}
          onClick={(event) => {
            event.stopPropagation();
            onDiscard();
          }}
          title="이 제안을 폐기합니다 — 동일한 증거 변경이 없으면 다시 제안되지 않습니다."
        >
          폐기
        </Button>
        {status !== "proposed" ? (
          <Button
            icon={RotateCcw}
            onClick={(event) => {
              event.stopPropagation();
              onReset();
            }}
            title="현재 검토 결정을 초기화합니다."
          >
            되돌리기
          </Button>
        ) : null}
      </footer>
    </article>
  );
}

function ConsolidationStatusBadge({ status }: { status: ConsolidationReviewStatus }) {
  return (
    <MoriStatusBadge tone={reviewStatusTone(status)}>
      {describeReviewStatus(status)}
    </MoriStatusBadge>
  );
}

/**
 * Tone for a pending review decision, drawn from the shared product-state
 * vocabulary. The decision is still local draft state until the user clicks
 * Apply; each status keeps a distinct tone so the apply boundary is clear.
 */
function reviewStatusTone(status: ConsolidationReviewStatus): ProductStateTone {
  switch (status) {
    case "accepted":
      return "success";
    case "edited":
      return "info";
    case "watching":
      return "accent";
    case "deferred":
      return "warning";
    case "discarded":
      return "danger";
    case "proposed":
    default:
      return "neutral";
  }
}

export function describeReviewStatus(status: ConsolidationReviewStatus): string {
  switch (status) {
    case "proposed":
      return "검토 대기";
    case "accepted":
      return "수락 예정";
    case "edited":
      return "편집 예정";
    case "watching":
      return "관찰";
    case "deferred":
      return "연기";
    case "discarded":
      return "폐기";
    default:
      return status;
  }
}

const IMPORTANCE_LABELS: Record<MemoryProposal["importance"], string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

function ImportanceBadge({ importance }: { importance: MemoryProposal["importance"] }) {
  const tone: ProductStateTone =
    importance === "high" ? "danger" : importance === "medium" ? "warning" : "info";
  return <MoriStatusBadge tone={tone}>{IMPORTANCE_LABELS[importance] ?? importance}</MoriStatusBadge>;
}

function describeConfidence(confidence: number): string {
  if (confidence >= 0.75) return `높음 (${Math.round(confidence * 100)}%)`;
  if (confidence >= 0.5) return `보통 (${Math.round(confidence * 100)}%)`;
  return `낮음 (${Math.round(confidence * 100)}%)`;
}

function describeProposedAction(action: MemoryProposal["proposedAction"]): string {
  switch (action) {
    case "promote":
      return "승급";
    case "merge":
      return "병합";
    case "markStale":
      return "오래됨으로 표시";
    case "keepWatching":
      return "계속 관찰";
    case "resolve":
      return "해결";
    case "scheduleNextSession":
      return "다음 세션 예약";
    default:
      return action;
  }
}
