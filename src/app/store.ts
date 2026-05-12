import { create } from "zustand";
import type { EventType, ViewKey } from "../domain/types";

type MoriAppState = {
  currentView: ViewKey;
  selectedEventId: string;
  hoveredEventId: string | null;
  activeFilters: EventType[];
  searchQuery: string;
  setCurrentView: (view: ViewKey) => void;
  setSelectedEventId: (eventId: string) => void;
  setHoveredEventId: (eventId: string | null) => void;
  toggleFilter: (eventType: EventType) => void;
  setSearchQuery: (query: string) => void;
};

export const useMoriAppStore = create<MoriAppState>((set) => ({
  currentView: "timeline",
  selectedEventId: "evt-positioning",
  hoveredEventId: null,
  activeFilters: [],
  searchQuery: "",
  setCurrentView: (currentView) => set({ currentView }),
  setSelectedEventId: (selectedEventId) => set({ selectedEventId }),
  setHoveredEventId: (hoveredEventId) => set({ hoveredEventId }),
  toggleFilter: (eventType) =>
    set((state) => ({
      activeFilters: state.activeFilters.includes(eventType)
        ? state.activeFilters.filter((value) => value !== eventType)
        : [...state.activeFilters, eventType],
    })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
