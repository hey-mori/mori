import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { MoriLogo } from "../brand/MoriLogo";
import { moriViewIcon } from "../brand/moriIcons";
import type { ViewKey } from "../../domain/types";
import { moriMockSession } from "../../domain/mock-data";
import { selectSessionView, useMoriSessionStore } from "../../app/sessionStore";
import { useMoriProfileStore } from "../../app/profileStore";
import { useMoriAppStore } from "../../app/store";
import { getProfileInitials } from "../../lib/profile/localProfile";
import {
  describeSessionCardAction,
  deriveSessionTiming,
} from "../../lib/session/sessionTiming";
import { getFeatureControlProps } from "../../app/featureStatus";

type NavKey = keyof typeof moriViewIcon;
type NavItem = { key: NavKey; label: string; badge?: string };

/**
 * The nav is grouped so nine destinations read as an organised structure
 * rather than a flat list: the entry action, the four session-work
 * surfaces, the project-level surfaces, and settings. Icons come from the
 * shared `moriViewIcon` vocabulary so they stay meaning-driven.
 *
 * Live badge counts are computed inside the component so session state
 * gives users at-a-glance context (e.g. how many events, issues, etc.)
 * without navigating to each surface first.
 */
const BASE_NAV_GROUPS: Array<{ label?: string; items: NavItem[] }> = [
  { items: [{ key: "start", label: "세션 시작" }] },
  {
    label: "작업",
    items: [
      { key: "timeline", label: "타임라인" },
      { key: "evidence", label: "증거 허브" },
      { key: "review", label: "검토" },
      { key: "reports", label: "보고서" },
    ],
  },
  {
    label: "프로젝트",
    items: [
      { key: "workspace", label: "워크스페이스" },
      { key: "memory", label: "메모리" },
      { key: "companion", label: "Mori 노트" },
    ],
  },
  { items: [{ key: "settings", label: "설정" }] },
];

export function Sidebar({ currentView, onNavigate }: { currentView: ViewKey; onNavigate: (view: ViewKey) => void }) {
  const view = useMoriSessionStore(selectSessionView);
  const imports = useMoriSessionStore((state) => state.imports);

  const isActive = (key: ViewKey) =>
    key === currentView ||
    (currentView === "flow" && key === "timeline") ||
    (currentView === "consolidation" && key === "memory");

  // Live badge counts — shown only when non-zero so the nav stays quiet
  // until the user has actually captured or analysed work.
  const liveBadges = useMemo<Partial<Record<NavKey, string>>>(() => {
    const badges: Partial<Record<NavKey, string>> = {};
    if (view.events.length > 0) {
      badges.timeline = String(view.events.length);
    }
    if (imports.length > 0) {
      badges.evidence = String(imports.length);
    }
    const openIssues = view.issues.filter((issue) => issue.status !== "resolved").length;
    if (openIssues > 0) {
      badges.review = String(openIssues);
    }
    return badges;
  }, [view.events.length, view.issues, imports.length]);

  return (
    <aside className="sidebar">
      <button
        className="brand"
        onClick={() => onNavigate("timeline")}
        type="button"
        aria-label="Mori — Timeline으로 이동"
      >
        <MoriLogo size={32} />
      </button>
      <nav className="nav">
        {BASE_NAV_GROUPS.map((group, groupIndex) => (
          <div className="nav-group" key={group.label ?? `group-${groupIndex}`}>
            {group.label ? <p className="nav-group-label">{group.label}</p> : null}
            {group.items.map((item) => {
              const Icon = moriViewIcon[item.key];
              const badge = item.badge ?? liveBadges[item.key];
              return (
                <button
                  className={`nav-item ${isActive(item.key) ? "active" : ""}`}
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  type="button"
                  title={item.label}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                  {badge ? <b>{badge}</b> : null}
                </button>
              );
            })}
          </div>
        ))}
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
        <small>로컬 모드</small>
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
