import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { useMoriAppStore } from "../../app/store";
import type { ViewKey } from "../../domain/types";

export function AppShell({ children }: { children: ReactNode }) {
  const currentView = useMoriAppStore((state) => state.currentView);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  // Off-canvas sidebar state — only meaningful at <=768px, where the
  // sidebar is a drawer. A nav click closes it so the content is visible.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigate = (view: ViewKey) => {
    setCurrentView(view);
    setSidebarOpen(false);
  };

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""}`}>
      <button
        type="button"
        className="sidebar-toggle"
        aria-label={sidebarOpen ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen((open) => !open)}
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      <Sidebar currentView={currentView} onNavigate={navigate} />
      <div
        className="sidebar-scrim"
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />
      <main className="workspace">{children}</main>
    </div>
  );
}
