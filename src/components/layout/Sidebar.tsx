import { Download, FolderGit2, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMoriAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  selectSessionSource,
  useMoriSessionStore,
} from "../../app/sessionStore";
import {
  filterSidebarRows,
  formatSidebarRelative,
  groupSidebarRows,
  toSidebarRow,
  type SidebarSessionRow,
} from "../../lib/sidebar/sessionList";
import { AttentionIndicator } from "../../features/companion/AttentionIndicator";
import type { ViewKey } from "../../domain/types";

/**
 * Primary sidebar — session (conversation) list.
 *
 * Drawing on the conversation-list paradigm from Claude / Codex desktop: the
 * sidebar is a scannable, scrollable list of sessions grouped by recency.
 * Clicking a row loads that session into the workspace; the top-bar nav
 * picks which workspace view (홈 / 세션 / 메모리) is on screen.
 *
 * The sidebar no longer carries any standing nav buttons or a brand lockup —
 * those moved to the top bar so this column can focus entirely on session
 * navigation. Mori notes sits at the bottom (the same `AttentionIndicator`
 * surface as before, just relocated).
 */
export function Sidebar({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const activeSessionId = useMoriSessionStore((state) => state.draft?.session.id ?? null);
  const source = useMoriSessionStore(selectSessionSource);
  const loadBrowserSession = useMoriSessionStore((state) => state.loadBrowserSession);
  const loadDesktopSession = useMoriSessionStore((state) => state.loadDesktopSession);
  const openSession = useMoriAppStore((state) => state.openSession);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  const [summaries, setSummaries] = useState(() => safeListSessions());
  const [query, setQuery] = useState("");

  // Refresh the list whenever the active session changes (a switch or a new
  // import should be reflected without a manual refresh).
  const refresh = useCallback(() => {
    setSummaries(safeListSessions());
  }, []);
  useEffect(() => {
    refresh();
  }, [activeSessionId, refresh]);

  const rows = useMemo<SidebarSessionRow[]>(
    () =>
      summaries
        .filter((summary) => !summary.archivedAt)
        .map(toSidebarRow),
    [summaries],
  );

  const filtered = useMemo(
    () => filterSidebarRows(rows, query),
    [rows, query],
  );

  const groups = useMemo(() => groupSidebarRows(filtered), [filtered]);

  const isDesktop = source === "desktop-sqlite";

  const handleSwitch = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionId) {
        // Already active — just open the session workspace.
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

  return (
    <aside className="sidebar" aria-label="세션 목록">
      <div className="sidebar-head" role="group" aria-label="빠른 작업">
        <button
          type="button"
          className="sidebar-head-action"
          onClick={() => setCurrentView("start")}
          aria-label="새 세션"
          title="새 세션 — 대부분은 가져오기에서 시작합니다."
        >
          <Plus size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sidebar-head-action"
          onClick={() => onNavigate("connections")}
          aria-label="가져오기"
          title="Claude / Codex / 노트 등 작업 소스를 세션으로 가져옵니다."
        >
          <Download size={15} aria-hidden="true" />
        </button>
      </div>

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
        <AttentionIndicator onNavigate={onNavigate} />
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
  return (
    <li>
      <button
        type="button"
        className={`sidebar-row${active ? " is-active" : ""}`}
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        title={row.title}
      >
        <span className="sidebar-row-title">{row.title}</span>
        <span className="sidebar-row-meta">
          {row.sourceLabel ? (
            <span className="sidebar-row-source" title={row.sourceLabel}>
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
