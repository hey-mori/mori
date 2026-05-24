import { CalendarClock, Download, FolderGit2, House, Layers, Plus, Search } from "lucide-react";
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
  toSidebarRow,
  type SidebarGroupingMode,
  type SidebarSessionRow,
} from "../../lib/sidebar/sessionList";
import {
  loadGroupingPreference,
  saveGroupingPreference,
} from "../../lib/sidebar/groupingPreference";
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

export function Sidebar({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
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

  const refresh = useCallback(() => {
    setSummaries(safeListSessions());
  }, []);
  useEffect(() => {
    refresh();
  }, [activeSessionId, refresh]);

  const rows = useMemo<SidebarSessionRow[]>(
    () =>
      mergeDemoSessionSummaries(summaries)
        .filter((summary) => !summary.archivedAt)
        .map(toSidebarRow),
    [summaries],
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
    <aside className="sidebar" aria-label="세션 목록 및 메뉴">
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
      </div>

      <div className="sidebar-list mori-scroll">
        {rows.length === 0 ? (
          <SidebarEmpty onImport={() => onNavigate("connections")} />
        ) : filtered.length === 0 ? (
          <p className="sidebar-empty-search">검색 결과가 없습니다.</p>
        ) : (
          groups.map((group) => (
            <SessionGroup
              key={group.bucket}
              label={group.label}
              rows={group.rows}
              activeSessionId={activeSessionId}
              onSelect={handleSwitch}
            />
          ))
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

function SessionGroup({
  label,
  rows,
  activeSessionId,
  onSelect,
}: {
  label: string;
  rows: SidebarSessionRow[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
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
}: {
  row: SidebarSessionRow;
  active: boolean;
  onSelect: () => void;
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
        className={`sidebar-row${active ? " is-active" : ""}`}
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        title={tooltip}
      >
        <span className="sidebar-row-title">{row.title}</span>
        <span className="sidebar-row-meta">
          {row.sourceLabel ? (
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
