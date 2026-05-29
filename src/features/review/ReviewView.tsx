import { CheckCircle2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { BaseObjectRow } from "../../components/ui/BaseObjectRow";
import { BaseMetadataLine } from "../../components/ui/BaseMetadataLine";
import { issueStatusLabels, priorityLabels } from "../../domain/constants";
import type { Decision, Issue, IssueStatus, NextAction, Priority } from "../../domain/types";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { getReportEvidenceSummary, getIssueEvidenceSources } from "../../lib/sources/traceability";
import {
  isNextActionCompleted,
  splitNextActionsByCompletion,
} from "../../lib/session/nextActionCompletion";
import {
  getUnresolvedItems,
  issueStatusTone,
  pickDefaultReviewSelection,
  priorityTone,
  type ReviewSelection,
} from "../../lib/review-workspace/reviewWorkspace";
import { ReviewDetailPanel } from "./ReviewDetailPanel";
import { formatDate, formatDateTime } from "../../lib/formatting/time";

/**
 * Review workspace — the **검토** tab inside the unified Session Detail workspace.
 *
 * One calm Kanban: three columns — 이슈 / 결정 / 다음 액션 — each a stack of
 * compact cards. That is the whole session's review work at a glance; the old
 * five-tab strip + dense stats header are gone. Selecting any card opens the
 * context inspector on the right, which carries every correction action
 * (status, confirm, complete, edit, promote). The framing stays value-first:
 * confirming an issue / decision / next action is what carries forward into
 * project memory.
 */
export function ReviewView() {
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const hasAnalysis = useSessionStore(selectHasRealAnalysis);
  const analysisStatus = useSessionStore((state) => state.analysisStatus);
  const analysisError = useSessionStore((state) => state.analysisError);
  const analysisProviderLabel = useSessionStore((state) => state.analysisProviderLabel);
  const analysis = useSessionStore((state) => state.analysis);
  const runQuickPass = useSessionStore((state) => state.runQuickPass);
  const setNextActionCompletion = useSessionStore((state) => state.setNextActionCompletion);
  const promoteIssueToNextAction = useSessionStore((state) => state.promoteIssueToNextAction);
  const setIssueStatus = useSessionStore((state) => state.setIssueStatus);
  const editIssue = useSessionStore((state) => state.editIssue);
  const setDecisionConfirmed = useSessionStore((state) => state.setDecisionConfirmed);
  const editDecision = useSessionStore((state) => state.editDecision);
  const editNextAction = useSessionStore((state) => state.editNextAction);
  const imports = useSessionStore((state) => state.imports);
  const setCurrentView = useAppStore((state) => state.navigate);
  const setSelectedEventId = useAppStore((state) => state.setSelectedEventId);
  const reviewFocus = useAppStore((state) => state.reviewFocus);
  const clearReviewFocus = useAppStore((state) => state.clearReviewFocus);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const [selection, setSelection] = useState<ReviewSelection | null>(null);

  // Consume a one-shot deep-link from another surface (e.g. the Timeline event
  // inspector "create issue"): focus the requested item and clear the request.
  useEffect(() => {
    if (!reviewFocus || reviewFocus.kind === "none") return;
    setSelection(reviewFocus);
    clearReviewFocus();
  }, [reviewFocus, clearReviewFocus]);

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

  // Keep selection in sync with the active view. We never overwrite the user's
  // selection without cause; we only fill in the default when none is set yet
  // or when the previously-selected id disappears.
  const effectiveSelection: ReviewSelection = (() => {
    if (!selection) return defaultSelection;
    if (selection.kind === "issue" && !view.issues.some((i) => i.id === selection.issueId)) {
      return defaultSelection;
    }
    if (selection.kind === "decision" && !view.decisions.some((d) => d.id === selection.decisionId)) {
      return defaultSelection;
    }
    if (selection.kind === "nextAction" && !view.nextActions.some((a) => a.id === selection.nextActionId)) {
      return defaultSelection;
    }
    return selection;
  })();

  const isDemo = mode === "demo";
  const canRunQuickPass = imports.length > 0 && analysisStatus !== "running";
  const showQuickPassEmpty = mode === "draft" && !hasAnalysis;

  const sortedIssues = useMemo(() => sortIssues(view.issues), [view.issues]);
  const sortedDecisions = useMemo(() => sortDecisions(view.decisions), [view.decisions]);
  const sortedNextActions = useMemo(() => sortNextActions(view.nextActions), [view.nextActions]);

  function handleShowTimeline(eventId: string) {
    setSelectedEventId(eventId);
    setCurrentView("timeline");
  }

  const actionBar = (
    <ActionBar
      label="검토"
      start={
        <Badge tone={unresolved.length ? "orange" : "green"}>
          확인 필요 {unresolved.length}
        </Badge>
      }
      end={
        !isDemo ? (
          <Button
            variant="primary"
            icon={Sparkles}
            onClick={() => runQuickPass()}
            disabled={!canRunQuickPass}
            title={
              canRunQuickPass
                ? "Quick Pass 실행"
                : imports.length === 0
                  ? "먼저 소스를 가져오세요."
                  : "이미 실행 중입니다."
            }
          >
            {analysisStatus === "running"
              ? "분석 중..."
              : hasAnalysis
                ? "Quick Pass 재실행"
                : "Quick Pass 실행"}
          </Button>
        ) : null
      }
    />
  );

  const aside = (
    <ReviewDetailPanel
      selection={effectiveSelection}
      view={view}
      onShowTimeline={handleShowTimeline}
      onToggleNextActionComplete={(id, completed) => setNextActionCompletion(id, completed)}
      onSetIssueStatus={(id, status) => setIssueStatus(id, status)}
      onEditIssue={(id, fields) => editIssue(id, fields)}
      onPromoteIssueToNextAction={(id) => {
        const nextAction = promoteIssueToNextAction(id);
        if (nextAction) setSelection({ kind: "nextAction", nextActionId: nextAction.id });
        return nextAction;
      }}
      onSetDecisionConfirmed={(id, confirmed) => setDecisionConfirmed(id, confirmed)}
      onEditDecision={(id, fields) => editDecision(id, fields)}
      onEditNextAction={(id, fields) => editNextAction(id, fields)}
      canEditReview={!view.isDemo}
    />
  );

  const board = (
    <section className="review-issue-board">
      <div className="review-issue-board-columns review-board-columns">
        <ReviewBoardColumn label="이슈" tone="orange" count={view.issues.length}>
          {sortedIssues.length === 0 ? (
            <ColumnEmpty label="이슈 없음" />
          ) : (
            sortedIssues.map((issue) => (
              <IssueBoardCard
                key={issue.id}
                issue={issue}
                view={view}
                selected={effectiveSelection.kind === "issue" && effectiveSelection.issueId === issue.id}
                onSelect={() => setSelection({ kind: "issue", issueId: issue.id })}
              />
            ))
          )}
        </ReviewBoardColumn>

        <ReviewBoardColumn label="결정" tone="blue" count={view.decisions.length}>
          {sortedDecisions.length === 0 ? (
            <ColumnEmpty label="결정 없음" />
          ) : (
            sortedDecisions.map((decision) => (
              <DecisionBoardCard
                key={decision.id}
                decision={decision}
                selected={
                  effectiveSelection.kind === "decision" &&
                  effectiveSelection.decisionId === decision.id
                }
                onSelect={() => setSelection({ kind: "decision", decisionId: decision.id })}
              />
            ))
          )}
        </ReviewBoardColumn>

        <ReviewBoardColumn label="다음 액션" tone="green" count={view.nextActions.length}>
          {sortedNextActions.length === 0 ? (
            <ColumnEmpty label="다음 액션 없음" />
          ) : (
            sortedNextActions.map((action) => (
              <NextActionBoardCard
                key={action.id}
                action={action}
                selected={
                  effectiveSelection.kind === "nextAction" &&
                  effectiveSelection.nextActionId === action.id
                }
                onSelect={() => setSelection({ kind: "nextAction", nextActionId: action.id })}
              />
            ))
          )}
        </ReviewBoardColumn>
      </div>
    </section>
  );

  const body = (
    <>
      <ReviewAnalysisNotice
        mode={mode}
        hasAnalysis={hasAnalysis}
        status={analysisStatus}
        providerLabel={analysisProviderLabel}
        providerName={analysis?.providerName ?? null}
        analysisGeneratedAt={analysis?.generatedAt ?? null}
        error={analysisError}
        importsCount={imports.length}
        dataBasis={dataBasis}
        onGoToEvidence={() => setCurrentView("evidence")}
      />

      {showQuickPassEmpty ? (
        <EmptyState
          icon={Sparkles}
          title="Quick Pass를 실행하면 검토 항목이 생성됩니다"
          description={
            imports.length > 0
              ? "가져온 소스와 타임라인 이벤트로 이슈 · 결정 · 다음 액션을 추출합니다."
              : "먼저 증거 탭에서 소스를 가져온 뒤 분석을 실행하세요."
          }
          actions={
            imports.length > 0 ? (
              <Button variant="primary" icon={Sparkles} onClick={() => runQuickPass()} disabled={!canRunQuickPass}>
                Quick Pass 실행
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setCurrentView("evidence")}>
                증거 탭으로 이동
              </Button>
            )
          }
        />
      ) : view.issues.length + view.decisions.length + view.nextActions.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="검토할 항목이 없습니다"
          description="이슈 · 결정 · 다음 액션이 추출되면 여기에 칸반으로 정리됩니다."
        />
      ) : (
        board
      )}
    </>
  );

  const showAside = effectiveSelection.kind !== "none";

  return (
    <div className="session-tab-pane session-tab-insights">
      <div className="session-tab-actionbar">{actionBar}</div>
      <div className={`session-tab-split${showAside ? "" : " is-collapsed"}`}>
        <div className="session-tab-main">{body}</div>
        {showAside ? aside : null}
      </div>
    </div>
  );
}

// ─── Board primitives ─────────────────────────────────────────────────────────

function ReviewBoardColumn({
  label,
  tone,
  count,
  children,
}: {
  label: string;
  tone: "orange" | "blue" | "green";
  count: number;
  children: ReactNode;
}) {
  return (
    <article className="review-issue-column">
      <header>
        <span className="review-issue-column-label">
          <Badge tone={tone}>{label}</Badge>
          <strong>{count}</strong>
        </span>
      </header>
      <div className="review-issue-column-list">{children}</div>
    </article>
  );
}

function ColumnEmpty({ label }: { label: string }) {
  return <p className="review-issue-column-empty">{label}</p>;
}

function ReviewBoardCard({
  title,
  subtitle,
  meta,
  badges,
  selected,
  onSelect,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  badges: ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`review-issue-card ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "true" : undefined}
    >
      <BaseObjectRow
        title={title}
        subtitle={subtitle}
        meta={meta}
        status={badges}
        selected={selected}
        onClick={onSelect}
        ariaLabel={title}
      />
    </article>
  );
}

function IssueBoardCard({
  issue,
  view,
  selected,
  onSelect,
}: {
  issue: Issue;
  view: ReturnType<typeof selectSessionView>;
  selected: boolean;
  onSelect: () => void;
}) {
  const evidence = getIssueEvidenceSources(issue, view.events, view.sources);
  return (
    <ReviewBoardCard
      title={issue.title}
      subtitle={issue.description}
      meta={
        <BaseMetadataLine
          items={[
            formatDate(issue.createdAt),
            <span title={`이벤트 ${evidence.eventCount}개 · 소스 ${evidence.sourceCount}개`}>
              {evidence.eventCount}E · {evidence.sourceCount}S
              {issue.relatedDecisionIds.length ? ` · ${issue.relatedDecisionIds.length}D` : ""}
            </span>,
          ]}
        />
      }
      badges={
        <>
          <Badge tone={issueStatusTone(issue.status)}>{issueStatusLabels[issue.status]}</Badge>
          <Badge tone={priorityTone(issue.priority)}>{priorityLabels[issue.priority]}</Badge>
          {issue.editedByUser ? <Badge tone="blue">수정됨</Badge> : null}
        </>
      }
      selected={selected}
      onSelect={onSelect}
    />
  );
}

function DecisionBoardCard({
  decision,
  selected,
  onSelect,
}: {
  decision: Decision;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <ReviewBoardCard
      title={decision.title}
      subtitle={decision.decision}
      meta={<BaseMetadataLine items={[formatDate(decision.createdAt)]} />}
      badges={
        <>
          <Badge tone={decision.confirmed ? "green" : "orange"}>
            {decision.confirmed ? "확정" : "미확정"}
          </Badge>
          <Badge tone={priorityTone(decision.importance)}>{priorityLabels[decision.importance]}</Badge>
          {decision.editedByUser ? <Badge tone="blue">수정됨</Badge> : null}
        </>
      }
      selected={selected}
      onSelect={onSelect}
    />
  );
}

function NextActionBoardCard({
  action,
  selected,
  onSelect,
}: {
  action: NextAction;
  selected: boolean;
  onSelect: () => void;
}) {
  const done = isNextActionCompleted(action);
  return (
    <ReviewBoardCard
      title={action.title}
      meta={
        done && action.completedAt
          ? <BaseMetadataLine items={[`완료 ${formatDate(action.completedAt)}`]} />
          : undefined
      }
      badges={
        <>
          <Badge tone={done ? "green" : "orange"}>{done ? "완료" : "진행"}</Badge>
          <Badge tone={priorityTone(action.priority)}>{priorityLabels[action.priority]}</Badge>
          {action.editedByUser ? <Badge tone="blue">수정됨</Badge> : null}
        </>
      }
      selected={selected}
      onSelect={onSelect}
    />
  );
}

// ─── Sorting ───────────────────────────────────────────────────────────────────

const ISSUE_STATUS_RANK: Record<IssueStatus, number> = {
  open: 0,
  inProgress: 1,
  watching: 2,
  resolved: 3,
};
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      ISSUE_STATUS_RANK[a.status] - ISSUE_STATUS_RANK[b.status] ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
}

function sortDecisions(decisions: Decision[]): Decision[] {
  return [...decisions].sort(
    (a, b) =>
      (a.confirmed ? 1 : 0) - (b.confirmed ? 1 : 0) ||
      PRIORITY_RANK[a.importance] - PRIORITY_RANK[b.importance],
  );
}

function sortNextActions(actions: NextAction[]): NextAction[] {
  const { pending, completed } = splitNextActionsByCompletion(actions);
  const byPriority = (list: NextAction[]) =>
    [...list].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  return [...byPriority(pending), ...byPriority(completed)];
}

// ─── Analysis notice ─────────────────────────────────────────────────────────

/**
 * Compact analysis-state notice. Surfaces only when there is something worth
 * saying: a failure, a run in progress, an empty real session, or the
 * provider/timestamp once results exist. Stays quiet otherwise.
 */
function ReviewAnalysisNotice({
  mode,
  hasAnalysis,
  status,
  providerLabel,
  providerName,
  analysisGeneratedAt,
  error,
  importsCount,
  dataBasis,
  onGoToEvidence,
}: {
  mode: "demo" | "draft";
  hasAnalysis: boolean;
  status: string;
  providerLabel: string | null;
  providerName: string | null;
  analysisGeneratedAt: string | null;
  error: string | null;
  importsCount: number;
  dataBasis: string;
  onGoToEvidence: () => void;
}) {
  if (mode === "demo") return null;

  if (status === "failed") {
    return (
      <NoticeBanner tone="danger" title="Quick Pass 실패">
        {error ?? "알 수 없는 오류"}
      </NoticeBanner>
    );
  }
  if (status === "running") {
    return <NoticeBanner tone="info">Quick Pass 실행 중...</NoticeBanner>;
  }
  if (!hasAnalysis && importsCount === 0) {
    return (
      <NoticeBanner
        tone="info"
        title="아직 가져온 소스가 없습니다"
        actions={<Button onClick={onGoToEvidence}>증거 탭으로 이동</Button>}
      >
        증거 탭에서 소스를 추가하고 Quick Pass를 실행하면 이슈와 결정이 정리됩니다.
      </NoticeBanner>
    );
  }
  if (!hasAnalysis) {
    return (
      <NoticeBanner tone="info">
        가져온 소스가 있습니다. 우측 상단에서 Quick Pass를 실행하면 이슈 · 결정 후보가 생성됩니다.
      </NoticeBanner>
    );
  }

  const providerCopy = providerLabel ?? "deterministic";
  const providerKind = providerName === "ollama-quick-pass-v1" ? "로컬 LLM" : "휴리스틱";
  return (
    <NoticeBanner tone="success" icon={null}>
      <span className="review-analysis-meta">
        {providerCopy} · {providerKind}
        {analysisGeneratedAt ? ` · ${formatDateTime(analysisGeneratedAt)}` : ""} · {dataBasis}
      </span>
    </NoticeBanner>
  );
}
