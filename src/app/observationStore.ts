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
  /**
   * The 라이브 세션 screen's pause, held here rather than in the screen.
   *
   * Before observation moved into the shell, that pause fed the poller directly
   * and genuinely stopped it. Afterwards it only blanked the view while the
   * shell kept observing, which made it a control that did not do what it said.
   * The shell reads it so the original meaning holds: pausing stops observing on
   * the view's account. It cannot stop ambient observation, which the user
   * turned on separately and turns off in the sidebar.
   *
   * Not persisted: a pause is about this sitting, not a standing preference.
   */
  viewPaused: boolean;
  setViewPaused: (paused: boolean) => void;
};

export const useObservationStore = create<ObservationState>((set, get) => ({
  // Read once at module load, so the shell does not flash from off to on.
  ambient: loadObservationSettings().ambient,
  setAmbient: (ambient) => {
    set({ ambient });
    saveObservationSettings({ ambient });
  },
  toggleAmbient: () => get().setAmbient(!get().ambient),
  viewPaused: false,
  setViewPaused: (viewPaused) => set({ viewPaused }),
}));
