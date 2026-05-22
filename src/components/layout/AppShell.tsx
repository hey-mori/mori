import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { SettingsSheet } from "./SettingsSheet";
import { useMoriAppStore } from "../../app/store";
import type { ViewKey } from "../../domain/types";

/**
 * Outer app shell — top bar across the top, session-list sidebar on the left,
 * workspace on the right.
 *
 * The top bar carries product nav (홈 / 세션 / 메모리), the brand mark, the
 * import / new-session shortcuts, and the user button (which opens the
 * settings sheet). The sidebar is dedicated to the session list, the way
 * Claude / Codex desktop dedicate their left rail to conversation history.
 * On narrow widths the sidebar is an off-canvas drawer toggled by the menu
 * button in the top-left corner.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useMoriAppStore((state) => state.navigate);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeAndNavigate = (view: ViewKey) => {
    navigate(view);
    setSidebarOpen(false);
  };

  return (
    <div className={`app-shell${sidebarOpen ? " sidebar-open" : ""}`}>
      <button
        type="button"
        className="sidebar-toggle"
        aria-label={sidebarOpen ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen((open) => !open)}
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      <TopBar />
      <Sidebar onNavigate={closeAndNavigate} />
      <div
        className="sidebar-scrim"
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />
      <main className="workspace">{children}</main>
      <SettingsSheet />
    </div>
  );
}
