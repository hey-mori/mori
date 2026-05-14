import { AlertCircle, CheckCircle2, FileText, ListChecks } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type { MoriMockSession } from "../../domain/types";
import { priorityLabels } from "../../domain/constants";
import { formatTime } from "../../lib/formatting/time";

export function WorkContinuationCards({
  view,
  onOpenTimeline,
}: {
  view: MoriMockSession;
  onOpenTimeline: () => void;
}) {
  const openIssues = view.issues.filter((issue) => issue.status === "open" || issue.status === "inProgress");
  const recentDecisions = [...view.decisions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4);
  const nextActions = view.nextActions;
  const artifacts = view.artifacts.slice(0, 4);

  return (
    <div className="work-continuation">
      <article className="continuation-card">
        <header>
          <h3>
            <ListChecks size={14} aria-hidden="true" /> 다음 액션
          </h3>
          <Badge tone={nextActions.length ? "purple" : "gray"}>{nextActions.length}</Badge>
        </header>
        {nextActions.length === 0 ? (
          <p className="continuation-empty">아직 다음 액션이 없습니다.</p>
        ) : (
          <ul>
            {nextActions.slice(0, 5).map((action) => (
              <li key={action.id}>
                <Badge tone={priorityToneMini(action.priority)}>{priorityLabels[action.priority]}</Badge>
                <span title={action.title}>{action.title}</span>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="continuation-card">
        <header>
          <h3>
            <AlertCircle size={14} aria-hidden="true" /> Open 이슈
          </h3>
          <Badge tone={openIssues.length ? "red" : "gray"}>{openIssues.length}</Badge>
        </header>
        {openIssues.length === 0 ? (
          <p className="continuation-empty">
            <CheckCircle2 size={12} aria-hidden="true" /> Open 또는 진행 중인 이슈가 없습니다.
          </p>
        ) : (
          <ul>
            {openIssues.slice(0, 5).map((issue) => (
              <li key={issue.id}>
                <Badge tone={priorityToneMini(issue.priority)}>{priorityLabels[issue.priority]}</Badge>
                <span title={issue.title}>{issue.title}</span>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="continuation-card">
        <header>
          <h3>최근 결정</h3>
          <Badge tone={recentDecisions.length ? "green" : "gray"}>{recentDecisions.length}</Badge>
        </header>
        {recentDecisions.length === 0 ? (
          <p className="continuation-empty">기록된 결정이 없습니다.</p>
        ) : (
          <ul>
            {recentDecisions.map((decision) => (
              <li key={decision.id}>
                <span title={decision.title}>{decision.title}</span>
                <small>{formatTime(decision.createdAt)}</small>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="continuation-card continuation-card-resources">
        <header>
          <h3>관련 리소스</h3>
          <Button onClick={onOpenTimeline}>Timeline 열기</Button>
        </header>
        {artifacts.length === 0 ? (
          <p className="continuation-empty">등록된 산출물이 없습니다.</p>
        ) : (
          <ul>
            {artifacts.map((artifact) => (
              <li key={artifact.id}>
                <FileText size={12} aria-hidden="true" />
                <span title={artifact.title}>{artifact.title}</span>
                {artifact.path ? <small>{artifact.path}</small> : null}
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}

function priorityToneMini(priority: string): "red" | "orange" | "blue" {
  if (priority === "high") return "red";
  if (priority === "medium") return "orange";
  return "blue";
}
