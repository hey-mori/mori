import { lazy, Suspense, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  FolderGit2,
  GanttChartSquare,
  LayoutDashboard,
  ScrollText,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { useAppStore, type SessionTab } from "../../app/store";
import {
  selectActiveSessionWindow,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { buildWorkContext } from "../../lib/session/workContext";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
/**
 * The tabs load on demand.
 *
 * Only one renders at a time, and imported eagerly all six travelled together:
 * opening any session parsed the timeline, evidence, review, report, overview
 * and analysis surfaces, whichever tab the user was actually on. The timeline
 * alone is the largest of them.
 *
 * Overview stays eager because it is the tab a session opens on, so making it
 * dynamic would put a chunk fetch in front of the first thing the user sees.
 */
import { OverviewView } from "./OverviewView";
import { SessionSourceWindow } from "./SessionSourceWindow";
import { SessionArchiveControl } from "./SessionArchiveControl";
import { RetainedSourceNotice } from "./RetainedSourceNotice";
import { sessionCrumbs, sessionReturnLink } from "./sessionProjectIdentity";
import { useSessionProjectIdentity } from "./useSessionProjectIdentity";
import { useShownSessionTitle } from "../../app/useDisclosedView";
import { nextActionsWorthShowing } from "../review/reviewRepeats";

const TimelineView = lazy(() =>
  import("../timeline/TimelineView").then((m) => ({ default: m.TimelineView })),
);
const EvidenceView = lazy(() =>
  import("../evidence/EvidenceView").then((m) => ({ default: m.EvidenceView })),
);
const ReviewView = lazy(() =>
  import("../review/ReviewView").then((m) => ({ default: m.ReviewView })),
);
const ReportsView = lazy(() =>
  import("../reports/ReportsView").then((m) => ({ default: m.ReportsView })),
);
const AnalysisView = lazy(() =>
  import("./AnalysisView").then((m) => ({ default: m.AnalysisView })),
);

/**
 * Session Detail — the unified, tabbed workspace for one session.
 *
 * No header band. The sidebar's highlighted row identifies which session is
 * open, so the workspace top is a single tight row: the session title as a
 * subtle inline label, then the tab strip with count badges in place of the
 * old "이벤트 24 · 소스 5 · 결정 7 …" metric strip. Tabs:
 *
 *   - **개요**    — session at a glance (identity · summary · scale · quick nav)
 *   - **활동**    — raw agent activity: the 타임라인 swimlane + the 원본 stream
 *   - **분석**    — the analysis surface: run controls + 흐름 (AI workflow) + 정리
 *                  (issues / decisions / next actions) + 상태; absorbs the old 자료 + 검토
 *   - **공유**    — handoff outputs: continue-context, report, .mori export
 */
export function SessionDetailView() {
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const sessionTab = useAppStore((state) => state.sessionTab);
  // A transcript too long to import shows its recent conversation (or why it
  // could not be read) in place of the tabs: analysis, report and the counted
  // tabs would treat a part of the session as the whole of it.
  const sessionWindow = useSessionStore(selectActiveSessionWindow);
  const activeSessionId = useSessionStore((state) => state.draft?.session.id ?? null);
  const setSessionTab = useAppStore((state) => state.setSessionTab);
  const recheckRestoredSource = useSessionStore((state) => state.recheckRestoredSource);

  // A session restored at startup shows without having been read this run;
  // once visible, check its source still exists (bounded to this session).
  useEffect(() => {
    if (activeSessionId) void recheckRestoredSource(activeSessionId);
  }, [activeSessionId, recheckRestoredSource]);

  // Retired tabs redirect to their new homes: the raw-activity alias to 활동,
  // and the former 자료 / 검토 surfaces into the unified 분석 tab.
  useEffect(() => {
    if (sessionTab === "reconstruct") setSessionTab("flow");
    else if (sessionTab === "evidence" || sessionTab === "insights") setSessionTab("analysis");
  }, [sessionTab, setSessionTab]);

  return (
    <PageShell className="session-detail-page" maxWidth="full">
      <div className="session-detail-bar">
        <SessionTitleInline />
        {sessionWindow ? null : <SessionTabBar activeTab={sessionTab} onChange={setSessionTab} />}
        {activeSessionId ? <SessionArchiveControl key={activeSessionId} sessionId={activeSessionId} /> : null}
      </div>
      {sessionWindow ? null : <RetainedSourceNotice />}
      {sessionWindow ? (
        <SessionSourceWindow state={sessionWindow} />
      ) : (
        <Suspense fallback={<div className="session-tab-loading" role="status" aria-live="polite" />}>
          <SessionTabContent tab={sessionTab} />
        </Suspense>
      )}
    </PageShell>
  );
}

/**
 * Slim inline title with a breadcrumb up to the project and workspace.
 * Reads as a real location indicator (←ish chevrons walking from
 * 프로젝트 (browser) → project → current session) so the user can always
 * tell how deep they are; the project crumb is clickable to jump up.
 * No banner, no chips, no metric strip.
 */
function SessionTitleInline() {
  const draft = useSessionStore((state) => state.draft);
  const analysisStatus = useSessionStore((state) => state.analysisStatus);
  // The demo branch of buildWorkContext reads `demoSession` for the title /
  // span. Feed it the *currently open* demo session (the per-session view)
  // rather than the canonical mock, so the breadcrumb names the session the
  // user actually clicked instead of always "Mori 앱 기획".
  const demoSession = useSessionStore(selectSessionView).session;
  const openProject = useAppStore((state) => state.openProject);
  const openProjectContext = useAppStore((state) => state.openProjectContext);
  const openCalendarAt = useAppStore((state) => state.openCalendarAt);
  const setSessionReturn = useAppStore((state) => state.setSessionReturn);
  const identity = useSessionProjectIdentity(draft?.session.id ?? null);
  const context = useMemo(
    () =>
      buildWorkContext({
        draft,
        demoSession,
        analysisStatus,
      }),
    [draft, demoSession, analysisStatus],
  );
  // The title as the request disclosure level shows it (a demo session has
  // no first-request title).
  const shownTitle = useShownSessionTitle(
    draft ? { title: context.sessionTitle, titleFromRequest: draft.session.titleFromRequest } : { title: context.sessionTitle },
  );
  // The agent's working folder is observed source, not the user's project.
  const { lead, trailingSource } = sessionCrumbs(identity, context.projectLabel ?? null);
  // The way back to where this session was opened from: a project page
  // (unless the breadcrumb already leads there, a confirmed member opened from
  // its own project's list), its search results, or a calendar day.
  const sessionReturn = useAppStore((state) => state.sessionReturn);
  const back = sessionReturnLink(sessionReturn, draft?.session.id ?? null, lead);
  return (
    <nav className="session-detail-breadcrumb" aria-label="현재 위치">
      {back?.to === "calendar" ? (
        <button
          type="button"
          className="session-detail-back"
          title="열었던 캘린더 날짜로 돌아갑니다"
          onClick={() => {
            setSessionReturn(null);
            openCalendarAt(back.date);
          }}
        >
          <ArrowLeft size={12} aria-hidden="true" />
          <span>{back.label}</span>
        </button>
      ) : back ? (
        <button
          type="button"
          className="session-detail-back"
          title={back.viaSearch ? "프로젝트 검색 결과로 돌아갑니다" : "열었던 프로젝트로 돌아갑니다"}
          onClick={() => {
            setSessionReturn(null);
            openProjectContext(back.contextId);
          }}
        >
          <ArrowLeft size={12} aria-hidden="true" />
          <span>{back.viaSearch ? `${back.label} 검색 결과` : back.label}</span>
        </button>
      ) : null}
      {lead?.kind === "project" ? (
        <button
          type="button"
          className="session-detail-crumb"
          title="확정한 프로젝트"
          onClick={() => openProjectContext(lead.contextId)}
        >
          <FolderGit2 size={12} aria-hidden="true" />
          <span>{lead.label}</span>
        </button>
      ) : lead?.kind === "review-needed" ? (
        <span
          className="session-detail-crumb is-unavailable"
          title={
            lead.reason === "archived"
              ? "확정했던 프로젝트가 보관되었습니다. 프로젝트에서 다시 확인하세요."
              : "확정했던 프로젝트를 찾을 수 없습니다. 프로젝트에서 다시 확인하세요."
          }
        >
          <TriangleAlert size={12} aria-hidden="true" />
          <span>프로젝트 확인 필요</span>
        </span>
      ) : lead?.kind === "source" ? (
        <button
          type="button"
          className="session-detail-crumb"
          title="에이전트 작업 폴더 · 확정한 프로젝트 없음"
          onClick={() => openProject(lead.sourceKey)}
        >
          <Folder size={12} aria-hidden="true" />
          <span>{shortProjectLabel(lead.sourceKey)}</span>
        </button>
      ) : null}
      {lead ? <ChevronRight size={11} className="session-detail-crumb-sep" aria-hidden="true" /> : null}
      <span
        className="session-detail-crumb is-current"
        title={shownTitle}
      >
        {shownTitle}
      </span>
      {trailingSource ? (
        <button
          type="button"
          className="session-detail-source"
          title="에이전트 작업 폴더"
          onClick={() => openProject(trailingSource)}
        >
          <Folder size={11} aria-hidden="true" />
          <span>{shortProjectLabel(trailingSource)}</span>
        </button>
      ) : null}
    </nav>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type SessionTabSpec = {
  id: SessionTab;
  label: string;
  icon: typeof GanttChartSquare;
};

const SESSION_TABS: SessionTabSpec[] = [
  { id: "overview", label: "개요", icon: LayoutDashboard },
  { id: "flow", label: "활동", icon: GanttChartSquare },
  { id: "analysis", label: "분석", icon: Sparkles },
  { id: "report", label: "공유", icon: ScrollText },
];

/**
 * Tab strip with count badges in place of the deprecated metric strip.
 *  - 개요:    no count (the at-a-glance summary, not a counted collection)
 *  - 활동:    timeline event count
 *  - 분석:    open issues + unconfirmed decisions + pending next actions (the
 *             review backlog still to confirm)
 *  - 공유:    no count (it is an output, not a counted collection)
 *
 * A zero count is hidden rather than rendered as "(0)" so the bar stays calm
 * on a fresh session.
 */
function SessionTabBar({
  activeTab,
  onChange,
}: {
  activeTab: SessionTab;
  onChange: (tab: SessionTab) => void;
}) {
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const imports = useSessionStore((state) => state.imports);
  const pendingReview = useSessionStore((state) => state.pendingReview);

  const counts: Record<SessionTab, number | null> = useMemo(() => {
    const sources = mode === "demo" ? view.sources.length : imports.length;
    const openIssues = view.issues.filter((issue) => issue.status !== "resolved").length;
    const unconfirmedDecisions = view.decisions.filter((d) => !d.confirmed).length;
    // Counted as the review board shows them, without actions that only
    // restate their issue, so the badge and the board agree.
    const pendingNextActions = nextActionsWorthShowing(view.nextActions, view.issues).filter(
      (a) => !isNextActionCompleted(a),
    ).length;
    const reviewCount = openIssues + unconfirmedDecisions + pendingNextActions;
    return {
      overview: null,
      flow: view.events.length,
      reconstruct: null,
      evidence: sources,
      insights: reviewCount,
      // 분석 carries the review backlog (open issues + unconfirmed decisions +
      // pending next actions) — the work still to confirm.
      analysis: reviewCount,
      report: null,
    };
  }, [view, imports, mode]);

  return (
    <nav
      className="session-tabs"
      role="tablist"
      aria-label="세션 상세 탭"
      onKeyDown={(event) => {
        const ids = SESSION_TABS.map((t) => t.id);
        const current = ids.indexOf(activeTab);
        let next = -1;
        if (event.key === "ArrowRight") next = (current + 1) % ids.length;
        else if (event.key === "ArrowLeft") next = (current - 1 + ids.length) % ids.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = ids.length - 1;
        if (next !== -1) {
          event.preventDefault();
          const nextId = ids[next]!;
          onChange(nextId);
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }
      }}
    >
      {SESSION_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const count = counts[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            tabIndex={isActive ? 0 : -1}
            aria-selected={isActive}
            className={`session-tab${isActive ? " is-active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{tab.label}</span>
            {tab.id === "analysis" && pendingReview ? (
              <b className="session-tab-dot" title="검토 대기" aria-label="검토 대기" />
            ) : count && count > 0 ? (
              <b className="session-tab-count">{count}</b>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Tab content ────────────────────────────────────────────────────────────

function SessionTabContent({ tab }: { tab: SessionTab }) {
  if (tab === "overview") return <OverviewView />;
  if (tab === "reconstruct") return <TimelineView mode="timeline" />;
  if (tab === "analysis") return <AnalysisView />;
  // 자료 / 검토 are retired from the tab bar (folded into 분석) but kept reachable
  // in code; the redirect effect routes a stale tab here to 분석.
  if (tab === "evidence") return <EvidenceView />;
  if (tab === "insights") return <ReviewView />;
  if (tab === "report") return <ReportsView />;
  return <TimelineView mode="timeline" />;
}
