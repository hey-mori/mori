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
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
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
  type HomeNextAction,
  type HomeNextActionKind,
  type HomeOverview,
  type HomeRecentSession,
  type HomeSessionMetricSnapshot,
} from "../../lib/home/homeOverview";

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
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
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

  const overview = useMemo<HomeOverview>(() => {
    let storedSessions: ReturnType<typeof loadStoredSessionSummaries>;
    try {
      storedSessions = loadStoredSessionSummaries();
    } catch {
      // The landing must never break the shell — fail closed to empty.
      storedSessions = [];
    }
    const realSessionCount = storedSessions.length;
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
    });
    // `view` / `mode` cover active-session changes; `initialized` re-reads
    // after hydrate populates storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, activeSessionId, mode, view, initialized]);

  const openSession = (sessionId: string, destination: ViewKey) => {
    if (sessionId === activeSessionId || loadBrowserSession(sessionId)) {
      setCurrentView(destination);
    }
  };

  const runNextAction = (action: HomeNextAction) => {
    if (action.targetSessionId && action.targetSessionId !== activeSessionId) {
      loadBrowserSession(action.targetSessionId);
    }
    setCurrentView(action.destination as ViewKey);
  };

  return (
    <PageShell
      className="home-page"
      header={null}
      actionBar={
        <ActionBar
          label="홈"
          start={<span className="action-bar-context">홈</span>}
          end={
            <>
              <Button
                variant="primary"
                icon={PlugZap}
                onClick={() => setCurrentView("connections")}
              >
                가져오기
              </Button>
              <Button
                variant="ghost"
                icon={PlayCircle}
                onClick={() => setCurrentView("start")}
                title="대부분의 세션은 가져오기에서 시작됩니다. 새 세션은 드문 경우입니다."
              >
                새 세션
              </Button>
            </>
          }
        />
      }
      maxWidth="wide"
    >
      {overview.isEmpty ? (
        <EmptyState
          icon={Layers}
          title="아직 작업 기억이 없습니다"
          description="연결에서 Claude 작업을 가져오면 여기에 작업 기억이 쌓이고, 무엇을 해왔고 다음에 무엇을 하면 좋을지 한눈에 보입니다."
          actions={
            <Button
              variant="primary"
              icon={PlugZap}
              onClick={() => setCurrentView("connections")}
            >
              연결에서 작업 가져오기
            </Button>
          }
        />
      ) : (
        <div className="home-dashboard">
          {overview.onlyDemo ? (
            <p className="home-demo-note">
              <Sparkles size={14} aria-hidden="true" />
              <span>
                지금은 데모 세션만 있습니다. 연결에서 Claude 작업을 가져오면 아래 요약이 실제 작업으로
                채워집니다.
              </span>
            </p>
          ) : null}

          {overview.metrics.length > 0 ? (
            <section className="home-metrics" aria-label="작업 요약">
              {overview.metrics.map((metric) => (
                <div className="home-metric" key={metric.key}>
                  <span className="home-metric-value">{metric.value}</span>
                  <span className="home-metric-label">{metric.label}</span>
                  {metric.hint ? (
                    <span className="home-metric-hint" title={metric.hint}>
                      {metric.hint}
                    </span>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          <div className="home-columns">
            <section className="home-section home-recent" aria-label="최근 세션">
              <header className="home-section-head">
                <h2>최근 세션</h2>
                <button
                  type="button"
                  className="home-section-link"
                  onClick={() => setCurrentView("workspace")}
                >
                  전체 세션 <ArrowRight size={13} aria-hidden="true" />
                </button>
              </header>

              {overview.recentSessions.length > 0 ? (
                <ul className="home-session-list">
                  {overview.recentSessions.map((session) => (
                    <RecentSessionRow
                      key={session.sessionId}
                      session={session}
                      onOpen={() => openSession(session.sessionId, "timeline")}
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
            </section>

            <aside className="home-section home-next" aria-label="지금 할 만한 것">
              <header className="home-section-head">
                <h2>지금 할 만한 것</h2>
              </header>
              <ul className="home-next-list">
                {overview.nextActions.map((action) => (
                  <NextActionCard
                    key={action.key}
                    action={action}
                    onRun={() => runNextAction(action)}
                  />
                ))}
              </ul>
            </aside>
          </div>
        </div>
      )}
    </PageShell>
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
      <button type="button" className="home-session-row" onClick={onOpen} title={session.title}>
        <span className="home-session-icon" aria-hidden="true">
          <FolderKanban size={15} />
        </span>
        <span className="home-session-body">
          <span className="home-session-title">{session.title}</span>
          <span className="home-session-meta">
            <MoriStatusBadge tone={origin.tone}>{origin.label}</MoriStatusBadge>
            <span className="home-session-project" title={session.projectLabel ?? undefined}>
              {session.projectLabel ?? "수동 세션"}
            </span>
            {session.spanLabel ? (
              <span className="home-session-span">{session.spanLabel}</span>
            ) : null}
            {session.countSummary ? (
              <span className="home-session-counts">{session.countSummary}</span>
            ) : null}
          </span>
        </span>
        <time className="home-session-time">{session.relativeTime}</time>
      </button>
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
};

function NextActionCard({
  action,
  onRun,
}: {
  action: HomeNextAction;
  onRun: () => void;
}) {
  const Icon = NEXT_ACTION_ICON[action.kind];
  return (
    <li className={`home-next-card tone-${action.tone}`}>
      <span className="home-next-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <div className="home-next-body">
        <h3 className="home-next-title">{action.title}</h3>
        <p className="home-next-desc">{action.description}</p>
        <button type="button" className="home-next-action" onClick={onRun}>
          {action.actionLabel} <ArrowRight size={13} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
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
