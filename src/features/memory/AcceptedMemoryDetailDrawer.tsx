import { useMemo, useState } from "react";
import { ArrowRight, Clock4, ExternalLink, FileText, ShieldCheck, Undo2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
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
  describeProposalKind,
  proposalKindTone,
} from "../../lib/project-memory/projectMemoryConsolidationState";
import {
  getProductMemoryStatusLabel,
  getProductMemoryStatusTone,
} from "../../lib/product-state/productState";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../../lib/storage/storageTypes";

/**
 * Per-memory provenance drawer rendered inside `MoriDrawer` on the
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
  onRevertAction,
  onClose,
}: {
  memory: StoredAcceptedProjectMemory;
  actions: StoredMemoryReviewAction[];
  onRevertAction: (action: StoredMemoryReviewAction) => Promise<void>;
  onClose: () => void;
}) {
  const provenance = useMemo(() => buildMemoryProvenance(memory, actions), [memory, actions]);
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
      setRevertError(err instanceof Error ? err.message : "Revert failed.");
      setRevertPhase("idle");
    }
  }

  return (
    <article className="accepted-memory-detail" aria-labelledby="accepted-memory-detail-title">
      <header className="accepted-memory-detail-head">
        <div className="accepted-memory-detail-titles">
          <p className="accepted-memory-detail-eyebrow">Accepted Project Memory</p>
          <h2 id="accepted-memory-detail-title">{memory.title}</h2>
          {memory.summary ? (
            <p className="accepted-memory-detail-summary">{memory.summary}</p>
          ) : null}
        </div>
        <Button onClick={onClose} aria-label="Close memory detail">
          닫기
        </Button>
      </header>

      <section className="accepted-memory-detail-state" aria-label="Lifecycle state">
        <div className="accepted-memory-detail-badges">
          <MoriStatusBadge tone={memoryLifecycleGroupTone(provenance.lifecycleGroup)}>
            {describeMemoryLifecycleGroup(provenance.lifecycleGroup)}
          </MoriStatusBadge>
          <MoriStatusBadge tone={getProductMemoryStatusTone(memory.status)}>
            {getProductMemoryStatusLabel(memory.status)}
          </MoriStatusBadge>
          <MoriStatusBadge tone={proposalKindTone(memory.kind)}>
            {describeProposalKind(memory.kind)}
          </MoriStatusBadge>
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

      <dl className="accepted-memory-detail-grid" aria-label="Provenance counts">
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

      <section className="accepted-memory-detail-meta" aria-label="Eligibility and importance">
        <div>
          <ShieldCheck size={12} aria-hidden="true" />
          <span>
            Resume Prompt 포함{" "}
            <MoriStatusBadge tone={provenance.resumeEligible ? "success" : "neutral"}>
              {provenance.resumeEligible ? "포함" : "제외"}
            </MoriStatusBadge>
          </span>
        </div>
        <div>
          <span>중요도</span>
          <MoriStatusBadge
            tone={
              memory.importance === "high"
                ? "danger"
                : memory.importance === "medium"
                  ? "info"
                  : "neutral"
            }
          >
            {memory.importance}
          </MoriStatusBadge>
        </div>
        <div>
          <span>신뢰도</span>
          <MoriStatusBadge
            tone={
              memory.confidence.label === "high"
                ? "success"
                : memory.confidence.label === "medium"
                  ? "info"
                  : "warning"
            }
          >
            {memory.confidence.label}
          </MoriStatusBadge>
        </div>
        <div>
          <FileText size={12} aria-hidden="true" />
          <span>승인 시각 {formatShort(memory.acceptedAt)}</span>
        </div>
      </section>

      {memory.reviewNote ? (
        <section className="accepted-memory-detail-note" aria-label="Reviewer note">
          <p className="accepted-memory-detail-note-label">리뷰어 메모</p>
          <p>{memory.reviewNote}</p>
        </section>
      ) : null}

      <section className="accepted-memory-detail-audit" aria-label="Audit history">
        <header>
          <h3>
            <Clock4 size={12} aria-hidden="true" /> 이 메모리의 변경 기록
          </h3>
          <MoriStatusBadge tone="neutral">{provenance.auditEntries.length}건</MoriStatusBadge>
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
                  <MoriStatusBadge tone="neutral">
                    {describeMemoryAuditAction(entry.action.actionType)}
                  </MoriStatusBadge>
                  <span>{formatShort(entry.action.timestamp)} UTC</span>
                  {entry.revertible ? (
                    <MoriStatusBadge tone="info">되돌릴 수 있음</MoriStatusBadge>
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

      <section className="accepted-memory-detail-actions" aria-label="Safe actions">
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
