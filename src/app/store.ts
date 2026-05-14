import { create } from "zustand";
import type { EventType, ViewKey } from "../domain/types";
import type { TimelineDensity } from "../lib/timeline/collisionLayout";

type MoriAppState = {
  currentView: ViewKey;
  selectedEventId: string;
  hoveredEventId: string | null;
  activeFilters: EventType[];
  searchQuery: string;
  timelineDensity: TimelineDensity;
  /** When true, the canvas hides lanes with zero items to tighten the rhythm. */
  activeLanesOnly: boolean;
  /** When true, the inspector is collapsed (used at narrow widths). */
  inspectorCollapsed: boolean;
  setCurrentView: (view: ViewKey) => void;
  setSelectedEventId: (eventId: string) => void;
  setHoveredEventId: (eventId: string | null) => void;
  toggleFilter: (eventType: EventType) => void;
  clearFilters: () => void;
  setSearchQuery: (query: string) => void;
  setTimelineDensity: (density: TimelineDensity) => void;
  toggleTimelineDensity: () => void;
  toggleActiveLanesOnly: () => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
};

export const useMoriAppStore = create<MoriAppState>((set) => ({
  currentView: "timeline",
  selectedEventId: "evt-positioning",
  hoveredEventId: null,
  activeFilters: [],
  searchQuery: "",
  timelineDensity: "comfortable",
  activeLanesOnly: false,
  inspectorCollapsed: false,
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
  setTimelineDensity: (timelineDensity) => set({ timelineDensity }),
  toggleTimelineDensity: () =>
    set((state) => ({
      timelineDensity: state.timelineDensity === "comfortable" ? "compact" : "comfortable",
    })),
  toggleActiveLanesOnly: () =>
    set((state) => ({ activeLanesOnly: !state.activeLanesOnly })),
  setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
}));
