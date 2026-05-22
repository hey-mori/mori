import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { SettingsSheet } from "./SettingsSheet";
import { useMoriAppStore } from "../../app/store";
import type { ViewKey } from "../../domain/types";

/**
 * Outer app shell — a session-list sidebar on the left, the workspace on the
 * right, both running full-height. There is no top chrome bar: the sidebar
 * owns product nav, quick actions, search, the session list, and the user
 * button, so the workspace stays free of header furniture.
 *
 * On narrow widths the sidebar lifts out of the grid and slides over the
 * workspace as an off-canvas drawer; the floating toggle in the top-left
 * corner opens it.
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
