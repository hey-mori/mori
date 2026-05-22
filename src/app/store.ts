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
export type SessionTab = "flow" | "evidence" | "insights";

/** Active tab on the Settings surface. Persisted so the user returns to the same tab. */
export type SettingsTab = "localAi" | "privacy" | "storage" | "repositories" | "connectors" | "appearance";

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
};

export const useMoriAppStore = create<MoriAppState>((set) => ({
  currentView: "home",
  selectedEventId: "evt-positioning",
  hoveredEventId: null,
  activeFilters: [],
  searchQuery: "",
  inspectorCollapsed: false,
  reviewFocus: null,
  memoryFocus: null,
  reviewTab: "issues",
  sessionTab: "flow",
  settingsTab: "localAi",
  setCurrentView: (currentView) => set({ currentView }),
  setSelectedEventId: (selectedEventId) => set({ selectedEventId }),
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
        default:
          return { currentView: view };
      }
    }),
}));
