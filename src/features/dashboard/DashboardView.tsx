import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight, BarChart3, FolderGit2, Search } from "lucide-react";
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
import { projectDisplayName } from "../../lib/projects/userProjects";
import type { UserProject } from "../../lib/projects/userProjects";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import {
  buildSessionsBrowserModel,
  type SessionProjectGroup,
  type SessionRow,
} from "../../lib/workspace/sessionsBrowser";

/**
 * Dashboard — the project-axis surface of the four-tab IA.
 *
 * It answers "how is my whole work system doing, and where do I go deep?" at a
 * glance, mostly through numbers and compact visuals rather than prose. It must
 * stay legible as projects scale from a handful to twenty-plus, so the charts
 * aggregate (top-N + 기타) and the matrix is the only scroll region. Every
 * figure is derived from already-imported local data — token totals, event
 * counts, review load, and session timestamps — never fabricated. Clicking a
 * project row drills straight into that project's page.
 *
 * This view is deliberately self-contained (it does not reuse the Home overview
 * builder or activity card) so it stays stable while those surfaces are
 * refactored independently.
 */

type ProjectStatus = {
  key: string;
  name: string;
  sourceLabel: string | null;
  sessionCount: number;
  analyzedSessions: number;
  lastActiveIso: string | null;
  eventCount: number;
  tokenTotal: number;
  openIssues: number;
  unconfirmedDecisions: number;
  pendingNextActions: number;
  attentionScore: number;
  coverageScore: number;
  activityScore: number;
  recentSessions: number;
};

type DashboardTotals = ReturnType<typeof summarizeProjects>;
type DashboardStatus = ReturnType<typeof buildDashboardStatus>;
type SortKey = "recent" | "tokens" | "attention" | "activity";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TREND_WEEKS = 12;

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
  const [sort, setSort] = useState<SortKey>("recent");
  const activeSessionId = draft?.session.id ?? view.session.id;

  const storedSessions = useMemo(
    () => mergeDemoSessionSummaries(repository.listStoredSessions()),
    [repository],
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
        storedSessions,
        filters: { query: "", origin: "all", sort: "recent" },
      }),
    [activeSessionId, draft, mode, storedSessions, view],
  );

  const projects = useMemo(
    () =>
      buildProjectStatuses({
        groups: browserModel.groups,
        storedSessions,
        repository,
        userProjects,
      }),
    [browserModel.groups, repository, storedSessions, userProjects],
  );

  const totals = useMemo(() => summarizeProjects(projects), [projects]);
  const status = useMemo(() => buildDashboardStatus(totals, projects), [projects, totals]);
  const trend = useMemo(() => buildActivitySeries(storedSessions), [storedSessions]);

  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = needle
      ? projects.filter((project) =>
          `${project.name} ${project.sourceLabel ?? ""}`.toLowerCase().includes(needle),
        )
      : projects;
    return sortProjects(base, sort);
  }, [projects, query, sort]);

  const hasRealWork = browserModel.realSessionCount > 0 || projects.length > 0;

  return (
    <PageShell
      className="dashboard-page"
      maxWidth="full"
      actionBar={
        <ActionBar
          label="대시보드 컨트롤"
          start={<ToolbarSearch value={query} onChange={setQuery} ariaLabel="대시보드 검색" />}
          end={<SortControl sort={sort} onChange={setSort} />}
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
          <KpiDeck status={status} totals={totals} />
          <div className="dashboard-charts">
            <ChartCard
              title="토큰 분포"
              hint="프로젝트별 누적 토큰(입력+출력)의 비중입니다. 상위 8개만 표시하고 나머지는 기타로 묶습니다."
            >
              <TokenDistribution projects={projects} total={totals.tokenTotal} />
            </ChartCard>
            <ChartCard title="활동 추이" hint="세션 저장·시작 시각으로 집계한 최근 12주 주간 세션 수입니다.">
              <ActivityTrend series={trend} />
            </ChartCard>
            <ChartCard
              title="검토 구성"
              hint="가져온 세션에서 분석된 미해결 이슈·미확정 결정·남은 다음 작업의 합입니다."
            >
              <AttentionDonut totals={totals} />
            </ChartCard>
          </div>

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
                <EmptyState
                  compact
                  icon={Search}
                  title="검색 결과가 없습니다"
                  description="검색어를 줄이거나 다른 프로젝트 이름을 입력해보세요."
                />
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
        </div>
      )}
    </PageShell>
  );
}

// ─── Toolbar sort ─────────────────────────────────────────────────────────────

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "최근" },
  { key: "tokens", label: "토큰" },
  { key: "attention", label: "검토" },
  { key: "activity", label: "활동" },
];

function SortControl({ sort, onChange }: { sort: SortKey; onChange: (key: SortKey) => void }) {
  return (
    <div className="dashboard-sort" role="group" aria-label="정렬 기준">
      {SORTS.map((option) => (
        <button
          key={option.key}
          type="button"
          className={option.key === sort ? "is-active" : ""}
          aria-pressed={option.key === sort}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ─── KPI deck ─────────────────────────────────────────────────────────────────

function KpiDeck({ status, totals }: { status: DashboardStatus; totals: DashboardTotals }) {
  const ringStyle = { "--score": status.healthScore } as CSSProperties;
  return (
    <section className="dashboard-kpis" aria-label="전체 요약">
      <div className="dashboard-kpi dashboard-kpi-score">
        <div className="dashboard-score-ring" style={ringStyle} aria-hidden="true">
          <span>{status.healthScore}</span>
        </div>
        <div>
          <span className="dashboard-kpi-label">
            운영 점수
            <InfoHint label="운영 점수 설명">
              검토 적체와 분석 커버리지로 계산한 0–100 지표입니다. 높을수록 미처리 항목이
              적고 분석이 잘 따라온 상태입니다.
            </InfoHint>
          </span>
          <strong className="dashboard-kpi-status">{status.overallLabel}</strong>
        </div>
      </div>

      <KpiTile label="프로젝트" value={String(totals.projectCount)} />
      <KpiTile label="세션" value={String(totals.sessionCount)} sub={`분석 ${totals.analyzedSessions}`} />
      <KpiTile
        label="토큰"
        value={formatCount(totals.tokenTotal)}
        sub={totals.tokenTotal > 0 ? "입력+출력" : "기록 없음"}
      />
      <KpiTile
        label="검토 대기"
        value={String(status.attentionCount)}
        tone={status.attentionCount > 0 ? "warning" : "success"}
      />
      <KpiTile label="최근 7일" value={String(status.recentSessions)} sub="세션" />
    </section>
  );
}

function KpiTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "warning" | "success";
}) {
  return (
    <div className={`dashboard-kpi tone-${tone}`}>
      <span className="dashboard-kpi-label">{label}</span>
      <strong>{value}</strong>
      {sub ? <span className="dashboard-kpi-sub">{sub}</span> : null}
    </div>
  );
}

// ─── Charts ─────────────────────────────────────────────────────────────────

function ChartCard({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="dashboard-chart-card" aria-label={title}>
      <header>
        <span>{title}</span>
        <InfoHint label={`${title} 설명`}>{hint}</InfoHint>
      </header>
      <div className="dashboard-chart-body">{children}</div>
    </section>
  );
}

function TokenDistribution({ projects, total }: { projects: ProjectStatus[]; total: number }) {
  const ranked = projects
    .filter((project) => project.tokenTotal > 0)
    .sort((a, b) => b.tokenTotal - a.tokenTotal);
  if (ranked.length === 0 || total === 0) {
    return <p className="dashboard-chart-empty">토큰 기록 없음</p>;
  }
  const top = ranked.slice(0, 8);
  const restTotal = ranked.slice(8).reduce((sum, project) => sum + project.tokenTotal, 0);
  const max = top[0]!.tokenTotal;
  const rows = top.map((project) => ({ key: project.key, name: project.name, value: project.tokenTotal }));
  if (restTotal > 0) {
    rows.push({ key: "__rest__", name: `기타 ${ranked.length - 8}개`, value: restTotal });
  }
  return (
    <div className="dashboard-bars">
      {rows.map((row) => (
        <div className="dashboard-bar" key={row.key}>
          <span title={row.name}>{row.name}</span>
          <span className="dashboard-bar-track" aria-hidden="true">
            <i style={{ width: `${Math.max(fraction(row.value, max) * 100, 4)}%` }} />
          </span>
          <strong>{Math.round((row.value / total) * 100)}%</strong>
        </div>
      ))}
    </div>
  );
}

function ActivityTrend({ series }: { series: number[] }) {
  const max = Math.max(...series, 1);
  if (!series.some((value) => value > 0)) {
    return <p className="dashboard-chart-empty">활동 기록 없음</p>;
  }
  return (
    <div className="dashboard-trend">
      <div className="dashboard-trend-cols" aria-hidden="true">
        {series.map((value, index) => (
          <span
            key={index}
            className={value > 0 ? "is-filled" : ""}
            style={{ height: `${value > 0 ? Math.max((value / max) * 100, 8) : 2}%` }}
            title={`${index === series.length - 1 ? "이번 주" : `${series.length - 1 - index}주 전`} · ${value}개`}
          />
        ))}
      </div>
      <div className="dashboard-trend-caption">
        <span>{series.length}주 전</span>
        <span>이번 주</span>
      </div>
    </div>
  );
}

function AttentionDonut({ totals }: { totals: DashboardTotals }) {
  const segments = [
    { key: "issues", label: "이슈", value: totals.openIssues, color: "var(--base-status-warning)" },
    { key: "decisions", label: "결정", value: totals.unconfirmedDecisions, color: "var(--base-accent)" },
    { key: "next", label: "다음", value: totals.pendingNextActions, color: "var(--base-status-info)" },
  ];
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let cursor = 0;
  const stops = segments
    .map((segment) => {
      const start = total === 0 ? 0 : (cursor / total) * 100;
      cursor += segment.value;
      const end = total === 0 ? 0 : (cursor / total) * 100;
      return `${segment.color} ${start}% ${end}%`;
    })
    .join(", ");
  const donutStyle = {
    background:
      total === 0
        ? "var(--base-surface-subtle)"
        : `conic-gradient(${stops}, var(--base-surface-subtle) 0)`,
  } as CSSProperties;
  return (
    <div className="dashboard-donut-wrap">
      <div className="dashboard-donut" style={donutStyle} aria-hidden="true">
        <div>
          <strong>{total}</strong>
          <span>항목</span>
        </div>
      </div>
      <ul className="dashboard-donut-legend">
        {segments.map((segment) => (
          <li key={segment.key}>
            <i style={{ background: segment.color }} aria-hidden="true" />
            <span>{segment.label}</span>
            <strong>{segment.value}</strong>
          </li>
        ))}
      </ul>
    </div>
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
        {drillable ? <ArrowUpRight size={13} className="dashboard-row-go" aria-hidden="true" /> : null}
      </span>

      <span className="dashboard-cell">
        <span className="dashboard-cell-num">{project.sessionCount}</span>
        <span className="dashboard-micro" aria-hidden="true">
          <i style={{ width: `${Math.round(project.coverageScore * 100)}%` }} />
        </span>
      </span>

      <Bar
        value={formatCount(project.tokenTotal)}
        fraction={fraction(project.tokenTotal, maxTokenTotal)}
        tone="accent"
      />
      <Bar
        value={project.attentionScore}
        fraction={fraction(project.attentionScore, maxAttention)}
        tone={project.attentionScore > 0 ? "warning" : "success"}
      />
      <Bar value={project.eventCount} fraction={fraction(project.eventCount, maxEventCount)} tone="info" />
    </button>
  );
}

function Bar({
  value,
  fraction: amount,
  tone,
}: {
  value: string | number;
  fraction: number;
  tone: "accent" | "warning" | "success" | "info";
}) {
  return (
    <span className={`dashboard-cell-bar tone-${tone}`}>
      <i style={{ width: `${Math.max(amount * 100, amount > 0 ? 6 : 0)}%` }} aria-hidden="true" />
      <strong>{value}</strong>
    </span>
  );
}

// ─── Derivations ──────────────────────────────────────────────────────────────

function buildProjectStatuses({
  groups,
  storedSessions,
  repository,
  userProjects,
}: {
  groups: SessionProjectGroup[];
  storedSessions: StoredSessionSummary[];
  repository: ReturnType<typeof createBrowserDraftRepository>;
  userProjects: UserProject[];
}): ProjectStatus[] {
  const byId = new Map(storedSessions.map((session) => [session.sessionId, session]));
  const now = Date.now();
  const statuses: ProjectStatus[] = groups.map((group) => {
    const sessions = group.sessions;
    const stored = sessions
      .map((row) => byId.get(row.sessionId))
      .filter((entry): entry is StoredSessionSummary => Boolean(entry));
    let openIssues = 0;
    let unconfirmedDecisions = 0;
    let pendingNextActions = 0;
    let analyzedSessions = 0;
    for (const row of sessions) {
      const body = safeLoadMemoryBody(repository, row.sessionId);
      if (!body) continue;
      analyzedSessions += 1;
      openIssues += body.issues.filter((issue) => issue.status === "open").length;
      unconfirmedDecisions += body.decisions.filter((decision) => !decision.confirmed).length;
      pendingNextActions += body.nextActions.filter((action) => !action.done).length;
    }
    const latest = latestSession(sessions);
    const sourceLabel = group.isUnsourced ? null : group.label;
    const eventCount = stored.reduce((sum, entry) => sum + (entry.eventCount ?? 0), 0);
    const tokenTotal = stored.reduce((sum, entry) => sum + (entry.tokenTotal ?? 0), 0);
    const recentSessions = sessions.filter((row) => {
      const iso = row.savedAt ?? row.startedAt;
      return iso ? now - new Date(iso).getTime() <= WEEK_MS : false;
    }).length;
    const attentionScore = openIssues + unconfirmedDecisions + pendingNextActions;
    return {
      key: group.key,
      name: sourceLabel ? projectDisplayName(sourceLabel, userProjects) : group.label,
      sourceLabel,
      sessionCount: sessions.length,
      analyzedSessions,
      lastActiveIso: latest?.savedAt ?? latest?.startedAt ?? null,
      eventCount,
      tokenTotal,
      openIssues,
      unconfirmedDecisions,
      pendingNextActions,
      attentionScore,
      coverageScore: sessions.length === 0 ? 0 : analyzedSessions / sessions.length,
      activityScore: eventCount + sessions.length,
      recentSessions,
    };
  });

  const sessionProjectKeys = new Set(
    statuses.map((project) => project.sourceLabel).filter(Boolean),
  );
  for (const project of userProjects) {
    if (!project.created || sessionProjectKeys.has(project.key)) continue;
    statuses.push({
      key: `created:${project.key}`,
      name: projectDisplayName(project.key, userProjects),
      sourceLabel: project.key,
      sessionCount: 0,
      analyzedSessions: 0,
      lastActiveIso: null,
      eventCount: 0,
      tokenTotal: 0,
      openIssues: 0,
      unconfirmedDecisions: 0,
      pendingNextActions: 0,
      attentionScore: 0,
      coverageScore: 0,
      activityScore: 0,
      recentSessions: 0,
    });
  }

  return statuses;
}

function sortProjects(projects: ProjectStatus[], sort: SortKey): ProjectStatus[] {
  const next = [...projects];
  switch (sort) {
    case "tokens":
      next.sort((a, b) => b.tokenTotal - a.tokenTotal || byRecent(a, b));
      break;
    case "attention":
      next.sort((a, b) => b.attentionScore - a.attentionScore || byRecent(a, b));
      break;
    case "activity":
      next.sort((a, b) => b.activityScore - a.activityScore || byRecent(a, b));
      break;
    default:
      next.sort(byRecent);
  }
  return next;
}

function byRecent(a: ProjectStatus, b: ProjectStatus): number {
  if (a.lastActiveIso && b.lastActiveIso) return b.lastActiveIso.localeCompare(a.lastActiveIso);
  if (a.lastActiveIso) return -1;
  if (b.lastActiveIso) return 1;
  return a.name.localeCompare(b.name, "ko");
}

function summarizeProjects(projects: ProjectStatus[]) {
  return projects.reduce(
    (sum, project) => ({
      projectCount: sum.projectCount + 1,
      sessionCount: sum.sessionCount + project.sessionCount,
      analyzedSessions: sum.analyzedSessions + project.analyzedSessions,
      eventCount: sum.eventCount + project.eventCount,
      tokenTotal: sum.tokenTotal + project.tokenTotal,
      tokenInput: sum.tokenInput,
      openIssues: sum.openIssues + project.openIssues,
      unconfirmedDecisions: sum.unconfirmedDecisions + project.unconfirmedDecisions,
      pendingNextActions: sum.pendingNextActions + project.pendingNextActions,
    }),
    {
      projectCount: 0,
      sessionCount: 0,
      analyzedSessions: 0,
      eventCount: 0,
      tokenTotal: 0,
      tokenInput: 0,
      openIssues: 0,
      unconfirmedDecisions: 0,
      pendingNextActions: 0,
    },
  );
}

function buildDashboardStatus(totals: DashboardTotals, projects: ProjectStatus[]) {
  const attentionCount =
    totals.openIssues + totals.unconfirmedDecisions + totals.pendingNextActions;
  const coverage = totals.sessionCount === 0 ? 0 : totals.analyzedSessions / totals.sessionCount;
  const maxTokenTotal = Math.max(...projects.map((project) => project.tokenTotal), 0);
  const maxEventCount = Math.max(...projects.map((project) => project.eventCount), 0);
  const maxAttention = Math.max(...projects.map((project) => project.attentionScore), 1);
  const recentSessions = projects.reduce((sum, project) => sum + project.recentSessions, 0);
  const attentionLoad = Math.min(attentionCount / 20, 1);
  const healthScore = Math.max(0, Math.round(100 - attentionLoad * 42 - (1 - coverage) * 18));
  return {
    attentionCount,
    coverage,
    recentSessions,
    maxTokenTotal,
    maxEventCount,
    maxAttention,
    healthScore,
    overallLabel: healthScore >= 82 ? "안정적" : healthScore >= 62 ? "검토 필요" : "집중 필요",
  };
}

/** Weekly session counts for the last TREND_WEEKS weeks, oldest first. */
function buildActivitySeries(sessions: StoredSessionSummary[]): number[] {
  const now = Date.now();
  const buckets = new Array<number>(TREND_WEEKS).fill(0);
  for (const session of sessions) {
    const iso = session.savedAt ?? session.startedAt;
    if (!iso) continue;
    const epoch = new Date(iso).getTime();
    if (Number.isNaN(epoch)) continue;
    const weeksAgo = Math.floor((now - epoch) / WEEK_MS);
    if (weeksAgo < 0 || weeksAgo >= TREND_WEEKS) continue;
    buckets[TREND_WEEKS - 1 - weeksAgo] += 1;
  }
  return buckets;
}

function latestSession(rows: SessionRow[]): SessionRow | null {
  return (
    [...rows].sort((a, b) => {
      const aKey = a.savedAt ?? a.startedAt ?? "";
      const bKey = b.savedAt ?? b.startedAt ?? "";
      return bKey.localeCompare(aKey);
    })[0] ?? null
  );
}

function safeLoadMemoryBody(
  repository: ReturnType<typeof createBrowserDraftRepository>,
  sessionId: string,
) {
  try {
    return repository.loadSessionMemoryBody(sessionId);
  } catch {
    return null;
  }
}

function fraction(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || value <= 0 || max <= 0) return 0;
  return Math.min(value / max, 1);
}

function formatCount(value: number): string {
  if (value < 1000) return String(value);
  const k = value / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
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
