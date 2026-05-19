import { AlertCircle, CheckCircle2, CircleDashed, FileText, Loader2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type {
  SessionWrapUpActionId,
  SessionWrapUpStepStatus,
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
