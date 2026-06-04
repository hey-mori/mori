import {
  Check,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Eye,
  Filter,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  SquareCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { EmptyState } from "../../components/layout/EmptyState";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { Button } from "../../components/ui/Button";
import { SearchField } from "../../components/ui/SearchField";
import type { Decision, Issue, IssueStatus, NextAction, Priority } from "../../domain/types";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { getQuickPassFallbackNotice } from "../../lib/analysis/analysisStatusDisplay";
import { getReportEvidenceSummary } from "../../lib/sources/traceability";
import {
  isNextActionCompleted,
  splitNextActionsByCompletion,
} from "../../lib/session/nextActionCompletion";
import {
  getUnresolvedItems,
  issueStatusTone,
  priorityTone,
  type ReviewSelection,
} from "../../lib/review-workspace/reviewWorkspace";
import { ReviewDetailPanel } from "./ReviewDetailPanel";
import { AnalysisRunHistoryPanel } from "./AnalysisRunHistoryPanel";
import { formatDateTime } from "../../lib/formatting/time";

type ReviewColumn = "issue" | "decision" | "nextAction";

const REVIEW_COLUMN_LABELS: Record<ReviewColumn, string> = {
  issue: "이슈",
  decision: "결정",
  nextAction: "다음 액션",
};

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
  const analysisFallbackUsed = useSessionStore((state) => state.analysisFallbackUsed);
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
  const openSettingsSheet = useAppStore((state) => state.openSettingsSheet);
  const setSelectedEventId = useAppStore((state) => state.setSelectedEventId);
  const reviewFocus = useAppStore((state) => state.reviewFocus);
  const clearReviewFocus = useAppStore((state) => state.clearReviewFocus);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const [selection, setSelection] = useState<ReviewSelection | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeColumns, setActiveColumns] = useState<ReviewColumn[]>([]);

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
  // Keep selection in sync with the active view. The board now opens without a
  // default inspector; detail appears only after a user click or a deep link.
  const activeSelection: ReviewSelection = (() => {
    if (!selection) return { kind: "none" };
    if (selection.kind === "issue" && !view.issues.some((i) => i.id === selection.issueId)) {
      return { kind: "none" };
    }
    if (selection.kind === "decision" && !view.decisions.some((d) => d.id === selection.decisionId)) {
      return { kind: "none" };
    }
    if (selection.kind === "nextAction" && !view.nextActions.some((a) => a.id === selection.nextActionId)) {
      return { kind: "none" };
    }
    return selection;
  })();

  const isDemo = mode === "demo";
  const canRunQuickPass = imports.length > 0 && analysisStatus !== "running";
  const showQuickPassEmpty = mode === "draft" && !hasAnalysis;

  const matchesQuery = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return () => true;
    return (haystack: string) => haystack.toLowerCase().includes(query);
  }, [searchQuery]);

  const visibleIssues = useMemo(() => {
    const showColumn = activeColumns.length === 0 || activeColumns.includes("issue");
    if (!showColumn) return [];
    return view.issues.filter((issue) => matchesQuery(`${issue.title} ${issue.description ?? ""}`));
  }, [view.issues, activeColumns, matchesQuery]);
  const visibleDecisions = useMemo(() => {
    const showColumn = activeColumns.length === 0 || activeColumns.includes("decision");
    if (!showColumn) return [];
    return view.decisions.filter((decision) =>
      matchesQuery(`${decision.title} ${decision.decision ?? ""}`),
    );
  }, [view.decisions, activeColumns, matchesQuery]);
  const visibleNextActions = useMemo(() => {
    const showColumn = activeColumns.length === 0 || activeColumns.includes("nextAction");
    if (!showColumn) return [];
    return view.nextActions.filter((action) => matchesQuery(action.title));
  }, [view.nextActions, activeColumns, matchesQuery]);

  const sortedIssues = useMemo(() => sortIssues(visibleIssues), [visibleIssues]);
  const sortedDecisions = useMemo(() => sortDecisions(visibleDecisions), [visibleDecisions]);
  const sortedNextActions = useMemo(() => sortNextActions(visibleNextActions), [visibleNextActions]);
  const pendingActionCount = useMemo(
    () => view.nextActions.filter((action) => !isNextActionCompleted(action)).length,
    [view.nextActions],
  );
  const openIssueCount = useMemo(
    () => view.issues.filter((issue) => issue.status === "open" || issue.status === "inProgress").length,
    [view.issues],
  );
  const unconfirmedDecisionCount = useMemo(
    () => view.decisions.filter((decision) => !decision.confirmed).length,
    [view.decisions],
  );

  function handleShowTimeline(eventId: string) {
    setSelectedEventId(eventId);
    setCurrentView("timeline");
  }

  function toggleSelection(next: ReviewSelection) {
    setSelection(isSameReviewSelection(activeSelection, next) ? null : next);
  }

  const quickPassButton = !isDemo ? (
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
  ) : null;

  const totalReviewItems =
    view.issues.length + view.decisions.length + view.nextActions.length;
  const toolbar =
    totalReviewItems > 0 ? (
      <ReviewToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeColumns={activeColumns}
        onToggleColumn={(column) =>
          setActiveColumns((current) =>
            current.includes(column)
              ? current.filter((entry) => entry !== column)
              : [...current, column],
          )
        }
        onClearFilters={() => {
          setSearchQuery("");
          setActiveColumns([]);
        }}
        confirmCount={unresolved.length}
        issueCount={openIssueCount}
        decisionCount={unconfirmedDecisionCount}
        actionCount={pendingActionCount}
        totalIssueCount={view.issues.length}
        totalDecisionCount={view.decisions.length}
        totalNextActionCount={view.nextActions.length}
        quickPassButton={quickPassButton}
      />
    ) : null;

  const aside = (
    <ReviewDetailPanel
      selection={activeSelection}
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

  const filterColumnsActive = activeColumns.length > 0;
  const showIssueColumn = !filterColumnsActive || activeColumns.includes("issue");
  const showDecisionColumn = !filterColumnsActive || activeColumns.includes("decision");
  const showActionColumn = !filterColumnsActive || activeColumns.includes("nextAction");
  const canWrite = !isDemo;
  const issueProgress = `열림 ${openIssueCount} · 해결 ${view.issues.filter((i) => i.status === "resolved").length}`;
  const decisionProgress = `확정 ${view.decisions.filter((d) => d.confirmed).length} / ${view.decisions.length}`;
  const actionProgress = `완료 ${view.nextActions.length - pendingActionCount} / ${view.nextActions.length}`;
  const board = (
    <section className="review-issue-board">
      <div className="review-issue-board-columns review-board-columns">
        {showIssueColumn ? (
          <ReviewBoardColumn
            label="이슈"
            tone="orange"
            count={view.issues.length}
            progress={view.issues.length > 0 ? issueProgress : undefined}
          >
            {sortedIssues.length === 0 ? (
              <ColumnEmpty label="이슈 없음" />
            ) : (
              sortedIssues.map((issue) => (
                <IssueBoardCard
                  key={issue.id}
                  issue={issue}
                  canWrite={canWrite}
                  selected={activeSelection.kind === "issue" && activeSelection.issueId === issue.id}
                  onSelect={() => toggleSelection({ kind: "issue", issueId: issue.id })}
                  onSetStatus={(status) => setIssueStatus(issue.id, status)}
                />
              ))
            )}
          </ReviewBoardColumn>
        ) : null}

        {showDecisionColumn ? (
          <ReviewBoardColumn
            label="결정"
            tone="blue"
            count={view.decisions.length}
            progress={view.decisions.length > 0 ? decisionProgress : undefined}
          >
            {sortedDecisions.length === 0 ? (
              <ColumnEmpty label="결정 없음" />
            ) : (
              sortedDecisions.map((decision) => (
                <DecisionBoardCard
                  key={decision.id}
                  decision={decision}
                  canWrite={canWrite}
                  selected={
                    activeSelection.kind === "decision" &&
                    activeSelection.decisionId === decision.id
                  }
                  onSelect={() => toggleSelection({ kind: "decision", decisionId: decision.id })}
                  onSetConfirmed={(confirmed) => setDecisionConfirmed(decision.id, confirmed)}
                />
              ))
            )}
          </ReviewBoardColumn>
        ) : null}

        {showActionColumn ? (
          <ReviewBoardColumn
            label="다음 액션"
            tone="green"
            count={view.nextActions.length}
            progress={view.nextActions.length > 0 ? actionProgress : undefined}
          >
            {sortedNextActions.length === 0 ? (
              <ColumnEmpty label="다음 액션 없음" />
            ) : (
              sortedNextActions.map((action) => (
                <NextActionBoardCard
                  key={action.id}
                  action={action}
                  canWrite={canWrite}
                  selected={
                    activeSelection.kind === "nextAction" &&
                    activeSelection.nextActionId === action.id
                  }
                  onSelect={() => toggleSelection({ kind: "nextAction", nextActionId: action.id })}
                  onSetCompletion={(completed) => setNextActionCompletion(action.id, completed)}
                />
              ))
            )}
          </ReviewBoardColumn>
        ) : null}
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
        fallbackUsed={analysisFallbackUsed}
        notes={analysis?.notes ?? []}
        importsCount={imports.length}
        dataBasis={dataBasis}
        onGoToEvidence={() => setCurrentView("evidence")}
        onGoToSettings={() => openSettingsSheet("localAi")}
      />

      {toolbar}

      <AnalysisRunHistoryPanel />

      {showQuickPassEmpty ? (
        <EmptyState
          icon={Sparkles}
          title="Quick Pass를 실행하면 검토 항목이 생성됩니다"
          description={
            imports.length > 0
              ? "가져온 소스와 타임라인 이벤트로 이슈 · 결정 · 다음 액션을 추출합니다."
              : "먼저 자료 탭에서 가져온 뒤 분석을 실행하세요."
          }
          actions={
            imports.length > 0 ? (
              <Button variant="primary" icon={Sparkles} onClick={() => runQuickPass()} disabled={!canRunQuickPass}>
                Quick Pass 실행
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setCurrentView("evidence")}>
                자료 탭으로 이동
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

  const showAside = activeSelection.kind !== "none";

  return (
    <div className="session-tab-pane session-tab-insights">
      <div className={`session-tab-split review-tab-canvas${showAside ? "" : " is-collapsed"}`}>
        <div className="session-tab-main">{body}</div>
        {showAside ? (
          <div className="review-inspector-shell" aria-label="선택 항목 상세">
            <header className="review-inspector-shell-head">
              <span>선택 항목</span>
              <button
                type="button"
                className="review-inspector-close"
                aria-label="상세 닫기"
                onClick={() => setSelection(null)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </header>
            {aside}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Tab toolbar ──────────────────────────────────────────────────────────────

/**
 * Replaces the deprecated ActionBar + "검토 보드 / N개 항목" header. Search and a
 * column filter live on the left, the confirm / issue / decision / action
 * counts (formerly the dl strip) live on the right, the Quick Pass button
 * stays anchored to the far end so it never moves.
 */
function ReviewToolbar({
  searchQuery,
  onSearchChange,
  activeColumns,
  onToggleColumn,
  onClearFilters,
  confirmCount,
  issueCount,
  decisionCount,
  actionCount,
  totalIssueCount,
  totalDecisionCount,
  totalNextActionCount,
  quickPassButton,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeColumns: ReviewColumn[];
  onToggleColumn: (column: ReviewColumn) => void;
  onClearFilters: () => void;
  confirmCount: number;
  issueCount: number;
  decisionCount: number;
  actionCount: number;
  totalIssueCount: number;
  totalDecisionCount: number;
  totalNextActionCount: number;
  quickPassButton: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const filterActive = searchQuery.trim().length > 0 || activeColumns.length > 0;

  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (!popRef.current) return;
      if (!popRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const columns: { id: ReviewColumn; total: number }[] = [
    { id: "issue", total: totalIssueCount },
    { id: "decision", total: totalDecisionCount },
    { id: "nextAction", total: totalNextActionCount },
  ];

  return (
    <div className="tab-toolbar" role="toolbar" aria-label="검토 도구">
      <SearchField
        value={searchQuery}
        onChange={onSearchChange}
        ariaLabel="검토 항목 검색"
        className="tab-toolbar-search"
      />
      <span className="tab-toolbar-spacer" aria-hidden="true" />
      <div className="tab-toolbar-right">
        <dl className="tab-toolbar-metrics" aria-label="검토 요약">
          <div className={`tab-toolbar-metric ${confirmCount === 0 ? "is-zero" : "tone-orange"}`}>
            <dt>확인</dt>
            <dd>{confirmCount}</dd>
          </div>
          <div className={`tab-toolbar-metric ${issueCount === 0 ? "is-zero" : "tone-orange"}`}>
            <dt>이슈</dt>
            <dd>{issueCount}</dd>
          </div>
          <div className={`tab-toolbar-metric ${decisionCount === 0 ? "is-zero" : "tone-blue"}`}>
            <dt>결정</dt>
            <dd>{decisionCount}</dd>
          </div>
          <div className={`tab-toolbar-metric ${actionCount === 0 ? "is-zero" : "tone-green"}`}>
            <dt>액션</dt>
            <dd>{actionCount}</dd>
          </div>
        </dl>
        <div className="toolbar-pop-wrap" ref={popRef}>
          <button
            type="button"
            className={`toolbar-toggle ${activeColumns.length ? "is-active" : ""}`}
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="review-filter-popover"
            aria-label="검토 카테고리 필터"
          >
            <Filter size={14} aria-hidden="true" />
            {activeColumns.length ? `필터 · ${activeColumns.length}` : "필터"}
          </button>
          {open ? (
            <div
              className="filter-popover"
              id="review-filter-popover"
              role="dialog"
              aria-label="검토 카테고리 필터"
            >
              <header>
                <span>카테고리</span>
                <button
                  type="button"
                  className="filter-popover-clear"
                  onClick={() => {
                    onClearFilters();
                    setOpen(false);
                  }}
                  disabled={!filterActive}
                >
                  지우기
                </button>
              </header>
              <ul>
                {columns.map((column) => {
                  const active = activeColumns.includes(column.id);
                  return (
                    <li key={column.id}>
                      <button
                        type="button"
                        className={`filter-pop-item ${active ? "active" : ""}`}
                        aria-pressed={active}
                        onClick={() => onToggleColumn(column.id)}
                      >
                        <span className="filter-pop-label">{REVIEW_COLUMN_LABELS[column.id]}</span>
                        <span className="filter-pop-count">{column.total}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
        {quickPassButton}
      </div>
    </div>
  );
}

// ─── Board primitives ─────────────────────────────────────────────────────────

function ReviewBoardColumn({
  label,
  tone,
  count,
  progress,
  children,
}: {
  label: string;
  tone: "orange" | "blue" | "green";
  count: number;
  progress?: string;
  children: ReactNode;
}) {
  return (
    <article className={`review-issue-column review-tone-${tone}`}>
      <header>
        <span className="review-issue-column-label">
          <span className="review-issue-column-dot" aria-hidden="true" />
          <span>{label}</span>
          <strong>{count}</strong>
        </span>
        {progress ? <small className="review-issue-column-progress">{progress}</small> : null}
      </header>
      <div className="review-issue-column-list">{children}</div>
    </article>
  );
}

function ColumnEmpty({ label }: { label: string }) {
  return <p className="review-issue-column-empty">{label}</p>;
}

/**
 * Calm card primitive shared by 이슈 / 결정 / 다음 액션. Layout:
 *   ┌─────────────────────────────────────────┐
 *   │ ● 제목 (leading status glyph + title) ⚐ │
 *   │ 요약 두 줄까지                          │
 *   │ [상태 칩]   근거 N · 연결 M             │
 *   └─────────────────────────────────────────┘
 *
 * The kicker label ("검토 이슈" / "결정 후보" / "다음 작업") is removed —
 * the column header already says what kind a card is, so repeating it on
 * every card is duplicated chrome.
 * Quick actions float at the top-right of the card on hover for one-click
 * confirm / resolve / complete.
 */
function ReviewBoardCard({
  title,
  subtitle,
  leading,
  stateChip,
  metaText,
  priority,
  edited,
  muted,
  quickActions,
  selected,
  onSelect,
}: {
  title: string;
  subtitle?: string;
  leading: ReactNode;
  stateChip: ReactNode;
  metaText?: string;
  priority?: Priority;
  edited?: boolean;
  muted?: boolean;
  quickActions?: ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={
        "review-issue-card" +
        (priority ? ` priority-${priority}` : "") +
        (muted ? " is-muted" : "") +
        (selected ? " is-selected" : "")
      }
      aria-current={selected ? "true" : undefined}
    >
      <button
        type="button"
        className="review-board-card-button"
        aria-pressed={selected}
        aria-label={title}
        onClick={onSelect}
      >
        <div className="review-card-head-row">
          <span className="review-card-leading" aria-hidden="true">
            {leading}
          </span>
          <span className="review-card-title">{title}</span>
          {priority === "high" ? (
            <span className="review-card-priority-flag" aria-label="우선 높음" title="우선 높음">
              높음
            </span>
          ) : null}
          {edited ? (
            <span className="review-card-edited" aria-label="사용자가 수정함" title="사용자가 수정함" />
          ) : null}
        </div>
        {subtitle ? <p className="review-card-summary">{subtitle}</p> : null}
        <footer className="review-card-meta-row">
          {stateChip}
          {metaText ? <span className="review-card-meta-text">{metaText}</span> : null}
        </footer>
      </button>
      {quickActions ? (
        <div className="review-card-quick-actions" role="group" aria-label="빠른 작업">
          {quickActions}
        </div>
      ) : null}
    </article>
  );
}

function IssueStatusGlyph({ status }: { status: IssueStatus }) {
  switch (status) {
    case "resolved":
      return <CheckCircle2 size={14} className="status-glyph status-resolved" />;
    case "inProgress":
      return <Loader2 size={14} className="status-glyph status-inProgress" />;
    case "watching":
      return <Eye size={14} className="status-glyph status-watching" />;
    case "open":
    default:
      return <CircleDot size={14} className="status-glyph status-open" />;
  }
}

function buildIssueMeta(issue: Issue): string | undefined {
  const evidence = issue.sourceEventIds?.length ?? 0;
  const linked = (issue.relatedDecisionIds?.length ?? 0) + (issue.relatedFileIds?.length ?? 0);
  const parts: string[] = [];
  if (evidence > 0) parts.push(`근거 ${evidence}`);
  if (linked > 0) parts.push(`연결 ${linked}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function buildDecisionMeta(decision: Decision): string | undefined {
  const evidence = decision.sourceEventIds?.length ?? 0;
  const impact = decision.impact?.length ?? 0;
  const parts: string[] = [];
  if (evidence > 0) parts.push(`근거 ${evidence}`);
  if (impact > 0) parts.push(`영향 ${impact}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function buildActionMeta(action: NextAction): string | undefined {
  const issues = action.relatedIssueIds?.length ?? 0;
  return issues > 0 ? `이슈 ${issues}` : undefined;
}

function stopAnd(handler: () => void) {
  return (event: ReactMouseEvent) => {
    event.stopPropagation();
    handler();
  };
}

function IssueBoardCard({
  issue,
  selected,
  canWrite,
  onSelect,
  onSetStatus,
}: {
  issue: Issue;
  selected: boolean;
  canWrite: boolean;
  onSelect: () => void;
  onSetStatus: (status: IssueStatus) => void;
}) {
  // "open" is the column's default state — the leading status glyph already
  // says so, and the column header carries the count. Skip the chip for
  // default state so each card only flags genuinely informative transitions
  // (진행 · 관찰 · 해결).
  const stateChip = issue.status === "open" ? null : (
    <span className={`review-card-state tone-${issueStatusTone(issue.status)}`}>
      {ISSUE_STATUS_CARD_LABELS[issue.status]}
    </span>
  );
  const isResolved = issue.status === "resolved";
  const quickActions = canWrite ? (
    isResolved ? (
      <button
        type="button"
        className="review-card-quick"
        onClick={stopAnd(() => onSetStatus("open"))}
        title="다시 열기"
      >
        <RotateCcw size={12} aria-hidden="true" />
        다시 열기
      </button>
    ) : (
      <>
        <button
          type="button"
          className="review-card-quick is-primary"
          onClick={stopAnd(() => onSetStatus("resolved"))}
          title="해결로 표시"
        >
          <Check size={12} aria-hidden="true" />
          해결
        </button>
        {issue.status !== "watching" ? (
          <button
            type="button"
            className="review-card-quick"
            onClick={stopAnd(() => onSetStatus("watching"))}
            title="관찰로 표시"
          >
            <Eye size={12} aria-hidden="true" />
            관찰
          </button>
        ) : null}
      </>
    )
  ) : null;
  return (
    <ReviewBoardCard
      title={issue.title}
      subtitle={issue.description}
      leading={<IssueStatusGlyph status={issue.status} />}
      stateChip={stateChip}
      metaText={buildIssueMeta(issue)}
      priority={issue.priority}
      edited={issue.editedByUser}
      muted={isResolved}
      quickActions={quickActions}
      selected={selected}
      onSelect={onSelect}
    />
  );
}

function DecisionBoardCard({
  decision,
  selected,
  canWrite,
  onSelect,
  onSetConfirmed,
}: {
  decision: Decision;
  selected: boolean;
  canWrite: boolean;
  onSelect: () => void;
  onSetConfirmed: (confirmed: boolean) => void;
}) {
  // Unconfirmed is the column default ("확정 0/N"). Only flag the confirmed
  // transition so the chip carries new information.
  const stateChip = decision.confirmed ? (
    <span className="review-card-state tone-green">확정</span>
  ) : null;
  const quickActions = canWrite ? (
    decision.confirmed ? (
      <button
        type="button"
        className="review-card-quick"
        onClick={stopAnd(() => onSetConfirmed(false))}
        title="확정 취소"
      >
        <RotateCcw size={12} aria-hidden="true" />
        재검토
      </button>
    ) : (
      <button
        type="button"
        className="review-card-quick is-primary"
        onClick={stopAnd(() => onSetConfirmed(true))}
        title="확정"
      >
        <Check size={12} aria-hidden="true" />
        확정
      </button>
    )
  ) : null;
  return (
    <ReviewBoardCard
      title={decision.title}
      subtitle={decision.decision}
      leading={
        decision.confirmed ? (
          <CheckCircle2 size={14} className="status-glyph status-confirmed" />
        ) : (
          <CircleDashed size={14} className="status-glyph status-pending" />
        )
      }
      stateChip={stateChip}
      metaText={buildDecisionMeta(decision)}
      priority={decision.importance}
      edited={decision.editedByUser}
      muted={false}
      quickActions={quickActions}
      selected={selected}
      onSelect={onSelect}
    />
  );
}

function NextActionBoardCard({
  action,
  selected,
  canWrite,
  onSelect,
  onSetCompletion,
}: {
  action: NextAction;
  selected: boolean;
  canWrite: boolean;
  onSelect: () => void;
  onSetCompletion: (completed: boolean) => void;
}) {
  const done = isNextActionCompleted(action);
  // 할 일 is the column default ("완료 0/N"). Only flag the completed state so
  // the chip is a transition signal, not noise.
  const stateChip = done ? (
    <span className="review-card-state tone-green">완료</span>
  ) : null;
  // The leading affordance for a next action is the checkbox itself — clicking
  // it toggles completion without opening the inspector.
  const leading = canWrite ? (
    <button
      type="button"
      className={`review-card-checkbox${done ? " is-done" : ""}`}
      onClick={stopAnd(() => onSetCompletion(!done))}
      aria-pressed={done}
      aria-label={done ? "완료 취소" : "완료로 표시"}
      title={done ? "완료 취소" : "완료로 표시"}
    >
      {done ? <SquareCheck size={16} aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}
    </button>
  ) : done ? (
    <SquareCheck size={14} className="status-glyph status-done" />
  ) : (
    <Square size={14} className="status-glyph status-pending" />
  );
  const quickActions = canWrite && !done ? (
    <button
      type="button"
      className="review-card-quick is-primary"
      onClick={stopAnd(() => onSetCompletion(true))}
      title="완료로 표시"
    >
      <Check size={12} aria-hidden="true" />
      완료
    </button>
  ) : canWrite && done ? (
    <button
      type="button"
      className="review-card-quick"
      onClick={stopAnd(() => onSetCompletion(false))}
      title="완료 취소"
    >
      <RotateCcw size={12} aria-hidden="true" />
      되돌리기
    </button>
  ) : null;
  return (
    <ReviewBoardCard
      title={action.title}
      leading={leading}
      stateChip={stateChip}
      metaText={buildActionMeta(action)}
      priority={action.priority}
      edited={action.editedByUser}
      muted={done}
      quickActions={quickActions}
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
const ISSUE_STATUS_CARD_LABELS: Record<IssueStatus, string> = {
  open: "열림",
  inProgress: "진행",
  resolved: "해결",
  watching: "관찰",
};
const PRIORITY_CARD_LABELS: Record<Priority, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

function isSameReviewSelection(a: ReviewSelection, b: ReviewSelection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "issue" && b.kind === "issue") return a.issueId === b.issueId;
  if (a.kind === "decision" && b.kind === "decision") return a.decisionId === b.decisionId;
  if (a.kind === "nextAction" && b.kind === "nextAction") {
    return a.nextActionId === b.nextActionId;
  }
  return a.kind === "none";
}

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
  fallbackUsed,
  notes,
  importsCount,
  dataBasis,
  onGoToEvidence,
  onGoToSettings,
}: {
  mode: "demo" | "draft";
  hasAnalysis: boolean;
  status: string;
  providerLabel: string | null;
  providerName: string | null;
  analysisGeneratedAt: string | null;
  error: string | null;
  fallbackUsed: boolean;
  notes: readonly string[];
  importsCount: number;
  dataBasis: string;
  onGoToEvidence: () => void;
  onGoToSettings: () => void;
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
        actions={<Button onClick={onGoToEvidence}>자료 탭으로 이동</Button>}
      >
        자료 탭에서 추가하고 Quick Pass를 실행하면 이슈와 결정이 정리됩니다.
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
  const providerKind =
    providerName === "ollama-quick-pass-v1"
      ? "로컬 LLM"
      : providerName === "openai-compatible-quick-pass-v1"
        ? "OpenAI 호환 LLM"
        : "휴리스틱";

  // A fallback-from-failure (the local LLM errored and the run fell back to
  // the heuristic) is surfaced as a warning, not a calm success line, so the
  // user knows the rich output they expected did not run. Detect it from the
  // persisted notes so it survives a reload, or from the live flag.
  const fallbackNotice =
    getQuickPassFallbackNotice(notes) ??
    (fallbackUsed
      ? "로컬 LLM 분석에 실패해 규칙 기반(휴리스틱) 결과를 표시하고 있습니다. 설정에서 엔진과 모델 이름을 확인하세요."
      : null);

  const metaLine = (
    <span className="review-analysis-meta">
      {providerCopy} · {providerKind}
      {analysisGeneratedAt ? ` · ${formatDateTime(analysisGeneratedAt)}` : ""} · {dataBasis}
    </span>
  );

  if (fallbackNotice) {
    return (
      <NoticeBanner
        tone="warning"
        title="로컬 LLM 분석 실패 · 규칙 기반으로 표시 중"
        actions={<Button onClick={onGoToSettings}>엔진 설정 확인</Button>}
      >
        {fallbackNotice}
        <br />
        {metaLine}
      </NoticeBanner>
    );
  }

  return (
    <NoticeBanner tone="success" icon={null}>
      {metaLine}
    </NoticeBanner>
  );
}
