import {
  ArrowRight,
  BookCheck,
  Check,
  ClipboardCheck,
  Database,
  FileText,
  FolderGit2,
  FolderKanban,
  FolderPlus,
  Layers,
  Pencil,
  Plus,
  ScrollText,
  Trash2,
  X,
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
import { getAcceptedMemoryRepository } from "../../lib/project-memory/acceptedMemoryRepository";
import type { StoredAcceptedProjectMemory } from "../../lib/storage/storageTypes";
import { useMoriProjectStore } from "../../app/projectStore";
import { projectDisplayName } from "../../lib/projects/userProjects";
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
  const openProject = useMoriAppStore((state) => state.openProject);
  const openSession = useMoriAppStore((state) => state.openSession);
  const setMemoryTab = useMoriAppStore((state) => state.setMemoryTab);

  const userProjects = useMoriProjectStore((state) => state.projects);
  const hydrateProjects = useMoriProjectStore((state) => state.hydrate);
  const projectsInitialized = useMoriProjectStore((state) => state.initialized);
  const createUserProjectRecord = useMoriProjectStore((state) => state.createProject);
  const renameUserProjectRecord = useMoriProjectStore((state) => state.renameProject);
  const deleteUserProjectRecord = useMoriProjectStore((state) => state.deleteProject);
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
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectDraft, setProjectDraft] = useState("");
  const [renamingProject, setRenamingProject] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  // Display name honours a user override; whether the project is explicitly
  // created decides if it can be deleted (a session-derived project cannot).
  const displayName = projectKey
    ? projectDisplayName(projectKey, userProjects)
    : "";
  const isCreatedProject = userProjects.some(
    (entry) => entry.key === projectKey && entry.created,
  );

  function handleCreateProject() {
    const key = projectDraft.trim();
    if (!key) return;
    const createdKey = createUserProjectRecord({ key });
    if (!createdKey) return;
    setProjectDraft("");
    setCreatingProject(false);
    openProject(createdKey);
  }

  function beginRenameProject() {
    setRenameDraft(displayName);
    setRenamingProject(true);
    setConfirmingDelete(false);
  }

  function handleRenameProject() {
    if (!projectKey) return;
    renameUserProjectRecord(projectKey, renameDraft);
    setRenamingProject(false);
  }

  function handleDeleteProject() {
    if (!projectKey || !isCreatedProject) return;
    deleteUserProjectRecord(projectKey);
    setConfirmingDelete(false);
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
            <>
              <Button variant="primary" icon={Plus} onClick={() => setCreatingProject(true)}>
                새 프로젝트
              </Button>
              <Button variant="ghost" onClick={() => setCurrentView("workspace")}>
                전체 세션 보기
              </Button>
            </>
          }
        />
        {creatingProject ? (
          <ProjectNameForm
            value={projectDraft}
            onChange={setProjectDraft}
            onSubmit={handleCreateProject}
            onCancel={() => {
              setCreatingProject(false);
              setProjectDraft("");
            }}
            submitLabel="만들기"
          />
        ) : null}
      </PageShell>
    );
  }

  const sessionRows = overview.groups.flatMap((group) => group.rows);
  const projectSessionLabel = displayName || overview.shortName;

  return (
    <PageShell className="project-page" maxWidth="wide">
      <header className="project-hero">
        <div className="project-hero-titles">
          <div className="project-hero-badge">
            <FolderGit2 size={14} aria-hidden="true" />
            <span>프로젝트</span>
          </div>
          <h1>{displayName || overview.shortName}</h1>
          <p className="project-hero-path" title={overview.fullPath}>
            {overview.fullPath}
          </p>
        </div>
        <div className="project-hero-actions">
          <Button
            variant="ghost"
            icon={Pencil}
            onClick={beginRenameProject}
            title="이 프로젝트의 표시 이름을 바꿉니다 (세션은 그대로)."
          >
            이름 변경
          </Button>
          {isCreatedProject ? (
            <Button
              variant="ghost"
              icon={Trash2}
              onClick={() => {
                setConfirmingDelete(true);
                setRenamingProject(false);
              }}
              title="이 프로젝트를 목록에서 제거합니다. 세션은 삭제되지 않습니다."
            >
              삭제
            </Button>
          ) : null}
          <Button
            variant="ghost"
            icon={FolderPlus}
            onClick={() => {
              setCreatingProject(true);
              setRenamingProject(false);
              setConfirmingDelete(false);
            }}
            title="새 프로젝트를 만들어 바로 엽니다."
          >
            새 프로젝트
          </Button>
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setCurrentView("start")}
            title="이 프로젝트에 새 세션을 시작합니다 — 새 대화 또는 기존 대화 가져오기."
          >
            새 세션
          </Button>
        </div>
      </header>

      {creatingProject ? (
        <ProjectNameForm
          value={projectDraft}
          onChange={setProjectDraft}
          onSubmit={handleCreateProject}
          onCancel={() => {
            setCreatingProject(false);
            setProjectDraft("");
          }}
          submitLabel="만들기"
        />
      ) : null}
      {renamingProject ? (
        <ProjectNameForm
          value={renameDraft}
          onChange={setRenameDraft}
          onSubmit={handleRenameProject}
          onCancel={() => setRenamingProject(false)}
          submitLabel="저장"
        />
      ) : null}
      {confirmingDelete ? (
        <div className="project-inline-form project-inline-form-danger">
          <div>
            <strong>{displayName}</strong>
            <p>프로젝트 목록에서만 제거합니다. 세션은 삭제되지 않습니다.</p>
          </div>
          <div className="project-inline-form-actions">
            <Button variant="ghost" icon={X} onClick={() => setConfirmingDelete(false)}>
              취소
            </Button>
            <Button variant="primary" icon={Trash2} onClick={handleDeleteProject}>
              삭제
            </Button>
          </div>
        </div>
      ) : null}

      <MoriMetricStrip
        className="project-stats"
        items={[
          {
            key: "sessions",
            label: "세션",
            value: overview.stats.sessions,
            hint: overview.stats.lastActivity
              ? `최근 활동 ${formatSidebarRelative(overview.stats.lastActivity)}`
              : "최근 활동 기록 없음",
          },
          {
            key: "review",
            label: "검토 항목",
            value: overview.stats.reviewItems,
          },
          {
            key: "memory",
            label: "확정 메모리",
            value: memories.length,
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
            {overview.stats.activeSessions}건
          </span>
        }
        ariaLabel="프로젝트 세션"
      >
        {sessionRows.length === 0 ? (
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

      <ProjectMemoryList memories={memories} />
    </PageShell>
  );
}

function ProjectNameForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <form
      className="project-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label>
        <span>프로젝트 이름</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="예: C:/dev/mori 또는 Mori 앱"
          autoFocus
        />
      </label>
      <div className="project-inline-form-actions">
        <Button variant="ghost" icon={X} onClick={onCancel}>
          취소
        </Button>
        <Button variant="primary" icon={Check} type="submit" disabled={!value.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
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
