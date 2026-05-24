import { create } from "zustand";
import type { EventType, ViewKey } from "../domain/types";
import type { ReviewSelection } from "../lib/review-workspace/reviewWorkspace";

/** Active tab on the Review surface. Persisted so the user returns to the same tab. */
export type ReviewTab = "issues" | "decisions" | "nextActions" | "unresolved" | "suggestions";

/**
 * Active tab inside the unified Session Detail workspace. Opening a session
 * lands on "flow" (what happened); "evidence" is the per-session sources; and
 * "insights" reframes the old Review surface around the value of confirming
 * issues / decisions / next actions. Stored so the user returns to the same
 * tab, and so other surfaces can deep-link a session straight to a tab.
 */
export type SessionTab = "flow" | "evidence" | "insights" | "report";

/** Active tab on the Settings surface. Persisted so the user returns to the same tab. */
export type SettingsTab = "localAi" | "privacy" | "storage" | "repositories" | "appearance";

/**
 * Outer tab on the settings sheet (the modal opened from the top-bar user
 * button). Two segments — the local profile, and the full settings surface.
 * Stored so the sheet reopens on the last segment.
 */
export type SettingsSheetTab = "profile" | "settings";

/**
 * Active segment inside the Memory surface. Memory is cross-session, so it
 * hosts the project-memory overview and the Consolidation review — both
 * operate across sessions. (A report is per-session, so it lives in the
 * Session workspace as its own tab, not here.)
 */
export type MemoryTab = "overview" | "consolidation";

type MoriAppState = {
  currentView: ViewKey;
  selectedEventId: string;
  hoveredEventId: string | null;
  activeFilters: EventType[];
  searchQuery: string;
  /** When true, the inspector is collapsed (used at narrow widths). */
  inspectorCollapsed: boolean;
  /**
   * A one-shot request to open the Review surface focused on a specific
   * item — set when another surface (e.g. the Timeline event inspector)
   * deep-links into Review. ReviewView consumes and clears it.
   */
  reviewFocus: ReviewSelection | null;
  /**
   * A one-shot request to open the Project Memory surface with a specific
   * accepted memory's provenance drawer open. Set when another surface
   * (e.g. Companion Inbox memory-health chips) deep-links into Memory.
   * `MemoryView` consumes and clears it once the drawer opens.
   */
  memoryFocus: { memoryId: string } | null;
  /**
   * Active tab on the Review surface. Stored here so the user returns to
   * the same tab when navigating away and back. Deep-link overrides via
   * `openReviewItem` still win and update this value.
   */
  reviewTab: ReviewTab;
  /**
   * Active tab inside the unified Session Detail workspace (흐름 / 증거 /
   * 인사이트). Stored so navigating away and back returns to the same tab;
   * `openSession` overrides it when another surface deep-links a tab.
   */
  sessionTab: SessionTab;
  /**
   * Active tab on the Settings surface. Stored here so the user returns
   * to the same tab when navigating away and back.
   */
  settingsTab: SettingsTab;
  /**
   * Active segment inside the Memory surface (개요 / 통합 / 리포트). Stored so
   * navigating away and back returns to the same segment; Memory-internal
   * links (e.g. the hero "리포트" action) set it to switch segment in place.
   */
  memoryTab: MemoryTab;
  /**
   * Whether the settings sheet (profile + settings, opened from the top-bar
   * user button) is open. Lives in the store so any surface can open it —
   * e.g. an empty-state CTA that wants to drop the user into the storage tab.
   */
  settingsSheetOpen: boolean;
  /** Active segment inside the settings sheet — profile or full settings. */
  settingsSheetTab: SettingsSheetTab;
  /**
   * Whether the command palette (Cmd+K / Ctrl+K) is open. Lives in the store
   * so any surface can trigger it — e.g. a "Find anything" CTA in an empty
   * state — without having to thread a ref through the component tree.
   */
  commandPaletteOpen: boolean;
  /**
   * The project key (sourceLabel) currently open in the project view. Lives
   * here so the sidebar folder click + a future Cmd+K project command both
   * route into the same surface without each having to thread state down.
   */
  currentProjectKey: string | null;
  setCurrentView: (view: ViewKey) => void;
  setSelectedEventId: (eventId: string) => void;
  setHoveredEventId: (eventId: string | null) => void;
  toggleFilter: (eventType: EventType) => void;
  clearFilters: () => void;
  setSearchQuery: (query: string) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  /** Deep-link into Review focused on a specific issue / decision / next action. */
  openReviewItem: (selection: ReviewSelection) => void;
  clearReviewFocus: () => void;
  /** Deep-link into Project Memory with one accepted memory's drawer open. */
  openAcceptedMemory: (memoryId: string) => void;
  clearMemoryFocus: () => void;
  setReviewTab: (tab: ReviewTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setMemoryTab: (tab: MemoryTab) => void;
  /**
   * Open the unified Session Detail workspace, optionally on a specific tab.
   * The single front door other surfaces use to route into a session — the
   * old `setCurrentView("timeline" | "evidence" | "review")` calls now flow
   * through here so a session always opens as one workspace, never a
   * standalone page.
   */
  openSession: (tab?: SessionTab) => void;
  setSessionTab: (tab: SessionTab) => void;
  /**
   * Navigate to a `ViewKey`, normalising the legacy session-surface keys
   * (`timeline` / `flow` / `evidence` / `review`) into the unified Session
   * Detail workspace on the matching tab. Surfaces that route by a dynamic
   * `ViewKey` (the Companion layer, deep links) should call this instead of
   * `setCurrentView` so they never land on a standalone page.
   */
  navigate: (view: ViewKey) => void;
  /** Open the settings sheet, optionally jumping to a segment. */
  openSettingsSheet: (tab?: SettingsSheetTab) => void;
  closeSettingsSheet: () => void;
  setSettingsSheetTab: (tab: SettingsSheetTab) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  /**
   * Open the project workspace for a given project key (sourceLabel). The
   * sidebar folder header calls this; future producers (Cmd+K, deep links)
   * route through the same action so the surface only has one front door.
   */
  openProject: (projectKey: string) => void;
};

export const useMoriAppStore = create<MoriAppState>((set) => ({
  currentView: "home",
  selectedEventId: "evt-positioning",
  hoveredEventId: null,
  activeFilters: [],
  searchQuery: "",
  // Default the timeline inspector to collapsed — keeps the workspace
  // single-column on first paint so a session opens calm. The user expands
  // it on demand from the toolbar toggle; selecting an event also opens it.
  inspectorCollapsed: true,
  reviewFocus: null,
  memoryFocus: null,
  reviewTab: "issues",
  sessionTab: "flow",
  settingsTab: "localAi",
  memoryTab: "overview",
  settingsSheetOpen: false,
  settingsSheetTab: "profile",
  commandPaletteOpen: false,
  currentProjectKey: null,
  setCurrentView: (currentView) => set({ currentView }),
  // Selecting an event auto-expands the timeline inspector — picking an event
  // is the exact intent the inspector serves, so the user never has to also
  // hit the toolbar toggle to actually see what they clicked.
  setSelectedEventId: (selectedEventId) =>
    set({ selectedEventId, inspectorCollapsed: false }),
  setHoveredEventId: (hoveredEventId) => set({ hoveredEventId }),
  toggleFilter: (eventType) =>
    set((state) => ({
      activeFilters: state.activeFilters.includes(eventType)
        ? state.activeFilters.filter((value) => value !== eventType)
        : [...state.activeFilters, eventType],
    })),
  clearFilters: () => set({ activeFilters: [] }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
  openReviewItem: (selection) =>
    set({ reviewFocus: selection, currentView: "session", sessionTab: "insights" }),
  clearReviewFocus: () => set({ reviewFocus: null }),
  openAcceptedMemory: (memoryId) =>
    set({ memoryFocus: { memoryId }, currentView: "memory" }),
  clearMemoryFocus: () => set({ memoryFocus: null }),
  setReviewTab: (reviewTab) => set({ reviewTab }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  setMemoryTab: (memoryTab) => set({ memoryTab }),
  openSession: (tab) =>
    set(tab ? { currentView: "session", sessionTab: tab } : { currentView: "session" }),
  setSessionTab: (sessionTab) => set({ sessionTab }),
  navigate: (view) =>
    set(() => {
      switch (view) {
        case "timeline":
        case "flow":
          return { currentView: "session", sessionTab: "flow" };
        case "evidence":
          return { currentView: "session", sessionTab: "evidence" };
        case "review":
          return { currentView: "session", sessionTab: "insights" };
        case "reports":
          // A report is per-session — open the session workspace on its report tab.
          return { currentView: "session", sessionTab: "report" };
        case "consolidation":
          // Consolidation is cross-session — it lives in Memory's 통합 segment.
          return { currentView: "memory", memoryTab: "consolidation" };
        case "settings":
        case "profile":
          // Settings + profile now live behind the user button as a sheet;
          // a legacy `navigate("settings")` opens the sheet instead of routing
          // to a standalone page so existing deep links keep working.
          return {
            settingsSheetOpen: true,
            settingsSheetTab: view === "profile" ? "profile" : "settings",
          };
        default:
          return { currentView: view };
      }
    }),
  openSettingsSheet: (tab) =>
    set(tab ? { settingsSheetOpen: true, settingsSheetTab: tab } : { settingsSheetOpen: true }),
  closeSettingsSheet: () => set({ settingsSheetOpen: false }),
  setSettingsSheetTab: (settingsSheetTab) => set({ settingsSheetTab }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  openProject: (projectKey) =>
    set({ currentView: "project", currentProjectKey: projectKey }),
}));
