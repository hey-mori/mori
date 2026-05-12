import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { useMoriAppStore } from "../../app/store";

export function AppShell({ children }: { children: ReactNode }) {
  const currentView = useMoriAppStore((state) => state.currentView);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  return (
    <div className="app-shell">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />
      <main className="workspace">{children}</main>
    </div>
  );
}
