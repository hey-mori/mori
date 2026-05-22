import { useMoriAppStore } from "../../app/store";
import { useMoriProfileStore } from "../../app/profileStore";
import { getProfileInitials } from "../../lib/profile/localProfile";
import type { ViewKey } from "../../domain/types";

/**
 * Top chrome bar — primary product nav and the user button.
 *
 * The bar is deliberately thin: it only carries the three top-level tabs
 * (홈 · 세션 · 메모리) and the user avatar. There is no brand lockup here —
 * the OS already shows the Mori icon, and the chrome stays calm. The new /
 * import shortcuts live in the sidebar header (where the Mori wordmark used
 * to be) because they belong with the session list they create.
 *
 * Settings is no longer a standing nav entry; clicking the avatar opens a
 * sheet that hosts the profile + full settings surface.
 */
const TOP_NAV: Array<{ key: ViewKey; label: string }> = [
  { key: "home", label: "홈" },
  { key: "workspace", label: "세션" },
  { key: "memory", label: "메모리" },
];

/** Off-nav views whose location belongs *under* one of the top tabs. */
const SESSION_VIEWS = new Set<ViewKey>([
  "workspace",
  "session",
  "timeline",
  "flow",
  "evidence",
  "review",
  "connections",
  "companion",
  "start",
]);

const MEMORY_VIEWS = new Set<ViewKey>(["memory", "consolidation", "reports"]);

export function TopBar() {
  const currentView = useMoriAppStore((state) => state.currentView);
  const navigate = useMoriAppStore((state) => state.navigate);
  const openSettings = useMoriAppStore((state) => state.openSettingsSheet);

  const profile = useMoriProfileStore((state) => state.profile);

  const isActive = (key: ViewKey) => {
    if (key === "home") return currentView === "home";
    if (key === "workspace") return SESSION_VIEWS.has(currentView);
    if (key === "memory") return MEMORY_VIEWS.has(currentView);
    return key === currentView;
  };

  return (
    <header className="topbar" role="banner">
      <nav className="topnav" aria-label="주요 메뉴">
        {TOP_NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`topnav-item${isActive(item.key) ? " is-active" : ""}`}
            onClick={() => navigate(item.key)}
            aria-current={isActive(item.key) ? "page" : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        <button
          type="button"
          className="topbar-user"
          onClick={() => openSettings()}
          aria-label={`${profile.displayName} — 프로필 및 설정 열기`}
          title="프로필 및 설정"
        >
          <span className="topbar-user-avatar" aria-hidden="true">
            {getProfileInitials(profile.displayName)}
          </span>
        </button>
      </div>
    </header>
  );
}
