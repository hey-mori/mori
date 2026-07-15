import {
  CalendarDays,
  FolderGit2,
  House,
  Layers,
  LayoutDashboard,
  Network,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radio,
} from "lucide-react";
import { useAppStore } from "../../app/store";
import { useProfileStore } from "../../app/profileStore";
import { AttentionIndicator } from "../../features/companion/AttentionIndicator";
import { getProfileInitials } from "../../lib/profile/localProfile";
import { viewIcon } from "../brand/moriIcons";
import { ContextNavigator } from "./ContextNavigator";
import type { LucideIcon } from "lucide-react";
import type { ViewKey } from "../../domain/types";

/**
 * Primary sidebar · full-height navigation column with two zones.
 *
 * Mori has no top chrome bar: the workspace runs full height and the sidebar
 * owns everything we used to spread across a header. From top to bottom:
 *
 *   1. Quick actions · icon-only 새 세션 / 작업 그래프 / Mori 노트.
 *   2. Zone 1 · global product nav (`PRIMARY_NAV`): destinations by job.
 *   3. Zone 2 · the `ContextNavigator`: search + recent work in context
 *      (today the project→session tree; the boundary exists so future
 *      non-session evidence can appear without touching the shell).
 *   4. The user button (opens the settings sheet).
 *
 * The zones are deliberately separate components (see
 * docs/design/mori-product-shell-ia.md): global navigation never grows
 * source-type entries, and everything about browsing recent work lives in
 * the navigator.
 */

/** Product-nav entries. Ordered top-to-bottom; "프로젝트" lights up only for the
 *  session-detail and the projects→sessions browser · NOT for new-session /
 *  import flows, which are reached via the head shortcut buttons and light
 *  those up instead so the user can always tell where they are. */
const PRIMARY_NAV: Array<{ key: ViewKey; label: string; icon: LucideIcon }> = [
  { key: "home", label: "홈", icon: viewIcon.home ?? House },
  // 기록 · the single record workspace: quick capture + search + a journal
  // feed with a collapsible calendar and a collapsible 합계 roll-up. Absorbs
  // the former 오늘 · 캘린더 · 트래커 · 인박스 · 메모리 surfaces (all lenses
  // on one ledger; durable memory is the feed + search over distilled records).
  { key: "ledger", label: "기록", icon: NotebookPen },
  { key: "liveSession", label: "라이브", icon: Radio },
  // 프로젝트 · contexts over records (projects · routines · topics · people).
  // Reframed off the AI-session-only model; the legacy all-projects list and
  // single-project view stay palette-reachable.
  {
    key: "contexts",
    label: "프로젝트",
    icon: viewIcon.workspace ?? FolderGit2,
  },
  {
    key: "dashboard",
    label: "대시보드",
    icon: viewIcon.dashboard ?? LayoutDashboard,
  },
  // 워크벤치 stays visible on its own merits pending a real role/overlap
  // evaluation (see mori-product-shell-ia.md): a usable capability is not
  // hidden into the palette just to keep the item count low.
  {
    key: "workbench",
    label: "워크벤치",
    icon: viewIcon.workbench ?? Layers,
  },
];

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
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const openSettings = useAppStore((state) => state.openSettingsSheet);
  const profile = useProfileStore((state) => state.profile);

  const isActive = (key: ViewKey) => key === currentView;

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
        >
          <Plus size={15} aria-hidden="true" />
        </button>
        {/* Work graph · an experimental overview of projects + sessions. Sits
            between 새 세션 and 알림 as a quick action; the full surface is also
            reachable from the command palette. */}
        <button
          type="button"
          className={`sidebar-head-action${currentView === "graph" ? " is-active" : ""}`}
          onClick={() => setCurrentView("graph")}
          aria-label="작업 그래프"
          aria-current={currentView === "graph" ? "page" : undefined}
        >
          <Network size={15} aria-hidden="true" />
        </button>
        {/* 캘린더 · a global time view over all records (including AI sessions,
            which are captured as records). Sits with the quick actions so it
            spans more than the 기록 workspace; opening a note routes to 기록. */}
        <button
          type="button"
          className={`sidebar-head-action${currentView === "calendar" ? " is-active" : ""}`}
          onClick={() => setCurrentView("calendar")}
          aria-label="캘린더"
          aria-current={currentView === "calendar" ? "page" : undefined}
        >
          <CalendarDays size={15} aria-hidden="true" />
        </button>
        {/* Mori 노트 · promoted to the head so it sits with the other quick
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

      {/* 최근 작업 (project → session tree). Hidden on the surfaces that own a
          unified note explorer (기록 · 캘린더) so the sidebar is not two
          competing lists; the explorer supersedes it there. Reachable
          elsewhere and via the palette. Full merge of legacy sessions into the
          explorer is the remaining v3 work. */}
      {currentView === "ledger" || currentView === "calendar" ? (
        <div className="sidebar-nav-spacer" />
      ) : (
        <ContextNavigator onNavigate={onNavigate} />
      )}

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
