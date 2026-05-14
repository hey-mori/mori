import { Badge } from "../../components/ui/Badge";
import { issueStatusLabels, priorityLabels } from "../../domain/constants";
import {
  issueStatusTone,
  type RecurringIssueRow,
} from "../../lib/project-memory/projectMemory";

const PRIORITY_TONE: Record<string, "red" | "orange" | "blue"> = {
  high: "red",
  medium: "orange",
  low: "blue",
};

export function RecurringIssuesCard({
  rows,
  scopeNote,
}: {
  rows: RecurringIssueRow[];
  scopeNote: string;
}) {
  return (
    <section className="memory-recurring" aria-label="Recurring issues">
      <header className="memory-section-head">
        <div>
          <h3>반복 이슈 Top {rows.length}</h3>
          <p>{scopeNote}</p>
        </div>
        <Badge tone={rows.length ? "red" : "gray"}>{rows.length} signals</Badge>
      </header>
      {rows.length === 0 ? (
        <p className="memory-empty">반복적으로 나타나는 이슈가 없습니다. Review에서 신규 이슈를 확인하세요.</p>
      ) : (
        <ul className="memory-recurring-list">
          {rows.map(({ issue, signalScore, evidenceCount, relatedDecisionCount, scopeLabel }) => (
            <li key={issue.id}>
              <header>
                <strong title={issue.title}>{issue.title}</strong>
                <Badge tone={PRIORITY_TONE[issue.priority] ?? "blue"}>{priorityLabels[issue.priority]}</Badge>
              </header>
              <div className="memory-recurring-meta">
                <Badge tone={issueStatusTone(issue.status)}>{issueStatusLabels[issue.status]}</Badge>
                <Badge tone="gray">{scopeLabel}</Badge>
                <span>
                  signal {signalScore} · evidence {evidenceCount}
                  {relatedDecisionCount > 0 ? ` · ${relatedDecisionCount} decisions` : ""}
                </span>
              </div>
              {issue.description ? (
                <p className="memory-recurring-summary" title={issue.description}>
                  {issue.description}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
