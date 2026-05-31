import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  Clock4,
  ExternalLink,
  FileText,
  GanttChartSquare,
  GitBranch,
  ShieldCheck,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { BaseStatusBadge } from "../../components/ui/BaseStatusBadge";
import { formatDateTime } from "../../lib/formatting/time";
import { describeMemoryAuditAction } from "../../lib/project-memory/memoryAuditTrail";
import {
  describeMemoryLifecycleGroup,
  memoryLifecycleGroupTone,
} from "../../lib/project-memory/memoryLifecycle";
import {
  buildMemoryProvenance,
  describeMemoryLifecycleMeaning,
} from "../../lib/project-memory/memoryProvenance";
import {
  buildAcceptedMemoryLinkTargets,
  countUnlinkableEvidenceRefs,
  type AcceptedMemoryLinkTarget,
  type AcceptedMemoryLinkViewSlice,
} from "../../lib/project-memory/acceptedMemoryLinks";
import {
  describeProposalKind,
  proposalKindTone,
} from "../../lib/project-memory/projectMemoryConsolidationState";
import {
  getProductMemoryStatusLabel,
  getProductMemoryStatusTone,
} from "../../lib/product-state/productState";
import type { ReviewSelection } from "../../lib/review-workspace/reviewWorkspace";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../../lib/storage/storageTypes";

/**
 * Per-memory provenance drawer rendered inside `BaseDrawer` on the
 * Project Memory page. Surfaces the structural answers to the user's
 * "why does this memory exist / what changed / can I undo this" questions
 * and exposes a confirm-gated revert for the most recent eligible change.
 *
 * The drawer is read-only except for the single Undo affordance. Any
 * other lifecycle transition (retire, supersede) still goes through the
 * Consolidation Review surface, which is the canonical write path.
 */
export function AcceptedMemoryDetailDrawer({
  memory,
  actions,
  view,
  onRevertAction,
  onNavigateTimelineEvent,
  onNavigateReviewItem,
  onClose,
}: {
  memory: StoredAcceptedProjectMemory;
  actions: StoredMemoryReviewAction[];
  view: AcceptedMemoryLinkViewSlice;
  onRevertAction: (action: StoredMemoryReviewAction) => Promise<void>;
  onNavigateTimelineEvent: (eventId: string) => void;
  onNavigateReviewItem: (selection: ReviewSelection) => void;
  onClose: () => void;
}) {
  const provenance = useMemo(() => buildMemoryProvenance(memory, actions), [memory, actions]);
  const links = useMemo(() => buildAcceptedMemoryLinkTargets(memory, view), [memory, view]);
  const unlinkableEvidenceCount = useMemo(
    () => countUnlinkableEvidenceRefs(memory),
    [memory],
  );
  const hasAnyLinks =
    links.timelineEvents.length +
      links.reviewIssues.length +
      links.reviewDecisions.length >
    0;
  const [revertPhase, setRevertPhase] = useState<"idle" | "confirming" | "reverting">("idle");
  const [revertError, setRevertError] = useState<string | null>(null);

  async function confirmRevert() {
    if (!provenance.lastRevertibleAction) return;
    setRevertPhase("reverting");
    setRevertError(null);
    try {
      await onRevertAction(provenance.lastRevertibleAction);
      // The parent reloads memory; this drawer's selection clears when
      // the memory id no longer exists, so an explicit close keeps the
      // flow predictable even when the memory still exists post-revert.
      setRevertPhase("idle");
      onClose();
    } catch (err) {
      setRevertError(err instanceof Error ? err.message : "되돌리기 실패.");
      setRevertPhase("idle");
    }
  }

  return (
    <article className="accepted-memory-detail" aria-labelledby="accepted-memory-detail-title">
      <header className="accepted-memory-detail-head">
        <div className="accepted-memory-detail-titles">
          <p className="accepted-memory-detail-eyebrow">수락된 프로젝트 메모리</p>
          <h2 id="accepted-memory-detail-title">{memory.title}</h2>
          {memory.summary ? (
            <p className="accepted-memory-detail-summary">{memory.summary}</p>
          ) : null}
        </div>
        <Button onClick={onClose} aria-label="메모리 상세 닫기">
          닫기
        </Button>
      </header>

      <section className="accepted-memory-detail-state" aria-label="생명주기 상태">
        <div className="accepted-memory-detail-badges">
          <BaseStatusBadge tone={memoryLifecycleGroupTone(provenance.lifecycleGroup)}>
            {describeMemoryLifecycleGroup(provenance.lifecycleGroup)}
          </BaseStatusBadge>
          <BaseStatusBadge tone={getProductMemoryStatusTone(memory.status)}>
            {getProductMemoryStatusLabel(memory.status)}
          </BaseStatusBadge>
          <BaseStatusBadge tone={proposalKindTone(memory.kind)}>
            {describeProposalKind(memory.kind)}
          </BaseStatusBadge>
        </div>
        <p className="accepted-memory-detail-meaning">
          {describeMemoryLifecycleMeaning(provenance.lifecycleGroup)}
        </p>
        {provenance.supersededBy ? (
          <p className="accepted-memory-detail-supersede">
            <ExternalLink size={12} aria-hidden="true" /> 더 새로운 메모리로 대체됨 ·{" "}
            <code>{provenance.supersededBy}</code>
          </p>
        ) : null}
      </section>

      <dl className="accepted-memory-detail-grid" aria-label="출처 통계">
        <ProvenanceStat label="근거" value={provenance.evidenceCount} hint="evidenceRefs" />
        <ProvenanceStat label="세션" value={provenance.sessionCount} hint="sourceSessionIds" />
        <ProvenanceStat
          label="관련 이슈"
          value={provenance.relatedIssueCount}
          hint="relatedIssueIds"
        />
        <ProvenanceStat
          label="관련 결정"
          value={provenance.relatedDecisionCount}
          hint="relatedDecisionIds"
        />
      </dl>

      <section className="accepted-memory-detail-meta" aria-label="공개 범위 및 중요도">
        <div>
          <ShieldCheck size={12} aria-hidden="true" />
          <span>
            이어가기 프롬프트{" "}
            <BaseStatusBadge tone={provenance.resumeEligible ? "success" : "neutral"}>
              {provenance.resumeEligible ? "포함" : "제외"}
            </BaseStatusBadge>
          </span>
        </div>
        <div>
          <span>중요도</span>
          <BaseStatusBadge
            tone={
              memory.importance === "high"
                ? "danger"
                : memory.importance === "medium"
                  ? "info"
                  : "neutral"
            }
          >
            {memory.importance}
          </BaseStatusBadge>
        </div>
        <div>
          <span>신뢰도</span>
          <BaseStatusBadge
            tone={
              memory.confidence.label === "high"
                ? "success"
                : memory.confidence.label === "medium"
                  ? "info"
                  : "warning"
            }
          >
            {memory.confidence.label}
          </BaseStatusBadge>
        </div>
        <div>
          <FileText size={12} aria-hidden="true" />
          <span>승인 시각 {formatShort(memory.acceptedAt)}</span>
        </div>
      </section>

      {memory.reviewNote ? (
        <section className="accepted-memory-detail-note" aria-label="리뷰어 메모">
          <p className="accepted-memory-detail-note-label">리뷰어 메모</p>
          <p>{memory.reviewNote}</p>
        </section>
      ) : null}

      {hasAnyLinks || unlinkableEvidenceCount > 0 ? (
        <section className="accepted-memory-detail-links" aria-label="연결된 항목">
          <header>
            <h3>연결된 항목</h3>
            <p>이 메모리가 가리키는 활성 세션의 항목입니다. 클릭하면 해당 화면으로 이동합니다.</p>
          </header>

          {links.timelineEvents.length > 0 ? (
            <LinkGroup
              icon={<GanttChartSquare size={12} aria-hidden="true" />}
              label={`타임라인 이벤트 ${links.timelineEvents.length}건`}
            >
              {links.timelineEvents.map((target) => (
                <LinkButton
                  key={(target.kind === "timelineEvent" ? target.eventId : "")}
                  title={target.title}
                  hint={target.kind === "timelineEvent" ? formatShort(target.start) : ""}
                  onClick={() => {
                    if (target.kind !== "timelineEvent") return;
                    onNavigateTimelineEvent(target.eventId);
                  }}
                />
              ))}
            </LinkGroup>
          ) : null}

          {links.reviewIssues.length > 0 ? (
            <LinkGroup
              icon={<TriangleAlert size={12} aria-hidden="true" />}
              label={`관련 이슈 ${links.reviewIssues.length}건`}
            >
              {links.reviewIssues.map((target) => (
                <LinkButton
                  key={selectionKey(target)}
                  title={target.title}
                  hint="검토 · 이슈"
                  onClick={() => {
                    if (target.kind !== "review") return;
                    onNavigateReviewItem(target.selection);
                  }}
                />
              ))}
            </LinkGroup>
          ) : null}

          {links.reviewDecisions.length > 0 ? (
            <LinkGroup
              icon={<GitBranch size={12} aria-hidden="true" />}
              label={`관련 결정 ${links.reviewDecisions.length}건`}
            >
              {links.reviewDecisions.map((target) => (
                <LinkButton
                  key={selectionKey(target)}
                  title={target.title}
                  hint="검토 · 결정"
                  onClick={() => {
                    if (target.kind !== "review") return;
                    onNavigateReviewItem(target.selection);
                  }}
                />
              ))}
            </LinkGroup>
          ) : null}

          {unlinkableEvidenceCount > 0 ? (
            <p className="accepted-memory-detail-links-note">
              <ClipboardCheck size={11} aria-hidden="true" /> {unlinkableEvidenceCount}건의 근거는
              세션·소스 단위라 여기서 바로 열 수 없습니다 — Evidence 페이지에서 확인하세요.
            </p>
          ) : null}

          {!hasAnyLinks ? (
            <p className="accepted-memory-detail-links-empty">
              활성 세션에서 직접 열 수 있는 연결된 항목이 없습니다. 다른 세션에서 만들어진 메모리일
              수 있습니다.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="accepted-memory-detail-audit" aria-label="변경 기록">
        <header>
          <h3>
            <Clock4 size={12} aria-hidden="true" /> 이 메모리의 변경 기록
          </h3>
          <BaseStatusBadge tone="neutral">{provenance.auditEntries.length}건</BaseStatusBadge>
        </header>
        {provenance.auditEntries.length === 0 ? (
          <p className="accepted-memory-detail-audit-empty">
            이 메모리에 대한 audit 기록이 아직 없습니다. apply 이후 변경되지 않았거나 본 audit
            저장소에 기록되지 않았습니다.
          </p>
        ) : (
          <ul className="accepted-memory-detail-audit-list">
            {provenance.auditEntries.slice(0, 8).map((entry) => (
              <li key={entry.action.id}>
                <header>
                  <BaseStatusBadge tone="neutral">
                    {describeMemoryAuditAction(entry.action.actionType)}
                  </BaseStatusBadge>
                  <span>{formatShort(entry.action.timestamp)} UTC</span>
                  {entry.revertible ? (
                    <BaseStatusBadge tone="info">되돌릴 수 있음</BaseStatusBadge>
                  ) : null}
                </header>
                {entry.action.note ? (
                  <p className="accepted-memory-detail-audit-note">{entry.action.note}</p>
                ) : null}
                {!entry.revertible && entry.ineligibleReason ? (
                  <p className="accepted-memory-detail-audit-reason">{entry.ineligibleReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="accepted-memory-detail-actions" aria-label="안전한 조치">
        {provenance.lastRevertibleAction ? (
          <RevertPanel
            phase={revertPhase}
            error={revertError}
            actionLabel={describeMemoryAuditAction(
              provenance.lastRevertibleAction.actionType,
            )}
            actionTime={provenance.lastRevertibleAction.timestamp}
            onArm={() => {
              setRevertError(null);
              setRevertPhase("confirming");
            }}
            onCancel={() => setRevertPhase("idle")}
            onConfirm={() => void confirmRevert()}
          />
        ) : (
          <p className="accepted-memory-detail-no-revert">
            <Undo2 size={12} aria-hidden="true" /> 되돌릴 수 있는 최근 변경이 없습니다. retire 또는
            supersede는 Consolidation Review에서 진행합니다.
          </p>
        )}
      </section>
    </article>
  );
}

function LinkGroup({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="accepted-memory-detail-links-group">
      <p className="accepted-memory-detail-links-group-label">
        {icon} {label}
      </p>
      <ul className="accepted-memory-detail-links-list">{children}</ul>
    </div>
  );
}

function LinkButton({
  title,
  hint,
  onClick,
}: {
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="accepted-memory-detail-link"
        onClick={onClick}
      >
        <span className="accepted-memory-detail-link-title">{title}</span>
        {hint ? <span className="accepted-memory-detail-link-hint">{hint}</span> : null}
        <ExternalLink
          size={12}
          aria-hidden="true"
          className="accepted-memory-detail-link-chevron"
        />
      </button>
    </li>
  );
}

function selectionKey(target: AcceptedMemoryLinkTarget): string {
  if (target.kind !== "review") return target.kind;
  const sel = target.selection;
  switch (sel.kind) {
    case "issue":
      return `issue::${sel.issueId}`;
    case "decision":
      return `decision::${sel.decisionId}`;
    case "nextAction":
      return `nextAction::${sel.nextActionId}`;
    default:
      return "none";
  }
}

function ProvenanceStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="accepted-memory-detail-stat">
      <dt>
        {label}
        <small>{hint}</small>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function RevertPanel({
  phase,
  error,
  actionLabel,
  actionTime,
  onArm,
  onCancel,
  onConfirm,
}: {
  phase: "idle" | "confirming" | "reverting";
  error: string | null;
  actionLabel: string;
  actionTime: string;
  onArm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="accepted-memory-detail-revert">
      <div className="accepted-memory-detail-revert-head">
        <strong>마지막 변경 되돌리기</strong>
        <span>
          <ArrowRight size={11} aria-hidden="true" /> {actionLabel} · {formatShort(actionTime)} UTC
        </span>
      </div>
      <p>
        이 작업의 before snapshot으로 메모리 상태를 복원합니다. 복원도 audit 기록으로 남으며,
        다른 변경에는 영향을 주지 않습니다.
      </p>
      {phase === "confirming" ? (
        <div className="accepted-memory-detail-revert-actions">
          <Button variant="primary" icon={Undo2} onClick={onConfirm}>
            되돌리기 확인
          </Button>
          <Button onClick={onCancel}>취소</Button>
        </div>
      ) : (
        <Button
          icon={Undo2}
          onClick={onArm}
          disabled={phase === "reverting"}
        >
          {phase === "reverting" ? "되돌리는 중…" : "되돌리기"}
        </Button>
      )}
      {error ? <p className="accepted-memory-detail-revert-error">{error}</p> : null}
    </div>
  );
}

function formatShort(iso: string): string {
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}
