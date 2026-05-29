import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clipboard,
  ClipboardCopy,
  FileText,
  FolderGit2,
  GanttChartSquare,
  House,
  Layers,
  LayoutDashboard,
  Link2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  ScrollText,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  selectSessionSource,
  useSessionStore,
} from "../../app/sessionStore";
import { useProfileStore } from "../../app/profileStore";
import {
  filterSidebarRows,
  groupSidebarRows,
  shortProjectLabel,
  toSidebarRow,
  type SidebarGroupingMode,
  type SidebarSessionGroup,
  type SidebarSessionRow,
} from "../../lib/sidebar/sessionList";
import {
  loadGroupingPreference,
  saveGroupingPreference,
} from "../../lib/sidebar/groupingPreference";
import {
  loadCollapsedProjects,
  saveCollapsedProjects,
} from "../../lib/sidebar/projectExpansionPreference";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { AttentionIndicator } from "../../features/companion/AttentionIndicator";
import { getProfileInitials } from "../../lib/profile/localProfile";
import { viewIcon } from "../brand/moriIcons";
import { SearchField } from "../ui/SearchField";
import {
  BaseContextMenu,
  useContextMenuPosition,
  type BaseMenuItemSpec,
} from "../ui/BaseActionMenu";
import type { LucideIcon } from "lucide-react";
import type { ViewKey } from "../../domain/types";
import type { SessionTab } from "../../app/store";

/**
 * Primary sidebar — full-height navigation column.
 *
 * Mori has no top chrome bar: the workspace runs full height and the sidebar
 * owns everything we used to spread across a header. From top to bottom:
 *
 *   1. Quick actions · icon-only 새 세션 / 가져오기 shortcuts.
 *   2. Product nav — 홈 / 프로젝트 / 메모리, the three top-level destinations.
 *   3. Session search input.
 *   4. The session conversation list, grouped by recency.
 *   5. Mori 노트 + the user button (opens the settings sheet).
 *
 * Drawing on the conversation-list paradigm from Claude / Codex desktop:
 * clicking a row loads that session into the workspace, and the product nav
 * lets the user switch between 홈 (dashboard), 프로젝트 (the projects→sessions
 * browser / active session's workspace), and 메모리 (cross-session memory).
 */

/** Product-nav entries. Ordered top-to-bottom; "프로젝트" lights up only for the
 *  session-detail and the projects→sessions browser — NOT for new-session /
 *  import flows, which are reached via the head shortcut buttons and light
 *  those up instead so the user can always tell where they are. */
const PRIMARY_NAV: Array<{ key: ViewKey; label: string; icon: LucideIcon }> = [
  { key: "home", label: "홈", icon: viewIcon.home ?? House },
  {
    key: "connections",
    label: "소스",
    icon: viewIcon.connections ?? Link2,
  },
  {
    key: "workspace",
    label: "프로젝트",
    icon: viewIcon.workspace ?? Layers,
  },
  // 메모리 is no longer a standing tab: durable project memory lives on each
  // project page (ProjectView). The memory overview / consolidation review stay
  // routable through a project's "메모리 통합" action and the command palette.
];

/** Views whose subject is a *specific* session — only on these should the
 *  matching session row light up as active. On home / project / workspace /
 *  memory the active session is just background state, so highlighting its row
 *  there reads as "this session is selected" when it is not. */
const SESSION_SUBJECT_VIEWS = new Set<ViewKey>([
  "session",
  "timeline",
  "flow",
  "evidence",
  "review",
  "companion",
  "reports",
]);

export function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  onNavigate: (view: ViewKey) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const currentView = useAppStore((state) => state.currentView);
  const currentProjectKey = useAppStore((state) => state.currentProjectKey);
  // Highlight the open session's row. A real session is identified by its
  // draft; a bundled demo session has no draft, so fall back to demoSessionId
  // — that way clicking a demo row both opens it and lights it up.
  const activeSessionId = useSessionStore(
    (state) => state.draft?.session.id ?? state.demoSessionId ?? null,
  );
  // Only light up a session row when the user is actually viewing that session.
  // On home / project / workspace / memory the active session is background
  // state, so its row must not read as "selected".
  const highlightedSessionId = SESSION_SUBJECT_VIEWS.has(currentView)
    ? activeSessionId
    : null;
  const source = useSessionStore(selectSessionSource);
  const dataResetNonce = useSessionStore((state) => state.dataResetNonce);
  const loadBrowserSession = useSessionStore(
    (state) => state.loadBrowserSession,
  );
  const loadDesktopSession = useSessionStore(
    (state) => state.loadDesktopSession,
  );
  const renameSession = useSessionStore((state) => state.renameSession);
  const openSession = useAppStore((state) => state.openSession);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const openSettings = useAppStore((state) => state.openSettingsSheet);
  const profile = useProfileStore((state) => state.profile);

  const [summaries, setSummaries] = useState(() => safeListSessions());
  const [query, setQuery] = useState("");
  const [groupingMode, setGroupingModeState] = useState<SidebarGroupingMode>(
    () => loadGroupingPreference(),
  );
  const setGroupingMode = (mode: SidebarGroupingMode) => {
    setGroupingModeState(mode);
    saveGroupingPreference(mode);
  };
  const openProject = useAppStore((state) => state.openProject);
  // Per-project collapse state for the project-tree mode. Stored as a set
  // of collapsed labels so the default ("everything expanded") needs no
  // persistence — we only remember explicit closes.
  const [collapsedProjects, setCollapsedProjectsState] = useState<Set<string>>(
    () => loadCollapsedProjects(),
  );
  const toggleProjectCollapsed = useCallback((label: string) => {
    setCollapsedProjectsState((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      saveCollapsedProjects(next);
      return next;
    });
  }, []);

  const refresh = useCallback(() => {
    setSummaries(safeListSessions());
  }, []);
  useEffect(() => {
    refresh();
  }, [activeSessionId, dataResetNonce, refresh]);

  const allRows = useMemo<SidebarSessionRow[]>(
    () => mergeDemoSessionSummaries(summaries).map(toSidebarRow),
    [summaries],
  );

  const filtered = useMemo(
    () => filterSidebarRows(allRows, query),
    [allRows, query],
  );
  const groups = useMemo(
    () => groupSidebarRows(filtered, Date.now(), groupingMode),
    [filtered, groupingMode],
  );

  const isDesktop = source === "desktop-sqlite";

  const handleSwitch = useCallback(
    (sessionId: string, tab?: SessionTab) => {
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
    },
    [
      activeSessionId,
      isDesktop,
      loadBrowserSession,
      loadDesktopSession,
      openSession,
    ],
  );

  const isActive = (key: ViewKey) => {
    if (key === "home") return currentView === "home";
    // 프로젝트 means the "all projects" browser (workspace). An *individual*
    // project page is a drill-down, not that destination, so it must not light
    // up 프로젝트 — otherwise selecting one project reads as selecting the whole
    // browser. Memory / consolidation still fold under it.
    if (key === "workspace") {
      return (
        currentView === "workspace" ||
        currentView === "memory" ||
        currentView === "consolidation"
      );
    }
    return key === currentView;
  };

  const handleRenameSession = useCallback(
    (row: SidebarSessionRow) => {
      const title = window.prompt("세션 이름", row.title);
      if (!title) return;
      if (renameSession(row.sessionId, title)) refresh();
    },
    [refresh, renameSession],
  );

  return (
    <aside
      className={`sidebar${collapsed ? " is-collapsed" : ""}`}
      aria-label="세션 목록 및 메뉴"
    >
      <div className="sidebar-head" role="group" aria-label="빠른 작업">
        <button
          type="button"
          className={`sidebar-head-action${currentView === "start" ? " is-active" : ""}`}
          onClick={() => setCurrentView("start")}
          aria-label="새 세션"
          aria-current={currentView === "start" ? "page" : undefined}
          title="새 세션 · 대화를 가져오거나 빈 세션을 만듭니다."
        >
          <Plus size={15} aria-hidden="true" />
        </button>
        {/* Mori 노트 — promoted to the head so it sits with the other quick
            actions instead of buried in the foot. Compact icon + count
            badge; the popup panel still opens on click. */}
        <AttentionIndicator onNavigate={onNavigate} compact />
        {onToggleCollapsed ? (
          <button
            type="button"
            className="sidebar-collapse-toggle"
            onClick={onToggleCollapsed}
            aria-pressed={collapsed}
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            title={
              collapsed
                ? "사이드바를 펼쳐 세션 목록을 다시 표시"
                : "사이드바를 접어 작업 영역을 넓힘"
            }
          >
            {collapsed ? (
              <PanelLeftOpen size={14} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={14} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      <nav className="sidebar-nav" aria-label="주요 메뉴">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.key);
          return (
            <button
              key={item.key}
              type="button"
              className={`sidebar-nav-item${active ? " is-active" : ""}`}
              onClick={() => onNavigate(item.key)}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-search-row">
        <SearchField
          className="sidebar-search"
          value={query}
          onChange={setQuery}
          placeholder=""
          ariaLabel="검색"
        />
        <button
          type="button"
          className="sidebar-grouping-toggle"
          onClick={() =>
            setGroupingMode(groupingMode === "recency" ? "project" : "recency")
          }
          aria-label={
            groupingMode === "recency"
              ? "프로젝트별로 묶기"
              : "최근 활동순으로 묶기"
          }
          title={
            groupingMode === "recency"
              ? "최근 활동순으로 묶음 — 누르면 프로젝트별로 전환"
              : "프로젝트별로 묶음 — 누르면 최근 활동순으로 전환"
          }
        >
          {groupingMode === "recency" ? (
            <CalendarClock size={13} aria-hidden="true" />
          ) : (
            <FolderGit2 size={13} aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="sidebar-list base-scroll">
        {allRows.length === 0 ? (
          <SidebarEmpty onImport={() => onNavigate("connections")} />
        ) : filtered.length === 0 ? (
          <p className="sidebar-empty-search">검색 결과가 없습니다.</p>
        ) : (
          groups.map((group) => {
            const isProject =
              group.bucket === "project" || group.bucket === "unsourced";
            if (isProject) {
              const collapsed = collapsedProjects.has(group.label);
              const projectKey = group.label;
              const canOpenProject = group.bucket === "project";
              return (
                <ProjectFolder
                  key={`project-${group.label}`}
                  group={group}
                  collapsed={collapsed}
                  searching={query.trim().length > 0}
                  activeSessionId={highlightedSessionId}
                  currentProjectKey={
                    currentView === "project" ? currentProjectKey : null
                  }
                  onSelect={handleSwitch}
                  onOpenTab={handleSwitch}
                  onRename={handleRenameSession}
                  onToggle={() => toggleProjectCollapsed(group.label)}
                  onOpenProject={
                    canOpenProject ? () => openProject(projectKey) : undefined
                  }
                />
              );
            }
            return (
              <SessionGroup
                key={`${group.bucket}-${group.label}`}
                label={group.label}
                rows={group.rows}
                activeSessionId={highlightedSessionId}
                onSelect={handleSwitch}
                onOpenTab={handleSwitch}
                onOpenProject={(projectKey) => openProject(projectKey)}
                onRename={handleRenameSession}
              />
            );
          })
        )}
      </div>

      <div className="sidebar-foot">
        <button
          type="button"
          className="sidebar-user"
          onClick={() => openSettings()}
          aria-label={`${profile.displayName} — 프로필 및 설정 열기`}
          title="프로필 및 설정"
        >
          <span className="sidebar-user-avatar" aria-hidden="true">
            {getProfileInitials(profile.displayName)}
          </span>
          <span className="sidebar-user-name">{profile.displayName}</span>
        </button>
      </div>
    </aside>
  );
}

/**
 * Project-mode folder. Renders the project as a header with chevron +
 * shortened name + session count; sessions sit indented underneath until
 * the user collapses the folder. While the user is actively searching we
 * force every folder open so a hit inside a collapsed project does not
 * silently hide itself.
 */
function ProjectFolder({
  group,
  collapsed,
  searching,
  activeSessionId,
  currentProjectKey,
  onSelect,
  onOpenTab,
  onRename,
  onToggle,
  onOpenProject,
}: {
  group: SidebarSessionGroup;
  collapsed: boolean;
  searching: boolean;
  activeSessionId: string | null;
  /** When the user is on a project page, the matching folder lights up. */
  currentProjectKey: string | null;
  onSelect: (id: string) => void;
  onOpenTab: (id: string, tab: SessionTab) => void;
  onRename: (row: SidebarSessionRow) => void;
  onToggle: () => void;
  /** Optional — when provided, clicking the folder *name* opens the project
   *  page. The chevron always toggles open/closed regardless. */
  onOpenProject?: () => void;
}) {
  const isOpen = searching ? true : !collapsed;
  const displayLabel = shortProjectLabel(group.label);
  const fullLabel = group.label;
  const containsActive = group.rows.some(
    (row) => row.sessionId === activeSessionId,
  );
  const isCurrentProject = currentProjectKey === group.label;
  return (
    <div
      className={[
        "sidebar-folder",
        isOpen ? "is-open" : "",
        isCurrentProject ? "is-current" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={`sidebar-folder-head${containsActive ? " has-active" : ""}${isCurrentProject ? " is-current" : ""}`}
      >
        <button
          type="button"
          className="sidebar-folder-toggle"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`sidebar-folder-${encodeURIComponent(group.label)}`}
          aria-label={
            isOpen ? `${displayLabel} 접기` : `${displayLabel} 펼치기`
          }
        >
          {isOpen ? (
            <ChevronDown size={12} aria-hidden="true" />
          ) : (
            <ChevronRight size={12} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="sidebar-folder-name-btn"
          onClick={onOpenProject ?? onToggle}
          aria-current={isCurrentProject ? "page" : undefined}
          title={
            onOpenProject ? `${fullLabel} · 프로젝트 페이지 열기` : fullLabel
          }
        >
          <FolderGit2 size={12} aria-hidden="true" />
          <span className="sidebar-folder-name">{displayLabel}</span>
        </button>
      </div>
      {isOpen ? (
        <ul
          id={`sidebar-folder-${encodeURIComponent(group.label)}`}
          className="sidebar-folder-body"
        >
          {group.rows.map((row) => (
            <SessionRow
              key={row.sessionId}
              row={row}
              active={row.sessionId === activeSessionId}
              onSelect={() => onSelect(row.sessionId)}
              onOpenTab={(tab) => onOpenTab(row.sessionId, tab)}
              onOpenProject={onOpenProject}
              onRename={() => onRename(row)}
              hideSource
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SessionGroup({
  label,
  rows,
  activeSessionId,
  onSelect,
  onOpenTab,
  onOpenProject,
  onRename,
}: {
  label: string;
  rows: SidebarSessionRow[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onOpenTab: (id: string, tab: SessionTab) => void;
  onOpenProject: (projectKey: string) => void;
  onRename: (row: SidebarSessionRow) => void;
}) {
  return (
    <div className="sidebar-group">
      <p className="sidebar-group-label">{label}</p>
      <ul>
        {rows.map((row) => (
          <SessionRow
            key={row.sessionId}
            row={row}
            active={row.sessionId === activeSessionId}
            onSelect={() => onSelect(row.sessionId)}
            onOpenTab={(tab) => onOpenTab(row.sessionId, tab)}
            onOpenProject={
              row.sourceLabel
                ? () => onOpenProject(row.sourceLabel as string)
                : undefined
            }
            onRename={() => onRename(row)}
          />
        ))}
      </ul>
    </div>
  );
}

function SessionRow({
  row,
  active,
  onSelect,
  onOpenTab,
  onOpenProject,
  onRename,
  hideSource = false,
}: {
  row: SidebarSessionRow;
  active: boolean;
  onSelect: () => void;
  onOpenTab: (tab: SessionTab) => void;
  onOpenProject?: () => void;
  onRename: () => void;
  /** Suppress the source chip — used when the row is already nested under
   *  a project folder that names the same source. */
  hideSource?: boolean;
}) {
  const menu = useContextMenuPosition();
  // Tooltip carries the full title + project path so identical-title rows
  // (multiple "Mori 앱 기획" duplicates from re-imports) can be told apart
  // on hover without expanding the row visually.
  const tooltip = row.sourceLabel
    ? `${row.title}\n${row.sourceLabel}`
    : row.title;
  const menuItems = buildSidebarSessionMenuItems({
    row,
    onOpen: onSelect,
    onOpenTab,
    onOpenProject,
    onRename,
  });
  return (
    <li>
      <button
        type="button"
        className={`sidebar-row${active ? " is-active" : ""}${hideSource ? " is-nested" : ""}`}
        onClick={onSelect}
        onContextMenu={menu.onContextMenu}
        onKeyDown={menu.onKeyDown}
        aria-current={active ? "true" : undefined}
        title={tooltip}
      >
        <span className="sidebar-row-title">{row.title}</span>
        {row.sourceLabel && !hideSource ? (
          <span className="sidebar-row-meta">
            <span className="sidebar-row-source">
              <FolderGit2 size={11} aria-hidden="true" />
              <span>{row.sourceLabel}</span>
            </span>
          </span>
        ) : null}
      </button>
      <BaseContextMenu
        open={menu.open}
        position={menu.position}
        items={menuItems}
        onClose={menu.close}
        label={`${row.title} 작업`}
      />
    </li>
  );
}

function buildSidebarSessionMenuItems({
  row,
  onOpen,
  onOpenTab,
  onOpenProject,
  onRename,
}: {
  row: SidebarSessionRow;
  onOpen: () => void;
  onOpenTab: (tab: SessionTab) => void;
  onOpenProject?: () => void;
  onRename: () => void;
}): BaseMenuItemSpec[] {
  const items: BaseMenuItemSpec[] = [
    { id: "open", label: "세션 열기", icon: ChevronRight, onSelect: onOpen },
    {
      id: "open-overview",
      label: "개요 열기",
      icon: LayoutDashboard,
      onSelect: () => onOpenTab("overview"),
    },
    {
      id: "open-flow",
      label: "흐름 열기",
      icon: GanttChartSquare,
      onSelect: () => onOpenTab("flow"),
    },
    {
      id: "open-evidence",
      label: "증거 열기",
      icon: FileText,
      onSelect: () => onOpenTab("evidence"),
    },
    {
      id: "open-review",
      label: "검토 열기",
      icon: Clipboard,
      onSelect: () => onOpenTab("insights"),
    },
    {
      id: "open-report",
      label: "리포트 열기",
      icon: ScrollText,
      onSelect: () => onOpenTab("report"),
    },
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
    { id: "rename", label: "이름 변경", icon: Pencil, onSelect: onRename },
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

function SidebarEmpty({ onImport }: { onImport: () => void }) {
  return (
    <div className="sidebar-empty">
      <p>아직 세션이 없습니다.</p>
      <button type="button" onClick={onImport}>
        Claude / Codex 작업 가져오기
      </button>
    </div>
  );
}

function safeListSessions() {
  try {
    return loadStoredSessionSummaries();
  } catch {
    return [];
  }
}
