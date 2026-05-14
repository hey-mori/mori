import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { SectionHeader } from "../../components/ui/SectionHeader";
import type { Decision, Issue, NextAction } from "../../domain/types";
import {
  countIssuePriorities,
  type ReviewSummary,
} from "../../lib/review-workspace/reviewWorkspace";

export function ReviewSummaryPanel({
  summary,
  issues,
  decisions,
  nextActions,
  hasAnalysis,
  providerLabel,
  dataBasis,
}: {
  summary: ReviewSummary;
  issues: Issue[];
  decisions: Decision[];
  nextActions: NextAction[];
  hasAnalysis: boolean;
  providerLabel: string | null;
  dataBasis: string;
}) {
  const priorities = countIssuePriorities(issues);

  return (
    <aside className="review-summary" aria-label="Review summary">
      <header className="review-summary-head">
        <h3>Review Summary</h3>
        <p>이슈 / 결정 / 다음 액션 현황 + 우선순위 분포.</p>
      </header>

      <section className="review-summary-metrics">
        <SummaryMetric label="이슈" value={summary.issueCount} tone="purple" />
        <SummaryMetric label="결정" value={summary.decisionCount} tone="green" />
        <SummaryMetric label="다음 액션" value={summary.nextActionCount} tone="blue" />
      </section>

      <section className="review-summary-section">
        <SectionHeader title="이슈 상태" />
        <ul className="review-summary-stats">
          <li>
            <span>Open</span>
            <strong>{summary.unresolvedIssueCount}</strong>
          </li>
          <li>
            <span>In Progress</span>
            <strong>{summary.inProgressIssueCount}</strong>
          </li>
          <li>
            <span>Resolved</span>
            <strong>{summary.resolvedIssueCount}</strong>
          </li>
          <li>
            <span>Watching</span>
            <strong>{summary.watchingIssueCount}</strong>
          </li>
        </ul>
      </section>

      <section className="review-summary-section">
        <SectionHeader title="우선순위 분포" />
        <PriorityBar
          high={priorities.high}
          medium={priorities.medium}
          low={priorities.low}
          total={issues.length}
        />
        <ul className="review-summary-pri-legend">
          <li>
            <i className="legend-dot tone-red" /> High <strong>{priorities.high}</strong>
          </li>
          <li>
            <i className="legend-dot tone-orange" /> Medium <strong>{priorities.medium}</strong>
          </li>
          <li>
            <i className="legend-dot tone-blue" /> Low <strong>{priorities.low}</strong>
          </li>
        </ul>
      </section>

      <section className="review-summary-section">
        <SectionHeader title="검토 필요" />
        <ul className="review-summary-alerts">
          {summary.unresolvedIssueCount === 0 &&
          summary.unconfirmedDecisionCount === 0 &&
          summary.lowConfidenceCount === 0 ? (
            <li className="review-summary-alert-ok">
              <ShieldCheck size={14} aria-hidden="true" />
              <span>처리되지 않은 항목이 없습니다.</span>
            </li>
          ) : (
            <>
              {summary.unresolvedIssueCount > 0 ? (
                <li>
                  <AlertTriangle size={12} aria-hidden="true" />
                  <span>{summary.unresolvedIssueCount}건의 Open 이슈가 있습니다.</span>
                </li>
              ) : null}
              {summary.unconfirmedDecisionCount > 0 ? (
                <li>
                  <AlertTriangle size={12} aria-hidden="true" />
                  <span>{summary.unconfirmedDecisionCount}건의 결정이 아직 확정되지 않았습니다.</span>
                </li>
              ) : null}
              {summary.lowConfidenceCount > 0 ? (
                <li>
                  <AlertTriangle size={12} aria-hidden="true" />
                  <span>{summary.lowConfidenceCount}건의 추론된 항목이 낮은 신뢰도입니다.</span>
                </li>
              ) : null}
            </>
          )}
        </ul>
      </section>

      <section className="review-summary-section">
        <SectionHeader title="다음 액션 미리보기" hint={`${nextActions.length}건`} />
        {nextActions.length === 0 ? (
          <p className="review-summary-empty">아직 다음 액션이 생성되지 않았습니다.</p>
        ) : (
          <ul className="review-summary-actions">
            {nextActions.slice(0, 3).map((action) => (
              <li key={action.id}>
                <Badge tone="purple">{action.priority}</Badge>
                <span title={action.title}>{action.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="review-summary-section">
        <SectionHeader title="데이터 출처" />
        <p className="review-summary-basis">{dataBasis}</p>
        <p className="review-summary-basis muted">
          {hasAnalysis
            ? `${providerLabel ?? "deterministic"} 결과를 표시합니다.`
            : "데모 모드에서는 mock 데이터, draft 모드에서는 Quick Pass 실행 결과가 표시됩니다."}
        </p>
      </section>
    </aside>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "purple" | "green" | "blue";
}) {
  return (
    <div className={`review-summary-metric tone-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PriorityBar({
  high,
  medium,
  low,
  total,
}: {
  high: number;
  medium: number;
  low: number;
  total: number;
}) {
  const safeTotal = total > 0 ? total : 1;
  const highPct = (high / safeTotal) * 100;
  const mediumPct = (medium / safeTotal) * 100;
  const lowPct = (low / safeTotal) * 100;

  return (
    <div className="review-summary-bar" role="img" aria-label="우선순위 분포">
      <span className="seg seg-high" style={{ width: `${highPct}%` }} />
      <span className="seg seg-medium" style={{ width: `${mediumPct}%` }} />
      <span className="seg seg-low" style={{ width: `${lowPct}%` }} />
    </div>
  );
}
