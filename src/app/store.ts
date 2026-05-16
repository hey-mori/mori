import { create } from "zustand";
import type { EventType, ViewKey } from "../domain/types";
import type { TimelineDensity } from "../lib/timeline/collisionLayout";
import type { ReviewSelection } from "../lib/review-workspace/reviewWorkspace";

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
  /**
   * A one-shot request to open the Review surface focused on a specific
   * item — set when another surface (e.g. the Timeline event inspector)
   * deep-links into Review. ReviewView consumes and clears it.
   */
  reviewFocus: ReviewSelection | null;
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
  /** Deep-link into Review focused on a specific issue / decision / next action. */
  openReviewItem: (selection: ReviewSelection) => void;
  clearReviewFocus: () => void;
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
  reviewFocus: null,
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
      timelineDensity:
        state.timelineDensity === "comfortable"
          ? "compact"
          : state.timelineDensity === "compact"
            ? "dense"
            : "comfortable",
    })),
  toggleActiveLanesOnly: () =>
    set((state) => ({ activeLanesOnly: !state.activeLanesOnly })),
  setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
  openReviewItem: (selection) =>
    set({ reviewFocus: selection, currentView: "review" }),
  clearReviewFocus: () => set({ reviewFocus: null }),
}));
