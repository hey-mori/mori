import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  GitBranch,
  KanbanSquare,
  Lightbulb,
  ListChecks,
  Search,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { moriConceptIcon } from "../../components/brand/moriIcons";
import { issueStatusLabels, priorityLabels } from "../../domain/constants";
import type { Priority } from "../../domain/types";
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
import { formatDateTime } from "../../lib/formatting/time";

const TAB_DEFS: Array<{ id: ReviewTab; label: string; icon: typeof KanbanSquare }> = [
  { id: "issues", label: "이슈 가든", icon: KanbanSquare },
  { id: "decisions", label: "결정 기록", icon: Table2 },
  { id: "nextActions", label: "다음 액션", icon: ListChecks },
  { id: "unresolved", label: "미처리", icon: AlertTriangle },
  { id: "suggestions", label: "제안", icon: Sparkles },
];

/**
 * Insights workspace (the surface formerly framed as "검토") — the **인사이트**
 * tab inside the unified Session Detail workspace.
 *
 * The Session Detail owns the single shell + header, so this view renders only
 * its action-bar row + body + inspector inside the session scroll area. Every
 * capability — tabs, Quick Pass, item editing, deep-link focus, inspector —
 * lives here. The framing is value-first: confirming an issue / decision /
 * next action is what carries forward into project memory — not a bare
 * "검토 후보 N개".
 */
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
  // `navigate` routes legacy session-surface keys (timeline / evidence) into
  // the unified Session Detail workspace, so "타임라인 보기" / "증거 허브로
  // 이동" switch tabs instead of opening a standalone page.
  const setCurrentView = useMoriAppStore((state) => state.navigate);
  const setSelectedEventId = useMoriAppStore((state) => state.setSelectedEventId);
  const reviewFocus = useMoriAppStore((state) => state.reviewFocus);
  const clearReviewFocus = useMoriAppStore((state) => state.clearReviewFocus);
  const activeTab = useMoriAppStore((state) => state.reviewTab);
  const setActiveTab = useMoriAppStore((state) => state.setReviewTab);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);


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

  const isDemo = mode === "demo";
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

  const actionBar = (
    <ActionBar
      label="인사이트 탭"
      start={
        <nav
          className="review-tabs"
          role="tablist"
          aria-label="Insights tabs"
          onKeyDown={(event) => {
            const tabIds = TAB_DEFS.map((t) => t.id);
            const current = tabIds.indexOf(activeTab);
            let next = -1;
            if (event.key === "ArrowRight") next = (current + 1) % tabIds.length;
            else if (event.key === "ArrowLeft")
              next = (current - 1 + tabIds.length) % tabIds.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = tabIds.length - 1;
            if (next !== -1) {
              event.preventDefault();
              const nextId = tabIds[next]!;
              setActiveTab(nextId);
              (event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus();
            }
          }}
        >
          {TAB_DEFS.map((tab) => {
            const Icon = tab.icon;
            const count = countForTab(tab.id, view, unresolved);
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                className={`review-tab ${isActive ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{tab.label}</span>
                <Badge tone={isActive ? "purple" : "gray"}>{count}</Badge>
              </button>
            );
          })}
        </nav>
      }
      end={
        <>
          <div className="review-action-counts">
            <Badge tone="red">이슈 {summary.issueCount}</Badge>
            <Badge tone="blue">결정 {summary.decisionCount}</Badge>
            <Badge tone="green">다음 {summary.nextActionCount}</Badge>
          </div>
          {!isDemo ? (
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
          ) : null}
        </>
      }
    />
  );

  const aside = (
    <aside className="review-rail" aria-label="인사이트 상세">
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
    </aside>
  );

  const body = (
    <>
      <InsightsValueNote
        mode={mode}
        hasAnalysis={hasAnalysis}
        issueCount={summary.issueCount}
        decisionCount={summary.decisionCount}
        nextActionCount={summary.nextActionCount}
      />

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

      <div className="review-main">
        <section className="review-main-tab">
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
      </div>
    </>
  );

  return (
    <div className="session-tab-pane session-tab-insights">
      <div className="session-tab-actionbar">{actionBar}</div>
      <div className="session-tab-split">
        <div className="session-tab-main">{body}</div>
        {aside}
      </div>
    </div>
  );
}

/**
 * Value-first framing strip for the Insights tab. Replaces the old
 * "검토 후보 N개" framing the user disliked: confirming an issue / decision /
 * next action is what carries forward into durable project memory. Calm,
 * concise, and only shown when there is something to confirm.
 */
function InsightsValueNote({
  mode,
  hasAnalysis,
  issueCount,
  decisionCount,
  nextActionCount,
}: {
  mode: "demo" | "draft";
  hasAnalysis: boolean;
  issueCount: number;
  decisionCount: number;
  nextActionCount: number;
}) {
  if (mode === "draft" && !hasAnalysis) return null;
  const total = issueCount + decisionCount + nextActionCount;
  if (total === 0) return null;
  return (
    <p className="session-insights-note">
      <Lightbulb size={14} aria-hidden="true" />
      <span>
        여기서 확인한 이슈 · 결정 · 다음 작업은 프로젝트 메모리에 남아 다음 작업에
        활용됩니다. 정확하지 않은 항목은 수정하거나 보류하세요.
      </span>
    </p>
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

/**
 * Compact analysis-state notice. The run action and the count badges now live
 * in the header + action bar, so this only surfaces when there is something
 * worth saying: a failure, a run in progress, an empty real session, or the
 * provider/timestamp once results exist. It stays quiet otherwise rather than
 * occupying a permanent strip.
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
        actions={
          <Button onClick={onGoToEvidence}>증거 허브로 이동</Button>
        }
      >
        증거 허브에서 소스를 추가하고 Quick Pass를 실행하면 이슈 · 결정 후보가 생성됩니다.
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
  const [searchText, setSearchText] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");

  if (showQuickPassEmpty) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Quick Pass를 실행하면 이슈가 생성됩니다"
        description={
          hasImports
            ? "가져온 소스와 타임라인 이벤트로 이슈 · 결정 · 다음 액션을 추출합니다."
            : "먼저 증거 허브에서 소스를 가져온 뒤 분석을 실행하세요."
        }
        actions={
          hasImports ? (
            <Button variant="primary" icon={Sparkles} onClick={onRunQuickPass} disabled={!canRunQuickPass}>
              Quick Pass 실행
            </Button>
          ) : (
            <Button variant="primary" onClick={onGoToEvidence}>
              증거 허브로 이동
            </Button>
          )
        }
      />
    );
  }

  const totalIssues = ISSUE_STATUS_ORDER.reduce((acc, status) => acc + grouped[status].length, 0);
  if (totalIssues === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="이슈가 없습니다"
        description="처리할 이슈가 없습니다. Quick Pass가 새 이슈를 추출하면 여기에 표시됩니다."
      />
    );
  }

  const needle = searchText.trim().toLowerCase();
  const filteredIssues = view.issues.filter((issue) => {
    if (priorityFilter !== "all" && issue.priority !== priorityFilter) return false;
    if (needle && !issue.title.toLowerCase().includes(needle) && !issue.description.toLowerCase().includes(needle)) return false;
    return true;
  });
  const filteredGrouped = groupIssuesByStatus(filteredIssues);
  const filteredTotal = filteredIssues.length;
  const isFiltered = needle !== "" || priorityFilter !== "all";

  return (
    <section className="review-issue-board">
      <IssueGardenFilter
        searchText={searchText}
        priorityFilter={priorityFilter}
        totalCount={totalIssues}
        filteredCount={filteredTotal}
        isFiltered={isFiltered}
        onSearchChange={setSearchText}
        onPriorityChange={setPriorityFilter}
        onClear={() => { setSearchText(""); setPriorityFilter("all"); }}
      />
      <div className="review-issue-board-columns">
        {ISSUE_STATUS_ORDER.map((status) => {
          const columnIssues = filteredGrouped[status];
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
                  <p className="review-issue-column-empty">{isFiltered ? "일치 없음" : "없음"}</p>
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

const PRIORITY_FILTER_OPTIONS: Array<{ value: Priority | "all"; label: string }> = [
  { value: "all", label: "전체" },
  { value: "high", label: "높음" },
  { value: "medium", label: "보통" },
  { value: "low", label: "낮음" },
];

function IssueGardenFilter({
  searchText,
  priorityFilter,
  totalCount,
  filteredCount,
  isFiltered,
  onSearchChange,
  onPriorityChange,
  onClear,
}: {
  searchText: string;
  priorityFilter: Priority | "all";
  totalCount: number;
  filteredCount: number;
  isFiltered: boolean;
  onSearchChange: (text: string) => void;
  onPriorityChange: (priority: Priority | "all") => void;
  onClear: () => void;
}) {
  return (
    <div className="review-issue-filter" role="search" aria-label="이슈 필터">
      <label className="review-issue-filter-search">
        <Search size={13} aria-hidden="true" className="review-issue-filter-icon" />
        <input
          type="search"
          placeholder="이슈 제목 또는 내용 검색..."
          value={searchText}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label="이슈 검색"
        />
        {searchText ? (
          <button
            type="button"
            className="review-issue-filter-clear-input"
            onClick={() => onSearchChange("")}
            aria-label="검색어 지우기"
          >
            <X size={12} />
          </button>
        ) : null}
      </label>
      <div className="review-issue-filter-priority" role="group" aria-label="우선순위 필터">
        {PRIORITY_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`review-issue-filter-pill ${priorityFilter === opt.value ? "is-active" : ""}`}
            onClick={() => onPriorityChange(opt.value)}
            aria-pressed={priorityFilter === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {isFiltered ? (
        <span className="review-issue-filter-count" aria-live="polite">
          {filteredCount}/{totalCount}건
          <button
            type="button"
            className="review-issue-filter-reset"
            onClick={onClear}
            title="필터 초기화"
          >
            <X size={11} aria-hidden="true" />
            초기화
          </button>
        </span>
      ) : (
        <span className="review-issue-filter-count muted">{totalCount}건</span>
      )}
    </div>
  );
}

type DecisionSortField = "title" | "createdAt" | "importance" | "status";
type SortDir = "asc" | "desc";

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortDecisions(
  decisions: ReturnType<typeof selectSessionView>["decisions"],
  field: DecisionSortField,
  dir: SortDir,
) {
  const sorted = [...decisions].sort((a, b) => {
    let cmp = 0;
    if (field === "title") {
      cmp = a.title.localeCompare(b.title, "ko");
    } else if (field === "createdAt") {
      cmp = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    } else if (field === "importance") {
      cmp = (PRIORITY_RANK[a.importance] ?? 9) - (PRIORITY_RANK[b.importance] ?? 9);
    } else if (field === "status") {
      // confirmed first
      cmp = (b.confirmed ? 1 : 0) - (a.confirmed ? 1 : 0);
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
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
  const [sortField, setSortField] = useState<DecisionSortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(field: DecisionSortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "createdAt" ? "desc" : "asc");
    }
  }

  if (decisions.length === 0) {
    return (
      <EmptyState
        icon={Table2}
        title="아직 결정이 없습니다"
        description="Quick Pass가 결정을 추출하면 근거 · 영향과 함께 표로 표시됩니다."
      />
    );
  }

  const sorted = sortDecisions(decisions, sortField, sortDir);

  return (
    <section className="review-decision-log">
      <div className="review-table-wrap">
        <table>
          <thead>
            <tr>
              <SortableHeader label="결정" field="title" active={sortField} dir={sortDir} onSort={handleSort} />
              <SortableHeader label="시각" field="createdAt" active={sortField} dir={sortDir} onSort={handleSort} />
              <SortableHeader label="중요도" field="importance" active={sortField} dir={sortDir} onSort={handleSort} />
              <th scope="col">근거</th>
              <SortableHeader label="상태" field="status" active={sortField} dir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((decision) => (
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

function SortableHeader({
  label,
  field,
  active,
  dir,
  onSort,
}: {
  label: string;
  field: DecisionSortField;
  active: DecisionSortField;
  dir: SortDir;
  onSort: (field: DecisionSortField) => void;
}) {
  const isActive = field === active;
  const Icon = isActive ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" className="sortable-th">
      <button
        type="button"
        className={`sort-th-btn ${isActive ? "is-active" : ""}`}
        onClick={() => onSort(field)}
        aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <Icon size={12} aria-hidden="true" />
      </button>
    </th>
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
      <EmptyState
        icon={ListChecks}
        title="다음 액션이 없습니다"
        description={
          hasAnalysis
            ? "제안 탭에서 이슈의 추천 작업을 다음 액션으로 승격할 수 있습니다."
            : "Quick Pass를 실행하면 추천 다음 액션 후보가 표시됩니다."
        }
      />
    );
  }
  const progress = countNextActionCompletion(actions);
  const { pending, completed } = splitNextActionsByCompletion(actions);
  const ordered = [...pending, ...completed];
  return (
    <section className="review-next-actions">
      <header className="review-list-head">
        <span className="review-list-progress">
          <Badge tone="orange">진행 {progress.pending}</Badge>
          <Badge tone="green">완료 {progress.completed}</Badge>
        </span>
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
      <EmptyState
        icon={Activity}
        title="처리되지 않은 항목이 없습니다"
        description="추가로 검토할 Open · 미확정 · 낮은 신뢰도 항목이 없습니다."
      />
    );
  }
  return (
    <section className="review-unresolved">
      <ul className="review-unresolved-list">
        {items.map((item) => {
          const reasonLabel = UNRESOLVED_REASON_LABEL[item.reason];
          if (item.kind === "issue") {
            const issue = item.issue;
            const selected = selection.kind === "issue" && selection.issueId === issue.id;
            return (
              <li key={`issue-${issue.id}`} className={`review-unresolved-item ${selected ? "is-selected" : ""}`}>
                <button type="button" onClick={() => onSelectIssue(issue.id)}>
                  <span className="review-unresolved-type-icon" aria-hidden="true">
                    <KanbanSquare size={13} />
                  </span>
                  <span className="review-unresolved-body">
                    <span className="review-unresolved-head">
                      <strong>{issue.title}</strong>
                      <Badge tone={issueStatusTone(issue.status)}>{reasonLabel}</Badge>
                      <Badge tone={priorityTone(issue.priority)}>{priorityLabels[issue.priority]}</Badge>
                    </span>
                    {issue.description ? <span className="review-unresolved-desc">{issue.description}</span> : null}
                  </span>
                </button>
              </li>
            );
          }
          if (item.kind === "decision") {
            const decision = item.decision;
            const selected = selection.kind === "decision" && selection.decisionId === decision.id;
            return (
              <li key={`decision-${decision.id}`} className={`review-unresolved-item ${selected ? "is-selected" : ""}`}>
                <button type="button" onClick={() => onSelectDecision(decision.id)}>
                  <span className="review-unresolved-type-icon" aria-hidden="true">
                    <GitBranch size={13} />
                  </span>
                  <span className="review-unresolved-body">
                    <span className="review-unresolved-head">
                      <strong>{decision.title}</strong>
                      <Badge tone="orange">{reasonLabel}</Badge>
                      <Badge tone={priorityTone(decision.importance)}>{priorityLabels[decision.importance]}</Badge>
                    </span>
                    {decision.decision ? <span className="review-unresolved-desc">{decision.decision}</span> : null}
                  </span>
                </button>
              </li>
            );
          }
          const action = item.nextAction;
          const selected = selection.kind === "nextAction" && selection.nextActionId === action.id;
          return (
            <li key={`na-${action.id}`} className={`review-unresolved-item ${selected ? "is-selected" : ""}`}>
              <button type="button" onClick={() => onSelectNextAction(action.id)}>
                <span className="review-unresolved-type-icon" aria-hidden="true">
                  <ListChecks size={13} />
                </span>
                <span className="review-unresolved-body">
                  <span className="review-unresolved-head">
                    <strong>{action.title}</strong>
                    <Badge tone="gray">{reasonLabel}</Badge>
                    <Badge tone={priorityTone(action.priority)}>{priorityLabels[action.priority]}</Badge>
                  </span>
                  <span className="review-unresolved-desc">다음 액션 후보</span>
                </span>
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
      <EmptyState
        icon={Sparkles}
        title="Quick Pass 분석 후 추천이 표시됩니다"
        description="각 이슈에 대해 제안된 다음 액션을 한 곳에서 검토할 수 있습니다."
      />
    );
  }
  if (suggestions.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="추천된 액션이 없습니다"
        description={`${providerLabel ?? "Quick Pass"}는 이번 세션에서 별도의 다음 액션 제안을 만들지 않았습니다.`}
      />
    );
  }
  const pendingCount = suggestions.filter((item) => !item.promotedNextActionId).length;
  return (
    <section className="review-suggestions">
      <header className="review-list-head">
        <span className="review-list-progress">
          <Badge tone="purple">승격 대기 {pendingCount}</Badge>
        </span>
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
