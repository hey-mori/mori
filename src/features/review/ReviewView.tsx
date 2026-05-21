import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  KanbanSquare,
  ListChecks,
  Sparkles,
  Table2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { SessionModeBanner } from "../../components/layout/SessionModeBanner";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { moriConceptIcon } from "../../components/brand/moriIcons";
import { issueStatusLabels, priorityLabels } from "../../domain/constants";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import type { ReviewTab } from "../../app/store";
import { getReportEvidenceSummary } from "../../lib/sources/traceability";
import {
  countNextActionCompletion,
  splitNextActionsByCompletion,
} from "../../lib/session/nextActionCompletion";
import {
  buildIssueSuggestions,
  getReviewSummary,
  getUnresolvedItems,
  groupIssuesByStatus,
  ISSUE_STATUS_ORDER,
  issueStatusTone,
  pickDefaultReviewSelection,
  priorityTone,
  reviewSelectionTab,
  UNRESOLVED_REASON_LABEL,
  type ReviewSelection,
  type UnresolvedItem,
} from "../../lib/review-workspace/reviewWorkspace";
import { ReviewIssueCard } from "./ReviewIssueCard";
import { ReviewDecisionRow } from "./ReviewDecisionRow";
import { ReviewNextActionRow } from "./ReviewNextActionRow";
import { ReviewDetailPanel } from "./ReviewDetailPanel";
import { ReviewSummaryPanel } from "./ReviewSummaryPanel";
import { CompanionStrip } from "../companion/CompanionStrip";
import { useCompanionSignals } from "../companion/useCompanionSignals";
import { formatDateTime } from "../../lib/formatting/time";

const TAB_DEFS: Array<{ id: ReviewTab; label: string; icon: typeof KanbanSquare }> = [
  { id: "issues", label: "Issue Garden", icon: KanbanSquare },
  { id: "decisions", label: "Decision Log", icon: Table2 },
  { id: "nextActions", label: "Next Actions", icon: ListChecks },
  { id: "unresolved", label: "Unresolved", icon: AlertTriangle },
  { id: "suggestions", label: "Suggestions", icon: Sparkles },
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
  const analysis = useMoriSessionStore((state) => state.analysis);
  const runQuickPass = useMoriSessionStore((state) => state.runQuickPass);
  const setNextActionCompletion = useMoriSessionStore((state) => state.setNextActionCompletion);
  const promoteIssueToNextAction = useMoriSessionStore((state) => state.promoteIssueToNextAction);
  const setIssueStatus = useMoriSessionStore((state) => state.setIssueStatus);
  const editIssue = useMoriSessionStore((state) => state.editIssue);
  const setDecisionConfirmed = useMoriSessionStore((state) => state.setDecisionConfirmed);
  const editDecision = useMoriSessionStore((state) => state.editDecision);
  const editNextAction = useMoriSessionStore((state) => state.editNextAction);
  const imports = useMoriSessionStore((state) => state.imports);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const setSelectedEventId = useMoriAppStore((state) => state.setSelectedEventId);
  const reviewFocus = useMoriAppStore((state) => state.reviewFocus);
  const clearReviewFocus = useMoriAppStore((state) => state.clearReviewFocus);
  const activeTab = useMoriAppStore((state) => state.reviewTab);
  const setActiveTab = useMoriAppStore((state) => state.setReviewTab);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const { signals: companionSignals } = useCompanionSignals();

  const [selection, setSelection] = useState<ReviewSelection | null>(null);

  // Consume a one-shot deep-link from another surface (e.g. the Timeline
  // event inspector): focus the requested item and clear the request.
  useEffect(() => {
    if (!reviewFocus || reviewFocus.kind === "none") return;
    setSelection(reviewFocus);
    setActiveTab(reviewSelectionTab(reviewFocus));
    clearReviewFocus();
  }, [reviewFocus, clearReviewFocus]);

  const grouped = useMemo(() => groupIssuesByStatus(view.issues), [view.issues]);
  const summary = useMemo(
    () =>
      getReviewSummary({
        issues: view.issues,
        decisions: view.decisions,
        nextActions: view.nextActions,
      }),
    [view.issues, view.decisions, view.nextActions],
  );
  const unresolved = useMemo(
    () =>
      getUnresolvedItems({
        issues: view.issues,
        decisions: view.decisions,
        nextActions: view.nextActions,
      }),
    [view.issues, view.decisions, view.nextActions],
  );
  const dataBasis = useMemo(() => getReportEvidenceSummary(view).dataBasis, [view]);
  const defaultSelection = useMemo(
    () =>
      pickDefaultReviewSelection({
        issues: view.issues,
        decisions: view.decisions,
        nextActions: view.nextActions,
      }),
    [view.issues, view.decisions, view.nextActions],
  );

  // Keep selection in sync with the active view. We never overwrite the
  // user's selection without cause; we only fill in the default when none
  // is set yet or when the previously-selected id disappears.
  const effectiveSelection: ReviewSelection = (() => {
    if (!selection) return defaultSelection;
    if (selection.kind === "issue" && !view.issues.some((issue) => issue.id === selection.issueId)) {
      return defaultSelection;
    }
    if (
      selection.kind === "decision" &&
      !view.decisions.some((decision) => decision.id === selection.decisionId)
    ) {
      return defaultSelection;
    }
    if (
      selection.kind === "nextAction" &&
      !view.nextActions.some((action) => action.id === selection.nextActionId)
    ) {
      return defaultSelection;
    }
    return selection;
  })();

  const canRunQuickPass = imports.length > 0 && analysisStatus !== "running";
  const showQuickPassEmpty = mode === "draft" && !hasAnalysis;

  function selectAndOpen(next: ReviewSelection, tab: ReviewTab) {
    setSelection(next);
    setActiveTab(tab);
  }

  function handleShowTimeline(eventId: string) {
    setSelectedEventId(eventId);
    setCurrentView("timeline");
  }

  return (
    <div className="page review-workspace">
      <PageHeader
        title="Review"
        subtitle="가져온 증거와 Timeline 분석을 바탕으로 Mori가 추출한 이슈, 결정, 다음 액션을 검토하세요. 모든 항목은 Apply된 소스에서 추적할 수 있습니다."
        right={
          <div className="evidence-page-actions">
            <Badge tone={mode === "demo" ? "gray" : "green"}>
              {mode === "demo" ? "데모 세션" : "실제 세션"}
            </Badge>
          </div>
        }
      />
      <SessionModeBanner />

      <CompanionStrip signals={companionSignals} onNavigate={setCurrentView} />

      <AnalysisStrip
        mode={mode}
        hasAnalysis={hasAnalysis}
        status={analysisStatus}
        providerLabel={analysisProviderLabel}
        providerName={analysis?.providerName ?? null}
        analysisGeneratedAt={analysis?.generatedAt ?? null}
        error={analysisError}
        canRun={canRunQuickPass}
        importsCount={imports.length}
        summary={summary}
        dataBasis={dataBasis}
        onRun={() => runQuickPass()}
        onGoToEvidence={() => setCurrentView("evidence")}
      />

      <nav className="review-tabs" role="tablist" aria-label="Review tabs">
        {TAB_DEFS.map((tab) => {
          const Icon = tab.icon;
          const count = countForTab(tab.id, view, unresolved);
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`review-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{tab.label}</span>
              <Badge tone={activeTab === tab.id ? "purple" : "gray"}>{count}</Badge>
            </button>
          );
        })}
      </nav>

      <div className="review-layout">
        <section className="review-main">
          {activeTab === "issues" ? (
            <IssueGardenTab
              grouped={grouped}
              view={view}
              selection={effectiveSelection}
              onSelectIssue={(id) => selectAndOpen({ kind: "issue", issueId: id }, "issues")}
              showQuickPassEmpty={showQuickPassEmpty}
              onRunQuickPass={() => runQuickPass()}
              canRunQuickPass={canRunQuickPass}
              hasImports={imports.length > 0}
              onGoToEvidence={() => setCurrentView("evidence")}
            />
          ) : null}
          {activeTab === "decisions" ? (
            <DecisionLogTab
              decisions={view.decisions}
              view={view}
              selection={effectiveSelection}
              onSelectDecision={(id) =>
                selectAndOpen({ kind: "decision", decisionId: id }, "decisions")
              }
            />
          ) : null}
          {activeTab === "nextActions" ? (
            <NextActionsTab
              view={view}
              selection={effectiveSelection}
              onSelectNextAction={(id) =>
                selectAndOpen({ kind: "nextAction", nextActionId: id }, "nextActions")
              }
              hasAnalysis={hasAnalysis}
            />
          ) : null}
          {activeTab === "unresolved" ? (
            <UnresolvedTab
              items={unresolved}
              selection={effectiveSelection}
              onSelectIssue={(id) => selectAndOpen({ kind: "issue", issueId: id }, "unresolved")}
              onSelectDecision={(id) =>
                selectAndOpen({ kind: "decision", decisionId: id }, "unresolved")
              }
              onSelectNextAction={(id) =>
                selectAndOpen({ kind: "nextAction", nextActionId: id }, "unresolved")
              }
            />
          ) : null}
          {activeTab === "suggestions" ? (
            <SuggestionsTab
              issues={view.issues}
              nextActions={view.nextActions}
              hasAnalysis={hasAnalysis}
              providerLabel={analysisProviderLabel}
              mode={mode}
              onPromote={(issueId) => {
                const nextAction = promoteIssueToNextAction(issueId);
                if (nextAction) {
                  selectAndOpen(
                    { kind: "nextAction", nextActionId: nextAction.id },
                    "nextActions",
                  );
                }
              }}
              onViewNextAction={(nextActionId) =>
                selectAndOpen({ kind: "nextAction", nextActionId }, "nextActions")
              }
            />
          ) : null}
        </section>

        <div className="review-sidebar">
          <ReviewDetailPanel
            selection={effectiveSelection}
            view={view}
            onShowTimeline={handleShowTimeline}
            onToggleNextActionComplete={(id, completed) =>
              setNextActionCompletion(id, completed)
            }
            onSetIssueStatus={(id, status) => setIssueStatus(id, status)}
            onEditIssue={(id, fields) => editIssue(id, fields)}
            onPromoteIssueToNextAction={(id) => {
              const nextAction = promoteIssueToNextAction(id);
              if (nextAction) {
                selectAndOpen(
                  { kind: "nextAction", nextActionId: nextAction.id },
                  "nextActions",
                );
              }
              return nextAction;
            }}
            onSetDecisionConfirmed={(id, confirmed) =>
              setDecisionConfirmed(id, confirmed)
            }
            onEditDecision={(id, fields) => editDecision(id, fields)}
            onEditNextAction={(id, fields) => editNextAction(id, fields)}
            canEditReview={!view.isDemo}
          />
          <ReviewSummaryPanel
            summary={summary}
            issues={view.issues}
            decisions={view.decisions}
            nextActions={view.nextActions}
            hasAnalysis={hasAnalysis}
            providerLabel={analysisProviderLabel}
            dataBasis={dataBasis}
          />
        </div>
      </div>
    </div>
  );
}

function countForTab(
  tab: ReviewTab,
  view: ReturnType<typeof selectSessionView>,
  unresolved: UnresolvedItem[],
): number {
  switch (tab) {
    case "issues":
      return view.issues.length;
    case "decisions":
      return view.decisions.length;
    case "nextActions":
      return view.nextActions.length;
    case "unresolved":
      return unresolved.length;
    case "suggestions":
      // Only issues that actually carry a suggested next action.
      return buildIssueSuggestions(view.issues, view.nextActions).length;
  }
}

function AnalysisStrip({
  mode,
  hasAnalysis,
  status,
  providerLabel,
  providerName,
  analysisGeneratedAt,
  error,
  canRun,
  importsCount,
  summary,
  dataBasis,
  onRun,
  onGoToEvidence,
}: {
  mode: "demo" | "draft";
  hasAnalysis: boolean;
  status: string;
  providerLabel: string | null;
  providerName: string | null;
  analysisGeneratedAt: string | null;
  error: string | null;
  canRun: boolean;
  importsCount: number;
  summary: ReturnType<typeof getReviewSummary>;
  dataBasis: string;
  onRun: () => void;
  onGoToEvidence: () => void;
}) {
  const isDemo = mode === "demo";
  const providerCopy = providerLabel ?? "deterministic";
  const providerKind = providerName === "ollama-quick-pass-v1" ? "local LLM" : "heuristic";

  return (
    <div className={`review-analysis-strip status-${status}`} role="region" aria-label="Analysis state">
      <div className="review-analysis-info">
        <div>
          <strong>분석 상태</strong>
          <span>
            {isDemo
              ? "데모 세션의 mock 분석 결과를 보여줍니다."
              : status === "running"
                ? "Quick Pass 실행 중..."
                : status === "failed"
                  ? `Quick Pass 실패: ${error ?? "알 수 없는 오류"}`
                  : hasAnalysis
                    ? `${providerCopy} · ${providerKind}`
                    : importsCount === 0
                      ? "아직 가져온 소스가 없습니다. Evidence에서 소스를 추가하세요."
                      : "가져온 소스가 있습니다. Quick Pass를 실행하면 이슈/결정 후보가 생성됩니다."}
          </span>
        </div>
        <div className="review-analysis-counts">
          <Badge tone="red">이슈 {summary.issueCount}</Badge>
          <Badge tone="blue">결정 {summary.decisionCount}</Badge>
          <Badge tone="green">다음 액션 {summary.nextActionCount}</Badge>
          <Badge tone="gray">{dataBasis}</Badge>
          {analysisGeneratedAt ? (
            <span className="review-analysis-time">
              {formatDateTime(analysisGeneratedAt)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="review-analysis-actions">
        {!isDemo && importsCount === 0 ? (
          <Button onClick={onGoToEvidence}>Evidence Hub로 이동</Button>
        ) : null}
        {!isDemo ? (
          <Button
            variant="primary"
            icon={Sparkles}
            onClick={onRun}
            disabled={!canRun}
            title={canRun ? "Quick Pass 실행" : importsCount === 0 ? "먼저 소스를 가져오세요." : "이미 실행 중입니다."}
          >
            {status === "running" ? "분석 중..." : hasAnalysis ? "Re-run Quick Pass" : "Run Quick Pass"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function IssueGardenTab({
  grouped,
  view,
  selection,
  onSelectIssue,
  showQuickPassEmpty,
  onRunQuickPass,
  canRunQuickPass,
  hasImports,
  onGoToEvidence,
}: {
  grouped: ReturnType<typeof groupIssuesByStatus>;
  view: ReturnType<typeof selectSessionView>;
  selection: ReviewSelection;
  onSelectIssue: (id: string) => void;
  showQuickPassEmpty: boolean;
  onRunQuickPass: () => void;
  canRunQuickPass: boolean;
  hasImports: boolean;
  onGoToEvidence: () => void;
}) {
  if (showQuickPassEmpty) {
    return (
      <div className="review-empty">
        <Sparkles size={28} aria-hidden="true" />
        <h3>Quick Pass를 실행하면 이슈가 생성됩니다</h3>
        <p>
          Review는 가져온 소스와 Timeline 이벤트를 기반으로 이슈/결정/다음 액션을 추출합니다.
          {hasImports
            ? " 위의 'Run Quick Pass' 버튼을 사용해 분석을 시작하세요."
            : " 먼저 Evidence Hub에서 소스를 가져온 뒤 분석을 실행하세요."}
        </p>
        <div className="review-empty-actions">
          {hasImports ? (
            <Button variant="primary" icon={Sparkles} onClick={onRunQuickPass} disabled={!canRunQuickPass}>
              Run Quick Pass
            </Button>
          ) : (
            <Button variant="primary" onClick={onGoToEvidence}>
              Evidence Hub로 이동
            </Button>
          )}
        </div>
      </div>
    );
  }

  const totalIssues = ISSUE_STATUS_ORDER.reduce((acc, status) => acc + grouped[status].length, 0);
  if (totalIssues === 0) {
    return (
      <div className="review-empty">
        <CheckCircle2 size={28} aria-hidden="true" />
        <h3>이슈가 없습니다</h3>
        <p>이번 세션에서는 처리할 이슈가 없습니다. Quick Pass가 새 이슈를 추출하면 여기에 표시됩니다.</p>
      </div>
    );
  }

  return (
    <section className="review-issue-board">
      <header className="review-section-head">
        <div>
          <h2>Issue Garden</h2>
          <p>상태별로 이슈를 정리합니다. 카드를 클릭하면 오른쪽 패널에 출처와 관련 이벤트가 표시됩니다.</p>
        </div>
      </header>
      <div className="review-issue-board-columns">
        {ISSUE_STATUS_ORDER.map((status) => {
          const columnIssues = grouped[status];
          return (
            <article className="review-issue-column" key={status}>
              <header>
                <span className="review-issue-column-label">
                  <Badge tone={issueStatusTone(status)}>{issueStatusLabels[status]}</Badge>
                  <strong>{columnIssues.length}</strong>
                </span>
              </header>
              <div className="review-issue-column-list">
                {columnIssues.length === 0 ? (
                  <p className="review-issue-column-empty">없음</p>
                ) : (
                  columnIssues.map((issue) => (
                    <ReviewIssueCard
                      key={issue.id}
                      issue={issue}
                      events={view.events}
                      sources={view.sources}
                      selected={selection.kind === "issue" && selection.issueId === issue.id}
                      onSelect={() => onSelectIssue(issue.id)}
                    />
                  ))
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DecisionLogTab({
  decisions,
  view,
  selection,
  onSelectDecision,
}: {
  decisions: ReturnType<typeof selectSessionView>["decisions"];
  view: ReturnType<typeof selectSessionView>;
  selection: ReviewSelection;
  onSelectDecision: (id: string) => void;
}) {
  if (decisions.length === 0) {
    return (
      <div className="review-empty">
        <Table2 size={28} aria-hidden="true" />
        <h3>아직 결정이 없습니다</h3>
        <p>Quick Pass가 결정을 추출하면 여기 표 형태로 표시됩니다. 각 결정은 근거와 영향까지 함께 보관됩니다.</p>
      </div>
    );
  }

  return (
    <section className="review-decision-log">
      <header className="review-section-head">
        <div>
          <h2>Decision Log</h2>
          <p>결정 시각, 중요도, 근거 출처를 한 행에서 확인합니다. 행을 클릭하면 오른쪽 패널에 자세한 내용이 표시됩니다.</p>
        </div>
      </header>
      <div className="review-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">결정</th>
              <th scope="col">시각</th>
              <th scope="col">중요도</th>
              <th scope="col">근거</th>
              <th scope="col">상태</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((decision) => (
              <ReviewDecisionRow
                key={decision.id}
                decision={decision}
                events={view.events}
                sources={view.sources}
                selected={
                  selection.kind === "decision" && selection.decisionId === decision.id
                }
                onSelect={() => onSelectDecision(decision.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NextActionsTab({
  view,
  selection,
  onSelectNextAction,
  hasAnalysis,
}: {
  view: ReturnType<typeof selectSessionView>;
  selection: ReviewSelection;
  onSelectNextAction: (id: string) => void;
  hasAnalysis: boolean;
}) {
  const actions = view.nextActions;
  if (actions.length === 0) {
    return (
      <div className="review-empty">
        <ListChecks size={28} aria-hidden="true" />
        <h3>다음 액션이 없습니다</h3>
        <p>
          {hasAnalysis
            ? "Quick Pass는 다음 액션 후보를 만들지 않았습니다. Suggestions 탭에서 이슈의 추천 작업을 다음 액션으로 승격할 수 있습니다."
            : "Quick Pass를 실행하면 추천 다음 액션 후보가 표시됩니다."}
        </p>
      </div>
    );
  }
  const progress = countNextActionCompletion(actions);
  const { pending, completed } = splitNextActionsByCompletion(actions);
  const ordered = [...pending, ...completed];
  return (
    <section className="review-next-actions">
      <header className="review-section-head">
        <div>
          <h2>Next Actions</h2>
          <p>
            이슈와 연결된 다음 작업 후보입니다. 완료 처리한 작업은 목록 아래로
            내려가며, 남은 작업 {progress.pending}개 · 완료 {progress.completed}개입니다.
          </p>
        </div>
      </header>
      <ul className="review-next-action-list">
        {ordered.map((action) => (
          <li key={action.id}>
            <ReviewNextActionRow
              nextAction={action}
              relatedIssues={view.issues.filter((issue) => action.relatedIssueIds.includes(issue.id))}
              selected={
                selection.kind === "nextAction" && selection.nextActionId === action.id
              }
              onSelect={() => onSelectNextAction(action.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function UnresolvedTab({
  items,
  selection,
  onSelectIssue,
  onSelectDecision,
  onSelectNextAction,
}: {
  items: UnresolvedItem[];
  selection: ReviewSelection;
  onSelectIssue: (id: string) => void;
  onSelectDecision: (id: string) => void;
  onSelectNextAction: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="review-empty">
        <Activity size={28} aria-hidden="true" />
        <h3>처리되지 않은 항목이 없습니다</h3>
        <p>현재 세션에는 추가로 검토할 Open / 미확정 / 낮은 신뢰도 항목이 없습니다.</p>
      </div>
    );
  }
  return (
    <section className="review-unresolved">
      <header className="review-section-head">
        <div>
          <h2>Unresolved</h2>
          <p>Open 이슈, 미확정 결정, 추론 신뢰도가 낮은 항목, 대기 중인 다음 액션을 모아 보여줍니다.</p>
        </div>
      </header>
      <ul className="review-unresolved-list">
        {items.map((item) => {
          const reasonLabel = UNRESOLVED_REASON_LABEL[item.reason];
          if (item.kind === "issue") {
            const issue = item.issue;
            const selected = selection.kind === "issue" && selection.issueId === issue.id;
            return (
              <li key={`issue-${issue.id}`} className={selected ? "is-selected" : ""}>
                <button type="button" onClick={() => onSelectIssue(issue.id)}>
                  <Badge tone={issueStatusTone(issue.status)}>{reasonLabel}</Badge>
                  <strong>{issue.title}</strong>
                  <span>{issue.description}</span>
                  <Badge tone={priorityTone(issue.priority)}>{priorityLabels[issue.priority]}</Badge>
                </button>
              </li>
            );
          }
          if (item.kind === "decision") {
            const decision = item.decision;
            const selected = selection.kind === "decision" && selection.decisionId === decision.id;
            return (
              <li key={`decision-${decision.id}`} className={selected ? "is-selected" : ""}>
                <button type="button" onClick={() => onSelectDecision(decision.id)}>
                  <Badge tone="orange">{reasonLabel}</Badge>
                  <strong>{decision.title}</strong>
                  <span>{decision.decision}</span>
                  <Badge tone={priorityTone(decision.importance)}>{priorityLabels[decision.importance]}</Badge>
                </button>
              </li>
            );
          }
          const action = item.nextAction;
          const selected = selection.kind === "nextAction" && selection.nextActionId === action.id;
          return (
            <li key={`na-${action.id}`} className={selected ? "is-selected" : ""}>
              <button type="button" onClick={() => onSelectNextAction(action.id)}>
                <Badge tone="gray">{reasonLabel}</Badge>
                <strong>{action.title}</strong>
                <span>다음 액션 후보</span>
                <Badge tone={priorityTone(action.priority)}>{priorityLabels[action.priority]}</Badge>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SuggestionsTab({
  issues,
  nextActions,
  hasAnalysis,
  providerLabel,
  mode,
  onPromote,
  onViewNextAction,
}: {
  issues: ReturnType<typeof selectSessionView>["issues"];
  nextActions: ReturnType<typeof selectSessionView>["nextActions"];
  hasAnalysis: boolean;
  providerLabel: string | null;
  mode: "demo" | "draft";
  onPromote: (issueId: string) => void;
  onViewNextAction: (nextActionId: string) => void;
}) {
  const suggestions = buildIssueSuggestions(issues, nextActions);
  const isDemo = mode === "demo";
  // Demo session ships pre-baked suggestions inside mock issues, so we render
  // them straight through. In a real session we only render after the user
  // explicitly runs Quick Pass; we never invent suggestions on our own.
  if (mode === "draft" && !hasAnalysis) {
    return (
      <div className="review-empty">
        <Sparkles size={28} aria-hidden="true" />
        <h3>Quick Pass 분석 후 추천이 표시됩니다</h3>
        <p>Quick Pass가 각 이슈에 대해 제안한 다음 액션을 한 곳에서 검토할 수 있습니다.</p>
      </div>
    );
  }
  if (suggestions.length === 0) {
    return (
      <div className="review-empty">
        <Sparkles size={28} aria-hidden="true" />
        <h3>현재 분석에서 추천된 액션이 없습니다</h3>
        <p>{providerLabel ?? "Quick Pass"}는 이번 세션에서 별도의 다음 액션 제안을 만들지 않았습니다.</p>
      </div>
    );
  }
  const pendingCount = suggestions.filter((item) => !item.promotedNextActionId).length;
  return (
    <section className="review-suggestions">
      <header className="review-section-head">
        <div>
          <h2>Suggestions</h2>
          <p>
            각 이슈에서 Quick Pass가 제안한 다음 액션입니다. 승격하면 Next Actions 탭에
            추가됩니다 — 승격 대기 {pendingCount}개.
          </p>
        </div>
      </header>
      <ul className="review-suggestions-list">
        {suggestions.map(({ issue, promotedNextActionId }) => (
          <li key={issue.id}>
            <header>
              <Badge tone={priorityTone(issue.priority)}>{priorityLabels[issue.priority]}</Badge>
              <strong>{issue.title}</strong>
            </header>
            <p>
              <Sparkles size={11} aria-hidden="true" />
              <span>{issue.suggestedNextAction}</span>
            </p>
            <div className="review-suggestion-action">
              {promotedNextActionId ? (
                <>
                  <span className="review-suggestion-done">
                    <Check size={13} aria-hidden="true" /> 다음 액션에 추가됨
                  </span>
                  <Button onClick={() => onViewNextAction(promotedNextActionId)}>
                    다음 액션 보기
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  icon={moriConceptIcon.nextAction}
                  onClick={() => onPromote(issue.id)}
                  disabled={isDemo}
                  title={
                    isDemo
                      ? "데모 세션에서는 승격할 수 없습니다. 실제 세션에서 사용하세요."
                      : "이 제안을 다음 액션으로 추가합니다."
                  }
                >
                  다음 액션으로 승격
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
