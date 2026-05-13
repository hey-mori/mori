import {
  ChevronLeft,
  Columns3,
  FileArchive,
  FileText,
  Folder,
  Home,
  PanelRightOpen,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "../ui/Button";
import type { ViewKey } from "../../domain/types";

const navItems: Array<{ key: ViewKey; label: string; badge?: string; icon: typeof Home }> = [
  { key: "start", label: "Home", icon: Home },
  { key: "timeline", label: "Timeline", icon: SlidersHorizontal },
  { key: "issues", label: "Issues", icon: Columns3, badge: "7" },
  { key: "issues", label: "Decisions", icon: FileArchive, badge: "7" },
  { key: "sources", label: "Sources", icon: FileText },
  { key: "reports", label: "Reports", icon: PanelRightOpen },
  { key: "projects", label: "Projects", icon: Folder },
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
          const active = item.key === currentView || (currentView === "flow" && item.key === "timeline");
          return (
            <button className={`nav-item ${active ? "active" : ""}`} key={`${item.label}-${index}`} onClick={() => onNavigate(item.key)} type="button">
              <Icon size={17} />
              <span>{item.label}</span>
              {item.badge ? <b>{item.badge}</b> : null}
            </button>
          );
        })}
      </nav>
      <div className="session-card">
        <span className="muted">진행 중인 세션</span>
        <strong>Mori 앱 기획</strong>
        <small>시작: 13:02</small>
        <time>04:32:19</time>
        <Button>세션 종료</Button>
      </div>
      <div className="profile">
        <div className="avatar">KM</div>
        <div>
          <strong>Kim Mori</strong>
          <small>Local Mode</small>
        </div>
        <span className="status-dot" />
      </div>
      <button
        className="collapse"
        type="button"
        aria-label="사이드바 접기 (다음 마일스톤)"
        title="사이드바 접기는 다음 마일스톤에서 활성화됩니다"
        disabled
      >
        <ChevronLeft size={18} />
      </button>
    </aside>
  );
}
