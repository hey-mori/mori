import {
  ArrowRight,
  BookCheck,
  FolderGit2,
  FolderKanban,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { Button } from "../../components/ui/Button";
import { MoriObjectRow } from "../../components/ui/MoriObjectRow";
import { MoriMetadataLine } from "../../components/ui/MoriMetadataLine";
import { MoriSection } from "../../components/ui/MoriSection";
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
  type ProjectSessionInsightSnapshot,
} from "../../lib/project/projectOverview";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";
import { getAcceptedMemoryRepository } from "../../lib/project-memory/acceptedMemoryRepository";
import type { StoredAcceptedProjectMemory } from "../../lib/storage/storageTypes";
import { useMoriProjectStore } from "../../app/projectStore";
import { projectDisplayName } from "../../lib/projects/userProjects";
import { ProjectFormModal } from "./ProjectFormModal";
import { ProjectSynthesisSection } from "./ProjectSynthesisSection";
import { ProjectPulse } from "./ProjectPulse";
import { useProjectSynthesis } from "./useProjectSynthesis";
import { spanLabel } from "../../lib/session/workContext";

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
 *   - sessions in the same compact row format used by Home recent sessions
 *   - quiet empty state when there is no project selected
 *
 * The page never renders project content it does not have. Everything is
 * derived from stored session summaries; nothing here writes.
 */
export function ProjectView() {
  const projectKey = useMoriAppStore((state) => state.currentProjectKey);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const openSession = useMoriAppStore((state) => state.openSession);

  const userProjects = useMoriProjectStore((state) => state.projects);
  const hydrateProjects = useMoriProjectStore((state) => state.hydrate);
  const projectsInitialized = useMoriProjectStore((state) => state.initialized);
  const editUserProjectRecord = useMoriProjectStore((state) => state.editProject);
  const deleteUserProjectRecord = useMoriProjectStore((state) => state.deleteProject);
  const [editing, setEditing] = useState(false);
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

  const storedSessions = useMemo(
    () => mergeDemoSessionSummaries(summaries),
    [summaries],
  );

  const overview = useMemo(() => {
    if (!projectKey) return null;
    return buildProjectOverview({
      projectKey,
      sessions: storedSessions,
      sessionInsights: gatherProjectSessionInsights(storedSessions, repository),
    });
  }, [projectKey, repository, storedSessions]);

  // Durable memory is keyed by `projectId`, but the project page is opened by
  // `sourceLabel`. Resolve one to the other from the project's own sessions so
  // the page can show "what this project remembers" without the active session
  // having to be one of them.
  const projectId = useMemo(() => {
    if (!projectKey) return null;
    const key = projectKey.trim().toLowerCase();
    const match = storedSessions.find(
      (entry) => (entry.sourceLabel ?? "").trim().toLowerCase() === key,
    );
    return match?.projectId ?? null;
  }, [projectKey, storedSessions]);

  // Durable accepted memory for this project — surfaced inline and compactly
  // (only when it exists). No consolidation navigate-away; reviewing proposals
  // into durable memory is handled in-context, not by leaving the page.
  const [memories, setMemories] = useState<StoredAcceptedProjectMemory[]>([]);

  useEffect(() => {
    if (!projectId) {
      setMemories([]);
      return;
    }
    let cancelled = false;
    const memoryRepository = getAcceptedMemoryRepository();
    void memoryRepository
      .listAcceptedProjectMemories(projectId)
      .then((result) => {
        if (!cancelled) setMemories(result.data);
      })
      .catch(() => {
        if (!cancelled) setMemories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectsInitialized) hydrateProjects();
  }, [projectsInitialized, hydrateProjects]);

  // Sessions in display order, plus the timestamps and synthesis the overview
  // band and the synthesis section share. Computed before the early return so
  // the hooks stay unconditional.
  const sessionRows = useMemo(
    () => (overview ? overview.groups.flatMap((group) => group.rows) : []),
    [overview],
  );
  const sessionTimestamps = useMemo(
    () => sessionRows.map((row) => row.timestamp),
    [sessionRows],
  );
  const synthesis = useProjectSynthesis(sessionRows);

  // Display name + description honour a user override; whether the project is
  // explicitly created decides if it can be deleted (a session-derived project
  // cannot).
  const projectRecord = userProjects.find((entry) => entry.key === projectKey);
  const displayName = projectKey
    ? projectDisplayName(projectKey, userProjects)
    : "";
  const description = projectRecord?.description?.trim() ?? "";
  const isCreatedProject = projectRecord?.created ?? false;

  function handleSaveEdit(values: { name: string; description: string }) {
    if (!projectKey) return;
    editUserProjectRecord(projectKey, {
      name: values.name,
      description: values.description,
    });
    setEditing(false);
  }

  function handleDeleteProject() {
    if (!projectKey || !isCreatedProject) return;
    const ok = window.confirm(
      `'${displayName}' 프로젝트를 목록에서 제거할까요? 세션은 삭제되지 않습니다.`,
    );
    if (!ok) return;
    deleteUserProjectRecord(projectKey);
    setCurrentView("workspace");
  }

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

  if (!projectKey || !overview) {
    return (
      <PageShell className="project-page" maxWidth="wide">
        <EmptyState
          icon={FolderGit2}
          title="프로젝트를 선택하세요"
          description="좌측 사이드바의 프로젝트 폴더 이름을 누르면 그 프로젝트의 전체 세션과 메모리가 한 페이지에 보입니다."
          actions={
            <Button variant="primary" onClick={() => setCurrentView("workspace")}>
              전체 프로젝트 보기
            </Button>
          }
        />
      </PageShell>
    );
  }

  const projectSessionLabel = displayName || overview.shortName;

  return (
    <PageShell className="project-page" maxWidth="wide">
      <header
        className="project-hero"
        style={{
          padding: "18px 20px",
          borderRadius: 12,
          background: "var(--mori-surface)",
          boxShadow: "none",
        }}
      >
        <div className="project-hero-titles">
          <h1>{displayName || overview.shortName}</h1>
          {overview.fullPath && overview.fullPath !== (displayName || overview.shortName) ? (
            <p className="project-hero-path" title={overview.fullPath}>
              {overview.fullPath}
            </p>
          ) : null}
          {description ? <p className="project-hero-path">{description}</p> : null}
        </div>
        <div className="project-hero-actions">
          <Button
            variant="ghost"
            icon={Pencil}
            onClick={() => setEditing(true)}
            title="프로젝트 이름과 설명을 수정합니다 (세션은 그대로)."
          >
            수정
          </Button>
          {isCreatedProject ? (
            <Button
              variant="ghost"
              icon={Trash2}
              onClick={handleDeleteProject}
              title="이 프로젝트를 목록에서 제거합니다. 세션은 삭제되지 않습니다."
            >
              삭제
            </Button>
          ) : null}
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setCurrentView("start")}
            title="이 프로젝트에 새 세션을 시작합니다. 새 대화 또는 기존 대화 가져오기."
          >
            새 세션
          </Button>
        </div>
      </header>

      <ProjectPulse timestamps={sessionTimestamps} synthesis={synthesis} />

      {editing ? (
        <ProjectFormModal
          mode="edit"
          initialName={displayName}
          initialDescription={description}
          onSubmit={handleSaveEdit}
          onClose={() => setEditing(false)}
        />
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <ProjectSynthesisSection
          synthesis={synthesis}
          onOpenSession={(sessionId) => openSessionId(sessionId)}
        />

        <MoriSection
          className="project-sessions"
          title="세션"
          actions={
            <span className="project-section-count">{sessionRows.length}건</span>
          }
          ariaLabel="프로젝트 세션"
        >
          {sessionRows.length === 0 ? (
            <EmptyState
              compact
              icon={Layers}
              title="이 프로젝트에 활성 세션이 없습니다"
              description="새 세션을 시작하거나 소스에서 가져오면 여기에 쌓입니다."
              actions={
                <Button onClick={() => setCurrentView("connections")}>소스 열기</Button>
              }
            />
          ) : (
            <ul className="project-session-list">
              {sessionRows.map((row) => (
                <ProjectSessionRowItem
                  key={row.sessionId}
                  row={row}
                  projectLabel={projectSessionLabel}
                  onOpen={() => openSessionId(row.sessionId)}
                />
              ))}
            </ul>
          )}
        </MoriSection>
      </div>

      <ProjectMemoryList memories={memories} />
    </PageShell>
  );
}

/**
 * Compact "what this project remembers" list. Durable accepted memory only —
 * rendered inline, capped, and *only when it exists*, so an empty project shows
 * nothing here instead of an onboarding card. No consolidation navigate-away.
 */
function ProjectMemoryList({ memories }: { memories: StoredAcceptedProjectMemory[] }) {
  if (memories.length === 0) return null;
  const top = memories.slice(0, 6);
  return (
    <MoriSection
      className="project-memory"
      title="이 프로젝트가 기억하는 것"
      actions={<span className="project-section-count">{memories.length}건</span>}
      ariaLabel="이 프로젝트가 기억하는 것"
    >
      <ul className="project-memory-list">
        {top.map((memory) => (
          <li key={memory.id}>
            <MoriObjectRow
              leading={<BookCheck size={15} />}
              title={memory.title}
              meta={
                memory.summary ? (
                  <MoriMetadataLine items={[memory.summary]} />
                ) : undefined
              }
              density="compact"
              ariaLabel={memory.title}
            />
          </li>
        ))}
      </ul>
    </MoriSection>
  );
}

function ProjectSessionRowItem({
  row,
  projectLabel,
  onOpen,
}: {
  row: ProjectSessionRow;
  projectLabel: string;
  onOpen: () => void;
}) {
  return (
    <li>
      <MoriObjectRow
        leading={<FolderKanban size={15} />}
        title={row.title}
        className="session-list-row"
        meta={
          <MoriMetadataLine
            items={[projectLabel, spanLabel(row.timestamp, undefined)]}
          />
        }
        onClick={onOpen}
        ariaLabel={row.title}
        density="compact"
        trailing={<ArrowRight size={13} aria-hidden="true" />}
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
