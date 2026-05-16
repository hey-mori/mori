import {
  ChevronLeft,
  FileText,
  FolderClock,
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
import { deriveSessionTiming } from "../../lib/session/sessionTiming";
import { getFeatureControlProps } from "../../app/featureStatus";

const navItems: Array<{ key: ViewKey; label: string; badge?: string; icon: typeof Play }> = [
  { key: "start", label: "Start Session", icon: Play },
  { key: "timeline", label: "Timeline", icon: SlidersHorizontal },
  { key: "evidence", label: "Evidence", icon: FileText },
  { key: "review", label: "Review", icon: ListChecks },
  { key: "reports", label: "Reports", icon: PanelRightOpen },
  { key: "memory", label: "Memory", icon: FolderClock },
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
      <SidebarProfile />
      <SidebarCollapseButton />
    </aside>
  );
}

function SidebarSessionCard() {
  const draft = useMoriSessionStore((state) => state.draft);
  const analysisStatus = useMoriSessionStore((state) => state.analysisStatus);

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

  return (
    <div className="session-card" role="region" aria-label="Current session">
      <span className="muted">진행 중인 세션</span>
      <strong>{title}</strong>
      <small>{startHint} · {timing.stateLabel}</small>
      <time className={timing.isLive ? "is-live" : ""} aria-live={timing.isLive ? "polite" : "off"}>
        {timing.durationLabel}
      </time>
      <Button
        disabled={!endSessionFeature.enabled || timing.state === "demo"}
        title={
          timing.state === "demo"
            ? "데모 세션은 종료할 필요가 없습니다."
            : endSessionFeature.title
        }
      >
        세션 종료
      </Button>
    </div>
  );
}

function SidebarProfile() {
  return (
    <div className="profile">
      <div className="avatar">KM</div>
      <div>
        <strong>Kim Mori</strong>
        <small>Local Mode</small>
      </div>
      <span className="status-dot" />
    </div>
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
