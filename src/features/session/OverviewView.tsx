import { useEffect, useMemo, type ComponentType } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  FileText,
  GanttChartSquare,
  ScrollText,
  type LucideProps,
} from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { buildSessionOriginSummary } from "../../lib/session/sessionOrigin";
import { deriveProjectIdentityHint } from "../../lib/session/projectIdentity";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";
import {
  getUnresolvedItems,
  UNRESOLVED_REASON_LABEL,
  type UnresolvedItem,
} from "../../lib/review-workspace/reviewWorkspace";

/**
 * Session 개요 — the at-a-glance landing tab for one session.
 *
 * Pure orientation, no outputs: it answers "what is this session, how big is
 * it, and where do I go next?" The work-unit identity + a one-line summary sit
 * up top, a calm metric strip gives scale, and a row of navigation cards jumps
 * into 흐름 / 증거 / 검토 / 리포트. Handoff artifacts (continue-context, report,
 * .mori export) live in the 리포트 tab, not here.
 */
export function OverviewView() {
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const hasAnalysis = useSessionStore(selectHasRealAnalysis);
  const analysis = useSessionStore((state) => state.analysis);
  const imports = useSessionStore((state) => state.imports);
  const setSessionTab = useAppStore((state) => state.setSessionTab);
  const openReviewItem = useAppStore((state) => state.openReviewItem);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const isDemo = mode === "demo";
  const sourceCount = isDemo ? view.sources.length : imports.length || view.sources.length;

  const originSummary = useMemo(
    () =>
      buildSessionOriginSummary({
        session: view.session,
        sources: view.sources,
        events: view.events,
        importCount: isDemo ? 0 : imports.length,
        isDemo,
      }),
    [view.session, view.sources, view.events, imports.length, isDemo],
  );
  const projectHint = useMemo(
    () =>
      deriveProjectIdentityHint({
        session: view.session,
        sources: view.sources,
        events: view.events,
      }),
    [view.session, view.sources, view.events],
  );

  const summaryText =
    (hasAnalysis && analysis ? analysis.summary.sessionSummary : view.summary.sessionSummary) || null;
  const duration = useMemo(
    () => formatDuration(view.session.startedAt, view.session.endedAt),
    [view.session.startedAt, view.session.endedAt],
  );

  const eventCount = view.events.length;
  const issueCount = view.issues.length;
  const decisionCount = view.decisions.length;
  const nextActionCount = view.nextActions.length;
  const reviewAttention =
    view.issues.filter((issue) => issue.status !== "resolved").length +
    view.decisions.filter((decision) => !decision.confirmed).length +
    view.nextActions.filter((action) => !isNextActionCompleted(action)).length;

  const unresolved = useMemo(
    () =>
      getUnresolvedItems({
        issues: view.issues,
        decisions: view.decisions,
        nextActions: view.nextActions,
      }),
    [view.issues, view.decisions, view.nextActions],
  );

  function openUnresolved(item: UnresolvedItem) {
    if (item.kind === "issue") openReviewItem({ kind: "issue", issueId: item.issue.id });
    else if (item.kind === "decision") openReviewItem({ kind: "decision", decisionId: item.decision.id });
    else openReviewItem({ kind: "nextAction", nextActionId: item.nextAction.id });
  }

  return (
    <div className="session-tab-pane session-tab-overview">
      <div className="session-tab-split is-collapsed">
        <div className="session-tab-main overview-main">
          <section className="session-overview-hero" aria-label="세션 개요">
            <div className="session-overview-origin">
              <Badge tone="purple">{originSummary.boundaryLabel}</Badge>
              <span className="session-overview-mix">{originSummary.sourceMixLabel}</span>
              {projectHint.projectLabel ? (
                <span className="session-overview-context">맥락 · {projectHint.projectLabel}</span>
              ) : null}
            </div>
            {summaryText ? (
              <p className="session-overview-summary">{summaryText}</p>
            ) : (
              <p className="session-overview-summary is-empty">
                아직 요약이 없습니다. 증거 탭에서 Quick Pass를 실행하면 이 세션에서 한 작업이 요약됩니다.
              </p>
            )}
          </section>

          <dl className="overview-metrics" aria-label="세션 규모">
            <OverviewMetric label="기간" value={duration} />
            <OverviewMetric label="소스" value={String(sourceCount)} />
            <OverviewMetric label="이벤트" value={String(eventCount)} />
            <OverviewMetric label="이슈" value={String(issueCount)} />
            <OverviewMetric label="결정" value={String(decisionCount)} />
            <OverviewMetric label="다음 액션" value={String(nextActionCount)} />
          </dl>

          {unresolved.length > 0 ? (
            <section className="overview-attention" aria-label="확인이 필요한 항목">
              <header className="overview-attention-head">
                <h2>확인이 필요한 항목</h2>
                <Badge tone="orange">{unresolved.length}</Badge>
              </header>
              <ul className="overview-attention-list">
                {unresolved.slice(0, 4).map((item) => (
                  <li key={`${item.kind}:${unresolvedItemId(item)}`}>
                    <button type="button" onClick={() => openUnresolved(item)}>
                      <span className="overview-attention-kind">{unresolvedKindLabel(item)}</span>
                      <span className="overview-attention-title">{unresolvedItemTitle(item)}</span>
                      <span className="overview-attention-reason">
                        {UNRESOLVED_REASON_LABEL[item.reason]}
                      </span>
                      <ArrowRight size={13} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              {unresolved.length > 4 ? (
                <button
                  type="button"
                  className="overview-attention-more"
                  onClick={() => setSessionTab("insights")}
                >
                  검토에서 {unresolved.length - 4}건 더 보기
                </button>
              ) : null}
            </section>
          ) : null}

          <nav className="overview-nav-cards" aria-label="세션 탭 바로가기">
            <OverviewNavCard
              icon={GanttChartSquare}
              label="흐름"
              count={eventCount}
              description="시간순으로 복원한 작업 타임라인"
              onOpen={() => setSessionTab("flow")}
            />
            <OverviewNavCard
              icon={FileText}
              label="증거"
              count={sourceCount}
              description="이 세션을 구성한 소스"
              onOpen={() => setSessionTab("evidence")}
            />
            <OverviewNavCard
              icon={ClipboardCheck}
              label="검토"
              count={reviewAttention}
              countTone={reviewAttention > 0 ? "orange" : "green"}
              countLabel="확인 필요"
              description={`이슈 ${issueCount} · 결정 ${decisionCount} · 다음 액션 ${nextActionCount}`}
              onOpen={() => setSessionTab("insights")}
            />
            <OverviewNavCard
              icon={ScrollText}
              label="리포트"
              description="이어가기 컨텍스트 · 리포트 · .mori 내보내기"
              onOpen={() => setSessionTab("report")}
            />
          </nav>
        </div>
      </div>
    </div>
  );
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="overview-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function OverviewNavCard({
  icon: Icon,
  label,
  count,
  countTone = "gray",
  countLabel,
  description,
  onOpen,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  count?: number;
  countTone?: "gray" | "orange" | "green" | "purple";
  countLabel?: string;
  description: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="overview-nav-card" onClick={onOpen}>
      <span className="overview-nav-card-head">
        <span className="overview-nav-card-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <strong>{label}</strong>
        {typeof count === "number" ? (
          <Badge tone={countTone}>{countLabel ? `${countLabel} ${count}` : count}</Badge>
        ) : null}
      </span>
      <span className="overview-nav-card-desc">{description}</span>
    </button>
  );
}

function unresolvedItemId(item: UnresolvedItem): string {
  if (item.kind === "issue") return item.issue.id;
  if (item.kind === "decision") return item.decision.id;
  return item.nextAction.id;
}

function unresolvedItemTitle(item: UnresolvedItem): string {
  if (item.kind === "issue") return item.issue.title;
  if (item.kind === "decision") return item.decision.title;
  return item.nextAction.title;
}

function unresolvedKindLabel(item: UnresolvedItem): string {
  if (item.kind === "issue") return "이슈";
  if (item.kind === "decision") return "결정";
  return "다음 액션";
}

function formatDuration(start: string, end: string): string {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return "-";
  }
  const minutes = Math.floor((endTime - startTime) / 60000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes - hours * 60;
  if (hours < 24) return remMin ? `${hours}시간 ${remMin}분` : `${hours}시간`;
  const days = Math.floor(hours / 24);
  const remHours = hours - days * 24;
  return remHours ? `${days}일 ${remHours}시간` : `${days}일`;
}
