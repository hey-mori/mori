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
/** Whether a keystroke landed in a field where a bare shortcut key must be
 *  treated as typed text, not a command. */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useAppStore((state) => state.navigate);
  const requestNewRecord = useAppStore((state) => state.requestNewRecord);
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
      if (isMod) {
        const key = event.key.toLowerCase();
        if (key !== "k" && key !== "p") return;
        event.preventDefault();
        toggleCommandPalette();
        return;
      }
      // Unmodified single-key shortcut for the highest-frequency action: 새 기록.
      // Skipped while typing (input / textarea / select / contenteditable) and
      // when any modifier is held, so Cmd+N (browser) and literal "n" are safe.
      if (event.altKey || event.shiftKey) return;
      if (event.key === "n" && !isEditableTarget(event.target)) {
        event.preventDefault();
        requestNewRecord();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleCommandPalette, requestNewRecord]);

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
      <Sidebar onNavigate={closeAndNavigate} collapsed={sidebarCollapsed} />
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
