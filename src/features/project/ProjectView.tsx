import {
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  Database,
  FileText,
  FolderGit2,
  FolderKanban,
  Layers,
  Plus,
  ScrollText,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { Button } from "../../components/ui/Button";
import { MoriObjectRow } from "../../components/ui/MoriObjectRow";
import { MoriMetadataLine } from "../../components/ui/MoriMetadataLine";
import { MoriMetricStrip } from "../../components/ui/MoriMetricStrip";
import { MoriSection } from "../../components/ui/MoriSection";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { useMoriAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  selectSessionSource,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import {
  buildProjectOverview,
  type ProjectFocusItem,
  type ProjectSessionRow,
  type ProjectSessionInsightSnapshot,
} from "../../lib/project/projectOverview";
import { formatSidebarRelative } from "../../lib/sidebar/sessionList";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";

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
  const setMemoryTab = useMoriAppStore((state) => state.setMemoryTab);
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

  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const [summaries, setSummaries] = useState(() => safeListSessions());
  useEffect(() => {
    setSummaries(safeListSessions());
  }, [projectKey, activeSessionId]);

  const overview = useMemo(() => {
    if (!projectKey) return null;
    const storedSessions = mergeDemoSessionSummaries(summaries);
    return buildProjectOverview({
      projectKey,
      sessions: storedSessions,
      sessionInsights: gatherProjectSessionInsights(storedSessions, repository),
    });
  }, [projectKey, repository, summaries]);

  const isDesktop = source === "desktop-sqlite";
  const openSessionId = (sessionId: string, tab: Parameters<typeof openSession>[0] = "flow") => {
    if (sessionId === activeSessionId) {
      openSession(tab);
      return;
    }
    if (isDesktop) {
      void loadDesktopSession(sessionId).then((ok) => {
        if (!ok) loadBrowserSession(sessionId);
        openSession(tab);
      });
    } else {
      loadBrowserSession(sessionId);
      openSession(tab);
    }
  };

  const openFocusItem = (item: ProjectFocusItem) => {
    const targetSessionId = item.targetSessionId;
    if (!item.enabled || !targetSessionId) return;
    if (item.destination === "memory") {
      if (targetSessionId !== activeSessionId) {
        if (isDesktop) {
          void loadDesktopSession(targetSessionId).then((ok) => {
            if (!ok) loadBrowserSession(targetSessionId);
            setMemoryTab("overview");
            setCurrentView("memory");
          });
          return;
        }
        loadBrowserSession(targetSessionId);
      }
      setMemoryTab("overview");
      setCurrentView("memory");
      return;
    }
    openSessionId(targetSessionId, item.destination);
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

      <MoriMetricStrip
        className="project-stats"
        items={[
          {
            key: "sessions",
            label: "전체 세션",
            value: overview.stats.sessions,
          },
          {
            key: "events",
            label: "총 이벤트",
            value: overview.stats.totalEvents,
            hint: overview.stats.lastActivity
              ? `최근 활동 ${formatSidebarRelative(overview.stats.lastActivity)}`
              : "최근 활동 기록 없음",
          },
          {
            key: "sources",
            label: "증거 소스",
            value: overview.stats.totalSources,
          },
          {
            key: "review",
            label: "검토 항목",
            value: overview.stats.reviewItems,
          },
          {
            key: "memory",
            label: "메모리 후보",
            value: overview.stats.memoryCandidates,
          },
        ]}
      />

      <MoriSection
        className="project-focus"
        title="작업 상태"
        actions={
          overview.stats.savedReports > 0 ? (
            <MoriStatusBadge tone="success">
              리포트 {overview.stats.savedReports}개
            </MoriStatusBadge>
          ) : null
        }
        ariaLabel="프로젝트 작업 상태"
      >
        <ul className="project-focus-list">
          {overview.focusItems.map((item) => (
            <ProjectFocusRow
              key={item.key}
              item={item}
              onOpen={() => openFocusItem(item)}
            />
          ))}
        </ul>
      </MoriSection>

      <MoriSection
        className="project-sessions"
        title="세션"
        actions={
          <span className="project-section-count">
            <CalendarClock size={13} aria-hidden="true" />
            {overview.stats.activeSessions}건
          </span>
        }
        ariaLabel="프로젝트 세션"
      >
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
                      onOpen={() => openSessionId(row.sessionId)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </MoriSection>
    </PageShell>
  );
}

function ProjectSessionRowItem({
  row,
  onOpen,
}: {
  row: ProjectSessionRow;
  onOpen: () => void;
}) {
  // No per-row timestamp: the session group header (오늘 / 이번 주 / 이전) already
  // states recency, so repeating a relative date on every row was a second date.
  // No process badge (진행 중 / 분석 중) either — that is pipeline state the user
  // does not act on from a list.
  const meta = [
    row.eventCount ? `이벤트 ${row.eventCount}건` : null,
    row.sourceCount ? `소스 ${row.sourceCount}개` : null,
    row.reviewCount ? `검토 ${row.reviewCount}건` : null,
  ].filter((label): label is string => Boolean(label));

  return (
    <li>
      <MoriObjectRow
        leading={<FolderKanban size={15} />}
        title={row.title}
        meta={<MoriMetadataLine items={meta} />}
        onClick={onOpen}
        ariaLabel={row.title}
        density="compact"
        trailing={<ArrowRight size={13} aria-hidden="true" />}
      />
    </li>
  );
}

function ProjectFocusRow({
  item,
  onOpen,
}: {
  item: ProjectFocusItem;
  onOpen: () => void;
}) {
  const Icon =
    item.destination === "insights"
      ? ClipboardCheck
      : item.destination === "evidence"
        ? Database
        : item.destination === "memory"
          ? FileText
          : ScrollText;
  return (
    <li>
      <MoriObjectRow
        leading={<Icon size={15} />}
        title={item.title}
        subtitle={item.detail}
        status={<MoriStatusBadge tone={item.tone}>{item.statusLabel}</MoriStatusBadge>}
        trailing={item.enabled ? <ArrowRight size={13} aria-hidden="true" /> : null}
        onClick={item.enabled ? onOpen : undefined}
        ariaLabel={item.title}
        density="compact"
      />
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

function gatherProjectSessionInsights(
  summaries: ReturnType<typeof loadStoredSessionSummaries>,
  repository: ReturnType<typeof createBrowserDraftRepository>,
): ProjectSessionInsightSnapshot[] {
  let reportSessionIds = new Map<string, number>();
  try {
    reportSessionIds = repository.listMoriPackageDrafts().reduce((map, draft) => {
      for (const sessionId of draft.package.manifest.sessionIds) {
        map.set(sessionId, (map.get(sessionId) ?? 0) + 1);
      }
      return map;
    }, new Map<string, number>());
  } catch {
    reportSessionIds = new Map();
  }

  return summaries.map((summary) => {
    let sourceCount = 0;
    try {
      sourceCount = repository.listSessionImports(summary.sessionId).length;
    } catch {
      sourceCount = 0;
    }

    let body;
    try {
      body = repository.loadSessionMemoryBody(summary.sessionId);
    } catch {
      body = null;
    }

    if (!body) {
      return {
        sessionId: summary.sessionId,
        sourceCount,
        reportCount: reportSessionIds.get(summary.sessionId) ?? 0,
      };
    }

    return {
      sessionId: summary.sessionId,
      sourceCount,
      openIssues: body.issues.filter((issue) => issue.status === "open").length,
      unconfirmedDecisions: body.decisions.filter((decision) => !decision.confirmed).length,
      pendingNextActions: body.nextActions.filter((action) => !isNextActionCompleted(action)).length,
      decisionCount: body.decisions.length,
      hasSummary: Boolean(body.summarySnapshot),
      reportCount: reportSessionIds.get(summary.sessionId) ?? 0,
    };
  });
}
