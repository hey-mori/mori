/**
 * The ambient-observation opt-in, as shared state.
 *
 * Lives in a store rather than in a screen because two different places need it
 * at once: the shell decides whether to observe at all, and the sidebar shows
 * the always-visible watching state that rail B requires. A setting that only
 * one screen could see could not be turned off from anywhere else, which is
 * exactly what "one-tap off" forbids.
 */
import { create } from "zustand";
import {
  loadObservationSettings,
  saveObservationSettings,
} from "../lib/live-intake/observationSettings";

type ObservationState = {
  ambient: boolean;
  setAmbient: (ambient: boolean) => void;
  toggleAmbient: () => void;
};

export const useObservationStore = create<ObservationState>((set, get) => ({
  // Read once at module load, so the shell does not flash from off to on.
  ambient: loadObservationSettings().ambient,
  setAmbient: (ambient) => {
    set({ ambient });
    saveObservationSettings({ ambient });
  },
  toggleAmbient: () => get().setAmbient(!get().ambient),
}));
