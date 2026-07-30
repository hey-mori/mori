import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  FilePlus2,
  FolderGit2,
  FolderKanban,
  House,
  NotebookPen,
  Network,
  Plus,
  Radio,
  Search,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "../../app/store";
import { useProfileStore } from "../../app/profileStore";
import { AttentionIndicator } from "../../features/companion/AttentionIndicator";
import { getProfileInitials } from "../../lib/profile/localProfile";
import { viewIcon } from "../brand/moriIcons";
import type { LucideIcon } from "lucide-react";
import type { ViewKey } from "../../domain/types";

/**
 * Primary sidebar · a slim icon rail (56–64px) running full height.
 *
 * Mori has no top chrome bar: the rail owns everything. From top to bottom:
 *
 *   1. Quick actions · 만들기 (기록 / 세션) and 알림.
 *   2. Product nav (`PRIMARY_NAV`): the destinations by job, each an icon over
 *      a micro-label, plus 검색 (opens the command palette).
 *   3. The user button (opens the settings sheet).
 *
 * The rail carries three bands. 기록 (notes · edit) and 세션 (AI work · review)
 * are the two primary experiences. 프로젝트 · 캘린더 are cross-lenses that route
 * each record to its proper home. 대시보드 · 워크벤치 · 작업 그래프 are the analysis
 * surfaces that look across all of the work: usage and status, a free-form
 * panel workspace, and the relationship map. They were briefly palette-only
 * during the 11 -> 6 nav narrowing, but hiding that much standing capability
 * behind search read as abandonment, so they are back in the rail (they also
 * stay reachable from the palette). Browsing sessions lives in the 세션
 * workspace, so the rail carries no session tree.
 */

const PRIMARY_NAV: Array<{ key: ViewKey; label: string; icon: LucideIcon }> = [
  { key: "home", label: "홈", icon: viewIcon.home ?? House },
  { key: "ledger", label: "기록", icon: NotebookPen },
  { key: "sessions", label: "세션", icon: Radio },
  { key: "contexts", label: "프로젝트", icon: viewIcon.workspace ?? FolderGit2 },
  { key: "calendar", label: "캘린더", icon: CalendarDays },
  { key: "dashboard", label: "대시보드", icon: BarChart3 },
  { key: "workbench", label: "워크벤치", icon: FolderKanban },
  { key: "graph", label: "작업 그래프", icon: Network },
];

export function Sidebar({
  onNavigate,
  collapsed = false,
}: {
  onNavigate: (view: ViewKey) => void;
  /** Icon-only focus mode, toggled from the command palette. The rail is
   *  already slim; collapsing drops the micro-labels for the narrowest column. */
  collapsed?: boolean;
}) {
  const currentView = useAppStore((state) => state.currentView);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const requestNewRecord = useAppStore((state) => state.requestNewRecord);
  const openCommandPalette = useAppStore((state) => state.openCommandPalette);
  const openSettings = useAppStore((state) => state.openSettingsSheet);
  const profile = useProfileStore((state) => state.profile);
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);

  const isActive = (key: ViewKey) => key === currentView;

  // The create menu closes on an outside click or Escape.
  useEffect(() => {
    if (!createOpen) return;
    const onDown = (event: MouseEvent) => {
      if (createRef.current && !createRef.current.contains(event.target as Node)) setCreateOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCreateOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [createOpen]);

  return (
    <aside
      className={`sidebar is-rail${collapsed ? " is-collapsed" : ""}`}
      aria-label="주요 메뉴"
    >
      <div className="sidebar-head" role="group" aria-label="빠른 작업">
        {/* 만들기 · two experiences, one entry: a new 기록 (the frequent
            personal capture) or a new 세션. */}
        <div className="sidebar-create" ref={createRef}>
          <button
            type="button"
            className={`sidebar-head-action${createOpen ? " is-active" : ""}`}
            onClick={() => setCreateOpen((v) => !v)}
            aria-label="만들기"
            aria-haspopup="menu"
            aria-expanded={createOpen}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
          {createOpen ? (
            <div className="sidebar-create-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  requestNewRecord();
                  setCreateOpen(false);
                }}
              >
                <FilePlus2 size={14} aria-hidden="true" />새 기록
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCurrentView("start");
                  setCreateOpen(false);
                }}
              >
                <Sparkles size={14} aria-hidden="true" />새 세션
              </button>
            </div>
          ) : null}
        </div>
        {/* Mori 노트 · the notification bell, compact. */}
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
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
        {/* 검색 · opens the command palette (⌘K), the one search surface across
            sessions, records, and destinations. */}
        <button
          type="button"
          className="sidebar-nav-item"
          onClick={() => openCommandPalette()}
          aria-label="검색 (명령 팔레트 열기)"
        >
          <Search size={18} aria-hidden="true" />
          <span>검색</span>
        </button>
      </nav>

      <div className="sidebar-nav-spacer" />

      <div className="sidebar-foot">
        <button
          type="button"
          className="sidebar-user"
          onClick={() => openSettings()}
          aria-label={`${profile.displayName} · 프로필 및 설정 열기`}
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
