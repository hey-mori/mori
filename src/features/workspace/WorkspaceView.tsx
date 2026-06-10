import { useEffect, useMemo, useState } from "react";
import "../../styles/features/top-level-surfaces.css";
import {
  ArrowRight,
  FolderGit2,
  FolderKanban,
  FolderPlus,
  PlugZap,
  Search,
} from "lucide-react";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { BaseObjectRow } from "../../components/ui/BaseObjectRow";
import { BaseMetadataLine } from "../../components/ui/BaseMetadataLine";
import { ToolbarSearch } from "../../components/ui/ToolbarSearch";
import { useAppStore } from "../../app/store";
import {
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import { useProjectStore } from "../../app/projectStore";
import { projectDisplayName } from "../../lib/projects/userProjects";
import { ProjectFormModal } from "../project/ProjectFormModal";
import {
  buildSessionsBrowserModel,
  type SessionRow,
  type SessionsBrowserFilters,
} from "../../lib/workspace/sessionsBrowser";

/**
 * Workspace — the first-class "projects → sessions" browser.
 *
 * Under the "1 Claude conversation = 1 Mori session" model the user
 * accumulates many small sessions, often re-importing past conversations into
 * new ones. This page is where they see every session at a glance, grouped by
 * its source project (the Claude project path), open one to keep working,
 * report on it, and tidy it with safe lifecycle actions — rename.
 * The right rail inspects the selected
 * session; when the selection is the active session it also shows the live
 * reconstruction counts.
 */
export function WorkspaceView() {
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const draft = useSessionStore((state) => state.draft);
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const loadBrowserSession = useSessionStore(
    (state) => state.loadBrowserSession,
  );
  const setCurrentView = useAppStore((state) => state.navigate);
  const openSessionDetail = useAppStore((state) => state.openSession);
  const openProject = useAppStore((state) => state.openProject);

  const projectsInitialized = useProjectStore((state) => state.initialized);
  const userProjects = useProjectStore((state) => state.projects);
  const hydrateProjects = useProjectStore((state) => state.hydrate);
  const createUserProjectRecord = useProjectStore(
    (state) => state.createProject,
  );
  const [creatingProject, setCreatingProject] = useState(false);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  useEffect(() => {
    if (!projectsInitialized) hydrateProjects();
  }, [projectsInitialized, hydrateProjects]);

  function handleCreateProject({
    name,
    description,
  }: {
    name: string;
    description: string;
  }) {
    // The name is the project's identity: it becomes the grouping key (the
    // sourceLabel its future sessions share) and the display name.
    const key = name.trim();
    if (!key) return;
    const createdKey = createUserProjectRecord({
      key,
      name: key,
      description: description.trim() || undefined,
    });
    if (!createdKey) return;
    setCreatingProject(false);
    openProject(createdKey);
  }

  const repository = useMemo(() => createBrowserDraftRepository(), []);

  const [query, setQuery] = useState("");
  const filters = useMemo<SessionsBrowserFilters>(
    () => ({ query, origin: "all", sort: "recent" }),
    [query],
  );

  const activeSessionId = draft?.session.id ?? view.session.id;

  const model = useMemo(
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
        storedSessions: mergeDemoSessionSummaries(
          repository.listStoredSessions(),
        ),
        filters,
      }),
    [activeSessionId, view, mode, draft, repository, filters],
  );

  const openSession = (
    row: SessionRow,
    tab: Parameters<typeof openSessionDetail>[0] = "flow",
  ) => {
    if (row.isActive) {
      openSessionDetail(tab);
      return;
    }
    if (row.savedAt !== null && loadBrowserSession(row.sessionId)) {
      openSessionDetail(tab);
    }
  };

  const createdProjectRows = useMemo<WorkspaceProjectRow[]>(() => {
    const needle = query.trim().toLowerCase();
    const sessionProjectKeys = new Set(
      model.groups
        .filter((group) => !group.isUnsourced)
        .map((group) => group.key),
    );
    const rows = userProjects
      .filter(
        (project) => project.created && !sessionProjectKeys.has(project.key),
      )
      .map((project) => ({
        key: project.key,
        name: projectDisplayName(project.key, userProjects),
        path: project.key,
      }));
    if (!needle) return rows;
    return rows.filter((project) =>
      `${project.name} ${project.path}`.toLowerCase().includes(needle),
    );
  }, [model.groups, query, userProjects]);
  const visibleProjectCount =
    model.groups.filter((group) => !group.isUnsourced).length +
    createdProjectRows.length;
  const hasResults = model.visibleCount > 0 || createdProjectRows.length > 0;
  // "Empty" honestly means the user has no real sessions yet — only the
  // bundled demo exists. That is when the Connections call-to-action is the
  // right nudge; a filtered-to-nothing list shows a lighter empty hint.
  const onlyDemo = model.realSessionCount === 0;

  return (
    <PageShell
      className="workspace-page"
      maxWidth="wide"
      actionBar={
        <ActionBar
          label="검색"
          start={
            <ToolbarSearch
              value={query}
              onChange={setQuery}
              placeholder=""
              ariaLabel="검색"
            />
          }
          end={
            <Button
              variant="secondary"
              icon={FolderPlus}
              onClick={() => setCreatingProject(true)}
            >
              새 프로젝트
            </Button>
          }
        />
      }
    >
      {creatingProject ? (
        <ProjectFormModal
          mode="create"
          onSubmit={handleCreateProject}
          onClose={() => setCreatingProject(false)}
        />
      ) : null}
      {!hasResults ? (
        onlyDemo && !query.trim() ? (
          <EmptyState
            icon={FolderKanban}
            title="아직 세션이 없습니다"
            description="연동에서 Claude 대화를 가져오거나 새 세션을 시작하면 여기에 프로젝트별로 쌓입니다."
            actions={
              <Button
                variant="primary"
                icon={PlugZap}
                onClick={() => setCurrentView("connections")}
              >
                연동으로 이동
              </Button>
            }
          />
        ) : (
          <EmptyState
            compact
            icon={Search}
            title="조건에 맞는 세션이 없습니다"
            description="검색어를 조정해 보세요."
          />
        )
      ) : (
        <div className="workspace-browser">
          <WorkspaceSummaryStrip
            projectCount={visibleProjectCount}
            visibleCount={model.visibleCount}
            totalCount={model.totalCount}
            realSessionCount={model.realSessionCount}
            filtered={model.visibleCount !== model.totalCount}
          />
          <div className="workspace-groups base-scroll">
            {createdProjectRows.length > 0 ? (
              <section className="workspace-group" aria-label="생성한 프로젝트">
                <header className="workspace-group-head">
                  <span className="workspace-group-title">
                    <FolderGit2 size={13} aria-hidden="true" />
                    <span className="workspace-group-name">
                      생성한 프로젝트
                    </span>
                    <span className="workspace-group-path">세션 없음</span>
                  </span>
                  <Badge tone="gray">{createdProjectRows.length}개</Badge>
                </header>
                <ul className="workspace-rows">
                  {createdProjectRows.map((project) => (
                    <ProjectRowItem
                      key={project.key}
                      project={project}
                      onOpen={() => openProject(project.key)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
            {model.groups.map((group) => (
              <section
                key={group.key}
                className="workspace-group"
                aria-label={group.isUnsourced ? "프로젝트 없음" : group.label}
              >
                <header className="workspace-group-head">
                  {group.isUnsourced ? (
                    <span className="workspace-group-title" title="프로젝트 없음">
                      <FolderGit2 size={13} aria-hidden="true" />
                      <span className="workspace-group-name">프로젝트 없음</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="workspace-group-title workspace-group-open"
                      onClick={() => openProject(group.label)}
                    >
                      <FolderGit2 size={13} aria-hidden="true" />
                      <span className="workspace-group-name">
                        {projectDisplayName(group.label, userProjects)}
                      </span>
                      <span className="workspace-group-path">{group.label}</span>
                      <ArrowRight size={12} aria-hidden="true" />
                    </button>
                  )}
                  <Badge tone="gray">{group.sessions.length}건</Badge>
                </header>
                <ul className="workspace-rows">
                  {group.sessions.map((row) => (
                    <SessionRowItem
                      key={row.sessionId}
                      row={row}
                      onOpen={() => openSession(row)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}

type WorkspaceProjectRow = {
  key: string;
  name: string;
  path: string;
};

function WorkspaceSummaryStrip({
  projectCount,
  visibleCount,
  totalCount,
  realSessionCount,
  filtered,
}: {
  projectCount: number;
  visibleCount: number;
  totalCount: number;
  realSessionCount: number;
  filtered: boolean;
}) {
  return (
    <dl className="workspace-summary-strip" aria-label="세션 브라우저 요약">
      <div>
        <dt>프로젝트</dt>
        <dd>{projectCount}</dd>
      </div>
      <div>
        <dt>{filtered ? "표시 중" : "세션"}</dt>
        <dd>{filtered ? `${visibleCount}/${totalCount}` : totalCount}</dd>
      </div>
      <div>
        <dt>실제 세션</dt>
        <dd>{realSessionCount}</dd>
      </div>
    </dl>
  );
}

// ─── Rows ───────────────────────────────────────────────────────────────────

function ProjectRowItem({
  project,
  onOpen,
}: {
  project: WorkspaceProjectRow;
  onOpen: () => void;
}) {
  return (
    <li>
      <BaseObjectRow
        leading={<FolderGit2 size={15} />}
        onClick={onOpen}
        ariaLabel={project.name}
        title={project.name}
        className="session-list-row"
        meta={
          <BaseMetadataLine
            items={[
              <span title={project.path}>
                {shortProjectLabel(project.path)}
              </span>,
              "세션 없음",
            ]}
          />
        }
        trailing={<ArrowRight size={13} aria-hidden="true" />}
        density="compact"
      />
    </li>
  );
}

function SessionRowItem({
  row,
  onOpen,
}: {
  row: SessionRow;
  onOpen: () => void;
}) {
  return (
    <li>
      <BaseObjectRow
        leading={<FolderKanban size={15} />}
        onClick={onOpen}
        ariaLabel={row.title}
        title={row.title}
        className="session-list-row"
        meta={
          <BaseMetadataLine
            items={[
              row.sourceLabel ? (
                <span title={row.sourceLabel}>
                  {shortProjectLabel(row.sourceLabel)}
                </span>
              ) : null,
              row.spanLabel,
            ]}
          />
        }
        trailing={<ArrowRight size={13} aria-hidden="true" />}
        density="compact"
      />
    </li>
  );
}
