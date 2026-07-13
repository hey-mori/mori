import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clipboard,
  ClipboardCopy,
  FileText,
  FolderGit2,
  GanttChartSquare,
  LayoutDashboard,
  Pencil,
  ScrollText,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  selectSessionSource,
  useSessionStore,
} from "../../app/sessionStore";
import {
  filterSidebarRows,
  groupSidebarRows,
  shortProjectLabel,
  SIDEBAR_PROJECT_VISIBLE_LIMIT,
  SIDEBAR_RECENCY_VISIBLE_LIMIT,
  toSidebarRow,
  truncateRecencyGroups,
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
import { SearchField } from "../ui/SearchField";
import {
  BaseContextMenu,
  useContextMenuPosition,
  type BaseMenuItemSpec,
} from "../ui/BaseActionMenu";
import type { ViewKey } from "../../domain/types";
import type { SessionTab } from "../../app/store";

/**
 * Context navigator · the sidebar's second zone, below the global nav.
 *
 * Its contract is "recent things inside contexts", not "session tree": today
 * every row is an agent session grouped by recency or by project, because
 * sessions are the only capture type. When non-session evidence lands
 * (documents via the K experiment), a context folder can grow non-session
 * rows here without touching the shell or the global navigation. Keeping the
 * boundary hard is the point: the sidebar above stays product navigation by
 * job, and this component owns everything about browsing recent work in
 * context (search, grouping, folders, row actions).
 *
 * Extracted from Sidebar as the shell plan's stage 0
 * (docs/design/mori-product-shell-ia.md). Markup and class names are
 * unchanged (`.sidebar-search-row`, `.sidebar-list`, `.sidebar-folder*`,
 * `.sidebar-row*`), so the stylesheet and collapsed behavior are untouched.
 */

/** Views whose subject is a *specific* session · only on these should the
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

export function ContextNavigator({
  onNavigate,
}: {
  onNavigate: (view: ViewKey) => void;
}) {
  const currentView = useAppStore((state) => state.currentView);
  const currentProjectKey = useAppStore((state) => state.currentProjectKey);
  // Highlight the open session's row. A real session is identified by its
  // draft; a bundled demo session has no draft, so fall back to demoSessionId
  // · that way clicking a demo row both opens it and lights it up.
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
  const openProject = useAppStore((state) => state.openProject);

  const [summaries, setSummaries] = useState(() => safeListSessions());
  const [query, setQuery] = useState("");
  const [groupingMode, setGroupingModeState] = useState<SidebarGroupingMode>(
    () => loadGroupingPreference(),
  );
  const setGroupingMode = (mode: SidebarGroupingMode) => {
    setGroupingModeState(mode);
    saveGroupingPreference(mode);
  };
  // Per-project collapse state for the project-tree mode. Stored as a set
  // of collapsed labels so the default ("everything expanded") needs no
  // persistence · we only remember explicit closes.
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

  // "더 보기" expansion · per-project in project mode, single flag in recency
  // mode. State is in-memory only: every fresh session lands on the calm
  // truncated view, and one click reveals the long tail. Toggling back to
  // the truncated state is supported (the row label flips to "접기").
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleProjectExpanded = useCallback((label: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);
  const [recencyExpanded, setRecencyExpanded] = useState(false);

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

  // A live search reveals everything · caps would silently hide a matching
  // row and read as a broken search. Otherwise recency mode slices a single
  // global cap across all buckets; project mode applies the per-project cap
  // inside each folder (see `ProjectFolder` below).
  const isSearching = query.trim().length > 0;
  const isRecencyMode = groupingMode === "recency";
  const { groups: visibleGroups, hiddenCount: recencyHiddenCount } = useMemo(() => {
    if (!isRecencyMode || isSearching || recencyExpanded) {
      return { groups, hiddenCount: 0 };
    }
    return truncateRecencyGroups(groups, SIDEBAR_RECENCY_VISIBLE_LIMIT);
  }, [groups, isRecencyMode, isSearching, recencyExpanded]);

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

  const handleRenameSession = useCallback(
    (row: SidebarSessionRow) => {
      const title = window.prompt("세션 이름", row.title);
      if (!title) return;
      if (renameSession(row.sessionId, title)) refresh();
    },
    [refresh, renameSession],
  );

  return (
    <>
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
          <>
            {visibleGroups.map((group) => {
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
                    searching={isSearching}
                    expanded={expandedProjects.has(group.label)}
                    visibleLimit={SIDEBAR_PROJECT_VISIBLE_LIMIT}
                    activeSessionId={highlightedSessionId}
                    currentProjectKey={
                      currentView === "project" ? currentProjectKey : null
                    }
                    onSelect={handleSwitch}
                    onOpenTab={handleSwitch}
                    onRename={handleRenameSession}
                    onToggle={() => toggleProjectCollapsed(group.label)}
                    onToggleExpanded={() => toggleProjectExpanded(group.label)}
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
            })}
            {/* Recency-mode "더 보기" foot. Hidden during search and when
                the truncation didn't kick in. Toggles between truncated and
                full so the user can collapse back to a calm list. */}
            {isRecencyMode && !isSearching && (recencyExpanded || recencyHiddenCount > 0) ? (
              <button
                type="button"
                className="sidebar-show-more"
                onClick={() => setRecencyExpanded((prev) => !prev)}
                aria-expanded={recencyExpanded}
              >
                {recencyExpanded
                  ? "접기"
                  : `${recencyHiddenCount}개 더 보기`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </>
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
  expanded,
  visibleLimit,
  activeSessionId,
  currentProjectKey,
  onSelect,
  onOpenTab,
  onRename,
  onToggle,
  onToggleExpanded,
  onOpenProject,
}: {
  group: SidebarSessionGroup;
  collapsed: boolean;
  searching: boolean;
  /** User has clicked "더 보기" on this folder. */
  expanded: boolean;
  /** Row cap before the "더 보기" affordance kicks in. */
  visibleLimit: number;
  activeSessionId: string | null;
  /** When the user is on a project page, the matching folder lights up. */
  currentProjectKey: string | null;
  onSelect: (id: string) => void;
  onOpenTab: (id: string, tab: SessionTab) => void;
  onRename: (row: SidebarSessionRow) => void;
  onToggle: () => void;
  onToggleExpanded: () => void;
  /** Optional · when provided, clicking the folder *name* opens the project
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
  // While searching, every match shows so a hit inside a long tail does not
  // get hidden behind "더 보기". Pinning the active session into view also
  // matters: if the user is on session #8 of a project that's still
  // truncated at 5, expand for them so the highlight isn't off-screen.
  const activeHidden =
    !expanded &&
    group.rows
      .slice(visibleLimit)
      .some((row) => row.sessionId === activeSessionId);
  const showAll = searching || expanded || activeHidden;
  const visibleRows = showAll ? group.rows : group.rows.slice(0, visibleLimit);
  const hiddenCount = group.rows.length - visibleRows.length;
  const canToggleExpanded = !searching && group.rows.length > visibleLimit;
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
          aria-label={fullLabel}
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
          {visibleRows.map((row) => (
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
          {canToggleExpanded ? (
            <li>
              <button
                type="button"
                className="sidebar-folder-more"
                onClick={onToggleExpanded}
                aria-expanded={showAll}
              >
                {showAll ? "접기" : `${hiddenCount}개 더 보기`}
              </button>
            </li>
          ) : null}
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
  /** Suppress the source chip · used when the row is already nested under
   *  a project folder that names the same source. */
  hideSource?: boolean;
}) {
  const menu = useContextMenuPosition();
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
      label: "활동 열기",
      icon: GanttChartSquare,
      onSelect: () => onOpenTab("flow"),
    },
    {
      id: "open-evidence",
      label: "자료 열기",
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
      label: "공유 열기",
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
