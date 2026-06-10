import { useEffect, useMemo } from "react";
import {
  ChevronRight,
  FileText,
  FolderGit2,
  GanttChartSquare,
  LayoutDashboard,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { useAppStore, type SessionTab } from "../../app/store";
import {
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { buildWorkContext } from "../../lib/session/workContext";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import { TimelineView } from "../timeline/TimelineView";
import { EvidenceView } from "../evidence/EvidenceView";
import { ReviewView } from "../review/ReviewView";
import { ReportsView } from "../reports/ReportsView";
import { OverviewView } from "./OverviewView";

/**
 * Session Detail — the unified, tabbed workspace for one session.
 *
 * No header band. The sidebar's highlighted row identifies which session is
 * open, so the workspace top is a single tight row: the session title as a
 * subtle inline label, then the tab strip with count badges in place of the
 * old "이벤트 24 · 소스 5 · 결정 7 …" metric strip. Tabs:
 *
 *   - **개요**    — session at a glance (identity · summary · scale · quick nav)
 *   - **흐름**    — Timeline + conversation thread
 *   - **증거**    — imported sources / evidence
 *   - **검토**    — issues / decisions / next actions to confirm
 *   - **공유**    — handoff outputs: continue-context, report, .mori export
 */
export function SessionDetailView() {
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const sessionTab = useAppStore((state) => state.sessionTab);
  const setSessionTab = useAppStore((state) => state.setSessionTab);

  useEffect(() => {
    if (sessionTab === "reconstruct") setSessionTab("flow");
  }, [sessionTab, setSessionTab]);

  return (
    <PageShell className="session-detail-page" maxWidth="full">
      <div className="session-detail-bar">
        <SessionTitleInline />
        <SessionTabBar activeTab={sessionTab} onChange={setSessionTab} />
      </div>
      <SessionTabContent tab={sessionTab} />
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
  const context = useMemo(
    () =>
      buildWorkContext({
        draft,
        demoSession,
        analysisStatus,
      }),
    [draft, demoSession, analysisStatus],
  );
  const projectLabel = context.projectLabel ?? null;
  return (
    <nav className="session-detail-breadcrumb" aria-label="현재 위치">
      {projectLabel ? (
        <>
          <button
            type="button"
            className="session-detail-crumb"
            onClick={() => openProject(projectLabel)}
          >
            <FolderGit2 size={12} aria-hidden="true" />
            <span>{shortProjectLabel(projectLabel)}</span>
          </button>
          <ChevronRight size={11} className="session-detail-crumb-sep" aria-hidden="true" />
        </>
      ) : null}
      <span
        className="session-detail-crumb is-current"
        title={context.sessionTitle}
      >
        {context.sessionTitle}
      </span>
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
  { id: "evidence", label: "자료", icon: FileText },
  { id: "insights", label: "검토", icon: Sparkles },
  { id: "report", label: "공유", icon: ScrollText },
];

/**
 * Tab strip with count badges in place of the deprecated metric strip.
 *  - 개요:    no count (the at-a-glance summary, not a counted collection)
 *  - 흐름:    timeline event count
 *  - 증거:    imported source count
 *  - 검토:    open issues + unconfirmed decisions + pending next actions
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
    const pendingNextActions = view.nextActions.filter((a) => !isNextActionCompleted(a)).length;
    return {
      overview: null,
      flow: view.events.length,
      reconstruct: null,
      evidence: sources,
      insights: openIssues + unconfirmedDecisions + pendingNextActions,
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
            {tab.id === "evidence" && pendingReview ? (
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
  if (tab === "evidence") return <EvidenceView />;
  if (tab === "insights") return <ReviewView />;
  if (tab === "report") return <ReportsView />;
  return <TimelineView mode="timeline" />;
}
