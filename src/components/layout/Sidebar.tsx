import {
  ChevronLeft,
  Compass,
  FileText,
  FolderClock,
  FolderKanban,
  PanelRightOpen,
  Play,
  Settings,
  SlidersHorizontal,
  ListChecks,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import type { ViewKey } from "../../domain/types";
import { moriMockSession } from "../../domain/mock-data";
import { useMoriSessionStore } from "../../app/sessionStore";
import { useMoriProfileStore } from "../../app/profileStore";
import { useMoriAppStore } from "../../app/store";
import { getProfileInitials } from "../../lib/profile/localProfile";
import {
  describeSessionCardAction,
  deriveSessionTiming,
} from "../../lib/session/sessionTiming";
import { getFeatureControlProps } from "../../app/featureStatus";

const navItems: Array<{ key: ViewKey; label: string; badge?: string; icon: typeof Play }> = [
  { key: "start", label: "Start Session", icon: Play },
  { key: "workspace", label: "Workspace", icon: FolderKanban },
  { key: "timeline", label: "Timeline", icon: SlidersHorizontal },
  { key: "evidence", label: "Evidence", icon: FileText },
  { key: "review", label: "Review", icon: ListChecks },
  { key: "reports", label: "Reports", icon: PanelRightOpen },
  { key: "memory", label: "Memory", icon: FolderClock },
  { key: "companion", label: "Companion", icon: Compass },
  { key: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ currentView, onNavigate }: { currentView: ViewKey; onNavigate: (view: ViewKey) => void }) {
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onNavigate("timeline")} type="button">
        <div className="brand-mark">M</div>
        <span>mori</span>
      </button>
      <nav className="nav">
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const active =
            item.key === currentView ||
            (currentView === "flow" && item.key === "timeline") ||
            (currentView === "consolidation" && item.key === "memory");
          return (
            <button
              className={`nav-item ${active ? "active" : ""}`}
              key={`${item.label}-${index}`}
              onClick={() => onNavigate(item.key)}
              type="button"
            >
              <Icon size={17} />
              <span>{item.label}</span>
              {item.badge ? <b>{item.badge}</b> : null}
            </button>
          );
        })}
      </nav>
      <SidebarSessionCard />
      <SidebarProfile currentView={currentView} onNavigate={onNavigate} />
      <SidebarCollapseButton />
    </aside>
  );
}

function SidebarSessionCard() {
  const draft = useMoriSessionStore((state) => state.draft);
  const analysisStatus = useMoriSessionStore((state) => state.analysisStatus);
  const endSession = useMoriSessionStore((state) => state.endSession);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  const initialTiming = deriveSessionTiming({
    draft,
    demoSession: moriMockSession.session,
    analysisStatus,
  });
  const [timing, setTiming] = useState(initialTiming);
  useEffect(() => {
    const snapshot = deriveSessionTiming({
      draft,
      demoSession: moriMockSession.session,
      analysisStatus,
    });
    setTiming(snapshot);
    if (!snapshot.isLive) return;
    const interval = window.setInterval(() => {
      setTiming(
        deriveSessionTiming({
          draft,
          demoSession: moriMockSession.session,
          analysisStatus,
        }),
      );
    }, 1000);
    return () => window.clearInterval(interval);
  }, [draft, analysisStatus]);

  const title = draft?.session.title ?? moriMockSession.session.title;
  const startHint = timing.startTimeLabel
    ? `시작 ${timing.startTimeLabel}`
    : "시작 기록 없음";
  const endSessionFeature = getFeatureControlProps("appShell.endSession");
  const action = describeSessionCardAction(timing.state);

  return (
    <div className="session-card" role="region" aria-label="Current session">
      <span className="muted">진행 중인 세션</span>
      <strong>{title}</strong>
      <small>{startHint} · {timing.stateLabel}</small>
      <time className={timing.isLive ? "is-live" : ""} aria-live={timing.isLive ? "polite" : "off"}>
        {timing.durationLabel}
      </time>
      {action.kind === "endSession" ? (
        <Button
          disabled={!endSessionFeature.enabled}
          onClick={endSessionFeature.enabled ? endSession : undefined}
          title={
            endSessionFeature.enabled
              ? "활성 세션을 종료하고 완료 상태로 표시합니다."
              : endSessionFeature.title
          }
        >
          {action.label}
        </Button>
      ) : (
        <Button
          onClick={() => setCurrentView("reports")}
          title="이 세션의 리포트를 엽니다."
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

function SidebarProfile({
  currentView,
  onNavigate,
}: {
  currentView: ViewKey;
  onNavigate: (view: ViewKey) => void;
}) {
  const profile = useMoriProfileStore((state) => state.profile);
  return (
    <button
      type="button"
      className={`profile ${currentView === "profile" ? "active" : ""}`}
      onClick={() => onNavigate("profile")}
      aria-label="계정 및 프로필 열기"
    >
      <div className="avatar">{getProfileInitials(profile.displayName)}</div>
      <div>
        <strong>{profile.displayName}</strong>
        <small>Local Mode</small>
      </div>
      <span className="status-dot" />
    </button>
  );
}

function SidebarCollapseButton() {
  const collapseFeature = getFeatureControlProps("appShell.sidebarCollapse");
  return (
    <button
      className="collapse"
      type="button"
      aria-label="사이드바 접기"
      title={collapseFeature.title}
      disabled={!collapseFeature.enabled}
    >
      <ChevronLeft size={18} />
    </button>
  );
}
