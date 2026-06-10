import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "../../app/store";
import {
  loadCollapsePreference,
  saveCollapsePreference,
} from "../../lib/sidebar/collapsePreference";
import type { ViewKey } from "../../domain/types";

const SettingsSheet = lazy(() =>
  import("./SettingsSheet").then((module) => ({ default: module.SettingsSheet })),
);
const CommandPalette = lazy(() =>
  import("./CommandPalette").then((module) => ({ default: module.CommandPalette })),
);

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
  const navigate = useAppStore((state) => state.navigate);
  const toggleCommandPalette = useAppStore(
    (state) => state.toggleCommandPalette,
  );
  const settingsSheetOpen = useAppStore((state) => state.settingsSheetOpen);
  const commandPaletteOpen = useAppStore((state) => state.commandPaletteOpen);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop-only "narrow" mode — independent from the mobile off-canvas
  // drawer state above. When collapsed, the sidebar shrinks to its icon
  // rail so the workspace gets more breathing room; toggling it back
  // unfolds the search + session list without touching the drawer.
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(
    () => loadCollapsePreference(),
  );
  const setSidebarCollapsed = (collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    saveCollapsePreference(collapsed);
  };

  const closeAndNavigate = (view: ViewKey) => {
    navigate(view);
    setSidebarOpen(false);
  };

  // Global Cmd+K / Ctrl+K — opens the command palette from anywhere except
  // text inputs where the user might be typing the literal "k". Mod+P
  // ("프로젝트") is a familiar alternate from VS Code so power users from
  // that ecosystem find it without onboarding.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod) return;
      const key = event.key.toLowerCase();
      if (key !== "k" && key !== "p") return;
      event.preventDefault();
      toggleCommandPalette();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleCommandPalette]);

  const shellClass = [
    "app-shell",
    sidebarOpen ? "sidebar-open" : "",
    sidebarCollapsed ? "sidebar-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      <button
        type="button"
        className="sidebar-toggle"
        aria-label={sidebarOpen ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen((open) => !open)}
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      <Sidebar
        onNavigate={closeAndNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div
        className="sidebar-scrim"
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />
      <main className="workspace">{children}</main>
      <Suspense fallback={null}>
        {settingsSheetOpen ? <SettingsSheet /> : null}
        {commandPaletteOpen ? (
          <CommandPalette
            onToggleSidebarCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        ) : null}
      </Suspense>
    </div>
  );
}
