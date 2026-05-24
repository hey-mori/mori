import {
  ArrowRight,
  CalendarClock,
  FolderGit2,
  Layers,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { Button } from "../../components/ui/Button";
import { MoriSectionHeader } from "../../components/ui/MoriSectionHeader";
import { useMoriAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  selectSessionSource,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import {
  buildProjectOverview,
  type ProjectSessionRow,
} from "../../lib/project/projectOverview";
import { formatSidebarRelative } from "../../lib/sidebar/sessionList";

/**
 * Project workspace — the unit-of-work page.
 *
 * Mori organises sessions under projects (sourceLabel). Until now there was
 * no surface to *see* a project: the sidebar listed its sessions and the
 * workspace browser grouped them, but there was no "project overview" —
 * just nested children. This view fills that gap.
 *
 * It is intentionally a calm, dense single column:
 *   - hero with project name, full path, and a small action cluster
 *   - a four-stat strip (sessions / active / archived / events)
 *   - sessions grouped by recency (today / 이번 주 / 이전)
 *   - quiet empty state when there is no project selected
 *
 * The page never renders project content it does not have. Everything is
 * derived from stored session summaries; nothing here writes.
 */
export function ProjectView() {
  const projectKey = useMoriAppStore((state) => state.currentProjectKey);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const openSession = useMoriAppStore((state) => state.openSession);
  const source = useMoriSessionStore(selectSessionSource);
  const loadBrowserSession = useMoriSessionStore(
    (state) => state.loadBrowserSession,
  );
  const loadDesktopSession = useMoriSessionStore(
    (state) => state.loadDesktopSession,
  );
  const activeSessionId = useMoriSessionStore(
    (state) => state.draft?.session.id ?? null,
  );

  const [summaries, setSummaries] = useState(() => safeListSessions());
  useEffect(() => {
    setSummaries(safeListSessions());
  }, [projectKey, activeSessionId]);

  const overview = useMemo(() => {
    if (!projectKey) return null;
    return buildProjectOverview({
      projectKey,
      sessions: mergeDemoSessionSummaries(summaries),
    });
  }, [projectKey, summaries]);

  const isDesktop = source === "desktop-sqlite";
  const openSessionId = (sessionId: string) => {
    if (sessionId === activeSessionId) {
      openSession("flow");
      return;
    }
    if (isDesktop) {
      void loadDesktopSession(sessionId).then((ok) => {
        if (!ok) loadBrowserSession(sessionId);
        openSession("flow");
      });
    } else {
      loadBrowserSession(sessionId);
      openSession("flow");
    }
  };

  if (!projectKey || !overview) {
    return (
      <PageShell className="project-page" maxWidth="wide">
        <EmptyState
          icon={FolderGit2}
          title="프로젝트를 선택하세요"
          description="좌측 사이드바의 프로젝트 폴더 이름을 누르면 그 프로젝트의 전체 세션과 메모리가 한 페이지에 보입니다."
          actions={
            <Button onClick={() => setCurrentView("workspace")}>
              전체 세션 보기
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell className="project-page" maxWidth="wide">
      <header className="project-hero">
        <div className="project-hero-titles">
          <div className="project-hero-badge">
            <FolderGit2 size={14} aria-hidden="true" />
            <span>프로젝트</span>
          </div>
          <h1>{overview.shortName}</h1>
          <p className="project-hero-path" title={overview.fullPath}>
            {overview.fullPath}
          </p>
        </div>
        <div className="project-hero-actions">
          <Button
            icon={Layers}
            onClick={() => setCurrentView("workspace")}
            title="전체 프로젝트 / 세션 목록"
          >
            전체 세션
          </Button>
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setCurrentView("start")}
          >
            새 세션 시작
          </Button>
        </div>
      </header>

      <dl className="project-stats mori-metric-strip">
        <ProjectStat
          label="전체 세션"
          value={overview.stats.sessions}
          hint={`${overview.stats.activeSessions}건 활성 · ${overview.stats.archivedSessions}건 보관`}
        />
        <ProjectStat
          label="활성 세션"
          value={overview.stats.activeSessions}
          hint="보관되지 않은 세션"
        />
        <ProjectStat
          label="보관 세션"
          value={overview.stats.archivedSessions}
          hint="목록 하단으로 정리됨"
        />
        <ProjectStat
          label="총 이벤트"
          value={overview.stats.totalEvents}
          hint={overview.stats.lastActivity
            ? `최근 활동 ${formatSidebarRelative(overview.stats.lastActivity)}`
            : "최근 활동 기록 없음"}
        />
      </dl>

      <section className="project-sessions mori-section" aria-label="프로젝트 세션">
        <MoriSectionHeader
          title="세션"
          action={
            <span className="project-section-count">
              <CalendarClock size={13} aria-hidden="true" />
              {overview.stats.activeSessions}건
            </span>
          }
        />

        {overview.groups.length === 0 ? (
          <EmptyState
            compact
            icon={Layers}
            title="이 프로젝트에 활성 세션이 없습니다"
            description="새 세션을 시작하거나 연결에서 가져오면 여기에 쌓입니다."
            actions={
              <Button onClick={() => setCurrentView("connections")}>연결 열기</Button>
            }
          />
        ) : (
          <div className="project-session-groups">
            {overview.groups.map((group) => (
              <div key={group.bucket} className="project-session-group">
                <p className="project-session-group-label">{group.label}</p>
                <ul>
                  {group.rows.map((row) => (
                    <ProjectSessionRowItem
                      key={row.sessionId}
                      row={row}
                      active={row.sessionId === activeSessionId}
                      onOpen={() => openSessionId(row.sessionId)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function ProjectStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="project-stat">
      <dd>
        <strong>{value}</strong>
      </dd>
      <dt>
        <span>{label}</span>
        <small>{hint}</small>
      </dt>
    </div>
  );
}

function ProjectSessionRowItem({
  row,
  active,
  onOpen,
}: {
  row: ProjectSessionRow;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`project-session-row mori-list-row${active ? " is-active" : ""}`}
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
      >
        <div className="project-session-titles">
          <strong>{row.title}</strong>
          <span className="project-session-meta">
            {formatSidebarRelative(row.timestamp)}
            {row.eventCount ? ` · 이벤트 ${row.eventCount}건` : ""}
          </span>
        </div>
        <ArrowRight size={14} aria-hidden="true" className="project-session-arrow" />
      </button>
    </li>
  );
}

function safeListSessions() {
  try {
    return loadStoredSessionSummaries();
  } catch {
    return [];
  }
}
