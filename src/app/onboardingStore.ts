import { create } from "zustand";
import {
  DEFAULT_ONBOARDING_STATE,
  loadOnboardingState,
  markOnboardingCompleted,
  saveOnboardingState,
  type OnboardingState,
} from "../lib/onboarding/onboardingState";

/**
 * First-run onboarding store.
 *
 * Holds the local "already onboarded" flag. `complete()` is called when the
 * user finishes or dismisses the guide; `reopen()` lets a command-palette /
 * settings entry show it again (retire, don't delete).
 */
export type OnboardingStoreState = {
  initialized: boolean;
  state: OnboardingState;
  /** True only while the user is explicitly reopening a completed guide. */
  reopened: boolean;
  hydrate: () => void;
  complete: () => void;
  reopen: () => void;
  closeReopened: () => void;
};

export const useOnboardingStore = create<OnboardingStoreState>((set, get) => ({
  initialized: false,
  state: DEFAULT_ONBOARDING_STATE,
  reopened: false,
  hydrate: () => {
    if (get().initialized) return;
    set({ state: loadOnboardingState(), initialized: true });
  },
  complete: () => {
    const next = markOnboardingCompleted(new Date().toISOString());
    saveOnboardingState(next);
    set({ state: next, reopened: false });
  },
  reopen: () => set({ reopened: true }),
  closeReopened: () => set({ reopened: false }),
}));
