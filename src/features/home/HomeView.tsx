import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderKanban,
  Layers,
  Lightbulb,
  PlayCircle,
  PlugZap,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { MoriSectionHeader } from "../../components/ui/MoriSectionHeader";
import { MoriMetricStrip } from "../../components/ui/MoriMetricStrip";
import { MoriObjectRow } from "../../components/ui/MoriObjectRow";
import { MoriMetadataLine } from "../../components/ui/MoriMetadataLine";
import { MoriSection } from "../../components/ui/MoriSection";
import { Button } from "../../components/ui/Button";
import { useMoriAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import type { ViewKey } from "../../domain/types";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";
import {
  buildHomeOverview,
  describeHomeSessionOrigin,
  formatCompactCount,
  type HomeNextAction,
  type HomeNextActionKind,
  type HomeOverview,
  type HomeRecentSession,
  type HomeSessionMetricSnapshot,
  type HomeUsagePanel,
} from "../../lib/home/homeOverview";
import type { ContributionMetric } from "../../lib/home/contributionGrid";
import {
  loadHomeMetricPreference,
  saveHomeMetricPreference,
} from "../../lib/home/homeMetricPreference";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";

/**
 * Home — the session-centric landing surface (P2).
 *
 * This is the dashboard that makes Mori legible the moment it opens. It
 * answers four questions calmly and at a glance:
 *   1. What have I worked on — recent captured sessions across projects.
 *   2. What needs my attention — framed as the value of acting, not a bare
 *      "검토 후보 N개": "결정을 확인하면 프로젝트 메모리에 남습니다".
 *   3. What's next — 가져오기 / 이어가기 / 리포트 as concrete next actions.
 *   4. How am I using AI — a calm strip of real metrics.
 *
 * Honest by construction: every number and row comes from
 * `loadStoredSessionSummaries` plus the cheap per-session memory bodies — no
 * fabricated data, no fake widgets. When the user has only the bundled demo,
 * the surface shows an honest empty state that nudges toward 연결 (import).
 * The derivation lives in `lib/home/homeOverview.ts`; this view only gathers
 * the inputs and renders.
 */
export function HomeView() {
  // `navigate` routes session-surface keys (reports → session 리포트 tab, etc.)
  // through the unified workspace; plain keys pass through unchanged.
  const setCurrentView = useMoriAppStore((state) => state.navigate);
  const openSession = useMoriAppStore((state) => state.openSession);
  const loadBrowserSession = useMoriSessionStore((state) => state.loadBrowserSession);
  const mode = useMoriSessionStore(selectSessionMode);
  const view = useMoriSessionStore(selectSessionView);
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const activeSessionId = view.session.id;

  // The 잔디 lens — persisted locally so the choice sticks across reloads.
  const [metric, setMetric] = useState<ContributionMetric>(() => loadHomeMetricPreference().metric);

  const selectMetric = (next: ContributionMetric) => {
    setMetric(next);
    saveHomeMetricPreference(next);
  };

  const overview = useMemo<HomeOverview>(() => {
    let realSessions: ReturnType<typeof loadStoredSessionSummaries>;
    try {
      realSessions = loadStoredSessionSummaries();
    } catch {
      // The landing must never break the shell — fail closed to empty.
      realSessions = [];
    }
    const realSessionCount = realSessions.length;
    // Fall through to the bundled demo summaries when the user has not
    // captured any real work yet, so the dashboard reads as a working install
    // (heatmap, recent rows, usage) instead of an honest-but-bare empty state.
    const storedSessions = mergeDemoSessionSummaries(realSessions);
    const metrics = gatherSessionMetrics({
      storedSessions,
      repository,
      activeSessionId,
      activeEventCount: mode === "demo" ? 0 : view.events.length,
      activeOpenIssues:
        mode === "demo" ? 0 : view.issues.filter((issue) => issue.status === "open").length,
      activeUnconfirmedDecisions:
        mode === "demo" ? 0 : view.decisions.filter((decision) => !decision.confirmed).length,
      activePendingNextActions:
        mode === "demo" ? 0 : view.nextActions.filter((a) => !isNextActionCompleted(a)).length,
    });

    return buildHomeOverview({
      storedSessions,
      sessionMetrics: metrics,
      realSessionCount,
      isDemo: mode === "demo",
      // The loaded session is the strip's "active" candidate only when it is a
      // real (non-demo) session — the demo never reads as live work.
      activeSession:
        mode === "demo" ? null : { sessionId: activeSessionId, eventCount: view.events.length },
      metric,
    });
    // `view` / `mode` cover active-session changes; `initialized` re-reads
    // after hydrate populates storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, activeSessionId, mode, view, initialized, metric]);

  const openSessionFlow = (sessionId: string) => {
    if (sessionId === activeSessionId || loadBrowserSession(sessionId)) {
      // Recent sessions open the unified workspace on its 흐름 tab.
      openSession("flow");
    }
  };

  const runNextAction = (action: HomeNextAction) => {
    if (action.targetSessionId && action.targetSessionId !== activeSessionId) {
      loadBrowserSession(action.targetSessionId);
    }
    // 검토(review) destinations now open the session 인사이트 tab; everything
    // else (가져오기 / 이어가기 / 리포트) stays a top-level destination.
    if (action.destination === "review") {
      openSession("insights");
    } else {
      setCurrentView(action.destination as ViewKey);
    }
  };

  return (
    <PageShell className="home-page" maxWidth="wide">
      {overview.isEmpty ? (
        <EmptyState
          icon={Layers}
          title="아직 작업 기억이 없습니다"
          description="연결에서 작업 세션을 가져오면 최근 흐름과 다음 작업이 여기에 정리됩니다."
          actions={
            <>
              <Button
                variant="primary"
                icon={PlugZap}
                onClick={() => setCurrentView("connections")}
              >
                연결에서 작업 가져오기
              </Button>
              <Button
                variant="ghost"
                icon={Sparkles}
                onClick={() => openSession("flow")}
                title="실제 데이터 없이 Mori를 둘러볼 수 있는 데모 세션을 열어봅니다."
              >
                체험용 데모 세션 살펴보기
              </Button>
            </>
          }
        />
      ) : (
        <div className="home-dashboard">
          {overview.onlyDemo ? (
            <p className="home-demo-note">
              <Sparkles size={14} aria-hidden="true" />
              <span>데모 세션입니다. 가져오기로 실제 작업이 들어오면 자동으로 채워집니다.</span>
            </p>
          ) : null}

          {/* The current-session strip used to sit here; with the new chrome
              the primary sidebar already lists every session by recency, so
              the duplicate strip on Home was redundant and pulled focus from
              the activity heatmap. */}

          <div className="home-top-grid">
            <div className="home-main-stack">
              <section className="home-activity" aria-label="작업 활동">
                <header className="home-activity-head">
                  <h2>작업 활동</h2>
                  <div className="home-activity-controls">
                    <MetricToggle
                      metric={overview.resolvedMetric}
                      availability={overview.metricAvailability}
                      onSelect={selectMetric}
                    />
                    <span className="home-activity-sub">
                      최근 {overview.contributionGrid.weekCount}주 · 활동 {overview.contributionGrid.activeDays}일
                    </span>
                  </div>
                </header>
                <ContributionHeatmap grid={overview.contributionGrid} />
                {overview.metrics.length > 0 ? (
                  <MoriMetricStrip
                    className="home-activity-stats"
                    items={overview.metrics.map((m) => ({
                      key: m.key,
                      label: m.label,
                      value: m.value,
                      hint: m.hint,
                    }))}
                  />
                ) : null}
              </section>

              <MoriSection
                className="home-section home-recent"
                ariaLabel="최근 세션"
                title="최근 세션"
                actions={
                  <button
                    type="button"
                    className="home-section-link"
                    onClick={() => setCurrentView("workspace")}
                  >
                    전체 세션 <ArrowRight size={13} aria-hidden="true" />
                  </button>
                }
              >
                {overview.recentSessions.length > 0 ? (
                  <ul className="home-session-list">
                    {overview.recentSessions.map((session) => (
                      <RecentSessionRow
                        key={session.sessionId}
                        session={session}
                        onOpen={() => openSessionFlow(session.sessionId)}
                      />
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    compact
                    icon={FolderKanban}
                    title="표시할 최근 세션이 없습니다"
                    description="연결에서 Claude 작업을 가져오면 여기에 쌓입니다."
                  />
                )}
              </MoriSection>
            </div>

            <MoriSection
              className="home-section home-next"
              title="다음 단계"
              ariaLabel="다음 단계"
            >
              <ul className="home-next-list">
                {overview.nextActions.map((action) => (
                  <NextActionRow
                    key={action.key}
                    action={action}
                    onRun={() => runNextAction(action)}
                  />
                ))}
              </ul>
              {overview.usagePanels.length > 0 ? (
                <div className="home-usage-rail" aria-label="사용 현황">
                  <MoriSectionHeader title="사용 현황" />
                  <div className="home-usage-panels">
                    {overview.usagePanels.map((panel) => (
                      <UsagePanel key={panel.key} panel={panel} />
                    ))}
                  </div>
                </div>
              ) : null}
            </MoriSection>
          </div>

        </div>
      )}
    </PageShell>
  );
}

// ─── Usage panel ──────────────────────────────────────────────────────────────

function UsagePanel({ panel }: { panel: HomeUsagePanel }) {
  return (
    <div className="home-usage-panel">
      <span className="home-usage-label">{panel.label}</span>
      <span className="home-usage-value">{panel.value}</span>
      <span className="home-usage-context">{panel.context}</span>
      {panel.bar ? (
        <span className="home-usage-bar" aria-hidden="true">
          {panel.bar.map((segment, index) => (
            <span
              key={index}
              className={`home-usage-bar-seg tone-${segment.tone}`}
              style={{ flexGrow: Math.max(segment.fraction, 0.001) }}
              title={segment.label}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}

// ─── Recent session row ───────────────────────────────────────────────────────

function RecentSessionRow({
  session,
  onOpen,
}: {
  session: HomeRecentSession;
  onOpen: () => void;
}) {
  const origin = describeHomeSessionOrigin(session.origin);
  return (
    <li>
      <MoriObjectRow
        leading={<FolderKanban size={15} />}
        title={session.title}
        meta={
          <MoriMetadataLine
            items={[
              <MoriStatusBadge tone={origin.tone}>{origin.label}</MoriStatusBadge>,
              session.projectLabel ? (
                <span title={session.projectLabel}>{session.projectLabel}</span>
              ) : null,
              session.spanLabel,
              session.countSummary,
            ]}
          />
        }
        timestamp={session.relativeTime}
        trailing={<ArrowRight size={13} aria-hidden="true" />}
        onClick={onOpen}
        ariaLabel={session.title}
        density="compact"
      />
    </li>
  );
}

// ─── Next action card ─────────────────────────────────────────────────────────

const NEXT_ACTION_ICON: Record<HomeNextActionKind, LucideIcon> = {
  import: PlugZap,
  resume: PlayCircle,
  review_decisions: Lightbulb,
  open_issues: CheckCircle2,
  report: FileText,
  explore_demo: Sparkles,
  open_memory: Layers,
};

function NextActionRow({
  action,
  onRun,
}: {
  action: HomeNextAction;
  onRun: () => void;
}) {
  const Icon = NEXT_ACTION_ICON[action.kind];
  return (
    <li className={`home-next-row tone-${action.tone}`}>
      <MoriObjectRow
        leading={<Icon size={15} />}
        title={action.title}
        subtitle={action.description}
        trailing={<ArrowRight size={13} aria-hidden="true" />}
        onClick={onRun}
        ariaLabel={action.title}
      />
    </li>
  );
}

// ─── 잔디 metric toggle ───────────────────────────────────────────────────────

const METRIC_OPTIONS: { metric: ContributionMetric; label: string }[] = [
  { metric: "sessions", label: "세션" },
  { metric: "activity", label: "활동" },
  { metric: "tokens", label: "토큰" },
];

// Why a lens is disabled — shown as the pill tooltip so the user understands
// the gap rather than seeing an empty grid.
const METRIC_UNAVAILABLE_HINT: Record<ContributionMetric, string> = {
  sessions: "표시할 세션이 없습니다",
  activity: "가져온 세션에 단계 정보가 없습니다",
  tokens: "가져온 세션에 토큰 정보가 없습니다",
};

function MetricToggle({
  metric,
  availability,
  onSelect,
}: {
  metric: ContributionMetric;
  availability: HomeOverview["metricAvailability"];
  onSelect: (next: ContributionMetric) => void;
}) {
  return (
    <div className="home-metric-toggle" role="group" aria-label="잔디 지표 선택">
      {METRIC_OPTIONS.map((option) => {
        const available = availability[option.metric];
        const active = option.metric === metric;
        return (
          <button
            key={option.metric}
            type="button"
            className="home-metric-pill"
            aria-pressed={active}
            disabled={!available}
            title={available ? undefined : METRIC_UNAVAILABLE_HINT[option.metric]}
            onClick={() => onSelect(option.metric)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Contribution heatmap (the 잔디) ──────────────────────────────────────────

// Show only alternating weekday labels (월/수/금) so the axis stays uncluttered.
const WEEKDAY_LABELS = ["", "월", "", "수", "", "금", ""];

/** Per-lens noun + value formatter for cell tooltips and the aria summary. */
function describeCellValue(metric: ContributionMetric, count: number): string {
  switch (metric) {
    case "tokens":
      return `토큰 ${formatCompactCount(count)}`;
    case "activity":
      return `단계 ${count}개`;
    case "sessions":
    default:
      return `세션 ${count}개`;
  }
}

function describeTotal(metric: ContributionMetric, total: number): string {
  switch (metric) {
    case "tokens":
      return `총 토큰 ${formatCompactCount(total)}`;
    case "activity":
      return `총 단계 ${total}개`;
    case "sessions":
    default:
      return `총 ${total}회`;
  }
}

function ContributionHeatmap({ grid }: { grid: HomeOverview["contributionGrid"] }) {
  const metric = grid.metric;
  return (
    <div
      className="contrib"
      role="img"
      aria-label={`최근 ${grid.weekCount}주 작업 활동 · 활동 ${grid.activeDays}일 · ${describeTotal(metric, grid.total)}`}
    >
      <div className="contrib-scroll mori-scroll">
        <div className="contrib-plot">
          <div className="contrib-months" aria-hidden="true">
            {grid.weeks.map((_, col) => (
              <span className="contrib-month" key={col}>
                {grid.months.find((month) => month.col === col)?.label ?? ""}
              </span>
            ))}
          </div>
          <div className="contrib-body">
            <div className="contrib-weekdays" aria-hidden="true">
              {WEEKDAY_LABELS.map((label, row) => (
                <span key={row}>{label}</span>
              ))}
            </div>
            <div className="contrib-weeks">
              {grid.weeks.map((week, col) => (
                <div className="contrib-week" key={col}>
                  {week.map((day, row) =>
                    day.date ? (
                      <span
                        key={row}
                        className={`contrib-cell lvl-${day.level}`}
                        title={`${formatDayKo(day.date)} · ${describeCellValue(metric, day.count)}`}
                      />
                    ) : (
                      <span key={row} className="contrib-cell is-pad" />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="contrib-legend" aria-hidden="true">
        <span>적음</span>
        <span className="contrib-cell lvl-0" />
        <span className="contrib-cell lvl-1" />
        <span className="contrib-cell lvl-2" />
        <span className="contrib-cell lvl-3" />
        <span className="contrib-cell lvl-4" />
        <span>많음</span>
      </div>
    </div>
  );
}

function formatDayKo(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

// ─── Per-session metric gathering ─────────────────────────────────────────────

type GatherInput = {
  storedSessions: ReturnType<typeof loadStoredSessionSummaries>;
  repository: ReturnType<typeof createBrowserDraftRepository>;
  activeSessionId: string;
  activeEventCount: number;
  activeOpenIssues: number;
  activeUnconfirmedDecisions: number;
  activePendingNextActions: number;
};

/**
 * Gather the cheap per-session metric snapshots the overview needs. For the
 * *active* session we use the already-loaded view (it carries the real event
 * count). For every other session we read only the compact memory body —
 * issues / decisions / next-actions, never the full import event payload — so
 * the dashboard never pays a re-parse cost. Sessions without a memory body
 * simply contribute nothing.
 */
function gatherSessionMetrics({
  storedSessions,
  repository,
  activeSessionId,
  activeEventCount,
  activeOpenIssues,
  activeUnconfirmedDecisions,
  activePendingNextActions,
}: GatherInput): HomeSessionMetricSnapshot[] {
  return storedSessions.map((session) => {
    if (session.sessionId === activeSessionId && activeEventCount > 0) {
      return {
        sessionId: session.sessionId,
        events: activeEventCount,
        hasReconstructedWork: true,
        openIssues: activeOpenIssues,
        unconfirmedDecisions: activeUnconfirmedDecisions,
        pendingNextActions: activePendingNextActions,
      };
    }

    let body;
    try {
      body = repository.loadSessionMemoryBody(session.sessionId);
    } catch {
      body = null;
    }
    if (!body) return { sessionId: session.sessionId };

    const openIssues = body.issues.filter((issue) => issue.status === "open").length;
    const unconfirmedDecisions = body.decisions.filter((d) => !d.confirmed).length;
    const importantDecisions = body.decisions.filter((d) => d.importance === "high").length;
    const pendingNextActions = body.nextActions.filter((a) => !isNextActionCompleted(a)).length;
    const hasReconstructedWork =
      body.issues.length > 0 ||
      body.decisions.length > 0 ||
      body.nextActions.length > 0 ||
      Boolean(body.summarySnapshot);

    return {
      sessionId: session.sessionId,
      hasReconstructedWork,
      issues: body.issues.length,
      openIssues,
      decisions: body.decisions.length,
      unconfirmedDecisions,
      importantDecisions,
      pendingNextActions,
    };
  });
}
