import {
  Archive,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Download,
  FolderGit2,
  House,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMoriAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  selectSessionSource,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriProfileStore } from "../../app/profileStore";
import {
  filterSidebarRows,
  formatSidebarRelative,
  groupSidebarRows,
  shortProjectLabel,
  toSidebarRow,
  type SidebarArchiveFilter,
  type SidebarGroupingMode,
  type SidebarSessionGroup,
  type SidebarSessionRow,
} from "../../lib/sidebar/sessionList";
import {
  loadGroupingPreference,
  saveGroupingPreference,
} from "../../lib/sidebar/groupingPreference";
import {
  loadArchivePreference,
  saveArchivePreference,
} from "../../lib/sidebar/archivePreference";
import {
  loadCollapsedProjects,
  saveCollapsedProjects,
} from "../../lib/sidebar/projectExpansionPreference";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { AttentionIndicator } from "../../features/companion/AttentionIndicator";
import { getProfileInitials } from "../../lib/profile/localProfile";
import { moriViewIcon } from "../brand/moriIcons";
import type { LucideIcon } from "lucide-react";
import type { ViewKey } from "../../domain/types";

/**
 * Primary sidebar — full-height navigation column.
 *
 * Mori has no top chrome bar: the workspace runs full height and the sidebar
 * owns everything we used to spread across a header. From top to bottom:
 *
 *   1. Quick actions — icon-only 새 세션 / 가져오기 shortcuts.
 *   2. Product nav — 홈 / 세션 / 메모리, the three top-level destinations.
 *   3. Session search input.
 *   4. The session conversation list, grouped by recency.
 *   5. Mori 노트 + the user button (opens the settings sheet).
 *
 * Drawing on the conversation-list paradigm from Claude / Codex desktop:
 * clicking a row loads that session into the workspace, and the product nav
 * lets the user switch between 홈 (dashboard), 세션 (the active session's
 * workspace), and 메모리 (cross-session memory).
 */

/** Product-nav entries. Ordered top-to-bottom; "세션" lights up only for the
 *  session-detail and the workspace browser — NOT for new-session / import
 *  flows, which are reached via the head shortcut buttons and light those up
 *  instead so the user can always tell where they are. */
const PRIMARY_NAV: Array<{ key: ViewKey; label: string; icon: LucideIcon }> = [
  { key: "home", label: "홈", icon: moriViewIcon.home ?? House },
  { key: "workspace", label: "세션", icon: moriViewIcon.workspace ?? Layers },
  { key: "memory", label: "메모리", icon: moriViewIcon.memory ?? Layers },
];

/** Views that belong *under* the 세션 destination — the session detail's own
 *  tabs route to these keys, so they should still light up "세션". The
 *  shortcut-button destinations (start / connections) are deliberately NOT
 *  in this set — they have their own active indicator on the shortcut. */
const SESSION_VIEWS = new Set<ViewKey>([
  "workspace",
  "session",
  "timeline",
  "flow",
  "evidence",
  "review",
  "companion",
]);

const MEMORY_VIEWS = new Set<ViewKey>(["memory", "consolidation", "reports"]);

export function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  onNavigate: (view: ViewKey) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const currentView = useMoriAppStore((state) => state.currentView);
  const activeSessionId = useMoriSessionStore((state) => state.draft?.session.id ?? null);
  const source = useMoriSessionStore(selectSessionSource);
  const loadBrowserSession = useMoriSessionStore((state) => state.loadBrowserSession);
  const loadDesktopSession = useMoriSessionStore((state) => state.loadDesktopSession);
  const openSession = useMoriAppStore((state) => state.openSession);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const openSettings = useMoriAppStore((state) => state.openSettingsSheet);
  const profile = useMoriProfileStore((state) => state.profile);

  const [summaries, setSummaries] = useState(() => safeListSessions());
  const [query, setQuery] = useState("");
  const [groupingMode, setGroupingModeState] = useState<SidebarGroupingMode>(
    () => loadGroupingPreference(),
  );
  const setGroupingMode = (mode: SidebarGroupingMode) => {
    setGroupingModeState(mode);
    saveGroupingPreference(mode);
  };
  const [archiveFilter, setArchiveFilterState] = useState<SidebarArchiveFilter>(
    () => loadArchivePreference(),
  );
  const setArchiveFilter = (filter: SidebarArchiveFilter) => {
    setArchiveFilterState(filter);
    saveArchivePreference(filter);
  };
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
  }, [activeSessionId, refresh]);

  const allRows = useMemo<SidebarSessionRow[]>(
    () => mergeDemoSessionSummaries(summaries).map(toSidebarRow),
    [summaries],
  );
  const archivedCount = useMemo(
    () => allRows.filter((row) => row.archived).length,
    [allRows],
  );
  const rows = useMemo<SidebarSessionRow[]>(
    () =>
      archiveFilter === "all"
        ? allRows
        : allRows.filter((row) => !row.archived),
    [allRows, archiveFilter],
  );

  const filtered = useMemo(() => filterSidebarRows(rows, query), [rows, query]);
  const groups = useMemo(
    () => groupSidebarRows(filtered, Date.now(), groupingMode),
    [filtered, groupingMode],
  );

  const isDesktop = source === "desktop-sqlite";

  const handleSwitch = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionId) {
        openSession();
        return;
      }
      if (isDesktop) {
        void loadDesktopSession(sessionId).then((ok) => {
          if (!ok) loadBrowserSession(sessionId);
          openSession();
        });
      } else {
        loadBrowserSession(sessionId);
        openSession();
      }
    },
    [activeSessionId, isDesktop, loadBrowserSession, loadDesktopSession, openSession],
  );

  const isActive = (key: ViewKey) => {
    if (key === "home") return currentView === "home";
    if (key === "workspace") return SESSION_VIEWS.has(currentView);
    if (key === "memory") return MEMORY_VIEWS.has(currentView);
    return key === currentView;
  };

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
          title="새 세션 — 대부분은 가져오기에서 시작합니다."
        >
          <Plus size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`sidebar-head-action${currentView === "connections" ? " is-active" : ""}`}
          onClick={() => onNavigate("connections")}
          aria-label="가져오기"
          aria-current={currentView === "connections" ? "page" : undefined}
          title="Claude / Codex / 노트 등 작업 소스를 세션으로 가져옵니다."
        >
          <Download size={15} aria-hidden="true" />
        </button>
        {/* Mori 노트 — promoted to the head so it sits with the other quick
            actions instead of buried in the foot. Compact icon + count
            badge; the popup panel still opens on click. */}
        <AttentionIndicator onNavigate={onNavigate} compact />
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
        <div className="sidebar-search">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            placeholder="세션 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="세션 검색"
          />
        </div>
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
        {archivedCount > 0 ? (
          <button
            type="button"
            className={`sidebar-grouping-toggle${archiveFilter === "all" ? " is-active" : ""}`}
            onClick={() =>
              setArchiveFilter(archiveFilter === "all" ? "active" : "all")
            }
            aria-pressed={archiveFilter === "all"}
            aria-label={
              archiveFilter === "all"
                ? "보관된 세션 숨기기"
                : `보관된 세션 ${archivedCount}건 보기`
            }
            title={
              archiveFilter === "all"
                ? "보관된 세션도 표시 중 — 누르면 숨김"
                : `보관된 ${archivedCount}건 — 누르면 목록에 표시`
            }
          >
            <Archive size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="sidebar-list mori-scroll">
        {rows.length === 0 ? (
          <SidebarEmpty onImport={() => onNavigate("connections")} />
        ) : filtered.length === 0 ? (
          <p className="sidebar-empty-search">검색 결과가 없습니다.</p>
        ) : (
          groups.map((group) => {
            // Project-mode rows render as a collapsible folder; recency /
            // archived stay as the existing flat group so today / yesterday
            // / 보관됨 do not pick up an unrelated chevron control.
            const isProject =
              group.bucket === "project" || group.bucket === "unsourced";
            if (isProject) {
              const collapsed = collapsedProjects.has(group.label);
              return (
                <ProjectFolder
                  key={`project-${group.label}`}
                  group={group}
                  collapsed={collapsed}
                  searching={query.trim().length > 0}
                  activeSessionId={activeSessionId}
                  onSelect={handleSwitch}
                  onToggle={() => toggleProjectCollapsed(group.label)}
                />
              );
            }
            return (
              <SessionGroup
                key={`${group.bucket}-${group.label}`}
                label={group.label}
                rows={group.rows}
                archivedBucket={group.bucket === "archived"}
                activeSessionId={activeSessionId}
                onSelect={handleSwitch}
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
  onSelect,
  onToggle,
}: {
  group: SidebarSessionGroup;
  collapsed: boolean;
  searching: boolean;
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onToggle: () => void;
}) {
  const isOpen = searching ? true : !collapsed;
  const displayLabel = shortProjectLabel(group.label);
  const fullLabel = group.label;
  const containsActive = group.rows.some(
    (row) => row.sessionId === activeSessionId,
  );
  return (
    <div className={`sidebar-folder${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className={`sidebar-folder-head${containsActive ? " has-active" : ""}`}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`sidebar-folder-${encodeURIComponent(group.label)}`}
        title={fullLabel}
      >
        {isOpen ? (
          <ChevronDown size={12} aria-hidden="true" />
        ) : (
          <ChevronRight size={12} aria-hidden="true" />
        )}
        <FolderGit2 size={12} aria-hidden="true" />
        <span className="sidebar-folder-name">{displayLabel}</span>
        <span className="sidebar-folder-count">{group.rows.length}</span>
      </button>
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
  archivedBucket,
  activeSessionId,
  onSelect,
}: {
  label: string;
  rows: SidebarSessionRow[];
  archivedBucket: boolean;
  activeSessionId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={`sidebar-group${archivedBucket ? " is-archived" : ""}`}>
      <p className="sidebar-group-label">{label}</p>
      <ul>
        {rows.map((row) => (
          <SessionRow
            key={row.sessionId}
            row={row}
            active={row.sessionId === activeSessionId}
            onSelect={() => onSelect(row.sessionId)}
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
  hideSource = false,
}: {
  row: SidebarSessionRow;
  active: boolean;
  onSelect: () => void;
  /** Suppress the source chip — used when the row is already nested under
   *  a project folder that names the same source. */
  hideSource?: boolean;
}) {
  // Tooltip carries the full title + project path so identical-title rows
  // (multiple "Mori 앱 기획" duplicates from re-imports) can be told apart
  // on hover without expanding the row visually.
  const tooltip = row.sourceLabel
    ? `${row.title}\n${row.sourceLabel}`
    : row.title;
  return (
    <li>
      <button
        type="button"
        className={`sidebar-row${active ? " is-active" : ""}${hideSource ? " is-nested" : ""}`}
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        title={tooltip}
      >
        <span className="sidebar-row-title">{row.title}</span>
        <span className="sidebar-row-meta">
          {row.sourceLabel && !hideSource ? (
            <span className="sidebar-row-source">
              <FolderGit2 size={11} aria-hidden="true" />
              <span>{row.sourceLabel}</span>
            </span>
          ) : null}
          <span className="sidebar-row-time">
            {formatSidebarRelative(row.timestamp)}
          </span>
        </span>
      </button>
    </li>
  );
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
