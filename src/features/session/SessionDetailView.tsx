import { useEffect, useMemo } from "react";
import {
  ChevronRight,
  FileText,
  FolderGit2,
  GanttChartSquare,
  Layers,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { useMoriAppStore, type SessionTab } from "../../app/store";
import {
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { moriMockSession } from "../../domain/mock-data";
import { buildWorkContext } from "../../lib/session/workContext";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import { TimelineView } from "../timeline/TimelineView";
import { EvidenceView } from "../evidence/EvidenceView";
import { ReviewView } from "../review/ReviewView";
import { ReportsView } from "../reports/ReportsView";

/**
 * Session Detail — the unified, tabbed workspace for one session.
 *
 * No header band. The sidebar's highlighted row identifies which session is
 * open, so the workspace top is a single tight row: the session title as a
 * subtle inline label, then the tab strip with count badges in place of the
 * old "이벤트 24 · 소스 5 · 결정 7 …" metric strip. Tabs:
 *
 *   - **흐름**    — Timeline + conversation thread
 *   - **증거**    — imported sources / evidence
 *   - **검토**    — issues / decisions / next actions to confirm
 *   - **리포트**  — per-session report + resume builder
 */
export function SessionDetailView() {
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const sessionTab = useMoriAppStore((state) => state.sessionTab);
  const setSessionTab = useMoriAppStore((state) => state.setSessionTab);

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
 * 세션 워크스페이스 → project → current session) so the user can always
 * tell how deep they are; the project crumb is clickable to jump up.
 * No banner, no chips, no metric strip.
 */
function SessionTitleInline() {
  const draft = useMoriSessionStore((state) => state.draft);
  const analysisStatus = useMoriSessionStore((state) => state.analysisStatus);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const openProject = useMoriAppStore((state) => state.openProject);
  const context = useMemo(
    () =>
      buildWorkContext({
        draft,
        demoSession: moriMockSession.session,
        analysisStatus,
      }),
    [draft, analysisStatus],
  );
  const projectLabel = context.projectLabel ?? null;
  return (
    <nav className="session-detail-breadcrumb" aria-label="현재 위치">
      <button
        type="button"
        className="session-detail-crumb is-back"
        onClick={() => setCurrentView("workspace")}
        title="세션 워크스페이스로 돌아가기"
      >
        <Layers size={12} aria-hidden="true" />
        <span>세션</span>
      </button>
      {projectLabel ? (
        <>
          <ChevronRight size={11} className="session-detail-crumb-sep" aria-hidden="true" />
          <button
            type="button"
            className="session-detail-crumb"
            onClick={() => openProject(projectLabel)}
            title={`${projectLabel} 프로젝트 페이지로 이동`}
          >
            <FolderGit2 size={12} aria-hidden="true" />
            <span>{shortProjectLabel(projectLabel)}</span>
          </button>
        </>
      ) : null}
      <ChevronRight size={11} className="session-detail-crumb-sep" aria-hidden="true" />
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
  { id: "flow", label: "흐름", icon: GanttChartSquare },
  { id: "evidence", label: "증거", icon: FileText },
  { id: "insights", label: "검토", icon: Sparkles },
  { id: "report", label: "리포트", icon: ScrollText },
];

/**
 * Tab strip with count badges in place of the deprecated metric strip.
 *  - 흐름:    timeline event count
 *  - 증거:    imported source count
 *  - 검토: open issues + unconfirmed decisions + pending next actions
 *  - 리포트:  no count (it is an output, not a counted collection)
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
  const view = useMoriSessionStore(selectSessionView);
  const mode = useMoriSessionStore(selectSessionMode);
  const imports = useMoriSessionStore((state) => state.imports);

  const counts: Record<SessionTab, number | null> = useMemo(() => {
    const sources = mode === "demo" ? view.sources.length : imports.length;
    const openIssues = view.issues.filter((issue) => issue.status !== "resolved").length;
    const unconfirmedDecisions = view.decisions.filter((d) => !d.confirmed).length;
    const pendingNextActions = view.nextActions.filter((a) => !isNextActionCompleted(a)).length;
    return {
      flow: view.events.length,
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
            {count && count > 0 ? <b className="session-tab-count">{count}</b> : null}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Tab content ────────────────────────────────────────────────────────────

function SessionTabContent({ tab }: { tab: SessionTab }) {
  if (tab === "evidence") return <EvidenceView />;
  if (tab === "insights") return <ReviewView />;
  if (tab === "report") return <ReportsView embedded />;
  return <TimelineView mode="timeline" />;
}
