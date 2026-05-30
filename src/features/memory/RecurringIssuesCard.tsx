import { Badge } from "../../components/ui/Badge";
import { issueStatusLabels, priorityLabels } from "../../domain/constants";
import { issueStatusTone } from "../../lib/project-memory/projectMemory";
import type { ProjectMemoryRecurringIssue } from "../../lib/project-memory/projectMemoryModel";

const PRIORITY_TONE: Record<string, "red" | "orange" | "blue"> = {
  high: "red",
  medium: "orange",
  low: "blue",
};

export function RecurringIssuesCard({
  rows,
  scopeNote,
}: {
  rows: ProjectMemoryRecurringIssue[];
  scopeNote: string;
}) {
  return (
    <section className="memory-recurring" aria-label="반복 이슈">
      <header className="memory-section-head">
        <div>
          <h3>반복 이슈 Top {rows.length}</h3>
          <p>{scopeNote}</p>
        </div>
        <Badge tone={rows.length ? "red" : "gray"}>{rows.length}개 신호</Badge>
      </header>
      {rows.length === 0 ? (
        <p className="memory-empty">반복적으로 나타나는 이슈가 없습니다. 검토에서 신규 이슈를 확인하세요.</p>
      ) : (
        <ul className="memory-recurring-list">
          {rows.map((row) => (
            <li key={`${row.sessionId}-${row.issueId}`}>
              <header>
                <strong title={row.title}>{row.title}</strong>
                <Badge tone={PRIORITY_TONE[row.priority] ?? "blue"}>{priorityLabels[row.priority]}</Badge>
              </header>
              <div className="memory-recurring-meta">
                <Badge tone={issueStatusTone(row.status)}>{issueStatusLabels[row.status]}</Badge>
                {row.crossSession ? (
                  <Badge tone="purple">{row.affectedSessionCount}개 세션</Badge>
                ) : (
                  <Badge tone="gray">{row.sessionTitle}{row.sessionIsActive ? " · 현재" : ""}</Badge>
                )}
                <span>signal {row.signalScore}</span>
              </div>
              {row.description ? (
                <p className="memory-recurring-summary" title={row.description}>
                  {row.description}
                </p>
              ) : null}
              {row.crossSession && row.affectedSessions.length > 1 ? (
                <ul className="memory-recurring-sessions">
                  {row.affectedSessions.slice(0, 4).map((session) => (
                    <li key={session.sessionId}>
                      <Badge tone={session.isActive ? "green" : "gray"}>{session.sessionTitle}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
