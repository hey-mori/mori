import { AlertCircle, ArrowRight, BookMarked, CheckCircle2, CircleDashed, FileText, Loader2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type {
  SessionWrapUpActionId,
  SessionWrapUpAttentionMemory,
  SessionWrapUpStepStatus,
  SessionWrapUpUnresolvedItem,
  SessionWrapUpViewModel,
} from "../../lib/report/sessionWrapUp";

export type SessionSummaryStripProps = {
  dataBasis: string;
  dataBasisTone: string;
  duration: string;
  sourceCount: number;
  eventCount: number;
  issueCount: number;
  decisionCount: number;
  nextActionCount: number;
  wrapUp?: SessionWrapUpViewModel;
  onWrapUpAction?: (actionId: SessionWrapUpActionId) => void;
  onOpenUnresolvedItem?: (item: SessionWrapUpUnresolvedItem) => void;
  /** Deep-link an attention-level accepted memory into its provenance drawer. */
  onOpenAttentionMemory?: (memoryId: string) => void;
};

export function SessionSummaryStrip({
  dataBasis,
  dataBasisTone,
  duration,
  sourceCount,
  eventCount,
  issueCount,
  decisionCount,
  nextActionCount,
  wrapUp,
  onWrapUpAction,
  onOpenUnresolvedItem,
  onOpenAttentionMemory,
}: SessionSummaryStripProps) {
  return (
    <section className="session-summary-strip" aria-label="Session summary">
      <header>
        <h2>세션 요약 (Session Summary)</h2>
        <Badge tone={dataBasisTone}>{dataBasis}</Badge>
      </header>
      <dl className="session-summary-metrics">
        <Metric label="기간" value={duration} />
        <Metric label="소스" value={String(sourceCount)} />
        <Metric label="이벤트" value={String(eventCount)} />
        <Metric label="이슈" value={String(issueCount)} />
        <Metric label="결정" value={String(decisionCount)} />
        <Metric label="다음 액션" value={String(nextActionCount)} />
      </dl>
      {wrapUp ? (
        <div className="session-wrap-up" aria-label="Continue-later checklist">
          <div className="session-wrap-up-main">
            <header>
              <h3>Continue later checklist</h3>
              <p>{wrapUp.primaryAction.detail}</p>
            </header>
            <ul className="session-wrap-up-steps">
              {wrapUp.steps.map((step) => (
                <li key={step.id} className={`status-${step.status}`}>
                  <span className="session-wrap-up-icon" aria-hidden="true">
                    <StatusIcon status={step.status} />
                  </span>
                  <span>
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                  </span>
                  <Badge tone={statusTone(step.status)}>{step.statusLabel}</Badge>
                </li>
              ))}
            </ul>
            <UnresolvedPreview
              unresolved={wrapUp.unresolved}
              onOpenItem={onOpenUnresolvedItem}
            />
            <AttentionMemoryPreview
              attentionMemories={wrapUp.attentionMemories}
              onOpenMemory={onOpenAttentionMemory}
            />
          </div>
          <div className="session-wrap-up-action">
            <Button
              icon={FileText}
              variant={wrapUp.primaryAction.enabled ? "primary" : "secondary"}
              disabled={!wrapUp.primaryAction.enabled}
              onClick={() => onWrapUpAction?.(wrapUp.primaryAction.id)}
            >
              {wrapUp.primaryAction.label}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function UnresolvedPreview({
  unresolved,
  onOpenItem,
}: {
  unresolved: SessionWrapUpViewModel["unresolved"];
  onOpenItem?: (item: SessionWrapUpUnresolvedItem) => void;
}) {
  if (unresolved.total === 0) {
    return (
      <div className="session-wrap-up-unresolved is-empty">
        <strong>No unresolved review items</strong>
        <span>Issues, decisions, and next actions are clear for this session.</span>
      </div>
    );
  }

  return (
    <div className="session-wrap-up-unresolved" aria-label="Unresolved work preview">
      <header>
        <strong>Needs attention before next session</strong>
        <Badge tone="orange">{unresolved.total} unresolved</Badge>
      </header>
      <ul>
        {unresolved.preview.map((item) => (
          <li key={`${item.kind}:${item.id}`}>
            <button type="button" onClick={() => onOpenItem?.(item)}>
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {unresolved.hiddenCount > 0 ? (
        <p>{unresolved.hiddenCount} more item{unresolved.hiddenCount === 1 ? "" : "s"} in Review.</p>
      ) : null}
    </div>
  );
}

function AttentionMemoryPreview({
  attentionMemories,
  onOpenMemory,
}: {
  attentionMemories: SessionWrapUpViewModel["attentionMemories"];
  onOpenMemory?: (memoryId: string) => void;
}) {
  if (attentionMemories.total === 0) return null;
  return (
    <div className="session-wrap-up-attention-memory" aria-label="Memory needs review">
      <header>
        <strong>
          <BookMarked size={13} aria-hidden="true" /> Memory needs lifecycle review
        </strong>
        <Badge tone="orange">{attentionMemories.total} accepted memor{attentionMemories.total === 1 ? "y" : "ies"}</Badge>
      </header>
      <ul>
        {attentionMemories.preview.map((memory) => (
          <li key={memory.id}>
            <button
              type="button"
              onClick={() => onOpenMemory?.(memory.id)}
              title={`${memory.title} — open provenance drawer`}
            >
              <span>
                <strong>{memory.title}</strong>
                <small>{describeAttentionMemoryStatus(memory)}</small>
              </span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {attentionMemories.hiddenCount > 0 ? (
        <p>
          {attentionMemories.hiddenCount} more memor
          {attentionMemories.hiddenCount === 1 ? "y" : "ies"} in Consolidation Review.
        </p>
      ) : null}
    </div>
  );
}

function describeAttentionMemoryStatus(memory: SessionWrapUpAttentionMemory): string {
  if (memory.status === "stale") {
    return "Stale — newer work may have superseded this memory.";
  }
  return "Contradicted — recent work disagrees with this memory.";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="session-summary-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StatusIcon({ status }: { status: SessionWrapUpStepStatus }) {
  if (status === "done") return <CheckCircle2 size={15} />;
  if (status === "ready") return <CircleDashed size={15} />;
  if (status === "waiting") return <Loader2 size={15} />;
  return <AlertCircle size={15} />;
}

function statusTone(status: SessionWrapUpStepStatus): string {
  switch (status) {
    case "done":
      return "green";
    case "ready":
      return "blue";
    case "waiting":
      return "gray";
    case "attention":
    default:
      return "orange";
  }
}
