import { Calendar, FileText, Filter, KanbanSquare, List, MoreHorizontal, Plus, Sparkles, Table2 } from "lucide-react";
import { useEffect } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { SessionModeBanner } from "../../components/layout/SessionModeBanner";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type { Decision, Issue, IssueStatus } from "../../domain/types";
import { issueStatusLabels, priorityLabels } from "../../domain/constants";
import { formatDate, formatTime } from "../../lib/formatting/time";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";

const issueColumns: Array<{ status: IssueStatus; tone: string }> = [
  { status: "open", tone: "red" },
  { status: "inProgress", tone: "orange" },
  { status: "resolved", tone: "green" },
  { status: "watching", tone: "gray" },
];

export function ReviewView() {
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const view = useMoriSessionStore(selectSessionView);
  const mode = useMoriSessionStore(selectSessionMode);
  const hasAnalysis = useMoriSessionStore(selectHasRealAnalysis);
  const analysisStatus = useMoriSessionStore((state) => state.analysisStatus);
  const analysisError = useMoriSessionStore((state) => state.analysisError);
  const analysisProviderLabel = useMoriSessionStore((state) => state.analysisProviderLabel);
  const runQuickPass = useMoriSessionStore((state) => state.runQuickPass);
  const imports = useMoriSessionStore((state) => state.imports);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const issues = view.issues;
  const decisions = view.decisions;
  const showEmptyDraft = mode === "draft" && !hasAnalysis;
  const canRun = imports.length > 0 && analysisStatus !== "running";

  return (
    <div className="page page-tight">
      <PageHeader
        title="Review"
        subtitle="Issues, decisions, and next actions discovered in this session"
        right={
          <div className="toolbar">
            <Button>{view.project.name}</Button>
            <Button icon={Calendar}>{formatDate(view.session.startedAt)}</Button>
            <Button icon={Filter}>필터</Button>
            <Button variant="primary" icon={Plus}>새 항목</Button>
          </div>
        }
      />
      <SessionModeBanner />
      {mode === "draft" ? (
        <AnalysisBanner
          status={analysisStatus}
          providerLabel={analysisProviderLabel}
          error={analysisError}
          canRun={canRun}
          onRun={() => runQuickPass()}
        />
      ) : null}
      <div className="tabs">
        <button className="active" type="button"><KanbanSquare size={16} /> Issue Garden</button>
        <button type="button"><Table2 size={16} /> Decision Log</button>
        <span />
        <Button icon={KanbanSquare}>보드</Button>
        <Button icon={List}>리스트</Button>
        <Button icon={Sparkles}>AI 추천 보기</Button>
      </div>
      {showEmptyDraft ? (
        <div className="evidence-empty">
          <Sparkles size={28} />
          <h2>Quick Pass를 실행해 이슈와 결정을 추출하세요</h2>
          <p>현재 세션에 가져온 소스가 있다면 위 배너의 “Run Quick Pass” 버튼을 사용할 수 있습니다.</p>
          {imports.length === 0 ? (
            <Button variant="primary" icon={Plus} onClick={() => setCurrentView("evidence")}>
              소스 가져오기로 이동
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="issue-layout">
          <section className="issue-main">
            <h2>Issue Garden</h2>
            <div className="issue-board">
              {issueColumns.map((column) => {
                const columnIssues = issues.filter((issue) => issue.status === column.status);
                return (
                  <div className="issue-column" key={column.status}>
                    <header>
                      <h3>
                        <i className={`legend-dot ${column.tone}`} />
                        {issueStatusLabels[column.status]} <span>{columnIssues.length}</span>
                      </h3>
                      <Button icon={Plus} />
                    </header>
                    {columnIssues.map((issue) => <IssueCard issue={issue} key={issue.id} />)}
                    {columnIssues.length === 0 ? (
                      <div className="issue-column-empty">없음</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <DecisionLog decisions={decisions} />
          </section>
          <IssueInsights issues={issues} hasAnalysis={hasAnalysis} providerLabel={analysisProviderLabel} />
        </div>
      )}
    </div>
  );
}

function AnalysisBanner({
  status,
  providerLabel,
  error,
  canRun,
  onRun,
}: {
  status: string;
  providerLabel: string | null;
  error: string | null;
  canRun: boolean;
  onRun: () => void;
}) {
  return (
    <div className={`analysis-banner status-${status}`}>
      <div>
        <strong>Quick Pass</strong>
        <span>
          {status === "running"
            ? "분석 중..."
            : status === "succeeded"
              ? `완료 (${providerLabel ?? "deterministic"})`
              : status === "failed"
                ? `실패: ${error ?? "알 수 없는 오류"}`
                : "현재 세션의 가져온 소스로 이슈/결정을 추출합니다."}
        </span>
      </div>
      <Button
        variant="primary"
        icon={Sparkles}
        onClick={onRun}
        disabled={!canRun}
      >
        Run Quick Pass
      </Button>
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
        <Badge tone={issue.trustLevel === "verified" ? "green" : issue.trustLevel === "observed" ? "blue" : "purple"}>
          {issue.trustLevel}
        </Badge>
      </footer>
    </article>
  );
}

function IssueInsights({ issues, hasAnalysis, providerLabel }: { issues: Issue[]; hasAnalysis: boolean; providerLabel: string | null }) {
  const open = issues.filter((issue) => issue.status === "open").length;
  const progress = issues.filter((issue) => issue.status === "inProgress").length;
  const resolved = issues.filter((issue) => issue.status === "resolved").length;
  const watching = issues.filter((issue) => issue.status === "watching").length;

  return (
    <aside className="issue-sidebar">
      <h2>이슈 통계</h2>
      <div className="donut"><span>{issues.length}<small>Total</small></span></div>
      <dl className="stats-list">
        <div><dt>Open</dt><dd>{open}</dd></div>
        <div><dt>In Progress</dt><dd>{progress}</dd></div>
        <div><dt>Resolved</dt><dd>{resolved}</dd></div>
        <div><dt>Watching</dt><dd>{watching}</dd></div>
      </dl>
      <Button icon={FileText}>이슈 리포트 보기</Button>
      <div className="highlight-box">
        <h3>출처</h3>
        <p>
          {hasAnalysis
            ? `현재 표시 중인 이슈/결정은 ${providerLabel ?? "Quick Pass"}가 가져온 소스로부터 추출한 결과입니다.`
            : "데모 모드에서는 정적 mock 데이터를 보여줍니다. 실제 세션을 시작하고 Quick Pass를 실행하면 가져온 소스 기반의 분석 결과가 표시됩니다."}
        </p>
      </div>
    </aside>
  );
}

function DecisionLog({ decisions }: { decisions: Decision[] }) {
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
      {decisions.length === 0 ? (
        <div className="decision-empty">표시할 결정이 없습니다.</div>
      ) : (
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
            {decisions.map((decision) => <DecisionRow decision={decision} key={decision.id} />)}
          </tbody>
        </table>
      )}
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
