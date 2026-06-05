import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  FolderGit2,
  Layers,
  Search,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { InfoHint } from "../../components/ui/InfoHint";
import { ToolbarSearch } from "../../components/ui/ToolbarSearch";
import { useAppStore } from "../../app/store";
import {
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useProjectStore } from "../../app/projectStore";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { buildSessionsBrowserModel } from "../../lib/workspace/sessionsBrowser";
import {
  applyDashboardFilters,
  buildActivityTrend,
  buildDashboardStatus,
  buildKpiDeltas,
  buildProjectStatuses,
  buildWeeklySeries,
  DASHBOARD_TIME_RANGE_OPTIONS,
  dashboardRangeLabel,
  filterSessionsByDashboardRange,
  fraction,
  formatCount,
  summarizeProjects,
  type AttentionLens,
  type ConcreteLens,
  type DashboardStatus,
  type DashboardTotals,
  type DashboardTimeRange,
  type KpiDelta,
  type ProjectStatus,
} from "../../lib/dashboard/dashboardModel";
import { gatherSessionMetrics } from "../../lib/home/homeSessionMetrics";
import {
  buildHomeMemoryState,
  type MemoryStateBucket,
} from "../../lib/home/homeMemoryState";
import type { HomeSessionMetricSnapshot } from "../../lib/home/homeOverview";
import { ActivityTrend } from "./charts/ActivityTrend";
import { AttentionDonut } from "./charts/AttentionDonut";
import { TokenDistribution } from "./charts/TokenDistribution";
import { useChartTooltip } from "./charts/ChartTooltip";
import { DashboardInsights, type WorkFlowStage } from "./DashboardInsights";

/**
 * Dashboard — the project-axis surface of the four-tab IA.
 *
 * It answers "how is my whole work system doing, and where do I go deep?" at a
 * glance, mostly through numbers and compact visuals rather than prose. It must
 * stay legible as projects scale from a handful to twenty-plus, so the charts
 * aggregate (top-N + 기타) and the matrix is the only scroll region. Every
 * figure is derived from already-imported local data — token totals, event
 * counts, review load, and session timestamps — never fabricated.
 *
 * It is a *linked* surface: the charts, KPI tiles, and matrix talk to each
 * other. The hover and click contract is deliberate and uniform:
 *  - Hover lights related items and shows a precise tooltip; it never filters.
 *      · 토큰 분포 바  → 프로젝트 · NK 토큰 · share%, matching matrix row lit
 *      · 활동 추이 바  → 이번 주 / N주 전 · N개 · share%, with a guide line
 *      · 검토 세그먼트 → 이슈 / 결정 / 다음 · N개 · share%, centre swaps, rows lit
 *      · KPI 타일     → the week-over-week or breakdown detail behind the figure
 *  - Click commits a sticky focus (a project) or sort/lens, surfaced as a
 *    clearable chip; the matrix row click still drills into the project page.
 *
 * Pure derivations live in `lib/dashboard/dashboardModel` and the charts in
 * `./charts`, so this file stays the composition + KPI/matrix presentation.
 */

export function DashboardView() {
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const draft = useSessionStore((state) => state.draft);
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);

  const projectsInitialized = useProjectStore((state) => state.initialized);
  const userProjects = useProjectStore((state) => state.projects);
  const hydrateProjects = useProjectStore((state) => state.hydrate);
  const openProject = useAppStore((state) => state.openProject);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  useEffect(() => {
    if (!projectsInitialized) hydrateProjects();
  }, [projectsInitialized, hydrateProjects]);

  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const [query, setQuery] = useState("");
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("month");

  // Click-driven filters: focus (a project) and lens (a review category), both
  // surfaced as clearable chips. The charts and the table stay independent on
  // hover, each showing only its own local feedback.
  const [focusProjectKey, setFocusProjectKey] = useState<string | null>(null);
  const [attentionLens, setAttentionLens] = useState<AttentionLens>("all");

  const tooltip = useChartTooltip();
  const activeSessionId = draft?.session.id ?? view.session.id;

  const storedSessions = useMemo(
    () => mergeDemoSessionSummaries(repository.listStoredSessions()),
    [repository],
  );

  const rangedSessions = useMemo(
    () => filterSessionsByDashboardRange(storedSessions, timeRange),
    [storedSessions, timeRange],
  );

  const browserModel = useMemo(
    () =>
      buildSessionsBrowserModel({
        active: {
          sessionId: activeSessionId,
          title: view.session.title,
          status: view.session.status,
          sourceLabel: view.session.sourceLabel?.trim() || null,
          startedAt: view.session.startedAt || null,
          endedAt: view.session.endedAt || null,
          isDemo: mode === "demo",
          isStored: Boolean(draft),
        },
        storedSessions: rangedSessions,
        filters: { query: "", origin: "all", sort: "recent" },
      }),
    [activeSessionId, draft, mode, rangedSessions, view],
  );

  const projects = useMemo(
    () =>
      buildProjectStatuses({
        groups: browserModel.groups,
        storedSessions: rangedSessions,
        repository,
        userProjects,
        includeCreatedProjects: timeRange === "all",
      }),
    [browserModel.groups, repository, rangedSessions, timeRange, userProjects],
  );

  const totals = useMemo(() => summarizeProjects(projects), [projects]);
  const status = useMemo(() => buildDashboardStatus(totals, projects), [projects, totals]);

  useEffect(() => {
    if (focusProjectKey && !projects.some((project) => project.key === focusProjectKey)) {
      setFocusProjectKey(null);
    }
  }, [focusProjectKey, projects]);

  const trend = useMemo(
    () => buildActivityTrend(rangedSessions, timeRange),
    [rangedSessions, timeRange],
  );
  const deltas = useMemo(() => buildKpiDeltas(rangedSessions), [rangedSessions]);
  const sessionSpark = useMemo(() => buildWeeklySeries(rangedSessions, 12, "sessions"), [rangedSessions]);
  const tokenSpark = useMemo(() => buildWeeklySeries(rangedSessions, 12, "tokens"), [rangedSessions]);
  const timeRangeLabel = useMemo(() => dashboardRangeLabel(timeRange), [timeRange]);

  // Memory-state distribution + capture→memory pipeline totals for the insight
  // cards. Reuses the home overview's honest per-session metric snapshots.
  const sessionMetrics = useMemo(
    () => gatherSessionMetrics(rangedSessions, repository),
    [rangedSessions, repository],
  );
  const memoryState = useMemo(
    () => buildHomeMemoryState(sessionMetrics),
    [sessionMetrics],
  );
  const flowStages = useMemo(
    () => buildWorkFlowStages(rangedSessions.length, sessionMetrics, memoryState.buckets),
    [rangedSessions.length, sessionMetrics, memoryState.buckets],
  );
  const lastActivityLabel = useMemo(() => {
    const latest = rangedSessions.reduce((max, session) => {
      const stamp = session.startedAt || session.savedAt || "";
      return stamp > max ? stamp : max;
    }, "");
    return latest ? `${timeRangeLabel} · 최근 활동 ${formatRelative(latest)}` : timeRangeLabel;
  }, [rangedSessions, timeRangeLabel]);

  const filteredProjects = useMemo(
    () =>
      applyDashboardFilters(projects, {
        query,
        sort: "recent",
        focusKey: focusProjectKey,
        lens: attentionLens,
      }),
    [projects, query, focusProjectKey, attentionLens],
  );

  const focusedProject = focusProjectKey
    ? projects.find((project) => project.key === focusProjectKey) ?? null
    : null;

  const hasRealWork = storedSessions.length > 0 || userProjects.some((project) => project.created);

  const toggleFocus = (key: string) =>
    setFocusProjectKey((current) => (current === key ? null : key));

  return (
    <PageShell
      className="dashboard-page"
      maxWidth="full"
      actionBar={
        <ActionBar
          label="대시보드 컨트롤"
          start={
            <>
              <ToolbarSearch value={query} onChange={setQuery} ariaLabel="대시보드 검색" />
              <FilterChips
                focusName={focusedProject?.name ?? null}
                lens={attentionLens}
                onClearFocus={() => setFocusProjectKey(null)}
                onClearLens={() => setAttentionLens("all")}
              />
            </>
          }
          end={<RangeToggle range={timeRange} onChange={setTimeRange} />}
        />
      }
    >
      {!hasRealWork ? (
        <EmptyState
          icon={BarChart3}
          title="아직 대시보드에 보여줄 작업이 없습니다"
          description="작업 기록을 가져오면 프로젝트별 상태와 사용량이 이곳에 모입니다."
        />
      ) : (
        <div className="dashboard-surface">
          <KpiDeck
            status={status}
            totals={totals}
            deltas={deltas}
            sessionSpark={sessionSpark}
            tokenSpark={tokenSpark}
            rangeLabel={timeRangeLabel}
          />
          <div className="dashboard-charts">
            <ChartCard
              title="토큰 분포"
              hint="프로젝트별 누적 토큰(입력+출력)의 비중입니다. 상위 8개만 표시하고 나머지는 기타로 묶습니다. 막대에 마우스를 올리면 정확한 값이, 클릭하면 해당 프로젝트만 추려집니다."
            >
              <TokenDistribution
                projects={projects}
                total={totals.tokenTotal}
                focusProjectKey={focusProjectKey}
                onFocus={toggleFocus}
                tooltip={tooltip}
              />
            </ChartCard>
            <ChartCard
              title="활동 추이"
              hint="상단 기간 필터에 맞춰 세션 저장·시작 시각으로 집계한 활동량입니다. 막대에 마우스를 올리면 그 시점의 세션 수가 나타납니다."
            >
              <ActivityTrend trend={trend} tooltip={tooltip} />
            </ChartCard>
            <ChartCard
              title="검토 구성"
              hint="가져온 세션에서 분석된 미해결 이슈·미확정 결정·남은 다음 작업의 합입니다. 조각에 마우스를 올리면 비중이, 클릭하면 그 항목이 있는 프로젝트만 추려집니다."
            >
              <AttentionDonut
                totals={totals}
                attentionLens={attentionLens}
                onLensChange={setAttentionLens}
                tooltip={tooltip}
              />
            </ChartCard>
          </div>

          <DashboardInsights
            memory={memoryState}
            stages={flowStages}
            caption={lastActivityLabel}
          />

          <section className="dashboard-matrix" aria-label="프로젝트 현황">
            <header className="dashboard-matrix-head">
              <span>프로젝트</span>
              <span>세션</span>
              <span>토큰</span>
              <span>검토</span>
              <span>활동</span>
            </header>
            <div className="dashboard-matrix-body base-scroll">
              {filteredProjects.length === 0 ? (
                <p className="dashboard-matrix-empty">
                  <Search size={14} aria-hidden="true" />
                  조건에 맞는 프로젝트가 없습니다
                </p>
              ) : (
                filteredProjects.map((project) => (
                  <ProjectRow
                    key={project.key}
                    project={project}
                    maxTokenTotal={status.maxTokenTotal}
                    maxEventCount={status.maxEventCount}
                    maxAttention={status.maxAttention}
                    onOpen={() => project.sourceLabel && openProject(project.sourceLabel)}
                  />
                ))
              )}
            </div>
          </section>
          {tooltip.node}
        </div>
      )}
    </PageShell>
  );
}

// ─── Toolbar controls ─────────────────────────────────────────────────────────

function RangeToggle({
  range,
  onChange,
}: {
  range: DashboardTimeRange;
  onChange: (range: DashboardTimeRange) => void;
}) {
  return (
    <div className="dashboard-sort dashboard-range" role="group" aria-label="대시보드 기간">
      {DASHBOARD_TIME_RANGE_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          className={option.key === range ? "is-active" : ""}
          aria-pressed={option.key === range}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const LENS_LABELS: Record<ConcreteLens, string> = {
  issues: "이슈",
  decisions: "결정",
  next: "다음",
};
const LENS_TONE: Record<ConcreteLens, string> = {
  issues: "warning",
  decisions: "info",
  next: "success",
};

function FilterChips({
  focusName,
  lens,
  onClearFocus,
  onClearLens,
}: {
  focusName: string | null;
  lens: AttentionLens;
  onClearFocus: () => void;
  onClearLens: () => void;
}) {
  if (!focusName && lens === "all") return null;
  return (
    <div className="dashboard-chips">
      {focusName ? (
        <button
          type="button"
          className="dashboard-chip tone-accent"
          onClick={onClearFocus}
          aria-label={`프로젝트 필터 해제: ${focusName}`}
        >
          <FolderGit2 size={12} aria-hidden="true" />
          <span>{focusName}</span>
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
      {lens !== "all" ? (
        <button
          type="button"
          className={`dashboard-chip tone-${LENS_TONE[lens]}`}
          onClick={onClearLens}
          aria-label={`검토 필터 해제: ${LENS_LABELS[lens]}`}
        >
          <span>검토 · {LENS_LABELS[lens]}</span>
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

// ─── KPI deck ─────────────────────────────────────────────────────────────────

function KpiDeck({
  status,
  totals,
  deltas,
  sessionSpark,
  tokenSpark,
  rangeLabel,
}: {
  status: DashboardStatus;
  totals: DashboardTotals;
  deltas: ReturnType<typeof buildKpiDeltas>;
  sessionSpark: number[];
  tokenSpark: number[];
  rangeLabel: string;
}) {
  return (
    <section className="dashboard-kpis" aria-label="전체 요약">
      <KpiTile icon={FolderGit2} label="프로젝트" value={String(totals.projectCount)} />
      <KpiTile
        icon={Layers}
        label="세션"
        value={String(totals.sessionCount)}
        sub={`분석 ${totals.analyzedSessions}`}
        delta={{ delta: deltas.sessions, kind: "good" }}
        spark={sessionSpark}
        sparkTone="info"
      />
      <KpiTile
        icon={Zap}
        label="토큰"
        value={formatCount(totals.tokenTotal)}
        sub={totals.tokenTotal > 0 ? "입력+출력" : "기록 없음"}
        delta={{ delta: deltas.tokens, kind: "neutral" }}
        spark={tokenSpark}
        sparkTone="accent"
      />
      <KpiTile icon={Activity} label="활동량" value={formatCount(totals.eventCount)} sub="이벤트" />
      <KpiTile
        icon={status.attentionCount > 0 ? TriangleAlert : CheckCircle2}
        label="검토 대기"
        value={String(status.attentionCount)}
        tone={status.attentionCount > 0 ? "warning" : "neutral"}
      />
      <KpiTile icon={Clock3} label="기간" value={rangeLabel} sub={`${totals.sessionCount} 세션`} />
    </section>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
  delta,
  spark,
  sparkTone = "accent",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "warning" | "success";
  delta?: { delta: KpiDelta; kind: "good" | "neutral" };
  spark?: number[];
  sparkTone?: "accent" | "info";
}) {
  const inner = (
    <>
      <span className="dashboard-kpi-icon" aria-hidden="true">
        <Icon size={15} />
      </span>
      <span className="dashboard-kpi-label">{label}</span>
      <span className="dashboard-kpi-figure">
        <strong>{value}</strong>
        {delta ? <DeltaBadge delta={delta.delta} kind={delta.kind} /> : null}
      </span>
      {spark || sub ? (
        <span className="dashboard-kpi-foot">
          {spark ? <Sparkline values={spark} tone={sparkTone} /> : null}
          {sub ? <span className="dashboard-kpi-sub">{sub}</span> : null}
        </span>
      ) : null}
    </>
  );
  return <div className={`dashboard-kpi tone-${tone}`}>{inner}</div>;
}

function DeltaBadge({ delta, kind }: { delta: KpiDelta; kind: "good" | "neutral" }) {
  if (!delta.hasPrior) {
    return <span className="dashboard-kpi-delta is-none">이전 기록 없음</span>;
  }
  if (delta.direction === "flat") {
    return <span className="dashboard-kpi-delta is-flat">±0</span>;
  }
  const up = delta.direction === "up";
  const toneClass = kind === "good" && up ? "is-up" : "is-neutral";
  return (
    <span className={`dashboard-kpi-delta ${toneClass}`}>
      {up ? "▲" : "▼"} {formatCount(Math.abs(delta.delta))}
    </span>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: "accent" | "info" }) {
  if (!values.some((value) => value > 0)) return null;
  const W = 60;
  const H = 18;
  const max = Math.max(...values, 1);
  const n = values.length;
  const step = n > 1 ? W / (n - 1) : 0;
  const point = (value: number, index: number) =>
    `${(index * step).toFixed(1)},${(H - (value / max) * H).toFixed(1)}`;
  const points = values.map(point).join(" ");
  const lastValue = values[n - 1]!;
  return (
    <svg
      className={`dashboard-spark tone-${tone}`}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
    >
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
      <circle className="dashboard-spark-dot" cx={(n - 1) * step} cy={H - (lastValue / max) * H} r={1.7} />
    </svg>
  );
}

// ─── Charts ─────────────────────────────────────────────────────────────────

function ChartCard({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="dashboard-chart-card" aria-label={title}>
      <header>
        <span className="dashboard-chart-title">
          {title}
          <InfoHint label={`${title} 설명`}>{hint}</InfoHint>
        </span>
        {action ?? null}
      </header>
      <div className="dashboard-chart-body">{children}</div>
    </section>
  );
}

// ─── Project matrix ─────────────────────────────────────────────────────────

function ProjectRow({
  project,
  maxTokenTotal,
  maxEventCount,
  maxAttention,
  onOpen,
}: {
  project: ProjectStatus;
  maxTokenTotal: number;
  maxEventCount: number;
  maxAttention: number;
  onOpen: () => void;
}) {
  const drillable = Boolean(project.sourceLabel);
  return (
    <button
      type="button"
      className={`dashboard-matrix-row${drillable ? "" : " is-static"}`}
      onClick={drillable ? onOpen : undefined}
      aria-label={drillable ? `${project.name} 열기` : project.name}
    >
      <span className="dashboard-row-name">
        <FolderGit2 size={13} aria-hidden="true" />
        <span>
          <strong>{project.name}</strong>
          <small>{project.lastActiveIso ? formatRelative(project.lastActiveIso) : "활동 없음"}</small>
        </span>
      </span>

      <MetricCell
        label="세션"
        value={project.sessionCount}
        fraction={project.coverageScore}
        tone="info"
      />
      <MetricCell
        label="토큰"
        value={formatCount(project.tokenTotal)}
        fraction={fraction(project.tokenTotal, maxTokenTotal)}
        tone="accent"
      />
      <MetricCell
        label="검토"
        value={project.attentionScore}
        fraction={fraction(project.attentionScore, maxAttention)}
        tone={project.attentionScore > 0 ? "warning" : "success"}
      />
      <MetricCell
        label="활동"
        value={project.eventCount}
        fraction={fraction(project.eventCount, maxEventCount)}
        tone="info"
      />
    </button>
  );
}

function MetricCell({
  label,
  value,
  fraction: amount,
  tone,
}: {
  label: string;
  value: string | number;
  fraction: number;
  tone: "accent" | "warning" | "success" | "info";
}) {
  return (
    <span className="dashboard-cell" data-label={label}>
      <span className="dashboard-cell-num">{value}</span>
      <span className={`dashboard-micro tone-${tone}`} aria-hidden="true">
        <i style={{ width: `${Math.max(amount * 100, amount > 0 ? 6 : 0)}%` }} />
      </span>
    </span>
  );
}

/**
 * Aggregate the capture→memory pipeline totals — every figure a live count, no
 * fabricated steps. `saved` / `resumable` reuse the memory-state partition so
 * the funnel stays consistent with the distribution card beside it.
 */
function buildWorkFlowStages(
  sessionCount: number,
  metrics: HomeSessionMetricSnapshot[],
  buckets: MemoryStateBucket[],
): WorkFlowStage[] {
  const analyzed = metrics.filter((metric) => metric.hasReconstructedWork).length;
  const extracted = metrics.reduce(
    (sum, metric) =>
      sum +
      (metric.issues ?? 0) +
      (metric.decisions ?? 0) +
      (metric.pendingNextActions ?? 0),
    0,
  );
  const saved = buckets.find((bucket) => bucket.key === "saved")?.count ?? 0;
  const resumable = buckets.find((bucket) => bucket.key === "resumable")?.count ?? 0;
  return [
    { key: "collect", label: "소스 수집", value: sessionCount, unit: "소스" },
    { key: "organize", label: "정리", value: analyzed, unit: "정리됨" },
    { key: "extract", label: "핵심 추출", value: extracted, unit: "항목" },
    { key: "store", label: "기억 저장", value: saved, unit: "저장됨" },
    { key: "resume", label: "재개 준비", value: resumable + saved, unit: "준비됨" },
  ];
}

function formatRelative(iso: string): string {
  const epoch = new Date(iso).getTime();
  if (Number.isNaN(epoch)) return "";
  const diff = Date.now() - epoch;
  if (diff < 0) return "방금";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  const date = new Date(epoch);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}
