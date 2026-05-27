import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Clipboard,
  ClipboardCopy,
  FileText,
  FolderGit2,
  FolderKanban,
  GanttChartSquare,
  LayoutDashboard,
  Pencil,
  PlugZap,
  ScrollText,
  Search,
} from "lucide-react";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { MoriObjectRow } from "../../components/ui/MoriObjectRow";
import { MoriMetadataLine } from "../../components/ui/MoriMetadataLine";
import {
  MoriContextMenu,
  MoriOverflowMenu,
  useContextMenuPosition,
  type MoriMenuItemSpec,
} from "../../components/ui/MoriActionMenu";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { ToolbarSearch } from "../../components/ui/ToolbarSearch";
import { useMoriAppStore } from "../../app/store";
import {
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { describeWorkspaceSessionStatus } from "../../lib/workspace/workspaceSummary";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import {
  formatSidebarRelative,
  shortProjectLabel,
} from "../../lib/sidebar/sessionList";
import {
  DEFAULT_SESSIONS_BROWSER_FILTERS,
  buildSessionsBrowserModel,
  describeSessionOrigin,
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
  const view = useMoriSessionStore(selectSessionView);
  const mode = useMoriSessionStore(selectSessionMode);
  const draft = useMoriSessionStore((state) => state.draft);
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const loadBrowserSession = useMoriSessionStore((state) => state.loadBrowserSession);
  const renameSession = useMoriSessionStore((state) => state.renameSession);
  const setCurrentView = useMoriAppStore((state) => state.navigate);
  const openSessionDetail = useMoriAppStore((state) => state.openSession);
  const openProject = useMoriAppStore((state) => state.openProject);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const repository = useMemo(() => createBrowserDraftRepository(), []);
  // Increments after a row-level lifecycle write so the sessions list re-reads.
  const [revision, setRevision] = useState(0);

  const [filters, setFilters] = useState<SessionsBrowserFilters>(
    DEFAULT_SESSIONS_BROWSER_FILTERS,
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
        storedSessions: mergeDemoSessionSummaries(repository.listStoredSessions()),
        filters,
      }),
    // `view`/`draft`/`mode` cover active-session changes; the row list is
    // re-derived whenever any of those change. `revision` ticks after a
    // row-level lifecycle write so the list refreshes
    // without a store subscription on every saved row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSessionId, view, mode, draft, repository, filters, revision],
  );

  const openSession = (row: SessionRow, tab: Parameters<typeof openSessionDetail>[0] = "flow") => {
    if (row.isActive) {
      openSessionDetail(tab);
      return;
    }
    if (row.savedAt !== null && loadBrowserSession(row.sessionId)) {
      openSessionDetail(tab);
    }
  };

  const renameRow = (row: SessionRow) => {
    const title = window.prompt("세션 이름", row.title);
    if (!title) return;
    if (renameSession(row.sessionId, title)) {
      setRevision((value) => value + 1);
    }
  };

  const hasResults = model.visibleCount > 0;
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
          label="세션 필터"
          start={
            <>
              <ToolbarSearch
                value={filters.query}
                onChange={(query) => setFilters((prev) => ({ ...prev, query }))}
                placeholder="제목 또는 프로젝트로 검색"
                ariaLabel="세션 검색"
              />
              <SegmentedControl
                ariaLabel="출처 필터"
                value={filters.origin}
                onChange={(origin) => setFilters((prev) => ({ ...prev, origin }))}
                options={[
                  { id: "all", label: "전체" },
                  { id: "imported", label: "가져오기" },
                  { id: "manual", label: "수동" },
                ]}
              />
            </>
          }
          end={
            <SegmentedControl
              ariaLabel="정렬"
              value={filters.sort}
              onChange={(sort) => setFilters((prev) => ({ ...prev, sort }))}
              options={[
                { id: "recent", label: "최근순" },
                { id: "title", label: "이름순" },
              ]}
            />
          }
        />
      }
    >
      {!hasResults ? (
        onlyDemo && filters.origin !== "imported" && !filters.query.trim() ? (
          <EmptyState
            icon={FolderKanban}
            title="아직 세션이 없습니다"
            description="연결에서 Claude 대화를 가져오거나 새 세션을 시작하면 여기에 프로젝트별로 쌓입니다."
            actions={
              <Button
                variant="primary"
                icon={PlugZap}
                onClick={() => setCurrentView("connections")}
              >
                연결로 이동
              </Button>
            }
          />
        ) : (
          <EmptyState
            compact
            icon={Search}
            title="조건에 맞는 세션이 없습니다"
            description="검색어나 필터를 조정해 보세요."
          />
        )
      ) : (
        <div className="workspace-browser">
          {onlyDemo ? (
            <NoticeBanner
              tone="info"
              actions={
                <Button
                  variant="secondary"
                  icon={PlugZap}
                  onClick={() => setCurrentView("connections")}
                >
                  연결로 이동
                </Button>
              }
            >
              데모 세션입니다. 가져오기로 실제 세션이 들어오면 프로젝트별로 정리됩니다.
            </NoticeBanner>
          ) : null}
          <WorkspaceSummaryStrip
            projectCount={model.groups.filter((group) => !group.isUnsourced).length}
            visibleCount={model.visibleCount}
            totalCount={model.totalCount}
            realSessionCount={model.realSessionCount}
            filtered={model.visibleCount !== model.totalCount}
          />
          <div className="workspace-groups">
            {model.groups.map((group) => (
              <section key={group.key} className="workspace-group" aria-label={group.label}>
                <header className="workspace-group-head">
                  <span
                    className="workspace-group-title"
                    title={group.label}
                  >
                    <FolderGit2 size={13} aria-hidden="true" />
                    <span className="workspace-group-name">
                      {shortProjectLabel(group.label)}
                    </span>
                    <span className="workspace-group-path">{group.label}</span>
                  </span>
                  <Badge tone="gray">{group.sessions.length}개</Badge>
                </header>
                <ul className="workspace-rows">
                  {group.sessions.map((row) => (
                    <SessionRowItem
                      key={row.sessionId}
                      row={row}
                      onOpen={() => openSession(row)}
                      onOpenTab={(tab) => openSession(row, tab)}
                      onOpenProject={
                        row.sourceLabel ? () => openProject(row.sourceLabel as string) : undefined
                      }
                      onRename={() => renameRow(row)}
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

// ─── Session row ────────────────────────────────────────────────────────────

function SessionRowItem({
  row,
  onOpen,
  onOpenTab,
  onOpenProject,
  onRename,
}: {
  row: SessionRow;
  onOpen: () => void;
  onOpenTab: (tab: "overview" | "flow" | "evidence" | "insights" | "report") => void;
  onOpenProject?: () => void;
  onRename: () => void;
}) {
  const menu = useContextMenuPosition();
  const origin = describeSessionOrigin(row.origin);
  // Status badge only surfaces meaningful state. "complete" is the default for
  // every imported session (which is trivially "already-finished past work"),
  // so it would just paint a green pill on every row. The demo session is a
  // static fixture, not a live recording, so its "recording" status is
  // misleading. We keep the badge for genuine in-flight state — `analyzing`
  // on any session, and `recording` on a real (non-demo) manual draft.
  const showStatusBadge =
    row.status !== "complete" && !(row.origin === "demo" && row.status === "recording");
  const status = showStatusBadge ? describeWorkspaceSessionStatus(row.status) : null;
  const relative = row.startedAt || row.savedAt
    ? formatSidebarRelative(row.startedAt ?? row.savedAt ?? "")
    : null;
  const menuItems = buildSessionMenuItems({
    row,
    onOpen,
    onOpenTab,
    onOpenProject,
    onRename,
  });

  return (
    <li>
      <MoriObjectRow
        leading={<FolderKanban size={15} />}
        onClick={onOpen}
        onActionMenu={menu.openAt}
        ariaLabel={row.title}
        title={row.title}
        meta={
          <MoriMetadataLine
            items={[
              <MoriStatusBadge tone={origin.tone}>{origin.label}</MoriStatusBadge>,
              row.spanLabel,
            ]}
          />
        }
        timestamp={relative}
        status={status ? <MoriStatusBadge tone={status.tone}>{status.label}</MoriStatusBadge> : null}
        trailing={
          <span className="workspace-row-trailing-actions">
            <MoriOverflowMenu items={menuItems} label={`${row.title} 작업`} />
            <ArrowRight size={13} aria-hidden="true" />
          </span>
        }
        density="compact"
      />
      <MoriContextMenu
        open={menu.open}
        position={menu.position}
        items={menuItems}
        onClose={menu.close}
        label={`${row.title} 작업`}
      />
    </li>
  );
}

function buildSessionMenuItems({
  row,
  onOpen,
  onOpenTab,
  onOpenProject,
  onRename,
}: {
  row: SessionRow;
  onOpen: () => void;
  onOpenTab: (tab: "overview" | "flow" | "evidence" | "insights" | "report") => void;
  onOpenProject?: () => void;
  onRename: () => void;
}): MoriMenuItemSpec[] {
  const items: MoriMenuItemSpec[] = [
    { id: "open", label: "세션 열기", icon: ArrowRight, onSelect: onOpen },
    { id: "open-overview", label: "개요 열기", icon: LayoutDashboard, onSelect: () => onOpenTab("overview") },
    { id: "open-flow", label: "흐름 열기", icon: GanttChartSquare, onSelect: () => onOpenTab("flow") },
    { id: "open-evidence", label: "증거 열기", icon: FileText, onSelect: () => onOpenTab("evidence") },
    { id: "open-review", label: "검토 열기", icon: Clipboard, onSelect: () => onOpenTab("insights") },
    { id: "open-report", label: "리포트 열기", icon: ScrollText, onSelect: () => onOpenTab("report") },
  ];
  if (onOpenProject) {
    items.push({
      id: "open-project",
      label: "프로젝트 열기",
      icon: FolderGit2,
      onSelect: onOpenProject,
    });
  }
  items.push(
    { type: "separator", id: "manage-separator" },
    {
      id: "rename",
      label: "이름 변경",
      icon: Pencil,
      onSelect: onRename,
      disabled: row.origin === "demo",
      title: row.origin === "demo" ? "데모 세션은 이름을 바꿀 수 없습니다." : undefined,
    },
    { type: "separator", id: "copy-separator" },
    {
      id: "copy-title",
      label: "제목 복사",
      icon: ClipboardCopy,
      onSelect: () => copyText(row.title),
    },
    {
      id: "copy-id",
      label: "세션 ID 복사",
      icon: ClipboardCopy,
      onSelect: () => copyText(row.sessionId),
    },
  );
  if (row.sourceLabel) {
    items.push({
      id: "copy-project",
      label: "프로젝트 경로 복사",
      icon: ClipboardCopy,
      onSelect: () => copyText(row.sourceLabel ?? ""),
    });
  }
  return items;
}

function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      void navigator.clipboard.writeText(text).catch(() => {});
    } catch {
      // Clipboard access is permission-gated in some browser shells.
    }
  }
}
