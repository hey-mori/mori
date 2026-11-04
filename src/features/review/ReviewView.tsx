import {
  Check,
  Circle,
  CircleCheck,
  CircleDashed,
  Eye,
  Filter,
  ListPlus,
  RotateCcw,
  Sparkles,
  Square,
  SquareCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
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
import {
  isNextActionCompleted,
  splitNextActionsByCompletion,
} from "../../lib/session/nextActionCompletion";
import {
  type ReviewSelection,
} from "../../lib/review-workspace/reviewWorkspace";
import { SessionEmptyPrompt } from "../session/SessionEmptyPrompt";
import { ReviewDetailPanel } from "./ReviewDetailPanel";
import { nextActionsWorthShowing, summaryBesideTitle } from "./reviewRepeats";

type ReviewColumn = "issue" | "decision" | "nextAction";

const REVIEW_COLUMN_LABELS: Record<ReviewColumn, string> = {
  issue: "이슈",
  decision: "결정",
  nextAction: "다음 액션",
};

/**
 * Review workspace — the **정리** section inside the unified Analysis surface.
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
  const focusTimelineEvent = useAppStore((state) => state.focusTimelineEvent);
  const openEvidenceSource = useAppStore((state) => state.openEvidenceSource);
  const reviewFocus = useAppStore((state) => state.reviewFocus);
  const clearReviewFocus = useAppStore((state) => state.clearReviewFocus);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const [selection, setSelection] = useState<ReviewSelection | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeColumns, setActiveColumns] = useState<ReviewColumn[]>([]);
  // A next action that only restates its issue is left to the issue card. The
  // selected one stays, so promoting an issue always lands on a visible card.
  const selectedActionId = selection?.kind === "nextAction" ? selection.nextActionId : undefined;
  const boardNextActions = useMemo(
    () => nextActionsWorthShowing(view.nextActions, view.issues, selectedActionId),
    [view.nextActions, view.issues, selectedActionId],
  );

  // Consume a one-shot deep-link from another surface (e.g. the Timeline event
  // inspector "create issue"): focus the requested item and clear the request.
  useEffect(() => {
    if (!reviewFocus || reviewFocus.kind === "none") return;
    setSelection(reviewFocus);
    clearReviewFocus();
  }, [reviewFocus, clearReviewFocus]);

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
  const running = analysisStatus === "running";
  const canRunAnalysis = mode === "draft" && imports.length > 0 && !running;
  // The focal empty state owns the "not analysed yet" moment; running and
  // failed states are surfaced by the notice instead, so exclude them here.
  const showQuickPassEmpty =
    mode === "draft" &&
    !hasAnalysis &&
    !running &&
    analysisStatus !== "failed";

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
    return boardNextActions.filter((action) => matchesQuery(action.title));
  }, [boardNextActions, activeColumns, matchesQuery]);

  const sortedIssues = useMemo(() => sortIssues(visibleIssues), [visibleIssues]);
  const sortedDecisions = useMemo(() => sortDecisions(visibleDecisions), [visibleDecisions]);
  const sortedNextActions = useMemo(() => sortNextActions(visibleNextActions), [visibleNextActions]);
  function handleShowTimeline(eventId: string) {
    // Land on the event in the 원본 stream (highlighted + scrolled to), not the
    // AI 흐름 summary the 활동 tab would otherwise open on.
    focusTimelineEvent(eventId);
  }

  function toggleSelection(next: ReviewSelection) {
    setSelection(isSameReviewSelection(activeSelection, next) ? null : next);
  }

  const totalReviewItems =
    view.issues.length + view.decisions.length + boardNextActions.length;
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
        totalIssueCount={view.issues.length}
        totalDecisionCount={view.decisions.length}
        totalNextActionCount={boardNextActions.length}
      />
    ) : null;

  const aside = (
    <ReviewDetailPanel
      selection={activeSelection}
      view={view}
      onClose={() => setSelection(null)}
      onShowTimeline={handleShowTimeline}
      onOpenEvidenceSource={openEvidenceSource}
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
  const resolvedIssueCount = view.issues.filter((issue) => issue.status === "resolved").length;
  const openIssueCount = view.issues.length - resolvedIssueCount;
  const confirmedDecisionCount = view.decisions.filter((decision) => decision.confirmed).length;
  const unconfirmedDecisionCount = view.decisions.length - confirmedDecisionCount;
  const completedActionCount = boardNextActions.filter(isNextActionCompleted).length;
  const pendingActionCount = boardNextActions.length - completedActionCount;
  const board = (
    <section className="review-issue-board">
      <div className="review-issue-board-columns review-board-columns">
        {showIssueColumn ? (
          <ReviewBoardColumn
            label="이슈"
            tone="orange"
            count={view.issues.length}
            progress={`${openIssueCount} 열림 · ${resolvedIssueCount} 해결`}
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
            progress={`${unconfirmedDecisionCount} 확인 필요 · ${confirmedDecisionCount} 확정`}
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
            count={boardNextActions.length}
            progress={`${pendingActionCount} 대기 · ${completedActionCount} 완료`}
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

  // An empty board reads as "analyzed, nothing found" — which is wrong before
  // any analysis has run. So the not-yet-analyzed moment gets its own focal
  // empty state instead of the board: either "import something" (no material)
  // or "run analysis" (material present, not analysed). Once analysis
  // has run, the board shows even when a column is empty, so "이슈 없음" then
  // honestly means "analysed, none found".
  const body = showQuickPassEmpty ? (
    imports.length === 0 ? (
      <SessionEmptyPrompt
        title="정리할 소스가 없습니다"
        hint="소스에서 대화를 가져오면 이슈·결정·다음 액션을 추출할 수 있습니다."
        action={
          <Button
            variant="primary"
            size="sm"
            icon={ListPlus}
            onClick={() => setCurrentView("connections")}
          >
            소스에서 가져오기
          </Button>
        }
      />
    ) : (
      <SessionEmptyPrompt
        title="아직 분석하지 않았습니다"
        hint="분석을 실행하면 이슈·결정·다음 액션이 여기에 정리됩니다."
        action={
          <Button
            variant="primary"
            size="sm"
            icon={Sparkles}
            onClick={() => void runQuickPass()}
            disabled={!canRunAnalysis}
          >
            분석 실행
          </Button>
        }
      />
    )
  ) : (
    <>
      <ReviewAnalysisNotice status={analysisStatus} error={analysisError} mode={mode} />

      {toolbar}

      {/* The board (the 3 columns) always renders once analysed, empty or not,
          so the tab shows its shape and an empty column reads honestly. */}
      {board}
    </>
  );

  const showAside = activeSelection.kind !== "none";

  return (
    <div className="session-tab-pane session-tab-insights">
      <div className={`session-tab-split review-tab-canvas${showAside ? "" : " is-collapsed"}`}>
        <div className="session-tab-main">{body}</div>
        {showAside ? aside : null}
      </div>
    </div>
  );
}

// ─── Tab toolbar ──────────────────────────────────────────────────────────────

/**
 * Replaces the deprecated ActionBar + "정리 보드 / N개 항목" header. Search and a
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
  totalIssueCount,
  totalDecisionCount,
  totalNextActionCount,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeColumns: ReviewColumn[];
  onToggleColumn: (column: ReviewColumn) => void;
  onClearFilters: () => void;
  totalIssueCount: number;
  totalDecisionCount: number;
  totalNextActionCount: number;
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
    <div className="tab-toolbar" role="toolbar" aria-label="정리 도구">
      <SearchField
        value={searchQuery}
        onChange={onSearchChange}
        ariaLabel="정리 항목 검색"
        className="tab-toolbar-search"
      />
      <span className="tab-toolbar-spacer" aria-hidden="true" />
      <div className="tab-toolbar-right">
        <div className="toolbar-pop-wrap" ref={popRef}>
          <button
            type="button"
            className={`toolbar-toggle ${activeColumns.length ? "is-active" : ""}`}
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="review-filter-popover"
            aria-label="정리 카테고리 필터"
          >
            <Filter size={14} aria-hidden="true" />
            {activeColumns.length ? `필터 · ${activeColumns.length}` : "필터"}
          </button>
          {open ? (
            <div
              className="filter-popover"
              id="review-filter-popover"
              role="dialog"
              aria-label="정리 카테고리 필터"
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
      <div className="review-issue-column-list base-scroll">{children}</div>
    </article>
  );
}

function ColumnEmpty({ label }: { label: string }) {
  return <p className="review-issue-column-empty">{label}</p>;
}

/**
 * Calm card primitive shared by 이슈 / 결정 / 다음 액션. Layout:
 *   ┌─────────────────────────────────────────┐
 *   │ 제목                              높음 │
 *   │ 요약 두 줄까지                          │
 *   │ 근거 N                                  │
 *   └─────────────────────────────────────────┘
 *
 * The kicker label ("정리된 이슈" / "결정 후보" / "다음 작업") is removed —
 * the column header already says what kind a card is, so repeating it on
 * every card is duplicated chrome.
 * Quick actions float at the top-right of the card on hover for one-click
 * confirm / resolve / complete.
 */
function ReviewBoardCard({
  title,
  summary,
  meta,
  glyph,
  leading,
  priority,
  edited,
  muted,
  quickActions,
  selected,
  onSelect,
}: {
  title: string;
  summary?: string;
  meta?: string[];
  /** A small status / kind glyph shown left of the title (issue status,
   *  decision confirmation). Next-action cards use `leading` instead. */
  glyph?: ReactNode;
  leading?: ReactNode;
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
        (selected ? " is-selected" : "") +
        (leading ? " has-leading" : "")
      }
      aria-current={selected ? "true" : undefined}
    >
      {/* The leading control (a next-action checkbox button) sits OUTSIDE the
          card button: a button cannot nest inside a button. It is absolutely
          positioned over the title row so the layout still reads as inline. */}
      {leading ? <div className="review-card-leading-slot">{leading}</div> : null}
      <button
        type="button"
        className="review-board-card-button"
        aria-pressed={selected}
        aria-label={title}
        onClick={onSelect}
      >
        <div className="review-card-head-row">
          {glyph ? (
            <span className="review-card-glyph" aria-hidden="true">
              {glyph}
            </span>
          ) : null}
          <span className="review-card-title">{title}</span>
          {edited ? (
            <span className="review-card-edited" aria-label="사용자가 수정함" title="사용자가 수정함" />
          ) : null}
        </div>
        {summary ? <span className="review-card-summary">{summary}</span> : null}
        {meta?.length ? (
          <span className="review-card-meta-row">
            {meta.map((entry) => (
              <span key={entry}>{entry}</span>
            ))}
          </span>
        ) : null}
      </button>
      {quickActions ? (
        <div className="review-card-quick-actions" role="group" aria-label="빠른 작업">
          {quickActions}
        </div>
      ) : null}
    </article>
  );
}

/** Strip the rule-based "확인 또는 해결: " prefix the engine prepends to a
 *  next-action it derived from an issue, so the card reads as the work itself. */
function stripNextActionPrefix(title: string): string {
  return title.replace(/^확인 또는 해결:\s*/, "");
}

function compactText(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

function priorityLabel(priority: Priority): string {
  if (priority === "high") return "높음";
  if (priority === "medium") return "보통";
  return "낮음";
}

function statusLabel(status: IssueStatus): string {
  if (status === "resolved") return "해결";
  if (status === "inProgress") return "진행 중";
  if (status === "watching") return "관찰";
  return "열림";
}

function evidenceLabel(count: number): string {
  return count > 0 ? `근거 ${count}개` : "근거 없음";
}

/** The status glyph for an issue card — open / 진행 중 / 관찰 / 해결, so the
 *  card's state reads at a glance without a status chip. */
function IssueGlyph({ status }: { status: IssueStatus }) {
  if (status === "resolved") return <CircleCheck size={15} />;
  if (status === "watching") return <Eye size={15} />;
  if (status === "inProgress") return <CircleDashed size={15} />;
  return <Circle size={15} />;
}

/** The status glyph for a decision card — confirmed vs still under review. */
function DecisionGlyph({ confirmed }: { confirmed: boolean }) {
  return confirmed ? <CircleCheck size={15} /> : <Circle size={15} />;
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
      summary={summaryBesideTitle(issue.title, compactText(issue.description))}
      meta={[
        priorityLabel(issue.priority),
        statusLabel(issue.status),
        evidenceLabel(issue.sourceEventIds.length),
      ]}
      glyph={<IssueGlyph status={issue.status} />}
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
      summary={summaryBesideTitle(decision.title, compactText(decision.decision || decision.rationale))}
      meta={[
        priorityLabel(decision.importance),
        decision.confirmed ? "확정됨" : "확인 필요",
        evidenceLabel(decision.sourceEventIds.length),
      ]}
      glyph={<DecisionGlyph confirmed={decision.confirmed} />}
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
      title={stripNextActionPrefix(action.title)}
      meta={[
        priorityLabel(action.priority),
        done ? "완료" : "대기",
        action.relatedIssueIds.length > 0 ? `이슈 ${action.relatedIssueIds.length}개` : "직접 액션",
      ]}
      leading={leading}
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
 * Analysis-state notice. Speaks up only on a hard failure; a fallback to the
 * rule-based engine is conveyed quietly by the run header's engine label
 * ("규칙 기반 분석"), not a warning banner the user has to dismiss.
 */
function ReviewAnalysisNotice({
  mode,
  status,
  error,
}: {
  mode: "demo" | "draft";
  status: string;
  error: string | null;
}) {
  if (mode === "demo") return null;
  if (status === "failed") {
    return (
      <NoticeBanner tone="danger" title="분석 실패">
        {error ?? "알 수 없는 오류"}
      </NoticeBanner>
    );
  }
  return null;
}
