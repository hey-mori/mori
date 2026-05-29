import { create } from "zustand";
import {
  DEFAULT_LOCAL_PROFILE,
  loadLocalProfile,
  normalizeDisplayName,
  saveLocalProfile,
  type LocalProfile,
} from "../lib/profile/localProfile";

/**
 * Local profile store.
 *
 * Holds Mori's default identity — a user-set display name persisted in
 * browser localStorage. No account, no server, no data access.
 */
export type ProfileState = {
  initialized: boolean;
  profile: LocalProfile;
  hydrate: () => void;
  setDisplayName: (displayName: string) => void;
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  initialized: false,
  profile: DEFAULT_LOCAL_PROFILE,
  hydrate: () => {
    if (get().initialized) return;
    set({ profile: loadLocalProfile(), initialized: true });
  },
  setDisplayName: (displayName) => {
    const next: LocalProfile = {
      ...get().profile,
      displayName: normalizeDisplayName(displayName) || DEFAULT_LOCAL_PROFILE.displayName,
    };
    saveLocalProfile(next);
    set({ profile: next });
  },
}));
