import { Badge } from "../../components/ui/Badge";

export type SessionSummaryStripProps = {
  dataBasis: string;
  dataBasisTone: string;
  duration: string;
  sourceCount: number;
  eventCount: number;
  issueCount: number;
  decisionCount: number;
  nextActionCount: number;
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
}: SessionSummaryStripProps) {
  return (
    <section className="session-summary-strip" aria-label="Session summary">
      <header>
        <h2>Session Summary</h2>
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
