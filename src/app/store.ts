import { create } from "zustand";
import type { EventType, ViewKey } from "../domain/types";
import type { ReviewSelection } from "../lib/review-workspace/reviewWorkspace";

/** Active tab on the Review surface. Persisted so the user returns to the same tab. */
export type ReviewTab = "issues" | "decisions" | "nextActions" | "unresolved" | "suggestions";

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
    set({ reviewFocus: selection, currentView: "review" }),
  clearReviewFocus: () => set({ reviewFocus: null }),
  openAcceptedMemory: (memoryId) =>
    set({ memoryFocus: { memoryId }, currentView: "memory" }),
  clearMemoryFocus: () => set({ memoryFocus: null }),
  setReviewTab: (reviewTab) => set({ reviewTab }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
}));
