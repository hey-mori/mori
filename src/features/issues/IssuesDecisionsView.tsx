import { Calendar, FileText, Filter, KanbanSquare, List, MoreHorizontal, Plus, Sparkles, Table2 } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { moriMockSession } from "../../domain/mock-data";
import type { Decision, Issue, IssueStatus } from "../../domain/types";
import { issueStatusLabels, priorityLabels } from "../../domain/constants";
import { formatDate, formatTime } from "../../lib/formatting/time";

const issueColumns: Array<{ status: IssueStatus; tone: string }> = [
  { status: "open", tone: "red" },
  { status: "inProgress", tone: "orange" },
  { status: "resolved", tone: "green" },
  { status: "watching", tone: "gray" },
];

export function IssuesDecisionsView() {
  return (
    <div className="page page-tight">
      <PageHeader
        title="Issues & Decisions"
        subtitle="작업 중 발견된 이슈와 중요한 결정을 한 곳에서 관리하세요."
        right={
          <div className="toolbar">
            <Button>Mori 앱 기획</Button>
            <Button icon={Calendar}>2026.05.12 (화)</Button>
            <Button icon={Filter}>필터</Button>
            <Button variant="primary" icon={Plus}>새 항목</Button>
          </div>
        }
      />
      <div className="tabs">
        <button className="active" type="button"><KanbanSquare size={16} /> Issue Garden</button>
        <button type="button"><Table2 size={16} /> Decision Log</button>
        <span />
        <Button icon={KanbanSquare}>보드</Button>
        <Button icon={List}>리스트</Button>
        <Button icon={Sparkles}>AI 추천 보기</Button>
      </div>
      <div className="issue-layout">
        <section className="issue-main">
          <h2>Issue Garden</h2>
          <div className="issue-board">
            {issueColumns.map((column) => {
              const issues = moriMockSession.issues.filter((issue) => issue.status === column.status);
              return (
                <div className="issue-column" key={column.status}>
                  <header>
                    <h3>
                      <i className={`legend-dot ${column.tone}`} />
                      {issueStatusLabels[column.status]} <span>{issues.length}</span>
                    </h3>
                    <Button icon={Plus} />
                  </header>
                  {issues.map((issue) => <IssueCard issue={issue} key={issue.id} />)}
                </div>
              );
            })}
          </div>
          <DecisionLog />
        </section>
        <IssueInsights />
      </div>
    </div>
  );
}

function IssueCard({ issue }: { issue: Issue }) {
  return (
    <article className="issue-card">
      <div>
        <strong>{issue.title}</strong>
        <Badge tone={priorityTone(issue.priority)}>{priorityLabels[issue.priority]}</Badge>
      </div>
      <p>{issue.description}</p>
      <p className="suggested-action">{issue.suggestedNextAction}</p>
      <footer>
        <span><Calendar size={14} /> {formatDate(issue.createdAt)}</span>
        <span>이벤트 {issue.sourceEventIds.length}</span>
        <span>결정 {issue.relatedDecisionIds.length}</span>
        <b>KM</b>
      </footer>
    </article>
  );
}

function IssueInsights() {
  const open = moriMockSession.issues.filter((issue) => issue.status === "open").length;
  const progress = moriMockSession.issues.filter((issue) => issue.status === "inProgress").length;
  const resolved = moriMockSession.issues.filter((issue) => issue.status === "resolved").length;
  const watching = moriMockSession.issues.filter((issue) => issue.status === "watching").length;

  return (
    <aside className="issue-sidebar">
      <h2>이슈 통계</h2>
      <div className="donut"><span>{moriMockSession.issues.length}<small>Total</small></span></div>
      <dl className="stats-list">
        <div><dt>Open</dt><dd>{open}</dd></div>
        <div><dt>In Progress</dt><dd>{progress}</dd></div>
        <div><dt>Resolved</dt><dd>{resolved}</dd></div>
        <div><dt>Watching</dt><dd>{watching}</dd></div>
      </dl>
      <Button icon={FileText}>이슈 리포트 보기</Button>
      <div className="highlight-box">
        <h3>AI 추천</h3>
        <p>유사 이슈 병합, 우선순위 제안, 다음 액션 추천, Linear/Jira/Todo export는 backend boundary 이후 연결합니다.</p>
        <Button icon={Sparkles}>추천 확인</Button>
      </div>
    </aside>
  );
}

function DecisionLog() {
  return (
    <section className="decision-log">
      <div className="section-heading">
        <div>
          <h2>Decision Log <Badge tone="orange">contextual</Badge></h2>
          <p>어떤 정보를 바탕으로 어떤 결정을 했는지 근거와 영향까지 남깁니다.</p>
        </div>
        <div>
          <Button>중요도: 전체</Button>
          <Button>내보내기</Button>
          <Button icon={MoreHorizontal} />
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>결정 항목</th>
            <th>결정 시각</th>
            <th>중요도</th>
            <th>결정 내용</th>
            <th>이유</th>
            <th>폐기한 대안</th>
            <th>영향</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {moriMockSession.decisions.map((decision) => <DecisionRow decision={decision} key={decision.id} />)}
        </tbody>
      </table>
    </section>
  );
}

function DecisionRow({ decision }: { decision: Decision }) {
  return (
    <tr>
      <td><strong>{decision.title}</strong><span>{decision.sourceEventIds.length} source events</span></td>
      <td>{formatTime(decision.createdAt)}</td>
      <td><Badge tone={priorityTone(decision.importance)}>{priorityLabels[decision.importance]}</Badge></td>
      <td>{decision.decision}</td>
      <td>{decision.rationale}</td>
      <td>{decision.rejectedOptions.join(", ")}</td>
      <td>{decision.impact.join(", ")}</td>
      <td><Badge tone={decision.confirmed ? "green" : "purple"}>{decision.confirmed ? "Confirmed" : decision.trustLevel}</Badge></td>
    </tr>
  );
}

function priorityTone(priority: Issue["priority"]): string {
  if (priority === "high") return "red";
  if (priority === "medium") return "orange";
  return "blue";
}
